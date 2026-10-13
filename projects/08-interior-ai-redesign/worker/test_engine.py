"""Stdlib software tests only. Never real GPU acceptance evidence."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import uuid
from manifest import load_manifest, PINS, LICENSES


class WorkerBoundary(unittest.TestCase):
    def test_missing_offline_models(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'models_missing_provision_pinned_manifest'):
                load_manifest(folder)

    def test_unsafe_pickle_and_model_hash(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            models = {}
            for role, (repo, revision) in PINS.items():
                (root / role).mkdir()
                (root / role / 'pytorch_model.bin').write_bytes(b'unsafe test data')
                models[role] = {'repository': repo, 'revision': revision, 'license': LICENSES[role],
                                'license_file': 'pytorch_model.bin', 'files': {'pytorch_model.bin': '0' * 64}}
            (root / 'manifest.json').write_text(json.dumps({'version': 1, 'models': models}))
            with self.assertRaisesRegex(ValueError, 'unsafe_weights_blocked'):
                load_manifest(folder)

    def test_real_unavailable_is_explicit_not_fixture(self):
        # Run the actual engine in a real subprocess. This environment has no
        # installed GPU stack; if provisioned elsewhere, safe model failure is
        # also acceptable here, never success from a fallback.
        with tempfile.TemporaryDirectory() as folder:
            request = {'id': str(uuid.uuid4()), 'version': 1, 'input_key': str(uuid.uuid4()),
                       'output_key': str(uuid.uuid4()), 'config': {'style': 'warm', 'seed': 1,
                       'mode': 'controlnet', 'steps': 30, 'strength': 0.55, 'guidance_scale': 7.5,
                       'controlnet_conditioning_scale': 1}}
            env = {**os.environ, 'STORAGE_DIR': folder, 'MODEL_ROOT': folder, 'WORKER_MODE': 'controlnet', 'NODE_ENV': 'test'}
            result = subprocess.run(['python3', str(Path(__file__).with_name('engine.py'))],
                                    input=json.dumps(request) + '\n', text=True, capture_output=True, env=env, timeout=15)
            response = json.loads(result.stdout)
            self.assertFalse(response['ok'])
            self.assertIn(response['error'], ['gpu_dependencies_missing', 'cuda_unavailable', 'models_missing_provision_pinned_manifest'])

    def test_production_fixture_denied(self):
        with tempfile.TemporaryDirectory() as folder:
            request = {'id': str(uuid.uuid4()), 'version': 1}
            result = subprocess.run(['python3', str(Path(__file__).with_name('engine.py'))],
                input=json.dumps(request) + '\n', text=True, capture_output=True,
                env={**os.environ, 'STORAGE_DIR': folder, 'WORKER_MODE': 'fixture', 'NODE_ENV': 'production'}, timeout=5)
            self.assertEqual(json.loads(result.stdout)['error'], 'worker_mode_denied')

    def test_manifest_real_file_hash_and_symlink_denial(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); models = {}
            for role, (repo, revision) in PINS.items():
                (root / role).mkdir()
                (root / role / 'model.safetensors').write_bytes(b'SYNTHETIC NONMODEL')
                (root / role / 'LICENSE').write_bytes(b'SYNTHETIC LICENSE')
                models[role] = {'repository': repo, 'revision': revision, 'license': LICENSES[role],
                    'license_file': 'LICENSE', 'files': {'model.safetensors': hashlib.sha256(b'SYNTHETIC NONMODEL').hexdigest(),
                    'LICENSE': hashlib.sha256(b'SYNTHETIC LICENSE').hexdigest()}}
            (root / 'manifest.json').write_text(json.dumps({'version': 1, 'models': models}))
            # Manifest verification alone is not safetensors/model execution.
            load_manifest(folder)
            (root / 'sd' / 'model.safetensors').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'model_hash_mismatch'):
                load_manifest(folder)
            (root / 'sd' / 'model.safetensors').unlink()
            (root / 'sd' / 'model.safetensors').symlink_to(root / 'sd' / 'LICENSE')
            with self.assertRaisesRegex(ValueError, 'model_symlink_denied'):
                load_manifest(folder)


if __name__ == '__main__':
    unittest.main()
