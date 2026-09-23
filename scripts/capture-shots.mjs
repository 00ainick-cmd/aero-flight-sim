import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1480,1200',
  ],
  defaultViewport: { width: 1480, height: 1200, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.on('pageerror', (err) => console.error('PAGE', err.message));
await page.goto('http://127.0.0.1:47231/', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#view');
await new Promise((r) => setTimeout(r, 1200));

const air = () => page.evaluate(() => {
  const a = window.__air();
  return {
    phase: window.__lesson(),
    ias: Math.round(a.iasKt),
    gs: Math.round(a.gsKt),
    alt: Math.round(a.altFt),
    pitch: Math.round(a.pitchDeg),
    hdg: Math.round(a.hdgDeg),
    onGround: a.onGround,
    master: window.__sim.elec.master,
    avionics: window.__sim.elec.avionics,
  };
});

await page.screenshot({ path: '/opt/cursor/artifacts/cold-and-dark.png', fullPage: true });
console.log('cold', await air());

await page.evaluate(() => window.__seek('takeoff'));
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: '/opt/cursor/artifacts/takeoff.png', fullPage: true });
console.log('takeoff', await air());

await page.evaluate(() => window.__seek('cruise'));
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: '/opt/cursor/artifacts/cruise-glass.png', fullPage: true });
console.log('cruise', await air());

await page.evaluate(() => window.__reset());
await new Promise((r) => setTimeout(r, 400));
await page.click('[data-coach="master"]');
await new Promise((r) => setTimeout(r, 700));
const afterMaster = await air();
console.log('after master click', afterMaster);
if (!afterMaster.master) throw new Error('MASTER click did not energize the bus');

await browser.close();
