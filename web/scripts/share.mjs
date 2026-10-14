import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const font = await readFile(
    new URL(
      '../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
      import.meta.url,
    ),
  );
  const logo = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
  await page.setContent(
    `<style>@font-face{font-family:Space;src:url(data:font/woff2;base64,${font.toString('base64')})}*{box-sizing:border-box}body{margin:0;background:#101511;color:#f0f3e9;font-family:Space,Arial;padding:64px}header{display:flex;align-items:center;gap:20px;font-size:30px;font-weight:700}svg{width:56px;height:56px}h1{font-size:96px;letter-spacing:-5px;line-height:1.05;margin:56px 0 24px;font-weight:700}h1 span{color:#b8ee75}p{font-size:28px;color:#a8b4a8}footer{border-top:1px solid #36443a;margin-top:50px;padding-top:25px;display:flex;justify-content:space-between;font-size:20px;color:#a8b4a8}</style><header>${logo}VETERANS</header><h1>Mine your <span>legacy.</span></h1><p>Proof-of-work miners. Rewards that grow with wallet age.</p><footer><span>3,333 miners · 0.069 IMD per mint</span><span>Robinhood Chain</span></footer>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL('../public/share.png', import.meta.url).pathname });
  console.log('Created 1200 × 630 share card from the site design.');
} finally {
  await browser.close();
}
