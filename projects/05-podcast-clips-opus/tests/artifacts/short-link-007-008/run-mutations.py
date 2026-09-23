from pathlib import Path
import subprocess
root = Path.cwd()
out = root / 'tests/artifacts/short-link-007-008'
cases = [
 ('sl007', 'packages/shared/src/config.ts',
  "  const publicOrigin = loadRenderOrigin(env);\n  return role === 'worker-video'\n    ? Object.freeze({ ...connections, publicOrigin, role })\n    : Object.freeze({ ...connections, limits: loadLimits(env), publicOrigin, role });",
  "  return role === 'worker-video'\n    ? Object.freeze({ ...connections, publicOrigin: loadRenderOrigin(env), role })\n    : Object.freeze({ ...connections, limits: loadLimits(env), role });",
  ['tests/config.test.ts']),
 ('sl008-diagnosis', 'apps/worker/src/workers/render.ts',
  "error instanceof WatermarkGeometryError ? 'watermark_geometry'\n      : error instanceof FFmpegError ? error.reason : 'ffmpeg_failed'",
  "error instanceof FFmpegError ? error.reason : 'ffmpeg_failed'", ['tests/render-worker.test.ts']),
 ('sl008-retry', 'packages/db/src/render.ts',
  "const next = reason === 'watermark_geometry' ? null\n      : await leaseAttemptTx(tx, attempt.video_id, 'render', attempt.series_no, attempt.clip_id);",
  "const next = await leaseAttemptTx(tx, attempt.video_id, 'render', attempt.series_no, attempt.clip_id);",
  ['tests/render-failure.test.ts'])
]
for name, filename, old, new, tests in cases:
 p = root / filename
 source = p.read_text()
 assert source.count(old) == 1, name
 try:
  p.write_text(source.replace(old, new))
  with (out / f'{name}-mutation-red.txt').open('w') as f:
   result = subprocess.run(['npm', 'test', '--', *tests], stdout=f, stderr=subprocess.STDOUT, timeout=60)
  assert result.returncode == 1, (name, result.returncode)
  print(name, 'mutation exit', result.returncode, flush=True)
 finally:
  p.write_text(source)
