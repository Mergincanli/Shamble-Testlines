# Shamble Testlines

A throwaway feel sandbox for Shamble Frontlines: movement, jumping, camera and gun feel, tuned by playing.
Nothing here is the game, and no value here is a decision.

## Open it

`play/testlines.html` is the whole sandbox in one file. Save it and double-click it: it opens in your browser
with no install, no server and no internet.

Keys: WASD move (away from the camera on W), Shift sprint, Space jump, the mouse aims, the left button fires, R
reloads, hold the middle button to turn the camera, 1 and 2 change guns (SMG, rifle), the backquote key (`) hides
the panel.

Active reload (simplified, as Slice 1 has it): during a reload, tap R while the bar is inside the gold window and
the reload ends at once. A miss is a normal reload, with no jam; one try per reload. The window's start and width
are sliders per gun, as shares of the reload time.

What is in it: a test yard with steps, a cover wall, ledges and a ramp; your soldier; eleven dummies walking loops
in the other two factions' colours, which push softly and never block; the SMG and the rifle, firing at the
dummies (tracers, a muzzle flash, a hit marker on a hit, health bars; a dropped dummy stands again after 4 s).

## The panel

- Most sliders start at the old game's number. A few are the sandbox's own picks, because the old game has no
  number for them: the body radius (from the Art brief's soldier), push strength and push radius, the two
  sprint-to-fire delays (0.15 s SMG, 0.25 s rifle) and the active-reload window (40 % to 60 %). Every slider
  has its own reset (↺, lit when the value has moved); hover a name to see where its start value comes from.
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
