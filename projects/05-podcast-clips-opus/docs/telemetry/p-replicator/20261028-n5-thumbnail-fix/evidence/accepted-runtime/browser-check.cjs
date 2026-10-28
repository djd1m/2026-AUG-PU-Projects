const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('/opt/browser/node_modules/playwright');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json')));
const base = 'https://localhost:4435', out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
const report = { source_revision: 'd6fee35f52926c6b64fa4c79d238859548c8ddff', started_at: new Date().toISOString(), checks: [], engines: [], assets: [], playback: [], screenshots: [], errors: [] };
let stage = 'start', active;
function check(name, ok) { report.checks.push({ name, pass: Boolean(ok) }); assert.ok(ok, name); }
(async () => {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    stage = name + '-launch'; active = await engine.launch({ headless: true });
    report.engines.push({ name, version: active.version() });
    const context = await active.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(base + '/');
    await page.locator('#auth input[name=email]').fill(fixture.email);
    await page.locator('#auth input[name=password]').fill(fixture.password);
    await page.locator('#auth button:not([type=button])').click();
    await page.waitForURL('**/dashboard');
    for (const width of [360, 900]) for (const theme of ['dark', 'light']) {
      stage = `${name}-${width}-${theme}`;
      await page.setViewportSize({ width, height: 900 });
      await context.clearCookies({ name: 'n5_theme' });
      if (theme === 'light') await context.addCookies([{ name: 'n5_theme', value: 'light', url: base }]);
      await page.goto(base + '/dashboard/videos/' + fixture.video_id);
      await page.getByRole('heading', { name: 'Ваши клипы', exact: true }).waitFor();
      const cards = page.locator('.clip-card'), videos = cards.locator('video');
      check(stage + ' three cards', await cards.count() === 3);
      check(stage + ' three available previews', await videos.count() === 3);
      check(stage + ' three enabled downloads', await cards.getByRole('button', { name: 'Скачать клип', exact: true }).count() === 3 && await cards.getByRole('button', { name: 'Скачать клип', exact: true }).first().isEnabled());
      check(stage + ' no partial-render warning', await page.getByText('Часть клипов не удалось собрать.', { exact: false }).count() === 0);
      check(stage + ' correct theme', await page.locator('html').getAttribute('data-theme') === theme);
      check(stage + ' no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      for (let i = 0; i < 3; i++) {
        const poster = await videos.nth(i).getAttribute('poster');
        const good = await page.evaluate(src => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0); image.onerror = () => resolve(false); image.src = src; }), new URL(poster, base).href);
        check(stage + ' decoded poster ' + i, good);
        if (width === 360 && theme === 'dark') {
          await videos.nth(i).scrollIntoViewIfNeeded();
          const metadata = await videos.nth(i).evaluate(async video => {
            video.muted = true; video.load();
            await new Promise((resolve, reject) => { if (video.readyState >= 1) return resolve(); const timer = setTimeout(() => reject(new Error('metadata unavailable')), 10000); video.onloadedmetadata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(new Error('media unavailable')); }; });
            await video.play(); await new Promise(resolve => { const until = performance.now() + 5000; const poll = () => { if ((video.currentTime > 0 && video.videoWidth > 0) || performance.now() >= until) resolve(); else setTimeout(poll, 50); }; poll(); }); video.pause();
            return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, advanced: video.currentTime > 0 };
          });
          report.playback.push({ engine: name, index: i, ...metadata });
          check(name + ' playable 1080x1920 video ' + i, metadata.width === 1080 && metadata.height === 1920 && metadata.duration > 20 && metadata.advanced);
          if (name === 'chromium') {
            const src = await videos.nth(i).getAttribute('src');
            for (const [kind, url, mime, extension] of [['video', src, 'video/mp4', 'mp4'], ['poster', poster, 'image/jpeg', 'jpg']]) {
              const response = await context.request.get(new URL(url, base).href);
              check(kind + ' HTTP/MIME ' + i, response.ok() && response.headers()['content-type']?.startsWith(mime));
              const body = await response.body(); check(kind + ' bounded actual body ' + i, body.length > 100 && body.length < 40 * 1024 * 1024);
              const file = `clip-${i}.${extension}`; fs.writeFileSync(path.join(out, file), body, { mode: 0o600 });
              report.assets.push({ kind, index: i, clip_id: new URL(url, base).pathname.split('/')[3], file, bytes: body.length, mime: response.headers()['content-type'] });
            }
          }
        }
      }
      const shot = stage + '.png'; await page.screenshot({ path: path.join(out, shot), fullPage: true }); report.screenshots.push(shot);
    }
    if (name === 'chromium') {
      stage = 'actual download button';
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.clip-card').first().getByRole('button', { name: 'Скачать клип', exact: true }).click()]);
      report.download_failure = await download.failure();
      await download.saveAs(path.join(out, 'clicked-download.mp4')); check('actual UI download finishes', report.download_failure === null);
    }
    await active.close(); active = null;
  }
})().catch(error => { report.errors.push({ stage, error_class: error.name, message: String(error.message).replaceAll(fixture.password, '[redacted]').replaceAll(fixture.email, '[synthetic email]').replace(/https?:\/\/[^\s]+/g, '[URL]').slice(0, 500) }); process.exitCode = 1; }).finally(async () => {
  await active?.close(); report.finished_at = new Date().toISOString(); report.exit_code = process.exitCode || 0;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ exit_code: report.exit_code, checks: report.checks.length, errors: report.errors, screenshots: report.screenshots.length }));
});
