"""Small, dependency-free parsing and path helpers for validate_record.py."""

import hashlib
import json
import os
import re
import stat
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


class DuplicateKey(ValueError):
    pass


def json_pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise DuplicateKey(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path):
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream, object_pairs_hook=json_pairs)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def timestamp(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class Context:
    def __init__(self, root, expected):
        self.root = root
        self.expected = expected
        self.errors = []
        self.unavailable = []

    def error(self, message):
        self.errors.append(message)

    def missing(self, message):
        self.unavailable.append(message)

    def pathref(self, value, label, must_exist=True):
        if not isinstance(value, dict):
            self.error(f"{label}: expected rooted path object")
            return None
        if value.get("root") != "project" or not isinstance(value.get("path"), str):
            self.error(f"{label}: root must be 'project' and path must be a string")
            return None
        raw = value["path"]
        parts = raw.split("/")
        if not raw or raw.startswith("/") or "\\" in raw or any(p in ("", ".", "..") for p in parts):
            self.error(f"{label}: path must be normalized, relative, and non-escaping")
            return None
        candidate = self.root.joinpath(*parts)
        current = self.root
        try:
            for part in parts:
                current = current / part
                if current.exists() or current.is_symlink():
                    if stat.S_ISLNK(current.lstat().st_mode):
                        self.error(f"{label}: symlink component rejected: {raw}")
                        return None
            if os.path.commonpath((str(self.root), str(candidate.absolute()))) != str(self.root):
                self.error(f"{label}: path escapes project root")
                return None
        except (OSError, ValueError) as exc:
            self.missing(f"{label}: path probe failed: {exc}")
            return None
        if must_exist:
            try:
                mode = candidate.stat().st_mode
                if not stat.S_ISREG(mode):
                    self.error(f"{label}: expected regular file")
                    return None
            except OSError as exc:
                self.missing(f"{label}: file unavailable: {exc}")
                return None
        return candidate


def object_value(value, label, ctx):
    if not isinstance(value, dict):
        ctx.error(f"{label}: expected object")
        return {}
    return value


def list_value(value, label, ctx):
    if not isinstance(value, list):
        ctx.error(f"{label}: expected array")
        return []
    return value


def nonempty(value, label, ctx):
    if not isinstance(value, str) or not value.strip():
        ctx.error(f"{label}: expected non-empty string")
        return None
    return value


def strings(value, label, ctx, allow_empty=False):
    items = list_value(value, label, ctx)
    if (not allow_empty and not items) or any(not isinstance(x, str) or not x.strip() for x in items):
        ctx.error(f"{label}: expected {'possibly empty ' if allow_empty else 'non-empty '}string array")
        return []
    return items


def safe_root(raw):
    path = Path(raw)
    if not path.is_absolute():
        raise ValueError("--root must be absolute")
    if ".." in path.parts:
        raise ValueError("--root must be normalized and non-escaping")
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        if current.is_symlink():
            raise ValueError("--root may not contain symlinks")
    if not path.is_dir():
        raise OSError("--root is not an available directory")
    return path


def expect_launch(values):
    result = {}
    for value in values:
        if "=" not in value:
            raise ValueError("--expect-launch must be WORK_ID=SHA256")
        work_id, digest = value.split("=", 1)
        if not work_id or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("--expect-launch requires non-empty WORK_ID and lowercase SHA256")
        if work_id in result:
            raise ValueError("duplicate --expect-launch work ID")
        result[work_id] = digest
    return result


def read_headers(path, ctx, label):
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        ctx.missing(f"{label}: unreadable receipt: {exc}")
        return {}, ""
    fields = {}
    for line in text.splitlines():
        if ": " in line:
            key, value = line.split(": ", 1)
            if key in fields:
                ctx.error(f"{label}: duplicate receipt field {key}")
            fields[key] = value
    return fields, text


def substantive_receipt_payload(text):
    """Return narrative written after the verdict and before the terminal marker."""
    lines = text.splitlines()
    verdict_index = next(
        (index for index, line in enumerate(lines) if line.startswith("Verdict: ")),
        None,
    )
    if verdict_index is None:
        return ""
    payload = []
    for line in lines[verdict_index + 1:]:
        if line == "Status: completed":
            break
        if line.strip() and ": " not in line:
            payload.append(line.strip())
    return "\n".join(payload)


def supported_delivery_uri(value):
    """Accept full HTTP(S) URLs or well-formed URNs; local file URIs are unsupported."""
    if not isinstance(value, str) or not value or any(char.isspace() for char in value):
        return False
    try:
        parsed = urlparse(value)
        if parsed.scheme in ("http", "https"):
            if not parsed.netloc or not parsed.hostname:
                return False
            parsed.port  # Validate a present port without requiring one.
            return True
        if parsed.scheme == "urn" and not parsed.netloc and not parsed.query and not parsed.fragment:
            return re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,31}:.+", parsed.path) is not None
    except ValueError:
        return False
    return False


def guard_preflight(record, ctx):
    value = record.get("preflight")
    if value is None:
        return True
    preflight = object_value(value, "preflight", ctx)
    status = preflight.get("status")
    if status not in ("ready", "blocked", "inconclusive", "not_applicable"):
        ctx.error("preflight.status: unsupported value")
        return True
    if preflight.get("external_actions_executed") is not False or preflight.get("e2e_claim") is not None:
        ctx.error("preflight: must execute no external action and make no E2E claim")
    if status == "not_applicable":
        nonempty(preflight.get("reason"), "preflight.reason", ctx)
        return True
    nonempty(preflight.get("source_revision"), "preflight.source_revision", ctx)
    source = record.get("source") if isinstance(record.get("source"), dict) else {}
    if preflight.get("source_revision") != source.get("current_revision"):
        ctx.error("preflight.source_revision: differs from current source")
    for key in ("build_revision", "environment", "test_command"):
        if preflight.get(key) is not None:
            nonempty(preflight.get(key), f"preflight.{key}", ctx)
    if preflight.get("build_revision") is not None and preflight.get("build_revision") != source.get("build_revision"):
        ctx.error("preflight.build_revision: differs from selected build")
    if preflight.get("evidence_root") is not None:
        ctx.pathref(preflight.get("evidence_root"), "preflight.evidence_root", must_exist=False)
    inputs = list_value(preflight.get("inputs"), "preflight.inputs", ctx)
    for index, item_value in enumerate(inputs):
        item = object_value(item_value, f"preflight.inputs[{index}]", ctx)
        nonempty(item.get("name"), f"preflight.inputs[{index}].name", ctx)
        if type(item.get("available")) is not bool:
            ctx.error(f"preflight.inputs[{index}].available: expected boolean")
    strings(preflight.get("expected_effects"), "preflight.expected_effects", ctx, allow_empty=status != "ready")
    if preflight.get("environment_available") is not None and type(preflight.get("environment_available")) is not bool:
        ctx.error("preflight.environment_available: expected boolean")
    if status == "ready":
        for key in ("build_revision", "environment", "test_command"):
            nonempty(preflight.get(key), f"preflight.{key}", ctx)
        if not inputs:
            ctx.error("preflight.inputs: ready requires at least one input")
        if preflight.get("evidence_root") is None:
            ctx.error("preflight.evidence_root: ready requires an evidence destination")
        if preflight.get("environment_available") is not True or any(i.get("available") is not True for i in inputs if isinstance(i, dict)):
            ctx.error("preflight: ready requires all inputs and environment available")
    else:
        nonempty(preflight.get("reason"), "preflight.reason", ctx)
    return True
