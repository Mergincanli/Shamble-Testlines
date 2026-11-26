// Scripted check of the built file, opened straight from disk (file://), in Chromium and in Firefox.
// Usage: node tools/browser-check.mjs [chromium|firefox|both]   (Firefox needs a display: run under xvfb-run)
// Paths: CHROMIUM_PATH (default /opt/pw-browsers/chromium) and FIREFOX_PATH. Screenshots go to SHOTS_DIR.
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const which = process.argv[2] || 'both';
// PAGE picks another copy of the page (so a check can run while the next build is made).
const file = 'file://' + resolve(process.env.PAGE || 'play/testlines.html');
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
  const skip = (name, detail) => results.push({ name, pass: true, skip: true, detail });
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
    // Shots aim at the point under the cursor from the start; the gun checks below were written for level shots, so
    // they set level, and the aiming-at-height checks set the point again.
    ok('shots start aimed at the point under the cursor', (await T(() => window.__testlines.values())).aimAt === 'point', String((await T(() => window.__testlines.values())).aimAt));
    await T(() => window.__testlines.set('aimAt', 'level'));
    // The vision rule starts on, with its two test dummies and the dummies' footsteps: the older checks below were
    // written without them, so they go off here, and the vision checks turn them on again.
    {
      const v0 = await T(() => window.__testlines.values());
      ok('the vision rule starts on at 190 degrees, eyes at 1.65 m, outlines and the shooter off', v0.visionOn === true && v0.visionWidth === 190 && v0.visionEye === 1.65 && v0.visionGhosts === false && v0.visionDummies === true && v0.shooterOn === false, `rule ${v0.visionOn}, ${v0.visionWidth}°, eyes ${v0.visionEye} m, outlines ${v0.visionGhosts}, test dummies ${v0.visionDummies}, shooter ${v0.shooterOn}`);
    }
    await T(() => window.__testlines.set('visionOn', false));
    await T(() => window.__testlines.set('visionDummies', false));
    await T(() => window.__testlines.set('stepVolume', 0));
    await page.screenshot({ path: `${shots}/${browserName}-start.png` });
    // The camera starts on the Original profile; the movement checks below were written for the old Iso turn.
    let cv = await T(() => window.__testlines.values());
    ok('the camera starts on the Original profile', cv.camHeight === 24.5 && cv.camBack === 34.7 && cv.camTurn === 64 && cv.camLens === 15, `height ${cv.camHeight}, distance ${cv.camBack}, turn ${cv.camTurn}, lens ${cv.camLens}`);
    const profBtns = await page.$$eval('#panel .p-presets .p-btn', (bs) => bs.map((b) => [b.textContent, b.classList.contains('on')]));
    ok('the Original profile button is lit', profBtns.some(([t, on]) => t === 'Original' && on), JSON.stringify(profBtns.filter(([, on]) => on)));
    const indieBtn = (await page.$$('#panel .p-presets .p-btn'))[profBtns.findIndex(([t]) => t === 'Indie')];
    await indieBtn.click();
    cv = await T(() => window.__testlines.values());
    ok('the Indie profile button sets its camera', cv.camLens === 35 && cv.camTurn === 0 && cv.camHeight === 13.5, `height ${cv.camHeight}, distance ${cv.camBack}, turn ${cv.camTurn}, lens ${cv.camLens}`);
    ok('the profiles run Original, Experimental, Indie', profBtns.slice(0, 3).map(([t]) => t).join(',') === 'Original,Experimental,Indie', profBtns.map(([t]) => t).join(','));
    const expBtn = (await page.$$('#panel .p-presets .p-btn'))[profBtns.findIndex(([t]) => t === 'Experimental')];
    await expBtn.click();
    cv = await T(() => window.__testlines.values());
    const litExp = await page.$$eval('#panel .p-presets .p-btn.on', (bs) => bs.map((b) => b.textContent));
    ok('the Experimental profile sets its camera, rates included, and lights', cv.camLens === 13 && cv.camHeight === 24.5 && cv.camTurn === 64 && cv.lookMin === 4.5 && cv.lookFollow === 20.5 && cv.pushRate === 2.5 && cv.posFwdMax === 0 && cv.posSideMax === 0 && litExp.includes('Experimental'), `lens ${cv.camLens}, look min ${cv.lookMin}, follow ${cv.lookFollow}, push ${cv.pushRate}, lit ${litExp}`);
    await T(() => window.__testlines.preset('Original'));
    cv = await T(() => window.__testlines.values());
    ok('Original sets the rates back', cv.lookFollow === 9 && cv.pushRate === 9 && cv.camLens === 15, `follow ${cv.lookFollow}, push ${cv.pushRate}`);
    await T(() => window.__testlines.preset('Iso'));

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
    const au = await T(() => window.__testlines.audio());
    if (isFx && au.state !== 'running') {
      // Firefox here cannot open any audio output (the container has no sound device), so its audio never runs.
      skip('the audio runs and each shot plays a click', `audio ${au.state}: no sound device in this container`);
    } else {
      ok('the audio runs and each shot plays a click', au.state === 'running' && au.clicks >= g1.shots - 2, `audio ${au.state}, ${au.clicks} clicks for ${g1.shots} shots`);
    }
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
    // The second tap goes in inside the window, so only the one-try rule can stop it.
    for (let i = 0; i < 150; i++) {
      gr = await T(() => window.__testlines.gun());
      if (gr.reloadLeft > 0 && 1 - gr.reloadLeft / gr.reloadTotal >= 0.33) break;
      await sleep(30);
    }
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
    // The rifle's reload starts by itself after its one round. A reflex R right after the shot is not the tap.
    // (At this machine's 4 to 5 frames a second a press can reach the page after the 0.25 s grace; then the check
    // says so instead of failing.)
    await page.mouse.down();
    await page.keyboard.press('KeyR');
    await sleep(60);
    await page.mouse.up();
    await sleep(250);
    g1 = await T(() => window.__testlines.gun());
    if (g1.active === 'miss' && g1.activeAt > 0.25) {
      skip('a reflex R just after the rifle\'s shot does not use up the tap', `the press reached the page ${g1.activeAt.toFixed(2)} s into the reload, after the grace (slow frames)`);
    } else {
      ok('a reflex R just after the rifle\'s shot does not use up the tap', g1.active === '' && g1.reloadLeft > 0, `tap state '${g1.active}'`);
    }
    // A fresh automatic reload for the perfect tap: wait for this one to end, fire the round again.
    for (let i = 0; i < 200 && (await T(() => window.__testlines.gun())).ammo < 1; i++) await sleep(30);
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    for (let i = 0; i < 150; i++) {
      g1 = await T(() => window.__testlines.gun());
      if (g1.reloadLeft > 0 && 1 - g1.reloadLeft / g1.reloadTotal >= 0.42) break;
      await sleep(30);
    }
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

    // Aiming down sights (with the right button set to aim). Walk while aiming: 0.55 of the walk speed; Shift does
    // not sprint.
    await T(() => window.__testlines.place(30, 30));
    await sleep(300);
    const aimSpot = await T(() => window.__testlines.screenOf(30, 1.36, 24));
    await page.mouse.move(aimSpot.x, aimSpot.y);
    await page.mouse.down({ button: 'right' });
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyS');
    await sleep(1200);
    const sa = await T(() => window.__testlines.state());
    const dsWalk = (await T(() => window.__testlines.dummies())).map((d) => d.speed);
    await page.keyboard.up('KeyS');
    await page.keyboard.up('ShiftLeft');
    // (Flatten creeps toward its floor when the cursor is beyond the look point, as the old game's did; give
    // it time to settle before the settle check.)
    ok('aiming slows the soldier to 0.55 and blocks the sprint', Math.abs(Math.hypot(sa.vx, sa.vz) - 6.3 * 0.55) < 0.05 && !sa.sprinting, `${Math.hypot(sa.vx, sa.vz).toFixed(3)} m/s`);
    ok('the dummies keep their walk speed while you aim', dsWalk.filter((v) => Math.abs(v - 6.3) < 0.05).length >= 6, dsWalk.map((v) => v.toFixed(1)).join(' '));
    await sleep(600);
    let ga = await T(() => window.__testlines.gun());
    ok('aiming rests the SMG spread at its sights value (0.06)', Math.abs(ga.spread - 0.06) < 1e-6 && (await T(() => window.__testlines.aiming())), ga.spread.toFixed(4));
    // Flatten (the default reaction): with the cursor well ahead of the soldier the view tips toward it, and
    // with the cursor still it settles.
    const viewA = await page.$eval('#view', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(viewA.l + viewA.w * 0.5, viewA.t + viewA.h * 0.15);
    await sleep(2500);
    const p1 = await T(() => window.__testlines.aimPoint());
    const c1 = await T(() => window.__testlines.cam());
    await sleep(1000);
    const p2 = await T(() => window.__testlines.aimPoint());
    ok('with the cursor still, the aim settles while aiming', Math.hypot(p2.x - p1.x, p2.z - p1.z) < 0.05, `moved ${Math.hypot(p2.x - p1.x, p2.z - p1.z).toFixed(3)} m in 1 s`);
    await page.mouse.up({ button: 'right' });
    await sleep(1500);
    const c0 = await T(() => window.__testlines.cam());
    ga = await T(() => window.__testlines.gun());
    ok('letting go puts the spread back to rest (0.075)', Math.abs(ga.spread - 0.075) < 1e-6, ga.spread.toFixed(4));
    ok('Flatten tips the view while aiming', c1.pitch < c0.pitch - 0.3, `${c0.pitch.toFixed(2)}° at rest, ${c1.pitch.toFixed(2)}° aiming`);
    // Slide: the camera moves toward the cursor, and the soldier stays on screen.
    await T(() => window.__testlines.set('adsCam', 'pan'));
    const view = await page.$eval('#view', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(view.l + view.w * 0.5, view.t + 5);
    await sleep(800);
    const cs0 = await T(() => window.__testlines.cam());
    await page.mouse.down({ button: 'right' });
    await sleep(1500);
    const cs1 = await T(() => window.__testlines.cam());
    const me5 = await T(() => window.__testlines.state());
    const onScreen = await T((x, y, z) => window.__testlines.screenOf(x, y + 0.2, z), me5.x, me5.y, me5.z);
    await page.mouse.up({ button: 'right' });
    ok('Slide moves the camera toward the cursor', Math.hypot(cs1.x - cs0.x, cs1.z - cs0.z) > 1, `${Math.hypot(cs1.x - cs0.x, cs1.z - cs0.z).toFixed(2)} m`);
    ok('Slide keeps the soldier on screen', onScreen.x > view.l && onScreen.x < view.l + view.w && onScreen.y > view.t && onScreen.y < view.t + view.h, `${onScreen.x.toFixed(0)}, ${onScreen.y.toFixed(0)}`);
    await T(() => window.__testlines.set('adsCam', 'pitch'));
    // Toggle mode: one click aims, the next lets go.
    await T(() => window.__testlines.set('adsMode', 'toggle'));
    await page.mouse.move(aimSpot.x, aimSpot.y);
    await page.mouse.click(aimSpot.x, aimSpot.y, { button: 'right' });
    await sleep(400);
    const tg1 = await T(() => window.__testlines.aiming());
    await page.mouse.click(aimSpot.x, aimSpot.y, { button: 'right' });
    await sleep(400);
    const tg2 = await T(() => window.__testlines.aiming());
    ok('toggle mode: a click aims, the next click lets go', tg1 === true && tg2 === false, `${tg1}, ${tg2}`);
    // A toggled aim ends when the page loses focus; a camera preset click does not end it.
    await page.mouse.click(aimSpot.x, aimSpot.y, { button: 'right' });
    await sleep(300);
    await T(() => window.__testlines.preset('Iso'));
    await sleep(200);
    const tg3 = await T(() => window.__testlines.aiming());
    await T(() => window.dispatchEvent(new Event('blur')));
    await sleep(300);
    const tg4 = await T(() => window.__testlines.aiming());
    ok('a toggled aim survives a preset click and ends on focus loss', tg3 === true && tg4 === false, `${tg3}, ${tg4}`);
    await T(() => window.__testlines.set('adsMode', 'hold'));
    // Q aims down sights (with the right button on the grenade, the start).
    await page.mouse.click(aimSpot.x, aimSpot.y);
    await page.keyboard.down('KeyQ');
    await sleep(300);
    const q1 = await T(() => window.__testlines.aiming());
    await page.keyboard.up('KeyQ');
    await sleep(300);
    const q2 = await T(() => window.__testlines.aiming());
    ok('holding Q aims down sights', q1 === true && q2 === false, `${q1}, ${q2}`);
    // Flatten never tips the soldier's own feet off the bottom of the screen (Original profile, cursor at the top).
    await T(() => window.__testlines.preset('Original'));
    await T(() => window.__testlines.place(30, 30));
    await sleep(1500);
    const viewF = await page.$eval('#view', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(viewF.l + viewF.w * 0.5, viewF.t + 3);
    await page.keyboard.down('KeyQ');
    await sleep(2500);
    const feet = await T(() => window.__testlines.screenOf(30, 0, 30));
    await page.keyboard.up('KeyQ');
    ok('Flatten keeps the soldier\'s feet on screen', feet.y < viewF.t + viewF.h, `feet at ${feet.y.toFixed(0)} of ${(viewF.t + viewF.h).toFixed(0)}`);
    await T(() => window.__testlines.preset('Iso'));

    // The sight line while aiming down sights: from the gun to where the shot stops (the gun's range in the open,
    // or a dummy, or a block), the shot's own cast.
    await T(() => window.__testlines.preset('Original'));
    await T(() => window.__testlines.set('dummiesWalk', false));
    await T(() => window.__testlines.place(30, 30));
    await sleep(1200);
    {
      const fwd = await T(() => window.__testlines.axes());
      // Aim away from the camera, along the screen's up: open ground for 55 m.
      for (let k = 0; k < 2; k++) {
        const sp = await T((x, z) => window.__testlines.screenOf(x, 1.36, z), 30 + fwd.fwdX * 6, 30 + fwd.fwdZ * 6);
        await page.mouse.move(sp.x, sp.y);
        await sleep(400);
      }
      const off = await T(() => window.__testlines.sight());
      await page.mouse.down({ button: 'right' });
      await sleep(1500);
      let sl = await T(() => window.__testlines.sight());
      const me = await T(() => window.__testlines.state());
      const len = (s) => Math.hypot(s.end.x - me.x, s.end.z - me.z);
      ok('aiming down sights shows the sight line, out to the gun\'s range (55 m) in the open', !off.visible && sl.visible && Math.abs(len(sl) - 55) < 0.5 && !sl.onDummy, `visible ${off.visible} -> ${sl.visible}, ${len(sl).toFixed(1)} m`);
      await T(() => window.__testlines.set('smgRange', 20));
      await sleep(400);
      sl = await T(() => window.__testlines.sight());
      ok('the sight line follows the gun\'s range slider', Math.abs(len(sl) - 20) < 0.5, `${len(sl).toFixed(1)} m`);
      await T(() => window.__testlines.set('smgRange', 55));
      // A dummy on the line of aim, 8 m out: the line stops on it.
      const yaw = await T(() => window.__testlines.aimYaw());
      await T((x, z) => window.__testlines.placeDummy(0, x, z), me.x + Math.sin(yaw) * 8, me.z + Math.cos(yaw) * 8);
      await sleep(500);
      sl = await T(() => window.__testlines.sight());
      ok('the sight line stops on a dummy in the way', sl.onDummy && Math.abs(len(sl) - 7.7) < 0.4, `on a dummy ${sl.onDummy}, ${len(sl).toFixed(2)} m`);
      await T(() => window.__testlines.set('sightLine', false));
      await sleep(300);
      sl = await T(() => window.__testlines.sight());
      ok('the sight line has an off switch', !sl.visible, `visible ${sl.visible}`);
      await T(() => window.__testlines.set('sightLine', true));
      // G with the right button still held: aiming down sights ends, a grenade is ready, and no throw starts until a
      // fresh press of the right button.
      await page.keyboard.press('KeyG');
      await sleep(500);
      const ndG = await T(() => window.__testlines.nades());
      const adsG = await T(() => window.__testlines.aiming());
      await page.mouse.up({ button: 'right' });
      await sleep(300);
      const ndG2 = await T(() => window.__testlines.nades());
      ok('G with the right button held ends aiming and readies a grenade; no throw without a fresh press', !adsG && ndG.ready && !ndG.aiming && ndG2.thrown === ndG.thrown, `sights ${adsG}, ready ${ndG.ready}, aiming a throw ${ndG.aiming}`);
      await page.keyboard.press('KeyG');
      await sleep(300);
      await T(() => window.__testlines.placeDummy(0, 4, 4));
    }
    await T(() => window.__testlines.set('dummiesWalk', true));
    await T(() => window.__testlines.preset('Iso'));

    // Aiming at height: a dummy standing on the 2.5 m ledge, 3 m from the soldier on the ground. Aimed at the point
    // under the cursor the shot rises to it; level, it hits the ledge's face. A shot at open ground ends on it.
    await T(() => window.__testlines.set('dummiesWalk', false));
    await T(() => window.__testlines.preset('Original'));
    const shootLedge = async (mode) => {
      await T((m) => window.__testlines.set('aimAt', m), mode);
      await T(() => window.__testlines.place(-10, -2));
      await T(() => window.__testlines.placeDummy(0, -13, -2, 2.5));
      await sleep(1200);
      for (let k = 0; k < 3; k++) {
        const sp = await T(() => window.__testlines.screenOf(-13, 3.6, -2));
        await page.mouse.move(sp.x, sp.y);
        await sleep(400);
      }
      const g0 = await T(() => window.__testlines.gun());
      await page.mouse.down();
      await sleep(60);
      await page.mouse.up();
      for (let i = 0; i < 20 && (await T(() => window.__testlines.gun())).shots === g0.shots; i++) await sleep(100);
      await sleep(200);
      return { d: (await T(() => window.__testlines.dummies()))[0], end: (await T(() => window.__testlines.gun())).lastShotEnd };
    };
    const lvl = await shootLedge('level');
    const pnt = await shootLedge('point');
    ok('a dummy on the 2.5 m ledge: level, the shot hits the ledge face; aimed at the point, it hits the dummy', lvl.d.health === 100 && pnt.d.health < 100, `level: dummy ${lvl.d.health.toFixed(0)}, shot ended at y ${lvl.end.y.toFixed(2)}; point: dummy ${pnt.d.health.toFixed(0)}, ended at y ${pnt.end.y.toFixed(2)}`);
    // The sight line aimed at it ends on the dummy, with a mark up from the ledge top to its end. (The camera tips
    // toward the cursor while aiming, which moves the dummy on screen about as far as the cursor moved; jumping the
    // cursor onto it each time swings the view back and forth for ever, so the cursor closes in halfway each time,
    // as a hand does, until the aim point is on the dummy.)
    const mH = await T(() => window.__testlines.screenOf(-13, 3.6, -2));
    await page.mouse.move(mH.x, mH.y);
    await page.mouse.down({ button: 'right' });
    await sleep(1200);
    let cpH = null;
    for (let k = 0; k < 10; k++) {
      const sp = await T(() => window.__testlines.screenOf(-13, 3.6, -2));
      mH.x += (sp.x - mH.x) / 2;
      mH.y += (sp.y - mH.y) / 2;
      await page.mouse.move(mH.x, mH.y);
      await sleep(400);
      cpH = await T(() => window.__testlines.cursorPoint());
      if (k >= 1 && cpH && cpH.y > 2.6 && Math.hypot(cpH.x + 13, cpH.z + 2) < 0.35) break;
    }
    const slH = await T(() => window.__testlines.sight());
    await page.mouse.up({ button: 'right' });
    ok('aimed at a dummy on the 2.5 m ledge, the sight line rises to end on it, with a mark up from the ledge top', cpH && cpH.y > 2.6 && slH.visible && slH.onDummy && slH.end.y > 2.8 && Math.abs(slH.height - (slH.end.y - 2.5)) < 0.05, `aim point y ${cpH ? cpH.y.toFixed(2) : 'none'}; line on a dummy ${slH.onDummy}, end y ${slH.end.y.toFixed(2)}, mark ${slH.height.toFixed(2)} m`);
    // Open ground 8 m out: the shot ends on the ground.
    await T(() => window.__testlines.place(30, 30));
    await T(() => window.__testlines.placeDummy(0, 4, 4));
    await sleep(1200);
    {
      const fw = await T(() => window.__testlines.axes());
      for (let k = 0; k < 3; k++) {
        const sp = await T((x, z) => window.__testlines.screenOf(x, 0, z), 30 + fw.fwdX * 8, 30 + fw.fwdZ * 8);
        await page.mouse.move(sp.x, sp.y);
        await sleep(400);
      }
      const cp = await T(() => window.__testlines.cursorPoint());
      const g0 = await T(() => window.__testlines.gun());
      await page.mouse.down();
      await sleep(60);
      await page.mouse.up();
      for (let i = 0; i < 20 && (await T(() => window.__testlines.gun())).shots === g0.shots; i++) await sleep(100);
      const e = (await T(() => window.__testlines.gun())).lastShotEnd;
      ok('aimed at open ground, the shot ends on the ground at the cursor\'s distance', Math.abs(e.y) < 0.02 && Math.abs(Math.hypot(e.x - 30, e.z - 30) - Math.hypot(cp.x - 30, cp.z - 30)) < 0.5, `end y ${e.y.toFixed(3)}, ${Math.hypot(e.x - 30, e.z - 30).toFixed(2)} m against ${Math.hypot(cp.x - 30, cp.z - 30).toFixed(2)} m`);
    }
    await T(() => window.__testlines.set('aimAt', 'level'));
    await T(() => window.__testlines.set('dummiesWalk', true));
    await T(() => window.__testlines.preset('Iso'));

    // The shotgun (key 3): one pull is one round, one click and eight pellet rays.
    await T(() => window.__testlines.set('dummiesWalk', false));
    await T(() => window.__testlines.place(40, 40));
    await T(() => window.__testlines.placeDummy(0, 40, 37));
    await page.keyboard.press('Digit3');
    await sleep(1500);
    let p0sg = { x: 0, y: 0 };
    for (let k = 0; k < 2; k++) {
      p0sg = await T(() => window.__testlines.screenOf(40, 1.36, 37));
      await page.mouse.move(p0sg.x, p0sg.y);
      await sleep(600);
    }
    let gsg = await T(() => window.__testlines.gun());
    const au0 = await T(() => window.__testlines.audio());
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    await sleep(400);
    let gsg1 = await T(() => window.__testlines.gun());
    const au1 = await T(() => window.__testlines.audio());
    const dsg = (await T(() => window.__testlines.dummies()))[0];
    ok('key 3 takes the shotgun; one pull is one round and eight rays', gsg1.gun === 'shotgun' && gsg1.shots - gsg.shots === 1 && gsg1.lastShotRays === 8 && gsg.ammo - gsg1.ammo === 1, `${gsg1.gun}, ${gsg1.shots - gsg.shots} shot, ${gsg1.lastShotRays} rays, ammo ${gsg.ammo} -> ${gsg1.ammo}`);
    ok('several pellets hit a dummy 3 m away', 100 - dsg.health >= 22, `${(100 - dsg.health).toFixed(0)} damage`);
    if (au0.state === 'running') ok('one shotgun pull plays one click', au1.clicks - au0.clicks === 1, `${au1.clicks - au0.clicks} clicks`);
    else skip('one shotgun pull plays one click', `audio ${au0.state}`);
    await sleep(700);
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    await sleep(400);
    gsg1 = await T(() => window.__testlines.gun());
    ok('two shells, then it reloads by itself', gsg1.ammo === 0 && gsg1.reloadLeft > 0, `${gsg1.ammo} shells, ${gsg1.reloadLeft.toFixed(2)} s left`);
    await T(() => window.__testlines.set('shotgunPellets', 3));
    await sleep(2600);
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    await sleep(400);
    gsg1 = await T(() => window.__testlines.gun());
    ok('the pellet slider sets the rays per shot', gsg1.lastShotRays === 3, `${gsg1.lastShotRays} rays`);
    await T(() => window.__testlines.set('shotgunPellets', 8));
    // Two clicks 0.3 s apart fire once: the second comes early in the 0.85 s gap and is dropped. (The rule itself
    // is proven step by step in a simulation; this checks it in the page, with the clicks a few frames apart.)
    await sleep(3000);
    gsg = await T(() => window.__testlines.gun());
    await page.mouse.click(p0sg.x, p0sg.y);
    await sleep(300);
    await page.mouse.click(p0sg.x, p0sg.y);
    await sleep(1500);
    gsg1 = await T(() => window.__testlines.gun());
    ok('a second shotgun click early in the gap is dropped', gsg1.shots - gsg.shots === 1, `${gsg1.shots - gsg.shots} shots`);
    // Fire, switch away and back: the first shot after the switch comes after the short switch pause.
    await T(() => window.__testlines.set('shotgunMag', 10));
    await sleep(3000);
    await page.mouse.click(p0sg.x, p0sg.y);
    await sleep(150);
    await page.keyboard.press('Digit1');
    await sleep(800);
    await page.keyboard.press('Digit3');
    await sleep(300);
    gsg = await T(() => window.__testlines.gun());
    await page.mouse.click(p0sg.x, p0sg.y);
    await sleep(450);
    gsg1 = await T(() => window.__testlines.gun());
    ok('back on the shotgun, a click fires after the switch pause, not the old gap', gsg1.shots - gsg.shots === 1, `${gsg1.shots - gsg.shots} shots`);
    await T(() => window.__testlines.set('shotgunMag', 2));
    await page.keyboard.press('Digit1');
    await T(() => window.__testlines.set('dummiesWalk', true));

    // The grenade: G or F readies it; then hold the right button to aim at the cursor, let go to throw; the arc shows
    // the whole flight. After a throw it is back to the gun (the right button aims down sights again).
    const ready = async (key = 'KeyG') => {
      await page.keyboard.press(key);
      for (let i = 0; i < 20 && !(await nades()).ready; i++) await sleep(50);
    };
    const nades = () => T(() => window.__testlines.nades());
    // Wait for every grenade to go off (a let-go may only be read at the next frame, so look a moment later first).
    const quiet = async () => {
      await sleep(400);
      for (let i = 0; i < 150; i++) {
        const n = await nades();
        if (n.flying.length === 0 && !n.aiming) break;
        await sleep(100);
      }
      await sleep(200);
    };
    // Wait for the blast of the throw made after n0 was read.
    const blastAfter = async (n0) => {
      for (let i = 0; i < 150; i++) {
        const n = await nades();
        if (n.thrown > n0.thrown && n.blasts > n0.blasts && n.flying.length === 0) return n;
        await sleep(100);
      }
      return nades();
    };
    const aimNade = async (x, y, z) => {
      for (let k = 0; k < 2; k++) {
        const sp = await T((a, b, c) => window.__testlines.screenOf(a, b, c), x, y, z);
        await page.mouse.move(sp.x, sp.y);
        await sleep(500);
      }
    };
    const samePts = (a, b) => !!a && !!b && a.length === b.length && a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y, p.z - b[i].z) < 1e-9);
    const matches = (n) => !!n.lastThrow?.end && !!n.lastBlast && Math.hypot(n.lastBlast.at.x - n.lastThrow.end.x, n.lastBlast.at.y - n.lastThrow.end.y, n.lastBlast.at.z - n.lastThrow.end.z) < 1e-9 && samePts(n.lastBlast.bounces, n.lastThrow.bounces);
    await T(() => window.__testlines.set('dummiesWalk', false));
    await T(() => window.__testlines.set('nadeRefill', 0.5));
    await T(() => window.__testlines.place(30, 30));
    await sleep(1200);
    await aimNade(30, 0, 20);
    let nd0 = await nades();
    let gn0 = await T(() => window.__testlines.gun());
    await ready();
    await page.mouse.down({ button: 'right' });
    await sleep(500);
    await page.mouse.down();
    await sleep(300);
    await page.mouse.up();
    const ndA = await nades();
    const adsA = await T(() => window.__testlines.aiming());
    let gn1 = await T(() => window.__testlines.gun());
    await page.mouse.up({ button: 'right' });
    await sleep(400);
    let nd1 = await nades();
    ok('G readies a grenade; the right button then shows the arc, not aiming down sights', ndA.aiming && !!ndA.preview && !adsA, `aiming ${ndA.aiming}, arc ${!!ndA.preview}, sights ${adsA}`);
    ok('the gun does not fire while a grenade is ready', gn1.shots === gn0.shots, `${gn1.shots - gn0.shots} shots`);
    ok('letting go throws one grenade, and it is back to the gun', nd1.thrown - nd0.thrown === 1 && !nd1.aiming && !nd1.ready, `thrown ${nd1.thrown - nd0.thrown}, ready ${nd1.ready}`);
    const fb = nd1.lastThrow?.bounces?.[0];
    const tg = nd1.lastThrow?.target;
    ok('it lands on the point under the cursor', !!fb && !!tg && Math.hypot(fb.x - tg.x, fb.z - tg.z) < 0.4 && Math.abs(tg.y) < 1e-6, fb && tg ? `${Math.hypot(fb.x - tg.x, fb.z - tg.z).toFixed(2)} m from the target` : 'no bounce');
    nd1 = await blastAfter(nd0);
    ok('it flies the arc exactly: every bounce and the burst where shown', nd1.blasts - nd0.blasts === 1 && matches(nd1), nd1.lastBlast ? `${nd1.lastBlast.bounces.length} bounces` : 'no blast');
    // Walking while aiming: still exactly the arc shown just before letting go.
    nd0 = await nades();
    await ready();
    await page.mouse.down({ button: 'right' });
    await sleep(400);
    await page.keyboard.down('KeyD');
    await sleep(600);
    await page.mouse.up({ button: 'right' });
    await sleep(300);
    await page.keyboard.up('KeyD');
    nd1 = await blastAfter(nd0);
    ok('walking while aiming: it still flies the arc exactly', matches(nd1), nd1.lastThrow?.end ? 'matched' : 'no arc');
    // A bank shot: aim at the cover wall; the arc shows the bounce off the wall and the grenade bounces there.
    await T(() => window.__testlines.place(-2, -4));
    await sleep(1200);
    await aimNade(-2, 0.75, -8.75);
    nd0 = await nades();
    await ready('KeyF');
    await page.mouse.down({ button: 'right' });
    await sleep(500);
    await page.mouse.up({ button: 'right' });
    nd1 = await blastAfter(nd0);
    const onWall = (p) => !!p && p.x > -4.61 && p.x < 0.61 && p.z > -9.36 && p.z < -8.64 && p.y < 1.61;
    ok('aimed at the cover wall: the arc bounces off it and so does the grenade', onWall(nd1.lastThrow?.bounces?.[0]) && matches(nd1), JSON.stringify(nd1.lastThrow?.bounces?.[0] ?? null));
    // After a throw the right button aims down sights again; G again puts a readied grenade away and drops a throw
    // being aimed; a held G's key repeats do not toggle it back.
    await T(() => window.__testlines.place(30, 30));
    await sleep(1500);
    await aimNade(30, 0, 20);
    await page.mouse.down({ button: 'right' });
    await sleep(400);
    const adsBack = await T(() => window.__testlines.aiming());
    let ndB = await nades();
    await page.mouse.up({ button: 'right' });
    ok('without a grenade ready, the right button aims down sights and throws nothing', adsBack && !ndB.aiming && !ndB.ready, `sights ${adsBack}, grenade ${ndB.aiming}`);
    await sleep(400);
    nd0 = await nades();
    await ready();
    await page.mouse.down({ button: 'right' });
    await sleep(400);
    const midAim = (await nades()).aiming;
    await page.keyboard.press('KeyG');
    await sleep(300);
    await page.mouse.up({ button: 'right' });
    await sleep(400);
    nd1 = await nades();
    ok('G again puts it away: the throw being aimed is dropped', midAim && nd1.thrown === nd0.thrown && !nd1.ready && !nd1.aiming, `aiming before ${midAim}, ${nd1.thrown - nd0.thrown} thrown, ready ${nd1.ready}`);
    await page.keyboard.down('KeyG');
    await sleep(250);
    await page.keyboard.down('KeyG');
    await page.keyboard.down('KeyG');
    await sleep(250);
    await page.keyboard.up('KeyG');
    await sleep(300);
    ndB = await nades();
    ok('a held G readies it once (key repeats ignored)', ndB.ready, `ready ${ndB.ready}`);
    // A gun key puts it away.
    await page.keyboard.press('Digit2');
    await sleep(300);
    ndB = await nades();
    await page.keyboard.press('Digit1');
    ok('a gun key puts a readied grenade away', !ndB.ready, `ready ${ndB.ready}`);
    await sleep(400);
    // Losing focus while aiming drops the throw.
    nd0 = await nades();
    await ready();
    await page.mouse.down({ button: 'right' });
    await sleep(300);
    await T(() => window.dispatchEvent(new Event('blur')));
    await sleep(200);
    await page.mouse.up({ button: 'right' });
    await sleep(400);
    nd1 = await nades();
    ok('losing focus while aiming drops the throw', nd1.thrown === nd0.thrown && !nd1.aiming && !nd1.ready, `${nd1.thrown - nd0.thrown} thrown`);
    await sleep(1000);
    // A throw at the feet of a dummy: the blast drops it, leaves one far away alone, and kicks the camera.
    await T(() => window.__testlines.placeDummy(0, 30, 27.4));
    await T(() => window.__testlines.placeDummy(1, 30, 18));
    await aimNade(30, 0, 28);
    nd0 = await nades();
    await ready();
    await page.mouse.down({ button: 'right' });
    await sleep(400);
    await page.mouse.up({ button: 'right' });
    let peakKick = 0;
    // (The explosion and the fragments are read the moment the blast is seen: they last about a second, and at the
    // check's frame rate the kick readings below take longer than that.)
    let exAtBlast = null;
    let bitsAtBlast = null;
    let blastSeen = null;
    for (let i = 0; i < 120; i++) {
      const n = await nades();
      peakKick = Math.max(peakKick, n.kick);
      if (n.blasts > nd0.blasts && !exAtBlast) {
        exAtBlast = await T(() => window.__testlines.explosions());
        bitsAtBlast = await T(() => window.__testlines.blastBits());
        blastSeen = n.lastBlast;
      }
      if (n.blasts > nd0.blasts && peakKick > 0) break;
      await sleep(30);
    }
    for (let i = 0; i < 8; i++) {
      peakKick = Math.max(peakKick, (await nades()).kick);
      await sleep(30);
    }
    const dn = await T(() => window.__testlines.dummies());
    ok('the blast drops a dummy beside it', dn[0].down, `health ${dn[0].health.toFixed(0)}`);
    ok('a dummy outside the blast radius is unhurt', dn[1].health === 100, `health ${dn[1].health.toFixed(0)}`);
    ok('a blast this close kicks the camera', peakKick > 0.05, `peak kick ${peakKick.toFixed(2)} m`);
    // The blast plays the owner's explosion sheet (the start look) at the burst point, and fragments fly.
    {
      const lb = blastSeen;
      const ex = exAtBlast ?? { ready: false, plays: [] };
      const bits = bitsAtBlast ?? { plain: -1, fragments: 0 };
      const q = ex.plays[0];
      ok('the blast plays the explosion sheet at the burst point (not the plain flash), and fragments fly', ex.ready && ex.plays.length === 1 && !!lb && Math.hypot(q.at.x - lb.at.x, q.at.y - lb.at.y, q.at.z - lb.at.z) < 1e-9 && q.frame >= 0 && q.frame < 16 && bits.plain === 0 && bits.fragments > 0, `sheet ready ${ex.ready}, playing ${ex.plays.length}${q ? ` at frame ${q.frame}` : ''}, plain ${bits.plain}, fragments ${bits.fragments}`);
    }
    // One grenade comes back after the refill time.
    await T(() => window.__testlines.set('nadeRefill', 1));
    await sleep(3500);
    nd1 = await nades();
    ok('grenades come back after the refill time', nd1.held === 3, `held ${nd1.held}`);
    await T(() => window.__testlines.set('nadeRefill', 5));

    // The explosion sheet. Its own clock steps through the 16 frames over the play time, then it goes (read from the
    // effect itself: at the check's frame rate not every frame is drawn).
    await T(() => window.__testlines.clearExplosions());
    await T(() => window.__testlines.set('nadeFxTime', 3));
    await T(() => window.__testlines.place(30, 30));
    await T(() => window.__testlines.placeDummy(0, 4, 4));
    await T(() => window.__testlines.placeDummy(1, 6, 4));
    await page.mouse.move(640, 300);
    await sleep(1200);
    {
      await T(() => window.__testlines.explode(30, 0, 24));
      let maxT = 0;
      let steps = true;
      let seen = 0;
      const frames = new Set();
      for (let i = 0; i < 150; i++) {
        const e = await T(() => window.__testlines.explosions());
        if (!e.plays.length) break;
        const q = e.plays[0];
        seen++;
        frames.add(q.frame);
        maxT = Math.max(maxT, q.t);
        if (q.frame !== Math.floor((q.t / 3) * 16)) steps = false;
        await sleep(100);
      }
      const gone = (await T(() => window.__testlines.explosions())).plays.length === 0;
      ok('the explosion steps through its 16 frames over the play time (3 s here) by its own clock, then goes', steps && gone && seen >= 4 && frames.size >= 4 && maxT <= 3 && maxT > 2.2, `seen ${seen} times, ${frames.size} different frames, last clock ${maxT.toFixed(2)} s, gone ${gone}`);
    }
    await T(() => window.__testlines.set('nadeFxTime', 1));
    // Placed for the camera: drawn 2 m nearer the camera along the line to it and shrunk to keep its size on screen,
    // so it covers the same spot; standing upright, turned toward the camera, stretched up by 1 / cos of the camera's
    // height angle over it. (Held at frame 7 of 16, off the grid's diagonal: swapped rows and columns would show a
    // frame with no white-hot core.)
    {
      await T(() => window.__testlines.explode(30, 0, 24, 6));
      await sleep(600);
      const [q, c] = await T(() => [window.__testlines.explosions().plays[0], window.__testlines.cam()]);
      const D = Math.hypot(c.x - q.at.x, c.y - q.at.y, c.z - q.at.z);
      const flat = Math.hypot(c.x - q.at.x, c.z - q.at.z);
      const off = [q.drawnAt.x - q.at.x, q.drawnAt.y - q.at.y, q.drawnAt.z - q.at.z];
      const toCam = [(c.x - q.at.x) / D, (c.y - q.at.y) / D, (c.z - q.at.z) / D];
      const along = Math.hypot(...off);
      const lined = Math.hypot(off[0] / along - toCam[0], off[1] / along - toCam[1], off[2] / along - toCam[2]);
      const sA = await T((x, y, z) => window.__testlines.screenOf(x, y, z), q.at.x, q.at.y, q.at.z);
      const sB = await T((x, y, z) => window.__testlines.screenOf(x, y, z), q.drawnAt.x, q.drawnAt.y, q.drawnAt.z);
      const yawWant = Math.atan2(c.x - q.at.x, c.z - q.at.z);
      const qa = q.quaternion;
      const upright = Math.abs(qa[0]) < 1e-9 && Math.abs(qa[2]) < 1e-9 && Math.abs(Math.atan2(Math.sin(q.yaw - yawWant), Math.cos(q.yaw - yawWant))) < 1e-9;
      ok('the explosion is drawn 2 m nearer the camera on the line to it, at its 8 m width at the burst, upright and turned to the camera, stretched by 1 / cos of the camera\'s angle', Math.abs(along - 2) < 1e-6 && lined < 1e-6 && Math.abs(q.scale - (8 * (D - 2)) / D) < 1e-6 && Math.abs(q.stretch - D / flat) < 1e-9 && Math.hypot(sA.x - sB.x, sA.y - sB.y) < 0.5 && upright, `${along.toFixed(3)} m nearer, off the line ${lined.toExponential(1)}, scale ${q.scale.toFixed(3)} (want ${((8 * (D - 2)) / D).toFixed(3)}), stretch ${q.stretch.toFixed(3)} (want ${(D / flat).toFixed(3)}), ${Math.hypot(sA.x - sB.x, sA.y - sB.y).toFixed(2)} px apart on screen, upright ${upright}`);
      // On screen: no chroma blue anywhere round it, the white-hot core above the burst point, and the sheet's own
      // deep red and orange (a wrong colour conversion would move them).
      const view = await page.$eval('#view', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
      const x0 = Math.max(view.l, sA.x - 300);
      const y0 = Math.max(view.t, sA.y - 380);
      const bw = Math.min(view.l + view.w, sA.x + 300) - x0;
      const bh = Math.min(view.t + view.h, sA.y + 60) - y0;
      const px = await T((a, b, w, h) => window.__testlines.pixels(a, b, w, h), x0, y0, bw, bh);
      await page.screenshot({ path: `${shots}/${browserName}-explosion.png` });
      await T(() => window.__testlines.clearExplosions());
      await sleep(300);
      const px0 = await T((a, b, w, h) => window.__testlines.pixels(a, b, w, h), x0, y0, bw, bh);
      ok('at frame 7 the explosion shows a white-hot core above the burst point, fire round it, and no chroma blue', px.blue === 0 && px.hot > 1000 && px.fire > 1000 && px0.hot === 0 && px.hotY < sA.y - 20 && Math.abs(px.hotX - sA.x) < 60, `in a ${bw.toFixed(0)} x ${bh.toFixed(0)} px box: blue ${px.blue}, white-hot ${px.hot} (without it ${px0.hot}), fire ${px.fire}, core middle ${px.hotX ? `${(px.hotX - sA.x).toFixed(0)}, ${(px.hotY - sA.y).toFixed(0)}` : '-'} px from the burst point`);
      // (Counted against the same box without the explosion: the soldier's own reds may be in it.)
      ok('the sheet\'s own deep red and orange show as drawn (the colours are not converted twice)', px.deep - px0.deep > 300 && px.orange - px0.orange > 300, `deep red ${px.deep} (without it ${px0.deep}), orange ${px.orange} (without it ${px0.orange})`);
    }
    // At a steep camera (Classic, about 56 degrees, turned to look at the 3.5 m ledge's open side), a burst against
    // the ledge's face shows its white-hot core as fully as on open ground: standing upright in front of the burst,
    // the picture never reaches the wall behind it.
    {
      await T(() => window.__testlines.preset('Classic'));
      await T(() => window.__testlines.set('camTurn', -90));
      await T(() => { for (let i = 0; i < 11; i++) window.__testlines.placeDummy(i, 40 + i * 2, -40); });
      const ax = await T(() => window.__testlines.axes());
      const tw = Math.min(Math.abs(ax.fwdX) > 1e-6 ? 2 / Math.abs(ax.fwdX) : Infinity, Math.abs(ax.fwdZ) > 1e-6 ? 2 / Math.abs(ax.fwdZ) : Infinity);
      const spots = { wall: { x: -14 - ax.fwdX * (tw + 0.15), z: -14 - ax.fwdZ * (tw + 0.15) }, open: { x: 30, z: 20 } };
      const hot = {};
      for (const [name, at] of Object.entries(spots)) {
        await T(() => window.__testlines.clearExplosions());
        await T((x, z) => window.__testlines.place(x, z), at.x - ax.fwdX * 5, at.z - ax.fwdZ * 5);
        await sleep(1500);
        await T((x, z) => window.__testlines.explode(x, 0, z, 5), at.x, at.z);
        await sleep(500);
        const sp = await T((x, z) => window.__testlines.screenOf(x, 0, z), at.x, at.z);
        const view = await page.$eval('#view', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
        const bx = Math.max(view.l, sp.x - 330);
        const by = Math.max(view.t, sp.y - 560);
        hot[name] = (await T((a, b, w, h) => window.__testlines.pixels(a, b, w, h), bx, by, Math.min(view.l + view.w, sp.x + 330) - bx, Math.min(view.t + view.h, sp.y + 80) - by)).hot;
        if (name === 'wall') await page.screenshot({ path: `${shots}/${browserName}-explosion-wall.png` });
      }
      ok('at a steep camera a burst against a 3.5 m wall shows its white-hot core as fully as on open ground (the wall behind does not cut it)', hot.open > 1500 && hot.wall / hot.open > 0.95, `white-hot ${hot.wall} against the wall, ${hot.open} in the open (${(hot.wall / hot.open).toFixed(3)})`);
      await T(() => window.__testlines.clearExplosions());
      await T(() => window.__testlines.preset('Iso'));
      await T(() => window.__testlines.place(30, 30));
      await T(() => window.__testlines.placeDummy(0, 4, 4));
      await T(() => window.__testlines.placeDummy(1, 6, 4));
      await sleep(1200);
    }
    // Eight play at once; a ninth takes over the oldest.
    await T(() => { for (let i = 0; i < 9; i++) window.__testlines.explode(30 + i, 0, 20, 3); });
    {
      const n = (await T(() => window.__testlines.explosions())).plays.length;
      ok('eight explosions play at once (a ninth takes over the oldest)', n === 8, `${n} playing`);
    }
    await T(() => window.__testlines.clearExplosions());
    // The plain look (the earlier stand-in) shows its flash and ring instead of the sheet; fragments can be switched off.
    await T(() => window.__testlines.set('nadeLook', 'plain'));
    await T(() => window.__testlines.set('nadeFrags', false));
    await aimNade(30, 0, 24);
    nd0 = await nades();
    await ready();
    await page.mouse.down({ button: 'right' });
    await sleep(400);
    await page.mouse.up({ button: 'right' });
    {
      let sawPlain = 0;
      let sawSheet = 0;
      let sawFrags = 0;
      let after = 0;
      for (let i = 0; i < 200 && after < 12; i++) {
        const n = await nades();
        if (n.blasts > nd0.blasts) {
          after++;
          const bits = await T(() => window.__testlines.blastBits());
          sawPlain = Math.max(sawPlain, bits.plain);
          sawFrags = Math.max(sawFrags, bits.fragments);
          sawSheet = Math.max(sawSheet, (await T(() => window.__testlines.explosions())).plays.length);
        }
        await sleep(30);
      }
      ok('the plain look shows its flash and ring instead of the sheet; with fragments off none fly', after > 0 && sawPlain > 0 && sawSheet === 0 && sawFrags === 0, `plain ${sawPlain}, sheet ${sawSheet}, fragments ${sawFrags}`);
    }
    await T(() => window.__testlines.set('nadeLook', 'sheet'));
    await T(() => window.__testlines.set('nadeFrags', true));
    await T(() => window.__testlines.set('dummiesWalk', true));

    // The measuring grid and the metrics room (beside the yard at x 20).
    const ms = await T(() => window.__testlines.measured());
    const mtext = await page.$eval('#measure', (e) => e.textContent);
    ok('the readout measures the soldier at 1.80 m and gives his size on screen', Math.abs(ms.soldierHeightM - 1.8) < 0.005 && ms.soldierOnScreenPx > 20 && /1\.80 m/.test(mtext), mtext);
    await T(() => window.__testlines.set('gridOn', false));
    await T(() => window.__testlines.set('gridStep', '0.1'));
    await sleep(400);
    await T(() => window.__testlines.set('gridOn', true));
    await T(() => window.__testlines.set('gridStep', '0.5'));
    await T(() => window.__testlines.set('dummiesWalk', false));
    const fw = await T(() => window.__testlines.axes());
    // Walk forward (away from the camera) along a line through a point, from 2.5 m before it, for some time.
    const walkThrough = async (px, pz, ms2) => {
      await T((x, z) => window.__testlines.place(x, z), px - fw.fwdX * 2.5, pz - fw.fwdZ * 2.5);
      await sleep(400);
      let top = 0;
      let minX = Infinity;
      await page.keyboard.down('KeyW');
      for (let t = 0; t < ms2; t += 100) {
        await sleep(100);
        const now = await T(() => window.__testlines.state());
        top = Math.max(top, now.y);
        // Only in front of the piece aimed at (within 1.5 m of its centre along the wall): sliding along a wall
        // and round its end is not passing through it.
        if (Math.abs(now.z - pz) < 1.5) minX = Math.min(minX, now.x);
      }
      await page.keyboard.up('KeyW');
      await sleep(200);
      return { ...(await T(() => window.__testlines.state())), top, minX };
    };
    let st = await walkThrough(20, -11, 1200);
    ok('he walks through the 1.0 m doorway', st.x < 19.5, `x ${st.x.toFixed(2)} z ${st.z.toFixed(2)}`);
    // (Walking on, he slides along the wall; a short walk keeps him within its 4 m.)
    st = await walkThrough(20, -17, 900);
    ok('the window sill stops him', st.minX > 20.4, `nearest x ${st.minX.toFixed(2)}, y ${st.y.toFixed(2)}`);
    await T(() => window.__testlines.set('stairWidth', 4));
    await sleep(300);
    st = await walkThrough(21.2, -27.5, 1500);
    ok('he walks up the stair to the landing (1.44 m)', st.top > 1.43, `highest feet ${st.top.toFixed(2)} m`);
    await T(() => window.__testlines.set('stairWidth', 1.2));
    await T(() => window.__testlines.set('doorWidth', 0.7));
    await sleep(300);
    // (He wedges against both jambs, his centre 0.19 m short of the wall at 0.4 m body radius.)
    st = await walkThrough(20, -11, 1200);
    ok('a doorway narrower than his body (0.7 m) stops him; the room rebuilds with the slider', st.minX > 20.1, `nearest x ${st.minX.toFixed(2)}`);
    await T(() => window.__testlines.set('doorWidth', 1.0));
    await T(() => window.__testlines.place(30, 30));
    await T(() => window.__testlines.set('dummiesWalk', true));

    // The Hornet: E rides it near it; W/S drive, A/D turn; the left button: a tap fires pellets, a full charge the beam.
    const hn = () => T(() => window.__testlines.hornet());
    const pollMax = async (ms, pick) => {
      let best = -Infinity;
      for (let t = 0; t < ms; t += 80) {
        best = Math.max(best, pick(await hn()));
        await sleep(80);
      }
      return best;
    };
    await T(() => window.__testlines.set('dummiesWalk', false));
    await T(() => window.__testlines.placeHornet(30, 30, 0));
    await T(() => window.__testlines.place(30.9, 30));
    await sleep(800);
    const hintText = await page.$eval('#hint', (e) => (getComputedStyle(e).display === 'none' ? '' : e.textContent));
    await page.keyboard.press('KeyE');
    await sleep(500);
    let hs = await hn();
    ok('near the Hornet a hint shows; E gets on', hintText.includes('E') && hs.riding, `hint "${hintText}", riding ${hs.riding}`);
    // Aim ahead of it (it faces +z).
    for (let k = 0; k < 2; k++) {
      const sp = await T(() => window.__testlines.screenOf(30, 1.2, 37));
      await page.mouse.move(sp.x, sp.y);
      await sleep(400);
    }
    await page.keyboard.down('KeyW');
    const leanFwd = await pollMax(900, (h) => h.pitch);
    await sleep(600);
    hs = await hn();
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    const leanBack = -(await pollMax(700, (h) => -h.pitch));
    await page.keyboard.up('KeyS');
    ok('W drives it forward, leaning forward as it speeds up', hs.speed > 5 && hs.z > 31 && leanFwd > 4, `speed ${hs.speed.toFixed(1)} m/s, lean ${leanFwd.toFixed(1)}°`);
    ok('S brakes it, leaning back', leanBack < -10, `lean ${leanBack.toFixed(1)}°`);
    await sleep(1500);
    hs = await hn();
    const head0 = hs.heading;
    await page.keyboard.down('KeyA');
    await sleep(500);
    await page.keyboard.up('KeyA');
    hs = await hn();
    ok('A turns it', hs.heading - head0 > 0.3, `${(((hs.heading - head0) * 180) / Math.PI).toFixed(0)}°`);
    // Back on line at a known spot, facing +z, with a dummy 5 m ahead.
    await T(() => window.__testlines.placeHornet(30, 30, 0));
    await T(() => window.__testlines.placeDummy(0, 30, 35));
    await sleep(900);
    for (let k = 0; k < 2; k++) {
      const sp = await T(() => window.__testlines.screenOf(30, 1.2, 35));
      await page.mouse.move(sp.x, sp.y);
      await sleep(400);
    }
    let hgs0 = await T(() => window.__testlines.gun());
    hs = await hn();
    await page.mouse.down();
    await page.mouse.up();
    for (let i = 0; i < 20 && (await hn()).shots === hs.shots; i++) await sleep(100);
    let hgs1 = await T(() => window.__testlines.gun());
    let hhs1 = await hn();
    let hdn = await T(() => window.__testlines.dummies());
    ok('a tap fires 8 pellets, which hurt the dummy ahead', hhs1.shots - hs.shots === 1 && hgs1.lastShotRays === 8 && hdn[0].health < 100, `${hhs1.shots - hs.shots} shot, ${hgs1.lastShotRays} rays, dummy ${hdn[0].health.toFixed(0)}`);
    await sleep(1200);
    await T(() => window.__testlines.placeDummy(0, 30, 35));
    // (A long weak moment for the checks: the slow software renderer takes a while to look.)
    await T(() => window.__testlines.set('hornetWeakTime', 3));
    await sleep(300);
    hs = await hn();
    await page.mouse.down();
    await sleep(1600);
    const charged = await hn();
    await page.mouse.up();
    for (let i = 0; i < 20 && (await hn()).beams === hs.beams; i++) await sleep(100);
    hhs1 = await hn();
    hgs1 = await T(() => window.__testlines.gun());
    hdn = await T(() => window.__testlines.dummies());
    ok('held, it charges; let go at full charge it fires one beam that drops the dummy (120 damage)', charged.charge > 0.99 && hhs1.beams - hs.beams === 1 && hgs1.lastShotRays === 1 && hdn[0].down, `charge ${charged.charge.toFixed(2)}, ${hhs1.beams - hs.beams} beam, ${hgs1.lastShotRays} ray, dummy down ${hdn[0].down}`);
    hs = await hn();
    const tip = hs.leanSinceBeam;
    ok('the full-charge shot tips it back (picture) and starts the weak moment', tip < -20 && hs.weak > 0, `lean ${tip.toFixed(1)}°, weak ${hs.weak.toFixed(2)} s`);
    // A click in the weak moment fires nothing.
    await page.mouse.down();
    await page.mouse.up();
    await sleep(200);
    hhs1 = await hn();
    ok('in the weak moment a click fires nothing', hhs1.shots === hs.shots, `${hhs1.shots - hs.shots} shots`);
    await T(() => window.__testlines.set('hornetWeakTime', 0.9));
    for (let i = 0; i < 40 && (await hn()).weak > 0; i++) await sleep(100);
    await sleep(600);
    // Losing focus while charging drops the charge.
    hs = await hn();
    await page.mouse.down();
    await sleep(400);
    await T(() => window.dispatchEvent(new Event('blur')));
    await sleep(200);
    await page.mouse.up();
    await sleep(300);
    hhs1 = await hn();
    ok('losing focus while charging drops the charge without a shot', !hhs1.charging && hhs1.shots === hs.shots, `charging ${hhs1.charging}, ${hhs1.shots - hs.shots} shots`);
    // E gets off beside it, and the soldier's own gun works again.
    await page.keyboard.press('KeyE');
    await sleep(500);
    hs = await hn();
    const hme = await T(() => window.__testlines.state());
    hgs0 = await T(() => window.__testlines.gun());
    await page.mouse.down();
    await sleep(150);
    await page.mouse.up();
    await sleep(500);
    hgs1 = await T(() => window.__testlines.gun());
    ok('E gets off beside it; his own gun fires again', !hs.riding && Math.hypot(hme.x - hs.x, hme.z - hs.z) > 0.8 && Math.hypot(hme.x - hs.x, hme.z - hs.z) < 1.5 && hgs1.shots > hgs0.shots, `${Math.hypot(hme.x - hs.x, hme.z - hs.z).toFixed(2)} m from it, ${hgs1.shots - hgs0.shots} shots`);
    await T(() => window.__testlines.placeHornet(6, 1, 180));
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

    // The vision rule (the owner's, 26 November): a dummy is drawn only while part of its body is inside the cone with
    // a clear 3D line from the soldier's eyes. Geometry first at 360 degrees (only what blocks sight hides), then the
    // cone itself.
    {
      const V = () => T(() => window.__testlines.vision());
      // Wait for whole drawn frames (with the rule on, this machine draws about 1.5 a second in software).
      const frames = (n = 3) => T((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
      const put = async (i, x, z, y = 0) => T((a, b, c, d) => window.__testlines.placeDummy(a, b, c, d), i, x, z, y);
      const faceToward = async (x, z) => {
        for (let k = 0; k < 3; k++) {
          const sp = await T((a, b) => window.__testlines.screenOf(a, 0, b), x, z);
          const view = await page.$eval('#view', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
          await page.mouse.move(Math.max(view.l + 5, Math.min(view.l + view.w - 5, sp.x)), Math.max(view.t + 5, Math.min(view.t + view.h - 5, sp.y)));
          await frames();
        }
      };
      await T(() => window.__testlines.preset('Original'));
      await T(() => window.__testlines.set('dummiesWalk', false));
      await T(() => window.__testlines.set('visionOn', true));
      await T(() => window.__testlines.set('visionDummies', true));
      await T(() => window.__testlines.set('visionWidth', 360));
      await T(() => { for (let i = 0; i < 11; i++) window.__testlines.placeDummy(i, 40 + i * 2, -45); });
      // Behind the 3.07 m ledge (x -16 to -12, z -10 to -6), from x -8: hidden; far behind it, hidden at 1.65 m and
      // seen with the eyes raised to 4 m (over the ledge).
      await T(() => window.__testlines.place(-8, -8));
      await put(0, -18, -8);
      await put(1, -30, -8);
      await frames();
      let v = await V();
      const ledgeLow = [v.drawn[0], v.drawn[1]];
      await T(() => window.__testlines.set('visionEye', 4));
      await frames();
      v = await V();
      const ledgeHigh = [v.drawn[0], v.drawn[1]];
      await T(() => window.__testlines.set('visionEye', 1.65));
      ok('behind the 3.07 m ledge a dummy is not drawn; far behind it, drawn only with the eyes raised over the ledge (4 m)', !ledgeLow[0] && !ledgeLow[1] && !ledgeHigh[0] && ledgeHigh[1], `eyes 1.65 m: near ${ledgeLow[0]}, far ${ledgeLow[1]}; eyes 4 m: near ${ledgeHigh[0]}, far ${ledgeHigh[1]}`);
      // The 1.5 m cover wall: a standing dummy's head shows over it; the dummy is drawn.
      await T(() => window.__testlines.place(-2, -4));
      await put(0, -2, -10.5);
      await frames();
      v = await V();
      ok('behind the 1.5 m cover wall a standing dummy is drawn (its head shows over the wall)', v.drawn[0], `drawn ${v.drawn[0]}`);
      // The test corner: over the 1.4 m hedge yes, behind the 2.0 m hedge (the shooter's post) no, the smoke hides.
      await T(() => window.__testlines.place(-28, 16));
      await put(0, -28, 21.5);
      await put(1, -36, 23);
      await put(2, -32.5, 28);
      await frames();
      v = await V();
      ok('in the test corner: drawn over the 1.4 m hedge, not behind the 2.0 m hedge, not in the smoke, drawn beside it', v.drawn[0] && !v.drawn[12] && !v.drawn[1] && v.drawn[2], `low hedge ${v.drawn[0]}, tall hedge (the shooter) ${v.drawn[12]}, in the smoke ${v.drawn[1]}, beside it ${v.drawn[2]}`);
      // Outlines of the hidden ones, for explaining only.
      await T(() => window.__testlines.set('visionGhosts', true));
      await frames();
      v = await V();
      const outlinesOk = v.outlined[12] && v.outlined[1] && !v.outlined[0] && !v.outlined[2];
      await T(() => window.__testlines.set('visionGhosts', false));
      await frames();
      const vOff = await V();
      ok('the outline switch draws the hidden dummies as outlines, and only them', outlinesOk && !vOff.outlined.some(Boolean), `on: shooter ${v.outlined[12]}, in the smoke ${v.outlined[1]}, seen ones ${v.outlined[0]}/${v.outlined[2]}; off: ${vOff.outlined.filter(Boolean).length}`);
      // A dummy on the 2.5 m ledge, 2.5 m back from its edge: hidden from 1 m off the wall, drawn from 8 m back.
      await put(0, -14.5, -2, 2.5);
      await T(() => window.__testlines.place(-11, -2));
      await frames();
      const nearWall = (await V()).drawn[0];
      await T(() => window.__testlines.place(-4, -2));
      await frames();
      const farBack = (await V()).drawn[0];
      ok('a dummy on the 2.5 m ledge: hidden from right under the edge, drawn from 8 m back (its head over the edge)', !nearWall && farBack, `1 m off the wall ${nearWall}, 8 m back ${farBack}`);
      // The Hornet blocks sight (an upright 1.4 m cylinder) unless you ride it; riding, the eyes stand on its footplates.
      const hb = await T(() => window.__testlines.hornet());
      const through = await T((x, z) => window.__testlines.visionLine(x - 3, 1, z, x + 3, 1, z), hb.x, hb.z);
      await T((x, z) => window.__testlines.place(x + 1.2, z), hb.x, hb.z);
      await frames();
      await page.keyboard.press('KeyE');
      await frames();
      const ridingNow = (await T(() => window.__testlines.hornet())).riding;
      const throughRiding = await T((x, z) => window.__testlines.visionLine(x - 3, 1, z, x + 3, 1, z), hb.x, hb.z);
      const eyeRiding = (await V()).eye.y;
      const hb2 = await T(() => window.__testlines.hornet());
      await page.keyboard.press('KeyE');
      await frames();
      ok('the Hornet blocks sight unless you ride it; riding, the eyes are 1.65 m over its footplates', through && ridingNow && !throughRiding && Math.abs(eyeRiding - (hb2.y + 0.25 + 1.65)) < 0.05, `a line through it blocked ${through}; riding ${ridingNow}, blocked ${throughRiding}, eyes at ${eyeRiding.toFixed(2)} m`);
      // The cone (190 degrees): in front drawn, behind the back not, in the open.
      await T(() => window.__testlines.set('visionWidth', 190));
      await T(() => window.__testlines.place(30, 30));
      await frames();
      await faceToward(30, 45);
      const yaw = await T(() => window.__testlines.aimYaw());
      await put(0, 30 + Math.sin(yaw) * 8, 30 + Math.cos(yaw) * 8);
      await put(1, 30 - Math.sin(yaw) * 8, 30 - Math.cos(yaw) * 8);
      await frames();
      v = await V();
      const coneFront = v.drawn[0];
      const coneBack = v.drawn[1];
      await T(() => window.__testlines.set('visionWidth', 360));
      await frames();
      v = await V();
      ok('at 190 degrees a dummy in front is drawn and one behind your back is not, in the open; at 360 both are', coneFront && !coneBack && v.drawn[0] && v.drawn[1], `190°: front ${coneFront}, behind ${coneBack}; 360°: ${v.drawn[0]}, ${v.drawn[1]}`);
      await T(() => window.__testlines.set('visionWidth', 190));
      // A hidden dummy's health bar is hidden too: shoot the one in front, then it goes behind your back.
      await faceToward(30 + Math.sin(yaw) * 8, 30 + Math.cos(yaw) * 8);
      await page.mouse.down();
      await frames();
      await page.mouse.up();
      await frames();
      const barFront = (await V()).bars[0];
      await put(0, 30 - Math.sin(yaw) * 9, 30 - Math.cos(yaw) * 9 + 0.5);
      await frames();
      v = await V();
      ok('a hidden dummy hides its health bar too', barFront && !v.drawn[0] && !v.bars[0], `bar shown in front ${barFront}; behind: drawn ${v.drawn[0]}, bar ${v.bars[0]}`);
      // The white: the ground in front, in the open, is lighter with the rule on; behind the 3.07 m ledge it is not.
      await T(() => window.__testlines.set('visionWidth', 360));
      await T(() => window.__testlines.place(-8, -8));
      await put(0, 40, -40);
      await put(1, 42, -40);
      await frames();
      const box = async (x, z) => {
        const sp = await T((a, b) => window.__testlines.screenOf(a, 0, b), x, z);
        return (await T((a, b) => window.__testlines.pixels(a, b, 12, 12), sp.x - 6, sp.y - 6)).mean;
      };
      const lum = (m) => 0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2];
      const openOn = lum(await box(-5, -8));
      const shadeOn = lum(await box(-17.5, -8));
      await T(() => window.__testlines.set('visionOn', false));
      await frames();
      const openOff = lum(await box(-5, -8));
      const shadeOff = lum(await box(-17.5, -8));
      await T(() => window.__testlines.set('visionOn', true));
      await T(() => window.__testlines.set('visionWhite', 0));
      await frames();
      const openZero = lum(await box(-5, -8));
      await T(() => window.__testlines.set('visionWhite', 0.35));
      await page.screenshot({ path: `${shots}/${browserName}-vision.png` });
      ok('the white: the ground the eyes see is lighter with the rule on, the ground behind the 3.07 m ledge is not, and a white of 0 shows nothing', openOn > openOff + 15 && Math.abs(shadeOn - shadeOff) < 4 && Math.abs(openZero - openOff) < 4, `in the open ${openOff.toFixed(0)} -> ${openOn.toFixed(0)} (white 0: ${openZero.toFixed(0)}); behind the ledge ${shadeOff.toFixed(0)} -> ${shadeOn.toFixed(0)}`);
      // The sight line passes a hidden dummy (in the smoke): no stop, no colour; with the rule off it stops on it.
      await T(() => window.__testlines.set('visionWidth', 190));
      await T(() => window.__testlines.place(-36, 15));
      await put(1, -36, 21.8);
      await frames();
      await faceToward(-36, 30);
      await page.mouse.down({ button: 'right' });
      await frames();
      await faceToward(-36, 30);
      const lineHidden = await T(() => window.__testlines.sight());
      const hiddenNow = !(await V()).drawn[1];
      await T(() => window.__testlines.set('visionOn', false));
      await frames();
      const lineShown = await T(() => window.__testlines.sight());
      await page.mouse.up({ button: 'right' });
      await T(() => window.__testlines.set('visionOn', true));
      ok('the sight line passes a hidden dummy (no stop, no colour); with the rule off it stops on it', hiddenNow && lineHidden.visible && !lineHidden.onDummy && lineShown.onDummy, `hidden ${hiddenNow}; rule on: on a dummy ${lineHidden.onDummy}; rule off: ${lineShown.onDummy}`);
      // The shooter: behind the tall hedge, firing at you while you face away; its tracers are drawn and its shots heard.
      await T(() => window.__testlines.place(-28, 18));
      await frames();
      await faceToward(-28, 5);
      const s0 = await T(() => window.__testlines.shooter());
      const snd0 = await T(() => window.__testlines.sounds());
      await T(() => window.__testlines.set('shooterOn', true));
      let s1 = s0;
      for (let i = 0; i < 80 && s1.shots < s0.shots + 2; i++) {
        await sleep(100);
        s1 = await T(() => window.__testlines.shooter());
      }
      await T(() => window.__testlines.set('shooterOn', false));
      const snd1 = await T(() => window.__testlines.sounds());
      ok('the shooter fires at you from behind the tall hedge while hidden; its tracers are drawn and its shots heard', s1.shots >= s0.shots + 2 && s1.last?.hidden === true && s1.tracersStarted >= s0.tracersStarted + 2 && snd1.gun >= snd0.gun + 2 && snd1.clicks === snd0.clicks, `${s1.shots - s0.shots} shots, last hidden ${s1.last?.hidden}, tracers ${s1.tracersStarted - s0.tracersStarted}, heard ${snd1.gun - snd0.gun}, your clicks +${snd1.clicks - snd0.clicks}`);
      // Footsteps: walking dummies are heard (hidden or not), softer with distance as the settings say.
      await T(() => window.__testlines.set('stepVolume', 0.3));
      await T(() => window.__testlines.set('dummiesWalk', true));
      await T(() => window.__testlines.place(-8, 0));
      const f0 = await T(() => window.__testlines.sounds());
      await sleep(2500);
      const f1 = await T(() => window.__testlines.sounds());
      const att = await T(() => [window.__testlines.attenuationAt(2), window.__testlines.attenuationAt(21.5), window.__testlines.attenuationAt(41)]);
      const g = f1.last;
      const expected = 0.3 * 0.25 * (await T((d) => window.__testlines.attenuationAt(d), g.distance));
      ok('walking dummies are heard step by step, at the volume their distance gives (linear, 3 m to 40 m)', f1.step > f0.step + 3 && Math.abs(att[0] - 1) < 1e-9 && Math.abs(att[1] - 0.5) < 1e-9 && att[2] === 0 && (g.kind !== 'step' || Math.abs(g.gain - expected) < 1e-6), `${f1.step - f0.step} footsteps in 2.5 s; at 2 / 21.5 / 41 m: ${att.map((a) => a.toFixed(2)).join(' / ')}; last ${g.kind} at ${g.distance.toFixed(1)} m, gain ${g.gain.toFixed(4)}`);
      await T(() => window.__testlines.set('soundCurve', 'inverse'));
      const inv = await T(() => window.__testlines.attenuationAt(21.5));
      await T(() => window.__testlines.set('soundCurve', 'linear'));
      ok('the falloff curve can be changed (inverse drops sooner)', inv < 0.5 && inv > 0, inv.toFixed(3));
      // Put it all back for the checks that follow.
      await T(() => window.__testlines.set('stepVolume', 0));
      await T(() => window.__testlines.set('dummiesWalk', false));
      await T(() => window.__testlines.set('visionOn', false));
      await T(() => window.__testlines.set('visionDummies', false));
      await T(() => window.__testlines.set('visionWidth', 190));
      await T(() => window.__testlines.place(30, 30));
      await frames();
    }

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
    ok('Export carries the Hornet', !!doc && doc.values.hornet?.top_speed_m_per_s === 12 && doc.values.hornet?.beam_damage === 120 && doc.values.hornet?.pellet_damage === 12 && doc.constants?.hornet?.gun_height_m === 1.25, doc ? JSON.stringify(doc.values.hornet).slice(0, 80) : '');
    {
      const g = doc?.values?.grenade;
      const es = doc?.constants?.explosion_sheet;
      // (The sheet's numbers are compared with what the keying script wrote, so a new sheet needs no change here.)
      const keyed = JSON.parse(readFileSync(resolve('src/assets/explosion-keyed.json'), 'utf8'));
      const same = !!es && Object.entries(keyed).every(([k, v]) => JSON.stringify(es[k]) === JSON.stringify(v));
      ok('Export carries the explosion: its look, play time, width, pull and fragments, and the sheet as keyed', !!g && g.explosion_look === 'sheet' && g.explosion_play_time_s === 1 && g.explosion_width_m === 8 && g.explosion_pull_to_camera_m === 2 && g.fragments === true && same && es.drawn_at_once === 8 && es.max_stretch === 4, es ? JSON.stringify({ look: g?.explosion_look, ground: es.anchor_ground_line_from_top, clear: es.clear_share, key: es.key_colour_rgb, same }) : 'no explosion_sheet');
    }
    {
      const vv = doc?.values?.vision;
      const ds = doc?.values?.dummy_sounds;
      const cv = doc?.constants?.vision;
      ok("Export carries the vision rule and the dummies' sounds, with their fixed numbers, in format 1", !!vv && vv.cone_width_deg === 190 && vv.eye_height_m === 1.65 && vv.cone_white_strength === 0.35 && vv.show_hidden_outlines === false && vv.shooter_fires === false && 'vision_rule' in vv && 'test_dummies' in vv && !!ds && ds.inner_radius_m === 3 && ds.outer_radius_m === 40 && ds.falloff_curve === 'linear' && ds.pan_by_screen_side === true && ds.gunfire_volume === 1 && 'footsteps_volume' in ds && !!cv && cv.stand_ins.hedges.length === 2 && cv.stand_ins.hedges[0].top === 1.4 && cv.stand_ins.hedges[1].top === 2 && cv.body_points.middle_heights_m.length === 5 && !!doc.constants?.dummy_sounds?.falloff_formulas && doc.format_version === 1, vv ? JSON.stringify({ vision: vv, sounds: ds }) : 'no vision values');
    }
    ok('Export carries the room sizes, the grid and the measured soldier', !!doc && doc.values.metrics_room?.door_width_m === 1 && doc.values.metrics_room?.door_height_m === 2.1 && doc.values.measuring_grid?.grid_thin_step_m === 0.5 && doc.derived?.metrics_room_built?.door_height_m === 2.1 && !!doc.constants?.metrics_room_layout && Math.abs(doc.measured?.soldier_height_m - 1.8) < 0.005 && doc.measured?.soldier_on_screen_px > 20, doc ? JSON.stringify(doc.measured) : '');

    // The hand-over to the game: the format's name and version, the commit the page was built from, the step-rate
    // warning (the rate is 60 here), and everything the Export held before still in its place.
    {
      const commitOk = typeof doc?.build_commit === 'string' && /^[0-9a-f]{40}$/.test(doc.build_commit);
      // (The page must be built from committed files: a page built from uncommitted ones says "-dirty" and fails here.)
      let ancestor = false;
      if (commitOk) {
        try {
          execSync('git merge-base --is-ancestor ' + doc.build_commit + ' HEAD', { stdio: 'ignore' });
          ancestor = true;
        } catch {}
      }
      ok('Export names its format and version and the commit the page was built from (a commit of this branch)', !!doc && doc.format === 'testlines-export' && doc.format_version === 1 && commitOk && ancestor, `${doc?.format} ${doc?.format_version}, build_commit ${doc?.build_commit}`);
      const keys = doc ? Object.keys(doc) : [];
      const before = ['what', 'note', 'build', 'camera_profile', 'exported', 'exported_utc', 'values', 'derived', 'constants', 'measured', 'old_game_terms'];
      const at = before.map((k) => keys.indexOf(k));
      ok('everything the Export held keeps its name and order; the commit sits beside the step name', at.every((i, j) => i >= 0 && (j === 0 || i > at[j - 1])) && keys.indexOf('build_commit') === keys.indexOf('build') + 1, keys.join(', '));
      const warnUnder = await page.$eval('#panel .p-warn', (e) => (e.hidden ? '' : e.textContent));
      ok('at 60 steps a second a warning line shows in the Export and under the Export button', !!doc && doc.warnings.length === 1 && /60/.test(doc.warnings[0]) && /30/.test(doc.warnings[0]) && warnUnder === doc.warnings[0], `Export: ${JSON.stringify(doc?.warnings)}; under the button: "${warnUnder}"`);
      const listed = doc ? doc.changed_from_start.find((c) => c.group === 'simulation' && c.name === 'step_rate_hz') : null;
      ok('changed_from_start lists the step rate with its start and current value, and agrees with the values', !!listed && listed.start === 30 && listed.current === 60 && doc.changed_from_start.every((c) => JSON.stringify(doc.values[c.group][c.name]) === JSON.stringify(c.current) && JSON.stringify(c.start) !== JSON.stringify(c.current)), JSON.stringify(listed));
    }
    // One dialog handler for the rest: it answers as told (yes by default).
    let dialogAnswer = true;
    page.on('dialog', (d) => (dialogAnswer ? d.accept() : d.dismiss()));
    // Values survive a reload; Reset all restores them.
    await page.reload();
    await sleep(2000);
    v = await T(() => window.__testlines.values().tickRate);
    ok('values are kept after a reload', v === '60', String(v));
    dialogAnswer = true;
    const btns = await page.$$('#panel .p-btns .p-btn');
    await btns[2].click();
    await sleep(200);
    v = await T(() => window.__testlines.values().tickRate);
    ok('Reset all restores the start values', v === '30', String(v));
    cv = await T(() => window.__testlines.values());
    ok('Reset all puts the camera back on Original', cv.camHeight === 24.5 && cv.camTurn === 64, `height ${cv.camHeight}, turn ${cv.camTurn}`);
    {
      const ex = async () => JSON.parse(await T(() => window.__testlines.exportText()));
      const stored = () => T(() => window.__testlines.storedRaw());
      const importLine = () => page.$eval('#panel .p-import', (e) => (e.hidden ? '' : e.textContent));
      const d0 = await ex();
      const warnShown = await page.$eval('#panel .p-warn', (e) => !e.hidden);
      ok('at the start values changed_from_start is empty and there is no warning', d0.changed_from_start.length === 0 && d0.warnings.length === 0 && !warnShown, `${d0.changed_from_start.length} listed, warnings ${JSON.stringify(d0.warnings)}, line shown ${warnShown}`);
      // (Reset all turned the vision rule, its test dummies and the footsteps back on: off again for speed here.)
      await T(() => {
        const t = window.__testlines;
        t.set('visionOn', false);
        t.set('visionDummies', false);
        t.set('stepVolume', 0);
      });
      // State A: a number, the "auto" value set, a toggle, a choice written as a number, a word choice.
      await T(() => {
        const t = window.__testlines;
        t.set('walkSpeed', 7);
        t.set('camAngle', 30);
        t.set('gridOn', false);
        t.set('gridStep', '0.25');
        t.set('nadeLook', 'plain');
      });
      const dA = await ex();
      const got = dA.changed_from_start.map((c) => c.group + '.' + c.name + ': ' + JSON.stringify(c.start) + ' -> ' + JSON.stringify(c.current)).sort();
      const want = ['camera.angle_override_deg: "auto" -> 30', 'grenade.explosion_look: "sheet" -> "plain"', 'measuring_grid.grid_on: true -> false', 'measuring_grid.grid_thin_step_m: 0.5 -> 0.25', 'movement.walk_speed_m_per_s: 6.3 -> 7', 'vision.vision_rule: true -> false', 'vision.test_dummies: true -> false', 'dummy_sounds.footsteps_volume: 0.3 -> 0'].sort();
      ok('changed_from_start lists exactly the values moved, each with its start and current value', JSON.stringify(got) === JSON.stringify(want), got.join('; '));
      const textA = JSON.stringify(dA, null, 2);
      const storedA = await stored();
      // State B: each of those moved again (the angle back to auto), the step rate (a number choice) to 60, a word
      // choice, and the speed-up time, whose start (0.16447...) has more decimals than the Export keeps: the Export
      // says 0.164, and the Import must give back the exact start, not 0.164.
      await T(() => {
        const t = window.__testlines;
        t.set('walkSpeed', 8);
        t.set('camAngle', null);
        t.set('gridOn', true);
        t.set('gridStep', '0.1');
        t.set('nadeLook', 'sheet');
        t.set('tickRate', '60');
        t.set('aimAt', 'level');
        t.set('accelTime', 0.3);
      });
      const valuesB = JSON.stringify((await ex()).values);
      const storedB = await stored();
      // Refused: another format name, another version, an Export from before step E (no format), a value no slider
      // takes. Each changes nothing: the values and what the browser keeps stay as they were.
      const noFormat = { ...dA };
      delete noFormat.format;
      delete noFormat.format_version;
      const variants = [
        ['another format name', { ...dA, format: 'other-export' }],
        ['another version', { ...dA, format_version: 2 }],
        ['an Export from before step E (no format name)', noFormat],
        ['a value no slider takes', { ...dA, values: { ...dA.values, movement: { ...dA.values.movement, walk_speed_m_per_s: 'fast' } } }],
        ['a group that holds no values', { ...dA, values: { ...dA.values, movement: 'x' } }],
        ['a file with none of the values', { ...dA, values: {} }],
      ];
      for (const [name, bad] of variants) {
        const r = await T((t) => window.__testlines.importText(t), JSON.stringify(bad));
        const line = await importLine();
        const same = JSON.stringify((await ex()).values) === valuesB && (await stored()) === storedB;
        ok(`Import refuses ${name} and changes nothing`, r === 'refused' && same && /refused/i.test(line) && /Nothing was changed/.test(line), `${r}; "${line}"`);
      }
      // A "no" to the question changes nothing either.
      dialogAnswer = false;
      const rc = await T((t) => window.__testlines.importText(t), textA);
      dialogAnswer = true;
      ok('Import asks first; a no changes nothing', rc === 'cancelled' && JSON.stringify((await ex()).values) === valuesB && (await stored()) === storedB, rc);
      // The Import button with a saved Export under any file name: the button opens the file chooser (where the
      // browser's driver can answer it; otherwise the file goes straight into the button's file input).
      const file = resolve(shots, `${browserName}-saved-export.txt`);
      writeFileSync(file, textA);
      const importByButton = async () => {
        const before = await importLine();
        await T(() => {
          const l = document.querySelector('#panel .p-import');
          l.textContent = '';
        });
        let how = 'the Import button and its file chooser';
        if (isFx) {
          // (Here the file chooser is answered only in Chromium: a real one opened in Firefox could take the focus
          // from the checks that follow.)
          how = "the Import button's file input";
          // (Cleared first, as the button itself does, so the same file chosen again still counts as a choice.)
          await T(() => {
            document.querySelector('#panel input[type=file]').value = '';
          });
          await (await page.$('#panel input[type=file]')).uploadFile(file);
        } else {
          const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 20000 }), (await page.$$('#panel .p-btns .p-btn'))[1].click()]);
          await chooser.accept([file]);
        }
        for (let i = 0; i < 50 && !(await importLine()); i++) await sleep(100);
        return { how, line: await importLine(), before };
      };
      const first = await importByButton();
      const dBack = await ex();
      // (The very values come back, not values nudged by the Export's rounding: what the browser keeps is the same
      // string as when the Export was made, the speed-up time back at its exact start.)
      const storedBack = await stored();
      const accel = await T(() => window.__testlines.values().accelTime);
      ok('Import loads a saved Export back: every value exactly as exported, none nudged by rounding', JSON.stringify(dBack.values) === JSON.stringify(dA.values) && JSON.stringify(dBack.changed_from_start) === JSON.stringify(dA.changed_from_start) && storedBack === storedA && Math.abs(accel - Math.log(10) / 14) < 1e-12 && /Imported/.test(first.line) && /8 values changed/.test(first.line), `through ${first.how}; kept ${storedBack === storedA ? 'the same' : `${storedA} -> ${storedBack}`}; speed-up time ${accel}; "${first.line}"`);
      // The same file again through the button, after a change: it loads again.
      await T(() => window.__testlines.set('walkSpeed', 9));
      const second = await importByButton();
      ok('the same saved file loads again through the Import button', (await T(() => window.__testlines.values().walkSpeed)) === 7 && /Imported/.test(second.line) && /1 value changed/.test(second.line), `"${second.line}"`);
      // A value finer than the Export keeps (typed into its field) stays exactly as it is when the file's rounded value
      // is the same: an Import nudges nothing.
      await T(() => window.__testlines.set('walkSpeed', 7.00004));
      const rFine = await T((t) => window.__testlines.importText(t), textA);
      const fine = await T(() => window.__testlines.values().walkSpeed);
      ok('Import leaves a value finer than the Export keeps exactly as it is', rFine === 'imported' && fine === 7.00004 && /0 values changed/.test(await importLine()), `${rFine}, walk speed ${fine}`);
      await T(() => window.__testlines.set('walkSpeed', 7));
      // An Export from before step F (no vision or dummy sound values) still imports; those values stay as they are.
      {
        await T(() => window.__testlines.set('visionWidth', 250));
        const old = JSON.parse(textA);
        delete old.values.vision;
        delete old.values.dummy_sounds;
        const rOld = await T((t) => window.__testlines.importText(t), JSON.stringify(old));
        const lineOld = await importLine();
        const widthAfter = (await T(() => window.__testlines.values())).visionWidth;
        ok('an Export from before step F (no vision values) still imports, and leaves the vision values as they are', rOld === 'imported' && widthAfter === 250 && /not in the file stay as they are/.test(lineOld), `${rOld}; cone width ${widthAfter}; "${lineOld}"`);
        await T(() => window.__testlines.set('visionWidth', 190));
      }
      // What the browser keeps is never cleared by a reload, an Export, a refused or a cancelled Import.
      const s0 = await stored();
      await page.reload();
      await sleep(2000);
      const s1 = await stored();
      await page.click('#panel .p-primary');
      await sleep(300);
      const s2 = await stored();
      await T((t) => window.__testlines.importText(t), JSON.stringify({ ...dA, format_version: 2 }));
      const s3 = await stored();
      dialogAnswer = false;
      await T((t) => window.__testlines.importText(t), textA);
      dialogAnswer = true;
      const s4 = await stored();
      ok('the values kept in the browser stay exactly as they were after a reload, an Export, a refused and a cancelled Import', !!s0 && s0.length > 2 && [s1, s2, s3, s4].every((x) => x === s0), s0);
      await (await page.$$('#panel .p-btns .p-btn'))[2].click();
      await sleep(200);
    }
    // Values saved by the first builds (every value, under the old key): the old camera defaults count as
    // untouched, anything moved by hand is kept.
    await T(() => {
      localStorage.clear();
      localStorage.setItem(
        'shamble-testlines.values.v1',
        JSON.stringify({ camHeight: 40, camBack: 56.6, camTurn: 45, lookBase: 5.5, walkSpeed: 7.2, tickRate: '30' }),
      );
    });
    await page.reload();
    await sleep(2000);
    cv = await T(() => window.__testlines.values());
    ok(
      'old saved camera defaults give way to Original; moved values stay',
      cv.camHeight === 24.5 && cv.camTurn === 64 && cv.lookBase === 3.4 && cv.walkSpeed === 7.2,
      `height ${cv.camHeight}, turn ${cv.camTurn}, look ${cv.lookBase}, walk ${cv.walkSpeed}`,
    );
    // A camera moved by hand in the first builds (here the old Iso+ preset) comes back whole, not mixed.
    await T(() => {
      localStorage.clear();
      localStorage.setItem(
        'shamble-testlines.values.v1',
        JSON.stringify({ camHeight: 41.5, camBack: 65.5, camLens: 12, camTurn: 45, camAngle: null, lookBase: 5.5, lookMin: 3.5, lookMax: 8, lookFwdRange: 26, lookBackRange: 16, lookSideMax: 6, posFwdMax: 3.2, posBackMax: 2.2, posSideMax: 2 }),
      );
    });
    await page.reload();
    await sleep(2000);
    cv = await T(() => window.__testlines.values());
    ok(
      'a camera moved in the first builds comes back whole (Iso+)',
      cv.camHeight === 41.5 && cv.camLens === 12 && cv.camTurn === 45 && cv.lookBase === 5.5,
      `height ${cv.camHeight}, lens ${cv.camLens}, turn ${cv.camTurn}, look ${cv.lookBase}`,
    );
    // A saved old Foxhole camera (from before aiming down sights) comes back with its Slide, and lit.
    await T(() => {
      localStorage.clear();
      localStorage.setItem(
        'shamble-testlines.values.v1',
        JSON.stringify({ camHeight: 52, camBack: 42, camLens: 18, camTurn: 45, camAngle: null, lookBase: 5.5, lookMin: 3.5, lookMax: 8, lookFwdRange: 26, lookBackRange: 16, lookSideMax: 6, posFwdMax: 3.2, posBackMax: 2.2, posSideMax: 2 }),
      );
    });
    await page.reload();
    await sleep(2000);
    cv = await T(() => window.__testlines.values());
    const litF = await page.$$eval('#panel .p-presets .p-btn.on', (bs) => bs.map((b) => b.textContent));
    ok('a saved old Foxhole camera comes back sliding, and lit', cv.adsCam === 'pan' && cv.adsPanMax === 16 && litF.includes('Foxhole'), `${cv.adsCam}, ${cv.adsPanMax}, lit ${litF.join(',')}`);
    await T(() => window.__testlines.preset('Original'));
    await T(() => window.__testlines.set('walkSpeed', 6.3));

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
      console.log(`  ${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
    }
  } catch (e) {
    failed++;
    console.log(`\n${b}\n  FAIL  ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
