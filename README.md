# Shamble Testlines

A throwaway feel sandbox for Shamble Frontlines: movement, jumping, camera and gun feel, tuned by playing.
Nothing here is the game, and no value here is a decision.

## Open it

`play/testlines.html` is the whole sandbox in one file. Save it and double-click it: it opens in your browser
with no install, no server and no internet.

Keys: WASD move (away from the camera on W), Shift sprint, Space jump, the mouse aims, the left button fires, the
right button aims down sights, R reloads, hold the middle button to turn the camera, 1, 2 and 3 change guns (SMG,
rifle, shotgun), the backquote key (`) hides the panel.

The shotgun (key 3, the Peacekeeper's) starts from the old game's Bagpipe: 8 pellets of 11 damage, 0.85 s between
shots, 2 shells, a 2.6 s reload, 34 m range, spread 0.1 (0.05 aiming). One pull is one round, one click, one view
kick and one hit marker; each pellet scatters on its own. It has falloff sliders, starting at none, as the old
Bagpipe had none. Its reload fills both shells at once, as the old game's did (docs/UNITS.md has shells loading one
by one; that is not built). Its model is the sandbox's own minimal shape (no Art text covers it yet), held like
the rifle.

Aim down sights (the old game's rules): hold the right button or Q (or switch to click-to-toggle). In Firefox,
Shift + right click always opens the browser's own menu, which no page can stop; since Shift sprints, use Q there. While aiming
the soldier walks at 0.55 of his speed and cannot sprint, each gun's spread rests at its sights value, and the
screen dead zone shrinks to 0.45. The camera reacts in one of three ways: Flatten (the view tips toward the
cursor, no flatter than 28.5°), Slide (the camera slides toward the cursor, keeping the soldier on screen; the
old Foxhole style) or Still. Two differences from the old game: Flatten tips toward the point the cursor marks in
the resting view, so the view settles instead of creeping on while the cursor is still; and it never tips so far
that the soldier's own feet leave the screen (the old game's 28.5° floor suited its own Iso+ camera). The camera profiles carry
the reaction and the Slide reach (scaled like the look-ahead).

Active reload (simplified, as Slice 1 has it): during a reload, tap R while the bar is inside the gold window and
the reload ends at once. A miss is a normal reload, with no jam; one try per reload. The window's start and width
are sliders per gun, as shares of the reload time. An R press within 0.25 s of a reload starting by itself (the
rifle after every shot, any gun on its last round) counts as the press that started it, not as the tap.

Camera profiles (in the panel's Camera group; each sets the whole camera, framing included):
- **Original** (the default): the old game's camera as the owner's screenshot shows it. Fitted to the screenshot's
  path tiles, it is the old Iso camera (40 m up, 56.6 m back, lens 15°) turned 64° to the grid, with the old
  soldier 2.94 m tall on screen; it is scaled by 1.80 / 2.94 so the stand-in fills the screen as the old soldier
  did (24.5 m up, 34.7 m back), with the look-ahead scaled alike.
- **Indie**: the camera of the owner's indie game, judged by eye from one screenshot: about 50° above the feet,
  a 35° lens, straight behind, the character about a tenth of the screen's height.
- The old game's five presets (Classic, Tactical, Iso, Iso+, Foxhole) stay, at the old game's own soldier scale.

What is in it: a test yard with steps, a cover wall, ledges and a ramp; your soldier; eleven dummies walking loops
in the other two factions' colours, which push softly and never block; the SMG and the rifle, firing at the
dummies (tracers, a muzzle flash, a hit marker on a hit, health bars; a dropped dummy stands again after 4 s).

## The panel

- The camera starts on the Original profile (above). Most other sliders start at the old game's number. A few
  are the sandbox's own picks, because the old game has no number for them: the body radius (from the Art
  brief's soldier), push strength and push radius, the sprint-to-fire delays (0.15 s SMG, 0.25 s rifle, 0.3 s
  shotgun), the active-reload window (40 % to 60 %), the shotgun's falloff (none) and the press rule below
  (0.15 s, no slider). Every slider has its own reset (↺, lit when the value has moved);
  hover a name to see where its start value comes from. The Export names the camera profile in use.
- **Export** copies every value as JSON with the date and time, the build it came from, units in the names and
  the old game's own names beside them. The JSON also appears in a box, in case the browser blocks copying.
- Values are kept in the browser between visits. **Reset all** puts everything back to the start values.
- Steps per second: 30 (the game's rate) or 60. The picture is smoothed between steps. The jump follows its exact
  arc at each step, so its height is the same at either rate.

## How the guns differ from the old game

- Spread scatters shots sideways only (the old game scattered them up and down as well); shots go out level from
  the gun's height.
- A level shot still counts within 0.6 m above a dummy's head or below its feet, so the 0.55 m step and the foot
  of the ramp work. How aiming at height works is open in the game.
- Recoil is the old game's view kick (a camera shake and a small zoom punch per shot), not an aim kick.
- A click in the gap between two shots is kept only if the gap has at most 0.15 s left (then it fires as the gap
  ends); earlier clicks do nothing. The old game dropped every click in the gap. Clicks during the sprint-to-fire
  delay and the pause after a gun change still wait and fire. This has no slider.
- A gun change leaves 0.12 s before the first shot, whatever gap the gun was put away in (the old game's rule).
- With the old numbers the SMG's spread does not build up: its recovery takes back more between two shots than a
  shot adds. The panel says so under "Spread added per shot".

## The look

A light stand-in for the game's new art direction, from the Art texts in the game's repository: the Conscript
stand-in (appendix A4), the yard's colours (A5 part C), the SMG (A6, with A10's corrections), the palette with its
sun and shadow colours (A7). Flat shading in three steps, a warm sun with a cool soft shadow, and a black ink line
round soldiers, guns and blocks. Using these texts here decides no colour, line width or shading value.

## Build it

Needs Node 20.19 or newer.

```
npm install
npm run dev      # live page at the address Vite prints
npm run build    # type check, then writes play/testlines.html
```

`npm run check` opens `play/testlines.html` from disk in Chromium and in Firefox and plays a short script (walk,
sprint, jump, ledges, steps, panel, Export). It needs the browsers' paths in `CHROMIUM_PATH` and `FIREFOX_PATH`,
and Firefox needs a display (on Linux: `xvfb-run -a npm run check`).

## Where things are

- `src/params.ts`: the one table of every tuned value (the panel, the resets, the saved values and the Export
  all come from it). `src/panel.ts`, `src/exporter.ts`: the panel and the Export.
- `src/main.ts`: the fixed-step loop (30 or 60 per second) and the smoothing between steps.
- `src/movement.ts`: the movement. `src/yard.ts`: the test blocks and collision.
- `src/dummies.ts`: the dummies' loops. `src/push.ts`: soft pushing.
- `src/weapons.ts`: the guns, the hitscan, the reload and the active reload. `src/fx.ts`: shot feedback.
  `src/audio.ts`: the click. `src/hud.ts`: the readout, stamina, ammo and reload bar.
- `src/camera.ts`: the follow camera. `src/input.ts`: keys and mouse.
- `src/soldier.ts`, `src/guns.ts`, `src/look.ts`, `src/geom.ts`: the stand-in look.

No code here comes from the game's repository or from Shamble VFX; numbers and described behaviour only.
