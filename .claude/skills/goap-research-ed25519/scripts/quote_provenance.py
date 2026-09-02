#!/usr/bin/env python3
"""Deterministic quote provenance over bounded, witness-captured excerpts.

The normalization corridor is CLOSED and shared by capture and verification:
Unicode NFC; HTML entity decoding for HTML bodies; whitespace-run collapse;
and only these typography folds: «»„“” -> ``"`` and —– -> ``-``. Case and
words are never changed, and word-overlap is never a verbatim check.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import tempfile
import unicodedata
from dataclasses import asdict, dataclass
from email.message import Message
from typing import Any, Dict, Mapping, Optional, Tuple

ACQUISITION_METHODS = ("raw-fetch", "tool-summary", "search-listing", "manual")
METHOD_UNKNOWN = "method-unknown"
VERBATIM_VERDICTS = (
    "verbatim-confirmed",
    "not-in-excerpt",
    "no-excerpt",
    "method-ineligible",
    "hash-mismatch",
    METHOD_UNKNOWN,
)

EXCERPT_RADIUS_CHARS = 500
EXCERPT_MAX_CHARS = 2000
_TYPOGRAPHY_FOLD = str.maketrans({
    "«": '"', "»": '"', "„": '"', "“": '"', "”": '"',
    "—": "-", "–": "-",
})
_HTML_ENTITY_RE = re.compile(r"&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]+);")


class ExcerptCaptureRefused(ValueError):
    """A named author-time refusal before an excerpt can be persisted."""


class ExcerptStoreError(ValueError):
    """The excerpt store exists but cannot be interpreted safely."""


@dataclass(frozen=True)
class QuoteRecord:
    quote: str
    acquisition: str
    source_url: str
    sha256_body: str
    locator: Optional[str] = None
    excerpt_id: Optional[str] = None

    def __post_init__(self) -> None:
        if not isinstance(self.quote, str) or not self.quote.strip():
            raise ValueError("quote must be a non-blank string")
        if self.acquisition not in ACQUISITION_METHODS:
            raise ValueError(
                f"acquisition {self.acquisition!r} is outside the closed set {ACQUISITION_METHODS}"
            )
        if not isinstance(self.source_url, str) or not self.source_url.strip():
            raise ValueError("source_url must be a non-blank string")
        if not isinstance(self.sha256_body, str) or not re.fullmatch(r"[0-9a-f]{64}", self.sha256_body):
            raise ValueError("sha256_body must be 64 lowercase hexadecimal characters")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def read_acquisition(value_or_none: Any) -> str:
    """Read-side compatibility: absent or unknown stays unknown and grants nothing."""
    return value_or_none if value_or_none in ACQUISITION_METHODS else METHOD_UNKNOWN


def _content_type_parts(content_type: Any) -> Tuple[Optional[str], Optional[str]]:
    if not isinstance(content_type, str) or not content_type.strip():
        return None, None
    message = Message()
    message["content-type"] = content_type
    mime = message.get_content_type().lower()
    charset = message.get_content_charset() or "utf-8"
    return mime, charset


def _is_decodable_mime(mime: Optional[str]) -> bool:
    if mime is None:
        return False
    return (
        mime.startswith("text/")
        or mime in {
            "application/json", "application/ld+json", "application/xml",
            "application/xhtml+xml", "application/javascript",
        }
        or mime.endswith("+json")
        or mime.endswith("+xml")
    )


def _decode_body(body: Any, content_type: Any) -> Tuple[str, str, str]:
    mime, charset = _content_type_parts(content_type)
    if not _is_decodable_mime(mime):
        raise ExcerptCaptureRefused(
            f"non-text body with content_type {content_type!r} cannot produce verbatim evidence"
        )
    if not isinstance(body, (bytes, bytearray, memoryview)):
        raise ExcerptCaptureRefused("source body must be bytes captured by the fetch path")
    try:
        return bytes(body).decode(charset or "utf-8", errors="strict"), mime or "", charset or "utf-8"
    except (LookupError, UnicodeDecodeError) as exc:
        raise ExcerptCaptureRefused(
            f"undecodable source body under declared charset {charset!r}: {exc}"
        ) from None


def _html_unescape_with_offsets(text: str) -> Tuple[str, list]:
    output = []
    offsets = []
    cursor = 0
    for match in _HTML_ENTITY_RE.finditer(text):
        for index in range(cursor, match.start()):
            output.append(text[index])
            offsets.append(index)
        decoded = html.unescape(match.group(0))
        for char in decoded:
            output.append(char)
            offsets.append(match.start())
        cursor = match.end()
    for index in range(cursor, len(text)):
        output.append(text[index])
        offsets.append(index)
    return "".join(output), offsets


def _normalize_with_offsets(text: str, *, is_html: bool) -> Tuple[str, list]:
    if is_html:
        current, offsets = _html_unescape_with_offsets(text)
    else:
        current, offsets = text, list(range(len(text)))

    nfc_chars = []
    nfc_offsets = []
    index = 0
    while index < len(current):
        end = index + 1
        while end < len(current) and unicodedata.combining(current[end]):
            end += 1
        normalized = unicodedata.normalize("NFC", current[index:end])
        for char in normalized:
            nfc_chars.append(char.translate(_TYPOGRAPHY_FOLD))
            nfc_offsets.append(offsets[index])
        index = end

    collapsed = []
    collapsed_offsets = []
    in_whitespace = False
    for char, original_offset in zip(nfc_chars, nfc_offsets):
        if char.isspace():
            if not in_whitespace:
                collapsed.append(" ")
                collapsed_offsets.append(original_offset)
            in_whitespace = True
        else:
            collapsed.append(char)
            collapsed_offsets.append(original_offset)
            in_whitespace = False
    return "".join(collapsed), collapsed_offsets


def normalize_text(text: str, content_type: Optional[str] = "text/plain; charset=utf-8") -> str:
    """Apply the closed normalization corridor; never lowercase or paraphrase."""
    if not isinstance(text, str):
        raise TypeError(f"text must be str, got {type(text).__name__}")
    mime, _ = _content_type_parts(content_type)
    normalized, _ = _normalize_with_offsets(text, is_html=bool(mime and "html" in mime))
    return normalized


def _record_value(record: Any, name: str, default: Any = None) -> Any:
    if isinstance(record, Mapping):
        return record.get(name, default)
    return getattr(record, name, default)


def capture_excerpt(body: bytes, quote: str, record: Any) -> Dict[str, Any]:
    """Cut a bounded excerpt only after authentic FetchRecord/body hash agreement."""
    if not getattr(record, "is_authentic", None) or not record.is_authentic():
        raise ExcerptCaptureRefused(
            "excerpt capture requires an authentic FetchRecord from evidence_fetch.fetch_source()"
        )
    if not isinstance(quote, str) or not quote.strip():
        raise ExcerptCaptureRefused("quote must be a non-blank string")
    raw = bytes(body) if isinstance(body, (bytes, bytearray, memoryview)) else body
    if not isinstance(raw, bytes):
        raise ExcerptCaptureRefused("source body must be bytes captured by the fetch path")
    body_hash = hashlib.sha256(raw).hexdigest()
    if body_hash != getattr(record, "sha256_body", None):
        raise ExcerptCaptureRefused(
            "hash-mismatch: source bytes do not match the FetchRecord.sha256_body witness"
        )

    text, mime, encoding = _decode_body(raw, getattr(record, "content_type", None))
    normalized_body, offsets = _normalize_with_offsets(text, is_html="html" in mime)
    normalized_quote = normalize_text(quote, getattr(record, "content_type", None))
    if len(quote) > EXCERPT_MAX_CHARS or len(normalized_quote) > EXCERPT_MAX_CHARS:
        raise ExcerptCaptureRefused(
            f"excerpt too narrow: quote exceeds EXCERPT_MAX_CHARS={EXCERPT_MAX_CHARS}"
        )
    found = normalized_body.find(normalized_quote)
    if found < 0:
        raise ExcerptCaptureRefused(f"quote absent from captured source bytes: {quote!r}")

    raw_start = offsets[found]
    raw_end = offsets[found + len(normalized_quote) - 1] + 1
    start = max(0, raw_start - EXCERPT_RADIUS_CHARS)
    end = min(len(text), raw_end + EXCERPT_RADIUS_CHARS)
    if end - start > EXCERPT_MAX_CHARS:
        surplus = (end - start) - EXCERPT_MAX_CHARS
        trim_left = min(surplus // 2, raw_start - start)
        start += trim_left
        surplus -= trim_left
        end -= min(surplus, end - raw_end)
    if end - start > EXCERPT_MAX_CHARS or start > raw_start or end < raw_end:
        raise ExcerptCaptureRefused(
            f"excerpt too narrow: quote cannot fit inside EXCERPT_MAX_CHARS={EXCERPT_MAX_CHARS}"
        )

    excerpt = text[start:end]
    excerpt_hash = hashlib.sha256(excerpt.encode("utf-8")).hexdigest()
    quote_hash = hashlib.sha256(quote.encode("utf-8")).hexdigest()
    excerpt_id = f"{body_hash[:16]}-{quote_hash[:8]}.json"
    try:
        excerpt_offset = len(text[:start].encode(encoding, errors="strict"))
    except (LookupError, UnicodeEncodeError) as exc:
        raise ExcerptCaptureRefused(
            f"cannot reproduce excerpt byte offset under declared charset {encoding!r}: {exc}"
        ) from None
    return {
        "excerpt_id": excerpt_id,
        "sha256_body": body_hash,
        "fetched_at": getattr(record, "fetched_at", None),
        "source_url": getattr(record, "final_url", None),
        "excerpt": excerpt,
        "excerpt_offset": excerpt_offset,
        "radius_chars": EXCERPT_RADIUS_CHARS,
        "encoding": encoding,
        "content_type": getattr(record, "content_type", None),
        "sha256_excerpt": excerpt_hash,
    }


def _atomic_write(path: str, text: str) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".quote-provenance-", dir=os.path.dirname(path), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def write_excerpt(directory: str, excerpt_rec: Mapping[str, Any]) -> str:
    """Atomically write one excerpt and make its fresh store self-gitignoring."""
    if not isinstance(excerpt_rec, Mapping):
        raise ExcerptStoreError("excerpt record must be a mapping")
    excerpt_id = excerpt_rec.get("excerpt_id")
    if not isinstance(excerpt_id, str) or not excerpt_id or os.path.basename(excerpt_id) != excerpt_id:
        raise ExcerptStoreError("excerpt_id must be a non-empty basename")
    os.makedirs(directory, exist_ok=True)
    ignore_path = os.path.join(directory, ".gitignore")
    if not os.path.exists(ignore_path):
        _atomic_write(ignore_path, "*\n")
    target = os.path.join(directory, excerpt_id)
    try:
        payload = json.dumps(dict(excerpt_rec), ensure_ascii=False, sort_keys=True, indent=2) + "\n"
        _atomic_write(target, payload)
    except (OSError, TypeError, ValueError) as exc:
        raise ExcerptStoreError(f"cannot write excerpt {excerpt_id!r}: {exc}") from None
    return target


def load_excerpt(directory: str, excerpt_id: Any) -> Optional[Dict[str, Any]]:
    """Load one store leaf. Missing material is distinct from an unreadable store."""
    if not isinstance(excerpt_id, str) or not excerpt_id:
        return None
    if os.path.basename(excerpt_id) != excerpt_id:
        raise ExcerptStoreError(f"unsafe excerpt_id {excerpt_id!r}")
    path = os.path.join(directory, excerpt_id)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return None
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ExcerptStoreError(f"cannot read excerpt {excerpt_id!r}: {exc}") from None
    if not isinstance(data, dict):
        raise ExcerptStoreError(f"excerpt {excerpt_id!r} is not a JSON object")
    return data


def verify_verbatim(span: str, excerpt_rec: Any, fact: Any) -> str:
    """Return one closed verdict; only an exact normalized leaf match can confirm."""
    acquisition = read_acquisition(_record_value(fact, "acquisition"))
    if acquisition == METHOD_UNKNOWN:
        return METHOD_UNKNOWN
    if acquisition == "tool-summary":
        return "method-ineligible"
    if isinstance(excerpt_rec, (list, tuple)):
        return "not-in-excerpt"  # a JOIN of leaves is never a source leaf
    if not isinstance(excerpt_rec, Mapping) or not isinstance(excerpt_rec.get("excerpt"), str):
        return "no-excerpt"
    mime, _ = _content_type_parts(excerpt_rec.get("content_type"))
    if not _is_decodable_mime(mime):
        return "no-excerpt"
    excerpt = excerpt_rec["excerpt"]
    expected_excerpt_hash = excerpt_rec.get("sha256_excerpt")
    actual_excerpt_hash = hashlib.sha256(excerpt.encode("utf-8")).hexdigest()
    if not isinstance(expected_excerpt_hash, str) or expected_excerpt_hash != actual_excerpt_hash:
        return "hash-mismatch"
    fact_body_hash = _record_value(fact, "sha256_body")
    if not isinstance(fact_body_hash, str) or fact_body_hash != excerpt_rec.get("sha256_body"):
        return "hash-mismatch"
    fact_url = _record_value(fact, "source_url")
    if fact_url and excerpt_rec.get("source_url") and fact_url != excerpt_rec.get("source_url"):
        return "hash-mismatch"
    try:
        normalized_span = normalize_text(span, excerpt_rec.get("content_type"))
        normalized_excerpt = normalize_text(excerpt, excerpt_rec.get("content_type"))
    except (TypeError, ValueError):
        return "no-excerpt"
    return "verbatim-confirmed" if normalized_span in normalized_excerpt else "not-in-excerpt"
