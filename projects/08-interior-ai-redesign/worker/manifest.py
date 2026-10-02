"""Offline provisioning boundary. Stdlib only; never resolves a Hub URL."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

PINS = {
    'sd': ('stable-diffusion-v1-5/stable-diffusion-v1-5', '451f4fe16113bff5a5d2269ed5ad43b0592e9a14'),
    'controlnet': ('lllyasviel/control_v11f1p_sd15_depth', '539f99181d33db39cf1af2e517cd8056785f0a87'),
    'depth': ('Intel/dpt-hybrid-midas', '11eaf7a1cf4bd70740697dbc216f98980c0aeb03'),
}
LICENSES = {'sd': 'creativeml-openrail-m', 'controlnet': 'openrail', 'depth': 'apache-2.0'}


def bounded_read(path, limit):
    path = Path(path)
    if path.resolve() != path.absolute():
        raise ValueError('symlink_denied')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('file_type_denied')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(limit + 1)
            if not data or len(data) > limit:
                raise ValueError('file_limit')
            return data
    finally:
        os.close(fd)


def load_manifest(root):
    root = Path(root)
    if not root.is_absolute() or root.resolve() != root:
        raise ValueError('model_root_denied')
    try:
        raw = bounded_read(root / 'manifest.json', 1024 * 1024)
    except FileNotFoundError as exc:
        raise ValueError('models_missing_provision_pinned_manifest') from exc
    manifest = json.loads(raw)
    if manifest.get('version') != 1 or set(manifest.get('models', {})) != set(PINS):
        raise ValueError('model_manifest_invalid')
    for role, (repo, revision) in PINS.items():
        model = manifest['models'][role]
        if model.get('repository') != repo or model.get('revision') != revision or model.get('license') != LICENSES[role]:
            raise ValueError('model_pin_or_license_invalid')
        files = model.get('files', {})
        if not isinstance(files, dict) or not files or len(files) > 1000:
            raise ValueError('model_files_required')
        folder = root / role
        actual = set()
        for path in folder.rglob('*'):
            if path.is_symlink():
                raise ValueError('model_symlink_denied')
            if path.is_file():
                actual.add(path.relative_to(folder).as_posix())
        if actual != set(files) or not isinstance(model.get('license_file'), str) or model['license_file'] not in files:
            raise ValueError('model_file_or_license_manifest_mismatch')
        for name, digest in files.items():
            if not name or any(part in ('', '.', '..') for part in name.split('/')) or '\\' in name or name.startswith('/') or not re.fullmatch('[a-f0-9]{64}', digest):
                raise ValueError('model_file_invalid')
            if Path(name).suffix.lower() in ('.bin', '.pt', '.pth', '.ckpt', '.pkl', '.pickle', '.py'):
                raise ValueError('unsafe_weights_blocked_provision_safetensors')
            path = folder / name
            if path.resolve() != path.absolute():
                raise ValueError('model_symlink_denied')
            hasher = hashlib.sha256()
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(fd, 'rb') as stream:
                if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                    raise ValueError('model_file_type_denied')
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    hasher.update(chunk)
            if hasher.hexdigest() != digest:
                raise ValueError('model_hash_mismatch')
        if not any(name.endswith('.safetensors') for name in files):
            raise ValueError('safe_depth_weights_not_provisioned')
    return manifest, hashlib.sha256(raw).hexdigest()
