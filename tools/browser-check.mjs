// Scripted check of the built file, opened straight from disk (file://), in Chromium and in Firefox.
// Usage: node tools/browser-check.mjs [chromium|firefox|both]   (Firefox needs a display: run under xvfb-run)
// Paths: CHROMIUM_PATH (default /opt/pw-browsers/chromium) and FIREFOX_PATH. Screenshots go to SHOTS_DIR.
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const which = process.argv[2] || 'both';
const file = 'file://' + resolve('play/testlines.html');
const shots = process.env.SHOTS_DIR || resolve('tools/shots');
mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browserName) {
  const isFx = browserName === 'firefox';
  const exe = isFx ? process.env.FIREFOX_PATH : process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  if (!exe || !existsSync(exe)) throw new Error(`${browserName}: browser not found (${exe})`);
  const browser = await puppeteer.launch({
    browser: isFx ? 'firefox' : 'chrome',
    executablePath: exe,
    headless: isFx ? false : true,
    args: isFx ? [] : ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const results = [];
  const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
  try {
    const page = await browser.newPage();
    // Firefox's driver names the space bar ' '; both browsers then report the code 'Space' to the page.
    const SPACE = isFx ? ' ' : 'Space';
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(file);
    await sleep(2500);
    const T = (fn, ...args) => page.evaluate(fn, ...args);
    ok('page boots with the test hook', await T(() => !!window.__testlines));
    await page.screenshot({ path: `${shots}/${browserName}-start.png` });

    // Focus the yard (left of the panel).
    await page.mouse.move(500, 450);
    await page.mouse.click(500, 450);
    await T(() => window.__testlines.place(0, 0));
    await sleep(200);

    // Walk with W for 1.5 s.
    const s0 = await T(() => window.__testlines.state());
    await page.keyboard.down('KeyW');
    await sleep(1500);
    const s1 = await T(() => window.__testlines.state());
    await page.keyboard.up('KeyW');
    const walkSpeed = Math.hypot(s1.vx, s1.vz);
    ok('W walks at the walk speed (6.3 m/s)', Math.abs(walkSpeed - 6.3) < 0.05, walkSpeed.toFixed(3));
    ok('W moves away from the camera', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 5, `${(s1.x - s0.x).toFixed(2)}, ${(s1.z - s0.z).toFixed(2)}`);
    await sleep(600);
    const s2 = await T(() => window.__testlines.state());
    ok('releasing W stops', Math.hypot(s2.vx, s2.vz) < 0.05, Math.hypot(s2.vx, s2.vz).toFixed(3));

    // Sprint.
    await T(() => window.__testlines.place(10, 10));
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyS');
    await sleep(1200);
    const s3 = await T(() => window.__testlines.state());
    await page.keyboard.up('KeyS');
    await page.keyboard.up('ShiftLeft');
    const sprintSpeed = Math.hypot(s3.vx, s3.vz);
    ok('Shift sprints at 6.3 x 1.214', Math.abs(sprintSpeed - 6.3 * 1.214) < 0.06, sprintSpeed.toFixed(3));
    ok('sprint drains stamina', s3.stamina < 0.9, s3.stamina.toFixed(3));

    // Jump in place: the rise should be 2.52 m.
    await T(() => window.__testlines.place(20, 20));
    await sleep(300);
    await T(() => window.__testlines.peak());
    await page.keyboard.press(SPACE);
    await sleep(1200);
    let peak = await T(() => window.__testlines.peak());
    ok('jump rises 2.52 m (reach 3.07 minus step-up 0.55)', Math.abs(peak - 2.52) < 0.03, peak.toFixed(3));

    // Ledges: W + A moves toward -x at the default turn. Hold Space briefly to jump at the wall.
    const ledge = async (z, label, want) => {
      await T((zz) => window.__testlines.place(-10.6, zz), z);
      await sleep(250);
      await page.keyboard.down('KeyW');
      await page.keyboard.down('KeyA');
      await page.keyboard.press(SPACE);
      await sleep(1000);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('KeyA');
      await sleep(300);
      const top = await T(() => window.__testlines.peak());
      const pass = want > 0 ? Math.abs(top - want) < 0.01 : top < 3.5 - 0.01;
      ok(label, pass, `highest feet ${top.toFixed(3)}`);
    };
    await ledge(-2, 'jump gains the 2.5 m ledge', 2.5);
    await ledge(-8, 'jump gains the 3.07 m ledge (at the reach)', 3.07);
    await ledge(-14, 'jump does not gain the 3.5 m ledge', 0);

    // Steps: 0.55 walks up, 0.56 does not.
    await T(() => window.__testlines.place(-5, 6));
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await sleep(300);
    // W + D moves toward -z at the default turn.
    await sleep(400);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    await sleep(300);
    let top = await T(() => window.__testlines.peak());
    ok('walks up the 0.55 m step', Math.abs(top - 0.55) < 0.01, `highest feet ${top.toFixed(3)}`);
    await T(() => window.__testlines.place(3, -1.5));
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await sleep(800);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    await sleep(300);
    const s = await T(() => window.__testlines.state());
    top = await T(() => window.__testlines.peak());
    ok('stopped by the 0.56 m step', top < 0.01 && s.z > -3.5 - 0.41, `highest feet ${top.toFixed(3)}, z ${s.z.toFixed(2)}`);

    // Middle button turns the camera.
    const a0 = await T(() => window.__testlines.axes());
    await page.mouse.move(600, 450);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(700, 450, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await sleep(500);
    const a1 = await T(() => window.__testlines.axes());
    ok('middle button turns the camera', Math.abs(a1.fwdX - a0.fwdX) > 0.1, `${a0.fwdX.toFixed(3)} -> ${a1.fwdX.toFixed(3)}`);

    // Panel: type a walk speed, then reset it.
    const rowSel = '#panel .p-row';
    const idx = await page.$$eval(rowSel, (rows) => rows.findIndex((r) => r.querySelector('.p-label')?.textContent === 'Walk speed'));
    const rows = await page.$$(rowSel);
    const val = await rows[idx].$('.p-val');
    await val.click({ clickCount: 3 });
    await page.keyboard.type('9');
    await page.keyboard.press('Enter');
    let v = await T(() => window.__testlines.values().walkSpeed);
    ok('typing a value sets it', v === 9, String(v));
    await (await rows[idx].$('.p-reset')).click();
    v = await T(() => window.__testlines.values().walkSpeed);
    ok('the reset puts it back', v === 6.3, String(v));

    // Step rate switch.
    const seg = await page.$$eval('#panel .p-segbtn', (bs) => bs.map((b) => b.textContent));
    const b60 = (await page.$$('#panel .p-segbtn'))[seg.indexOf('60')];
    await b60.click();
    v = await T(() => window.__testlines.values().tickRate);
    ok('step rate switches to 60', v === '60', String(v));
    // Jump at 60 steps: same rise.
    await page.mouse.click(500, 450);
    await T(() => window.__testlines.place(20, 20));
    await sleep(300);
    await T(() => window.__testlines.peak());
    await page.keyboard.press(SPACE);
    await sleep(1200);
    peak = await T(() => window.__testlines.peak());
    ok('jump rises 2.52 m at 60 steps too', Math.abs(peak - 2.52) < 0.03, peak.toFixed(3));

    // Export.
    await page.click('#panel .p-primary');
    await sleep(400);
    const text = await page.$eval('#panel .p-export textarea', (t) => t.value);
    let doc = null;
    try {
      doc = JSON.parse(text);
    } catch {}
    ok('Export gives JSON with date, build and values', !!doc && !!doc.exported && doc.build.startsWith('step') && doc.values.movement.walk_speed_m_per_s === 6.3, doc ? doc.exported : 'no JSON');
    ok('Export carries the old game\'s names', !!doc && Math.abs(doc.old_game_terms['T.jumpV'] - 11) < 0.01, doc ? String(doc.old_game_terms['T.jumpV']) : '');

    // Values survive a reload; Reset all restores them.
    await page.reload();
    await sleep(2000);
    v = await T(() => window.__testlines.values().tickRate);
    ok('values are kept after a reload', v === '60', String(v));
    page.on('dialog', (d) => d.accept());
    const btns = await page.$$('#panel .p-btns .p-btn');
    await btns[1].click();
    await sleep(200);
    v = await T(() => window.__testlines.values().tickRate);
    ok('Reset all restores the start values', v === '30', String(v));

    // Pictures for the eye: walk near the blocks, both guns.
    await page.mouse.click(500, 450);
    await T(() => window.__testlines.place(-6, -4));
    await page.mouse.move(420, 300);
    await sleep(1500);
    await page.screenshot({ path: `${shots}/${browserName}-yard.png` });
    await page.keyboard.press('Digit2');
    await sleep(300);
    await page.screenshot({ path: `${shots}/${browserName}-rifle.png` });
    await page.keyboard.press('Digit1');
    const info = await T(() => window.__testlines.info());
    ok('draw calls reported', info.calls > 0, `${info.calls} calls, ${info.triangles} triangles; ${await T(() => window.__testlines.fps())}`);
    ok('no errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  return results;
}

let failed = 0;
for (const b of which === 'both' ? ['chromium', 'firefox'] : [which]) {
  try {
    const res = await run(b);
    console.log(`\n${b}`);
    for (const r of res) {
      if (!r.pass) failed++;
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
    }
  } catch (e) {
    failed++;
    console.log(`\n${b}\n  FAIL  ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
