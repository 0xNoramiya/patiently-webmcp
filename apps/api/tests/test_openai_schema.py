"""Structured-output schema translation.

The clinical agents were written against OpenAPI-flavoured schemas (`nullable`,
partial `required`). OpenAI Structured Outputs is stricter: every object must
set `additionalProperties: false` and list every property in `required`.

`_strictify` bridges the two, and getting it wrong fails *at request time on a
live patient*, so it is worth pinning down precisely.
"""
from __future__ import annotations

import pytest

from app.agents.schemas import (
    INTAKE_RESPONSE_SCHEMA,
    SUMMARY_SCHEMA,
    TRIAGE_RESPONSE_SCHEMA,
)
from app.integrations.openai_client import (
    _as_json_object,
    _make_nullable,
    _parse_retry_delay,
    _strictify,
    _stub_response,
    _to_messages,
)

ALL_SCHEMAS = [
    ("intake", INTAKE_RESPONSE_SCHEMA),
    ("triage", TRIAGE_RESPONSE_SCHEMA),
    ("summary", SUMMARY_SCHEMA),
]


def _walk(node, path="$"):
    """Yield (path, node) for every object/array node in a schema."""
    if not isinstance(node, dict):
        return
    yield path, node
    types = node.get("type")
    types = types if isinstance(types, list) else [types]
    if "object" in types:
        for k, v in node.get("properties", {}).items():
            yield from _walk(v, f"{path}.{k}")
    if "array" in types:
        yield from _walk(node.get("items", {}), f"{path}[]")


@pytest.mark.parametrize("name,schema", ALL_SCHEMAS)
def test_every_object_is_closed(name, schema):
    for path, node in _walk(_strictify(schema)):
        types = node.get("type")
        types = types if isinstance(types, list) else [types]
        if "object" in types:
            assert node.get("additionalProperties") is False, f"{name} {path}"


@pytest.mark.parametrize("name,schema", ALL_SCHEMAS)
def test_every_property_is_required(name, schema):
    for path, node in _walk(_strictify(schema)):
        types = node.get("type")
        types = types if isinstance(types, list) else [types]
        if "object" in types:
            props = set(node.get("properties", {}))
            assert props == set(node.get("required", [])), f"{name} {path}"


@pytest.mark.parametrize("name,schema", ALL_SCHEMAS)
def test_openapi_nullable_keyword_is_gone(name, schema):
    for path, node in _walk(_strictify(schema)):
        assert "nullable" not in node, f"{name} {path} still has 'nullable'"


def test_optional_fields_become_nullable_not_dropped():
    """A field the agents treated as optional must still be emittable as null.

    Dropping it from `required` is illegal in strict mode; dropping it from
    `properties` would silently lose clinical data. Widening the type is the
    only option that preserves 'absent means not yet known'.
    """
    strict = _strictify(INTAKE_RESPONSE_SCHEMA)
    extracted = strict["properties"]["extracted_fields"]

    # `extracted_fields` was not in the original `required` list.
    assert extracted["type"] == ["object", "null"]

    # Its own sub-fields were all optional, so each is nullable but present.
    assert set(extracted["properties"]) == set(
        INTAKE_RESPONSE_SCHEMA["properties"]["extracted_fields"]["properties"]
    )
    assert extracted["properties"]["onset"]["type"] == ["string", "null"]
    assert extracted["properties"]["severity"]["type"] == ["integer", "null"]


def test_required_fields_keep_their_narrow_type():
    """Fields that were genuinely required must not be widened to accept null."""
    strict = _strictify(INTAKE_RESPONSE_SCHEMA)
    assert strict["properties"]["reply_text"]["type"] == "string"
    assert strict["properties"]["is_complete"]["type"] == "boolean"


def test_triage_enum_survives_translation():
    """The red-flag codes are the whole contract of the triage classifier."""
    strict = _strictify(TRIAGE_RESPONSE_SCHEMA)
    items = strict["properties"]["triage_flags"]["items"]
    assert "CHEST_PAIN_CARDIAC" in items["enum"]
    assert "SUICIDAL_IDEATION" in items["enum"]
    assert len(items["enum"]) == 8


def test_nested_nullable_object_is_widened_and_closed():
    """`followup_delta` is both nullable and full of optional fields."""
    delta = _strictify(SUMMARY_SCHEMA)["properties"]["followup_delta"]
    assert delta["type"] == ["object", "null"]
    assert delta["additionalProperties"] is False
    assert set(delta["required"]) == set(delta["properties"])
    assert delta["properties"]["side_effects"]["type"] == ["array", "null"]
    # Array item types are not nullable — a null *element* is not the same as
    # an absent list.
    assert delta["properties"]["side_effects"]["items"]["type"] == "string"


def test_make_nullable_is_idempotent():
    node = {"type": "string"}
    once = _make_nullable(node)
    assert _make_nullable(once) == once
    assert node == {"type": "string"}, "must not mutate the input"


def test_strictify_does_not_mutate_the_source_schema():
    import copy

    before = copy.deepcopy(SUMMARY_SCHEMA)
    _strictify(SUMMARY_SCHEMA)
    assert SUMMARY_SCHEMA == before


# --- message flattening ----------------------------------------------------

def test_gemini_style_turns_flatten_to_chat_messages():
    msgs = _to_messages(
        "SYSTEM",
        [
            {"role": "user", "parts": [{"text": "hello"}]},
            {"role": "model", "parts": [{"text": "hi"}]},
        ],
    )
    assert msgs == [
        {"role": "system", "content": "SYSTEM"},
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]


def test_multipart_turns_are_joined_and_empty_turns_dropped():
    msgs = _to_messages(
        "S",
        [
            {"role": "user", "parts": [{"text": "a"}, {"text": "b"}]},
            {"role": "user", "parts": [{"text": "   "}]},
            {"role": "user", "parts": []},
        ],
    )
    assert msgs == [
        {"role": "system", "content": "S"},
        {"role": "user", "content": "a\nb"},
    ]


# --- resilience ------------------------------------------------------------

def test_retry_delay_is_parsed_from_rate_limit_text():
    assert _parse_retry_delay("Please try again in 21.4s") == pytest.approx(21.9)
    assert _parse_retry_delay("no delay mentioned") is None


def test_json_object_fallback_inlines_the_schema():
    payload = {
        "model": "m",
        "messages": [{"role": "system", "content": "SYS"}],
        "response_format": {"type": "json_schema"},
    }
    out = _as_json_object(payload, TRIAGE_RESPONSE_SCHEMA)
    assert out["response_format"] == {"type": "json_object"}
    assert "SYS" in out["messages"][0]["content"]
    assert "triage_flags" in out["messages"][0]["content"]
    # The original payload must be left alone for any retry path.
    assert payload["response_format"] == {"type": "json_schema"}


@pytest.mark.parametrize(
    "schema,expected_key",
    [
        (INTAKE_RESPONSE_SCHEMA, "reply_text"),
        (TRIAGE_RESPONSE_SCHEMA, "triage_flags"),
        (SUMMARY_SCHEMA, "chief_complaint"),
    ],
)
def test_stub_matches_each_agent_shape(schema, expected_key):
    """With no API key the app must still hand each agent a parseable object."""
    stub = _stub_response(schema)
    assert expected_key in stub


def test_triage_stub_raises_no_flags():
    """Failing open on triage would be a clinical safety bug in the other direction:
    the stub must never invent a red flag."""
    assert _stub_response(TRIAGE_RESPONSE_SCHEMA)["triage_flags"] == []
