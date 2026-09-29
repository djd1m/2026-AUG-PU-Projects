// Запись страницы в ФИЗИЧЕСКИХ пикселях (deviceScaleFactor 2 → 780×1688 для окна 390×844).
// Зачем: recordVideo Playwright 1.60 (chromium headless) получает кадры screencast в CSS-пикселях — при
// deviceScaleFactor 2 и size 780×1688 он кладёт картинку 390×844 в левый верхний угол серого поля (проверено ffprobe
// и кадром, см. README). Здесь кадры снимаются CDP Page.captureScreenshot (device pixels) так часто, как успевает
// браузер, а в ffmpeg уходят с постоянной частотой FPS: не успевший кадр дублируется предыдущим.
// Кодек — vp8/webm тем же ffmpeg, который поставляет Playwright в образе (/ms-playwright/ffmpeg-*/ffmpeg-linux).
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

function playwrightFfmpeg() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/ms-playwright';
  const dir = readdirSync(root).find((d) => d.startsWith('ffmpeg'));
  if (!dir) throw new Error(`ffmpeg Playwright не найден в ${root}`);
  return path.join(root, dir, 'ffmpeg-linux');
}

export async function startHiDpiRecording(page, file, { width, height, fps = 25, quality = 88 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const ff = spawn(playwrightFfmpeg(), ['-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-y', '-an', '-r', String(fps), '-c:v', 'vp8', '-qmin', '0', '-qmax', '40', '-crf', '6', '-b:v', '6M', '-deadline', 'realtime', '-speed', '6', '-threads', '2',
    '-vf', `scale=${width}:${height}:flags=lanczos`, file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr += d; });
  const exited = new Promise((resolve) => ff.on('close', resolve));
  const frameMs = 1000 / fps;
  let latest = null;
  let running = true;
  let captured = 0;
  let written = 0;
  const started = Date.now();
  // Съёмка: так часто, как отвечает браузер.
  const grab = (async () => {
    while (running) {
      try {
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true });
        latest = Buffer.from(r.data, 'base64');
        captured += 1;
      } catch (error) {
        if (!running) break;
        // Навигация/закрытие кадра — пропускаем тик, последний кадр остаётся.
        await new Promise((r) => setTimeout(r, 20));
      }
    }
  })();
  // Запись: постоянная частота по часам, без накопления дрейфа.
  const writeDue = () => {
    if (!latest) return;
    const due = Math.floor((Date.now() - started) / frameMs);
    while (written < due) { ff.stdin.write(latest); written += 1; }
  };
  const timer = setInterval(writeDue, frameMs / 2);
  return {
    async stop() {
      writeDue();
      running = false;
      clearInterval(timer);
      await grab;
      await cdp.detach().catch(() => {});
      ff.stdin.end();
      const code = await exited;
      if (code !== 0) throw new Error(`ffmpeg завершился с кодом ${code}: ${ffErr.slice(0, 300)}`);
      const seconds = (Date.now() - started) / 1000;
      return { captured, written, seconds: +seconds.toFixed(1), capture_fps: +(captured / seconds).toFixed(1) };
    },
  };
}
