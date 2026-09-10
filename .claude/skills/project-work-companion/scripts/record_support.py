"""Small, dependency-free parsing and path helpers for validate_record.py."""

import hashlib
import json
import os
import stat
from datetime import datetime
from pathlib import Path


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
