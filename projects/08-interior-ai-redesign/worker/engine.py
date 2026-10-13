"""Persistent single-flight JSON-lines engine. No SQL, providers or downloads."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from manifest import bounded_read, load_manifest, PINS

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
UUID = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
PROMPTS = {
    'warm': 'warm inviting interior, natural wood, soft warm colors',
    'minimal': 'minimalist interior, clean lines, neutral colors',
    'afrohemian': 'afrohemian interior, woven textures, earthy colors',
    'playful': 'playful interior, colorful decor, cheerful accents',
}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def write_artifact(root, folder, key, data):
    path = root / folder / key
    if path.parent.resolve() != path.parent:
        raise ValueError('storage_symlink_denied')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)


class Runtime:
    def __init__(self):
        self.pipeline = None
        self.jobs = 0
        self.root = Path(os.environ.get('STORAGE_DIR', ''))
        self.mode = os.environ.get('WORKER_MODE')
        if not self.root.is_absolute() or self.root.resolve() != self.root:
            raise ValueError('storage_root_denied')
        if self.mode not in ('fixture', 'controlnet') or (self.mode == 'fixture' and os.environ.get('NODE_ENV') == 'production'):
            raise ValueError('worker_mode_denied')

    def load(self):
        try:
            import torch
            from diffusers import ControlNetModel, StableDiffusionControlNetImg2ImgPipeline
            from transformers import DPTImageProcessor, DPTForDepthEstimation
        except ImportError as exc:
            raise ValueError('gpu_dependencies_missing') from exc
        if not torch.cuda.is_available():
            raise ValueError('cuda_unavailable')
        model_root = Path(os.environ.get('MODEL_ROOT', ''))
        manifest, self.manifest_sha = load_manifest(model_root)
        self.torch = torch
        self.depth_processor = DPTImageProcessor.from_pretrained(str(model_root / 'depth'), local_files_only=True)
        self.depth_model = DPTForDepthEstimation.from_pretrained(
            str(model_root / 'depth'), local_files_only=True, use_safetensors=True, trust_remote_code=False).to('cuda').eval()
        control = ControlNetModel.from_pretrained(str(model_root / 'controlnet'), local_files_only=True,
                                                  use_safetensors=True, torch_dtype=torch.float16)
        self.pipeline = StableDiffusionControlNetImg2ImgPipeline.from_pretrained(
            str(model_root / 'sd'), controlnet=control, local_files_only=True, use_safetensors=True,
            torch_dtype=torch.float16, requires_safety_checker=True).to('cuda')
        if self.pipeline.safety_checker is None or self.pipeline.feature_extractor is None:
            raise ValueError('safety_checker_required')
        self.pipeline.set_progress_bar_config(disable=True)
        self.hardware = torch.cuda.get_device_name(0)

    def generate(self, request):
        start = time.monotonic_ns()
        key, input_key, config = request.get('output_key'), request.get('input_key'), request.get('config')
        if not UUID.fullmatch(key or '') or not UUID.fullmatch(input_key or '') or not isinstance(config, dict):
            raise ValueError('request_keys_invalid')
        if config.get('style') not in PROMPTS or type(config.get('seed')) is not int or not 0 <= config['seed'] < 2**32:
            raise ValueError('generation_config_invalid')
        if config.get('mode') != self.mode or config.get('steps') != 30 or config.get('strength') != 0.55 or config.get('guidance_scale') != 7.5 or config.get('controlnet_conditioning_scale') != 1:
            raise ValueError('generation_config_invalid')
        # Fixture uses Pillow only and is visibly labelled, never accepted quality.
        if self.mode == 'controlnet' and self.pipeline is None:
            self.load()
        if self.mode == 'controlnet' and (config.get('manifest_sha') != self.manifest_sha or config.get('model_revisions') != {k: v[1] for k, v in PINS.items()}):
            raise ValueError('manifest_config_mismatch')
        from PIL import Image, ImageDraw
        import io
        raw = bounded_read(self.root / input_key, 10485760)
        Image.MAX_IMAGE_PIXELS = 20000000
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 20000000 or getattr(image, 'n_frames', 1) != 1:
            raise ValueError('input_pixels_denied')
        image = image.convert('RGB')
        warm = self.mode == 'controlnet' and self.jobs > 0
        if self.mode == 'fixture':
            result = image.copy()
            ImageDraw.Draw(result).text((8, 8), 'SYNTHETIC FIXTURE - NOT GPU QUALITY', fill='red')
            depth = Image.new('RGB', image.size, (127, 127, 127))
            hardware = 'synthetic software fixture; no GPU inference'
        else:
            torch = self.torch
            with torch.inference_mode():
                pixels = self.depth_processor(images=image, return_tensors='pt').to('cuda')
                predicted = self.depth_model(**pixels).predicted_depth
                depth_tensor = torch.nn.functional.interpolate(predicted.unsqueeze(1), size=(image.height, image.width), mode='bicubic', align_corners=False)
                minimum, maximum = depth_tensor.min(), depth_tensor.max()
                if not torch.isfinite(depth_tensor).all() or maximum <= minimum:
                    raise ValueError('depth_invalid')
                depth_array = ((depth_tensor - minimum) / (maximum - minimum) * 255).squeeze().cpu().numpy().astype('uint8')
                depth = Image.fromarray(depth_array).convert('RGB')
                # Pad resized canvas to multiples of8, then remove padding and
                # restore exact input dimensions. Never stretch to a square.
                scale = min(1, 768 / max(image.size))
                size = (max(8, round(image.width * scale)), max(8, round(image.height * scale)))
                canvas_size = tuple((v + 7) // 8 * 8 for v in size)
                resized = image.resize(size)
                canvas = Image.new('RGB', canvas_size); canvas.paste(resized)
                conditioning = Image.new('RGB', canvas_size); conditioning.paste(depth.resize(size))
                generated = self.pipeline(prompt=PROMPTS[config['style']] + ', same room structure, preserve all windows and doors',
                    negative_prompt='changed walls, new windows, missing doors, distorted geometry', image=canvas,
                    control_image=conditioning, width=canvas_size[0], height=canvas_size[1], strength=config['strength'],
                    num_inference_steps=config['steps'], guidance_scale=config['guidance_scale'],
                    controlnet_conditioning_scale=config['controlnet_conditioning_scale'],
                    generator=torch.Generator(device='cuda').manual_seed(config['seed']))
                if generated.nsfw_content_detected is None or any(generated.nsfw_content_detected):
                    raise ValueError('safety_output_rejected')
                result = generated.images[0].crop((0, 0, *size)).resize(image.size)
                torch.cuda.synchronize()
                hardware = self.hardware
        artifacts = {}
        for name, value in [('output', result), ('depth', depth)]:
            buffer = io.BytesIO(); value.save(buffer, format='PNG'); artifacts[name] = buffer.getvalue()
            if len(artifacts[name]) > 10485760:
                raise ValueError('output_bytes_denied')
        config_bytes = canonical(config)
        write_artifact(self.root, 'outputs', key, artifacts['output'])
        write_artifact(self.root, 'depths', key, artifacts['depth'])
        write_artifact(self.root, 'configs', key, config_bytes)
        self.jobs += 1
        return {'hashes': {k + '_sha': hashlib.sha256(v).hexdigest() for k, v in
                [('input', raw), ('output', artifacts['output']), ('depth', artifacts['depth']), ('config', config_bytes)]},
                'hardware': hardware, 'warm': warm, 'inference_ms': (time.monotonic_ns() - start) // 1000000}


def main():
    runtime = None
    while True:
        line = sys.stdin.buffer.readline(8193)
        if not line:
            return
        if len(line) > 8192 or not line.endswith(b'\n'):
            return
        request = {}
        try:
            request = json.loads(line)
            if request.get('version') != 1 or not UUID.fullmatch(request.get('id', '')):
                raise ValueError('protocol_invalid')
            # Keep all library stdout out of the bounded JSON protocol.
            with contextlib.redirect_stdout(sys.stderr):
                if runtime is None:
                    runtime = Runtime()
                result = runtime.generate(request)
            response = {'version': 1, 'id': request['id'], 'ok': True, **result}
        except Exception as exc:
            code = str(exc) if isinstance(exc, ValueError) and re.fullmatch('[a-z0-9_]{1,100}', str(exc)) else 'engine_failed'
            response = {'version': 1, 'id': request.get('id'), 'ok': False, 'error': code}
        print(json.dumps(response, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    main()
