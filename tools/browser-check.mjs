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

    // Past an edge: the centre 0.25 m beyond the 2.5 m ledge (inside the body, outside the feet) falls.
    await T(() => window.__testlines.place(-11.75, -2, 2.5));
    await sleep(900);
    const off = await T(() => window.__testlines.state());
    ok('does not stand on air past an edge', off.y < 0.01, `feet ${off.y.toFixed(3)}`);
    await T(() => window.__testlines.place(-12.1, -2, 2.5));
    await sleep(600);
    const on = await T(() => window.__testlines.state());
    ok('stands with the feet just on the edge', Math.abs(on.y - 2.5) < 0.01, `feet ${on.y.toFixed(3)}`);

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

    // A value box left untouched keeps the exact value; Escape cancels what was typed.
    const rowOf = async (label) => {
      const i = await page.$$eval(rowSel, (rs, l) => rs.findIndex((r) => r.querySelector('.p-label')?.textContent === l), label);
      return (await page.$$(rowSel))[i];
    };
    const accRow = await rowOf('Speed-up time (to 90 %)');
    await (await accRow.$('.p-val')).click();
    await page.mouse.click(500, 450);
    v = await T(() => window.__testlines.values().accelTime);
    ok('an untouched value box keeps the exact value', Math.abs(v - Math.log(10) / 14) < 1e-12, String(v));
    const walkRow = await rowOf('Walk speed');
    await (await walkRow.$('.p-val')).click({ clickCount: 3 });
    await page.keyboard.type('11');
    await page.keyboard.press('Escape');
    await page.mouse.click(500, 450);
    v = await T(() => window.__testlines.values().walkSpeed);
    ok('Escape cancels a typed value', v === 6.3, String(v));
    const angRow = await rowOf('Angle above the ground');
    const angText = await (await angRow.$('.p-val')).evaluate((e) => e.value);
    ok('the angle shows the real view angle as auto', angText === 'auto 32.0', angText);

    // At a high gravity the top of the jump falls between steps: the reach must still hold at 30 steps.
    await T(() => window.__testlines.set('gravity', 50));
    // The turn check above left the camera turned; setting the turn puts the live turn back to zero.
    await T(() => window.__testlines.set('camTurn', 45));
    await page.mouse.click(500, 450);
    await ledge(-8, 'gravity 50: the 3.07 m ledge is still gained at 30 steps', 3.07);
    await T(() => window.__testlines.set('gravity', 24));

    // Dummies: eleven, walking their loops; they stand when switched off.
    const d0 = await T(() => window.__testlines.dummies());
    await sleep(1000);
    const d1 = await T(() => window.__testlines.dummies());
    const walked = d0.filter((p, i) => Math.hypot(p.x - d1[i].x, p.z - d1[i].z) > 1).length;
    ok('eleven dummies walk their loops', d0.length === 11 && walked >= 10, `${d0.length} dummies, ${walked} moved more than 1 m in 1 s`);
    await T(() => window.__testlines.set('dummiesWalk', false));
    await sleep(500);
    const d2 = await T(() => window.__testlines.dummies());
    await sleep(800);
    const d3 = await T(() => window.__testlines.dummies());
    const still = d2.every((p, i) => Math.hypot(p.x - d3[i].x, p.z - d3[i].z) < 0.02);
    ok('dummies stand still when switched off', still);

    // Soft push: two soldiers on top of each other come apart to about two push radii.
    await T(() => window.__testlines.set('camTurn', 45));
    await page.mouse.click(500, 450);
    await T(() => window.__testlines.placeDummy(0, 30, 30));
    await T(() => window.__testlines.place(30.05, 30));
    await sleep(1500);
    const me = await T(() => window.__testlines.state());
    const du = (await T(() => window.__testlines.dummies()))[0];
    const gap = Math.hypot(me.x - du.x, me.z - du.z);
    ok('soldiers on top of each other push apart', gap > 0.7 && gap < 0.81, `${gap.toFixed(3)} m apart (two radii: 0.80)`);

    // Never block: walking at a standing dummy, the soldier gets past it and shoves it aside.
    await T(() => window.__testlines.placeDummy(0, 8, 8));
    await T(() => window.__testlines.place(11, 11));
    await sleep(200);
    await page.keyboard.down('KeyW');
    await sleep(1500);
    await page.keyboard.up('KeyW');
    await sleep(300);
    const me2 = await T(() => window.__testlines.state());
    const du2 = (await T(() => window.__testlines.dummies()))[0];
    // Distance along the walk (from the start at 11, 11 toward -x, -z) of the soldier and of the dummy at the end.
    const alongOf = (p) => (11 + 11 - p.x - p.z) / Math.SQRT2;
    const along = alongOf(me2);
    const shoved = Math.hypot(du2.x - 8, du2.z - 8);
    ok('a standing dummy never blocks: the soldier gets past', along > alongOf(du2) + 1, `soldier ${along.toFixed(2)} m along, dummy now ${alongOf(du2).toFixed(2)} m along`);
    ok('the dummy is shoved aside', shoved > 0.2, `${shoved.toFixed(2)} m`);
    // The same at the stiffest push: still never blocked.
    await T(() => window.__testlines.set('pushStrength', 40));
    await T(() => window.__testlines.placeDummy(0, 8, 8));
    await T(() => window.__testlines.place(11, 11));
    await sleep(200);
    await page.keyboard.down('KeyW');
    await sleep(1500);
    await page.keyboard.up('KeyW');
    await sleep(300);
    const me3 = await T(() => window.__testlines.state());
    const du3 = (await T(() => window.__testlines.dummies()))[0];
    ok('at the stiffest push a standing dummy still never blocks', alongOf(me3) > alongOf(du3) + 1, `soldier ${alongOf(me3).toFixed(2)} m along, dummy now ${alongOf(du3).toFixed(2)} m along`);
    await T(() => window.__testlines.set('pushStrength', 8));
    await T(() => window.__testlines.set('dummiesWalk', true));

    // Shooting: dummies stopped, one dummy 7 m in front, the cursor on it.
    await T(() => window.__testlines.set('dummiesWalk', false));
    await T(() => window.__testlines.set('gun', 'smg'));
    await T(() => window.__testlines.place(20, 20));
    await T(() => window.__testlines.placeDummy(0, 20, 13));
    // The camera eases after the soldier is moved: let it settle, then put the cursor on the dummy (twice, since
    // moving the cursor nudges the framing).
    const aimAt = async (x, z) => {
      await sleep(1500);
      for (let k = 0; k < 2; k++) {
        const p = await T((xx, zz) => window.__testlines.screenOf(xx, 1.36, zz), x, z);
        await page.mouse.move(p.x, p.y);
        await sleep(700);
      }
    };
    await aimAt(20, 13);
    let g0 = await T(() => window.__testlines.gun());
    const t0 = Date.now();
    await page.mouse.down();
    await sleep(1000);
    await page.mouse.up();
    const held = (Date.now() - t0) / 1000;
    let g1 = await T(() => window.__testlines.gun());
    const fired = g1.shots - g0.shots;
    ok('the SMG fires at its rate while held (0.072 s a shot)', Math.abs(fired - held / 0.072) <= 4, `${fired} shots in about ${held.toFixed(2)} s`);
    ok('each shot takes a round', g0.ammo - g1.ammo === fired, `${g0.ammo} -> ${g1.ammo}`);
    // With the old numbers the SMG's spread recovers (0.7/s) faster than its shots add to it (14 x 0.005/s), so
    // it stays at rest. With more added per shot it grows while the trigger is held.
    ok('with the old numbers the SMG spread stays at rest', g1.spread <= 0.075 + 0.0051, g1.spread.toFixed(4));
    let dmy = (await T(() => window.__testlines.dummies()))[0];
    ok('hits hurt the dummy', dmy.health < 100, `health ${dmy.health.toFixed(0)}`);
    ok('a hit dummy stays on its spot (the knockback is drawn only)', Math.hypot(dmy.x - 20, dmy.z - 13) < 0.01, `${dmy.x.toFixed(2)}, ${dmy.z.toFixed(2)}`);
    // Keep firing until it drops, then it stands again after 4 s with full health.
    await page.mouse.down();
    for (let i = 0; i < 30 && !(await T(() => window.__testlines.dummies()))[0].down; i++) await sleep(100);
    await page.mouse.up();
    dmy = (await T(() => window.__testlines.dummies()))[0];
    ok('enough hits drop the dummy', dmy.down, `health ${dmy.health.toFixed(0)}`);
    await sleep(4600);
    dmy = (await T(() => window.__testlines.dummies()))[0];
    ok('a dropped dummy stands again with full health', !dmy.down && dmy.health === 100, `down ${dmy.down}, health ${dmy.health}`);
    ok('with the old numbers SMG shots leave at the rest spread', Math.abs(g1.lastShotSpread - 0.075) < 1e-9, g1.lastShotSpread.toFixed(4));
    // With more added per shot than the recovery takes back, shots leave with a growing spread.
    await T(() => window.__testlines.set('smgSpreadPerShot', 0.1));
    await page.mouse.down();
    await sleep(600);
    const gs = await T(() => window.__testlines.gun());
    await page.mouse.up();
    ok('with more spread per shot than recovers, it builds up', gs.lastShotSpread > 0.075 + 0.01, `a shot left with ${gs.lastShotSpread.toFixed(4)}`);
    await T(() => window.__testlines.set('smgSpreadPerShot', 0.005));
    // R reloads the SMG.
    await page.keyboard.press('KeyR');
    await sleep(300);
    g1 = await T(() => window.__testlines.gun());
    ok('R starts a reload', g1.reloadLeft > 0, `${g1.reloadLeft.toFixed(2)} s left`);
    await sleep(2200);
    g1 = await T(() => window.__testlines.gun());
    ok('the reload fills the magazine (1.9 s)', g1.ammo === 36 && g1.reloadLeft === 0, `${g1.ammo} rounds`);
    // The active reload. For the check: a 4 s reload and a window from 30 % to 70 %, and the tap goes in once the
    // bar passes 33 %, so a tap that reaches the page a frame or two late still lands.
    await T(() => window.__testlines.set('smgReload', 4));
    await T(() => window.__testlines.set('smgActiveStart', 30));
    await T(() => window.__testlines.set('smgActiveWidth', 40));
    await page.mouse.down();
    await sleep(300);
    await page.mouse.up();
    await page.keyboard.press('KeyR');
    let gr = await T(() => window.__testlines.gun());
    let doneAtTap = 0;
    for (let i = 0; i < 100; i++) {
      gr = await T(() => window.__testlines.gun());
      doneAtTap = gr.reloadTotal ? 1 - gr.reloadLeft / gr.reloadTotal : 0;
      if (gr.reloadLeft > 0 && doneAtTap >= 0.33) break;
      await sleep(30);
    }
    await page.keyboard.press('KeyR');
    await sleep(250);
    gr = await T(() => window.__testlines.gun());
    ok(
      'a tap of R inside the window ends the reload at once',
      gr.active === 'perfect' && gr.reloadLeft === 0 && gr.ammo === 36,
      `${gr.active}, tapped at about ${(doneAtTap * 100).toFixed(0)} %, ${gr.ammo} rounds`,
    );
    // A tap too early is a miss: the reload carries on to its full time, and a second tap does nothing.
    await page.mouse.down();
    await sleep(300);
    await page.mouse.up();
    await page.keyboard.press('KeyR');
    await sleep(150);
    await page.keyboard.press('KeyR');
    await sleep(250);
    gr = await T(() => window.__testlines.gun());
    ok('a tap outside the window is a miss and the reload goes on', gr.active === 'miss' && gr.reloadLeft > 0, `${gr.active}, ${gr.reloadLeft.toFixed(2)} s left`);
    await sleep(500);
    await page.keyboard.press('KeyR');
    await sleep(250);
    gr = await T(() => window.__testlines.gun());
    ok('only one try per reload', gr.active === 'miss' && gr.reloadLeft > 0, `${gr.active}, ${gr.reloadLeft.toFixed(2)} s left`);
    await sleep(3200);
    gr = await T(() => window.__testlines.gun());
    ok('after a miss the reload ends at its normal time', gr.reloadLeft === 0 && gr.ammo === 36, `${gr.ammo} rounds`);
    await T(() => window.__testlines.set('smgReload', 1.9));
    await T(() => window.__testlines.set('smgActiveStart', 40));
    await T(() => window.__testlines.set('smgActiveWidth', 20));

    // The rifle: one shot per click, then it reloads by itself (magazine of 1, 3.5 s).
    await page.keyboard.press('Digit2');
    await sleep(400);
    g0 = await T(() => window.__testlines.gun());
    await page.mouse.down();
    await sleep(600);
    await page.mouse.up();
    g1 = await T(() => window.__testlines.gun());
    ok('the rifle fires once per click', g1.gun === 'rifle' && g1.shots - g0.shots === 1, `${g1.shots - g0.shots} shots`);
    ok('an empty rifle reloads by itself', g1.ammo === 0 && g1.reloadLeft > 0, `${g1.ammo} rounds, ${g1.reloadLeft.toFixed(2)} s left`);
    await sleep(3600);
    g1 = await T(() => window.__testlines.gun());
    ok('the rifle is loaded again after its reload', g1.ammo === 1, `${g1.ammo} rounds`);
    // The rifle's reload starts by itself after its one round; a tap in the window (40 % to 60 % of 3.5 s) ends it.
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    await sleep(1400 + 350);
    await page.keyboard.press('KeyR');
    await sleep(250);
    g1 = await T(() => window.__testlines.gun());
    ok('a perfect tap ends the rifle\'s automatic reload', g1.active === 'perfect' && g1.ammo === 1, `${g1.active}, ${g1.ammo} rounds`);
    // A rifle click while sprinting waits out the sprint-to-fire delay, then fires.
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyS');
    await sleep(600);
    g0 = await T(() => window.__testlines.gun());
    await page.mouse.down();
    await sleep(30);
    await page.mouse.up();
    await sleep(900);
    g1 = await T(() => window.__testlines.gun());
    await page.keyboard.up('KeyS');
    await page.keyboard.up('ShiftLeft');
    ok('a rifle click while sprinting fires after the delay', g1.shots - g0.shots === 1, `${g1.shots - g0.shots} shots`);
    await sleep(3700);
    await page.keyboard.press('Digit1');
    await sleep(300);
    // The same for the SMG: a normal click while sprinting fires once the gun is up.
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyS');
    await sleep(600);
    g0 = await T(() => window.__testlines.gun());
    await page.mouse.down();
    await sleep(100);
    await page.mouse.up();
    await sleep(700);
    g1 = await T(() => window.__testlines.gun());
    await page.keyboard.up('KeyS');
    await page.keyboard.up('ShiftLeft');
    ok('an SMG click while sprinting fires after the delay', g1.shots - g0.shots >= 1, `${g1.shots - g0.shots} shots`);
    // Sprinting: the gun is not ready while sprinting.
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyS');
    await sleep(500);
    g1 = await T(() => window.__testlines.gun());
    await page.keyboard.up('KeyS');
    await page.keyboard.up('ShiftLeft');
    ok('the gun is not ready while sprinting', g1.readyIn > 0.1, `ready in ${g1.readyIn.toFixed(2)} s`);
    await T(() => window.__testlines.set('dummiesWalk', true));

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
