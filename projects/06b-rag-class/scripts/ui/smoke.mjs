import { chromium, firefox, webkit } from 'playwright';

const results = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.connect('ws://127.0.0.1:9320/');
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<button id="next">Продолжить</button><output></output>');
    await page.evaluate(() => { document.querySelector('#next').onclick = () => {
      document.querySelector('output').textContent = 'Готово';
    }; });
    await page.getByRole('button', { name: 'Продолжить' }).click();
    if (await page.locator('output').textContent() !== 'Готово') throw new Error('Interaction failed');
    const result = { engine: name, version: browser.version(), interaction: 'pass', width: 390 };
    if (name === 'chromium') {
      const cdp = await browser.newBrowserCDPSession();
      const version = await cdp.send('Browser.getVersion');
      result.devtools = { protocol: version.protocolVersion, product: version.product };
      await cdp.detach();
    }
    results.push(result);
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify({ status: 'pass', checks: results }, null, 2));
