import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const out = process.env.OUT_DIR;
const chrome = process.env.CHROME_PATH;
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox','--disable-dev-shm-usage','--window-size=1480,1200'],
  defaultViewport: { width: 1480, height: 1200, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (err) => console.error('PAGE', err.message));
await page.goto('http://127.0.0.1:47231/', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#view');
await new Promise((r) => setTimeout(r, 1500));

const air = () => page.evaluate(() => {
  const a = window.__air();
  return {
    phase: window.__lesson(),
    ias: Math.round(a.iasKt),
    gs: Math.round(a.gsKt),
    alt: Math.round(a.altFt),
    pitch: Math.round(a.pitchDeg),
    hdg: Math.round(a.hdgDeg),
    vs: Math.round(a.vsFpm),
    onGround: a.onGround,
    master: window.__sim.elec.master,
    avionics: window.__sim.elec.avionics,
  };
});

const results = [];
await page.screenshot({ path: path.join(out, 'klaus-cold-and-dark.png'), fullPage: true });
const cold = await air();
results.push({ frame: 'cold', ...cold });
console.log('cold', JSON.stringify(cold));

await page.evaluate(() => window.__seek('takeoff'));
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: path.join(out, 'klaus-takeoff.png'), fullPage: true });
const takeoff = await air();
results.push({ frame: 'takeoff', ...takeoff });
console.log('takeoff', JSON.stringify(takeoff));

await page.evaluate(() => window.__seek('cruise'));
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: path.join(out, 'klaus-cruise-glass.png'), fullPage: true });
const cruise = await air();
results.push({ frame: 'cruise', ...cruise });
console.log('cruise', JSON.stringify(cruise));

await page.evaluate(() => window.__reset());
await new Promise((r) => setTimeout(r, 500));
await page.click('[data-coach="master"]');
await new Promise((r) => setTimeout(r, 800));
const afterMaster = await air();
results.push({ frame: 'after-master-click', ...afterMaster });
console.log('after master click', JSON.stringify(afterMaster));
if (!afterMaster.master) throw new Error('MASTER click did not energize the bus');

fs.writeFileSync(path.join(out, 'klaus-verify.json'), JSON.stringify(results, null, 2));
await browser.close();
console.log('VERIFY_OK');
