"""Text going into the visit PDF must be drawable.

Found by exporting a real chart from production and reading it back: the
clinical models reach for typographic characters the PDF's base fonts cannot
draw, and ReportLab renders each as a black box. The exported chart contained
`SpO■`, `12■lead`, `D■dimer/CT`, `X■ray` and `(high■sensitivity` — which on a
printed document reads as corrupted data rather than a rendering quirk.
"""
from __future__ import annotations

import pytest

from app.services.pdf_export import POLI_LABELS, _esc, _pdf_safe


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("SpO₂ 95%", "SpO2 95%"),
        ("12‑lead ECG", "12-lead ECG"),
        ("D‑dimer/CT", "D-dimer/CT"),
        ("high‑sensitivity troponin", "high-sensitivity troponin"),
        ("X‑ray", "X-ray"),
        ("5 × daily", "5 x daily"),
        ("≤100 mmHg", "<=100 mmHg"),
        ("≥90 bpm", ">=90 bpm"),
        ("CO₂ retention", "CO2 retention"),
        ("50 μg", "50 ug"),
        ("don’t", "don't"),
    ],
)
def test_clinical_glyphs_become_drawable(raw, expected):
    assert _pdf_safe(raw) == expected


def test_nothing_undrawable_survives():
    """Whatever a model emits, the output must be encodable by the base font."""
    messy = "Ω≈ç√∫˜µ≤≥ ★ 中文 SpO₂ 12‑lead"
    out = _pdf_safe(messy)
    out.encode("cp1252")  # raises if a box would be drawn


def test_escaping_still_happens_after_sanitising():
    assert _esc("a<b>&c") == "a&lt;b&gt;&amp;c"
    assert _esc("SpO₂ <5") == "SpO2 &lt;5"


def test_none_is_empty_not_the_string_none():
    assert _esc(None) == ""


@pytest.mark.parametrize("code,label", list(POLI_LABELS.items()))
def test_departments_read_as_english_not_enum_values(code, label):
    """A document a patient may be handed should not say 'Umum'."""
    assert label != code.title()
    assert label[0].isupper()


def test_no_undrawable_literal_in_the_module_itself():
    """Table cells are raw strings, not routed through _esc.

    A literal like "SpO₂ %" in a header therefore reaches ReportLab unsanitised
    and draws a black box — which is exactly how it shipped.
    """
    import inspect
    from app.services import pdf_export

    for lineno, line in enumerate(inspect.getsource(pdf_export).split("\n"), 1):
        if line.lstrip().startswith("#"):
            continue  # the comments explain the problem using the characters
        for ch in line:
            if ord(ch) > 127:
                try:
                    ch.encode("cp1252")
                except UnicodeEncodeError:  # pragma: no cover
                    raise AssertionError(
                        f"line {lineno}: {ch!r} cannot be drawn by the PDF font — {line.strip()[:70]}"
                    )
