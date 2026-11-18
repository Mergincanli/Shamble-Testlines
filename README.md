# Shamble Testlines

A throwaway feel sandbox for Shamble Frontlines: movement, jumping, camera and gun feel, tuned by playing.
Nothing here is the game, and no value here is a decision.

## Open it

`play/testlines.html` is the whole sandbox in one file. Save it and double-click it: it opens in your browser
with no install, no server and no internet.

Keys: WASD move (away from the camera on W), Shift sprint, Space jump, the mouse aims, hold the middle button to
turn the camera, 1 and 2 change guns, the backquote key (`) hides the panel.

## The panel

- Every slider starts at the old game's number (or the Art brief's, where the old game has none) and has its own
  reset (↺, lit when the value has moved). Hover a name to see where its start value comes from.
- **Export** copies every value as JSON with the date and time, the build it came from, units in the names and
  the old game's own names beside them. The JSON also appears in a box, in case the browser blocks copying.
- Values are kept in the browser between visits. **Reset all** puts everything back to the start values.
- Steps per second: 30 (the game's rate) or 60. The picture is smoothed between steps. The jump follows its exact
  arc at each step, so its height is the same at either rate.

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
  all come from it).
- `src/movement.ts`: the fixed-step movement. `src/yard.ts`: the test blocks and collision.
- `src/camera.ts`: the follow camera. `src/soldier.ts`, `src/guns.ts`, `src/look.ts`: the stand-in look.

No code here comes from the game's repository or from Shamble VFX; numbers and described behaviour only.
