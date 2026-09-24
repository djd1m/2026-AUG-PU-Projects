# Разовые образцы уплотнения для выбора K владельцем (не код продукта).
# Порог — медиана огибающей ВСЕЙ записи − 18 дБ (proposal density §3: −24,6 − 18 = −42,6 дБFS).
import subprocess, numpy as np, json, sys
SR, FRAME = 16000, 0.02             # огибающая по 20 мс
THRESH_DB, T_MIN, T_MAX, EDGE, XF = -42.6, 0.30, 2.0, 0.5, 0.06
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'seg.mp4', '-map', '0:a:0', '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                     capture_output=True, check=True).stdout
x = np.frombuffer(pcm, dtype=np.int16).astype(np.float64) / 32768
n = int(SR * FRAME); frames = len(x) // n
rms = np.sqrt(np.mean(x[:frames * n].reshape(frames, n) ** 2, axis=1) + 1e-12)
db = 20 * np.log10(rms); dur = len(x) / SR
quiet = db < THRESH_DB
runs, i = [], 0
while i < frames:
    if quiet[i]:
        j = i
        while j < frames and quiet[j]: j += 1
        a, b = i * FRAME, j * FRAME
        if T_MIN <= b - a <= T_MAX and a >= EDGE and b <= dur - EDGE: runs.append((a, b))
        i = j
    else: i += 1
report = {'duration': round(dur, 3), 'silences': [(round(a, 2), round(b, 2)) for a, b in runs]}
for K in [0.05, 0.10, 0.15, 0.25]:
    keep_side = (K + XF) / 2            # после перекрестия XF в стыке остаётся ровно K тишины
    segs, cur = [], 0.0
    for a, b in runs:
        if b - a <= K + XF: continue
        segs.append((cur, a + keep_side)); cur = b - keep_side
    segs.append((cur, dur))
    parts, v, au = [], [], []
    for k, (s, e) in enumerate(segs):
        parts.append(f"[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS,crop=ih*9/16:ih,scale=1080:1920,setsar=1,fps=25,format=yuv420p[v{k}]")
        parts.append(f"[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a{k}]")
    vl, al, offset = 'v0', 'a0', segs[0][1] - segs[0][0]
    for k in range(1, len(segs)):
        offset -= XF
        parts.append(f"[{vl}][v{k}]xfade=transition=fade:duration={XF}:offset={offset:.3f}[vx{k}]")
        parts.append(f"[{al}][a{k}]acrossfade=d={XF}[ax{k}]")
        vl, al = f"vx{k}", f"ax{k}"; offset += segs[k][1] - segs[k][0]
    out = f"k{int(K*100):03d}.mp4"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'seg.mp4', '-filter_complex', ';'.join(parts), '-map', f'[{vl}]', '-map', f'[{al}]',
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], check=True)
    got = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout)
    report[out] = {'K': K, 'cuts': len(segs) - 1, 'length': round(got, 2), 'saved_s': round(dur - got, 2), 'saved_pct': round(100 * (dur - got) / dur, 1)}
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'seg.mp4', '-vf', 'crop=ih*9/16:ih,scale=1080:1920,setsar=1', '-c:v', 'libx264', '-preset', 'fast',
                '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'k000-original.mp4'], check=True)
print(json.dumps(report, ensure_ascii=False, indent=1))
