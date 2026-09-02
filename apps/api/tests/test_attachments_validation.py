"""Uploaded files must actually be what they claim to be.

Found by uploading to production: the declared Content-Type was simply
believed. HTML, a PDF and an ELF binary were all accepted and stored as
.png/.jpg by asserting `image/png`. Nothing executed — files are served with a
type derived from the allowlisted extension rather than from the upload — but a
row saying "image/jpeg" should be true, not just claimed by whoever sent it.
"""
from __future__ import annotations

import struct
import zlib

import pytest

from app.services.attachments import ALLOWED_MIME, MAX_BYTES, _ext_for, _looks_like


def real_png() -> bytes:
    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\xff\x00\x00")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


REAL = {
    "image/png": real_png(),
    "image/jpeg": b"\xff\xd8\xff\xe0" + b"\x00" * 32,
    "image/jpg": b"\xff\xd8\xff\xe0" + b"\x00" * 32,
    "image/webp": b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 16,
    "image/heic": b"\x00\x00\x00\x18ftypheic" + b"\x00" * 16,
    "image/heif": b"\x00\x00\x00\x18ftypmif1" + b"\x00" * 16,
}


@pytest.mark.parametrize("mime", sorted(ALLOWED_MIME))
def test_a_genuine_image_of_each_allowed_type_passes(mime):
    assert _looks_like(REAL[mime], mime), f"{mime} rejected its own magic bytes"


@pytest.mark.parametrize(
    "label,payload",
    [
        ("HTML with a script tag", b"<html><script>alert(1)</script></html>"),
        ("a PDF", b"%PDF-1.4\n%payload"),
        ("an ELF binary", b"\x7fELF\x02\x01\x01" + b"\x00" * 64),
        ("a shell script", b"#!/bin/sh\nrm -rf /\n"),
        ("a zip/office file", b"PK\x03\x04" + b"\x00" * 32),
        ("empty-ish bytes", b"\x00\x00\x00\x00"),
        ("plain text", b"just some text"),
    ],
)
@pytest.mark.parametrize("claimed", ["image/png", "image/jpeg", "image/webp", "image/heic"])
def test_lying_about_the_content_type_does_not_work(label, payload, claimed):
    assert not _looks_like(payload, claimed), f"{label} accepted as {claimed}"


def test_a_png_cannot_pass_itself_off_as_a_jpeg():
    """Each type is checked against its own signature, not 'any image'."""
    assert _looks_like(REAL["image/png"], "image/png")
    assert not _looks_like(REAL["image/png"], "image/jpeg")
    assert not _looks_like(REAL["image/jpeg"], "image/png")


def test_a_truncated_header_is_rejected_rather_than_crashing():
    for mime in ALLOWED_MIME:
        assert _looks_like(b"", mime) is False
        assert _looks_like(b"\xff", mime) is False


def test_svg_is_not_an_allowed_type_at_all():
    """SVG can carry script, so it never reaches the signature check."""
    assert "image/svg+xml" not in ALLOWED_MIME


def test_extensions_only_ever_come_from_the_allowlist():
    """The stored filename's extension is derived from the verified MIME, never
    from the name the uploader chose — which is what defeats path traversal and
    stops an arbitrary extension being written to disk."""
    for mime in ALLOWED_MIME:
        assert _ext_for(mime).startswith(".")
        assert _ext_for(mime) != ".bin"
    assert _ext_for("application/x-httpd-php") == ".bin"
    assert _ext_for("") == ".bin"


def test_the_cap_is_a_sane_size_for_a_phone_photo():
    assert 1 * 1024 * 1024 <= MAX_BYTES <= 25 * 1024 * 1024
