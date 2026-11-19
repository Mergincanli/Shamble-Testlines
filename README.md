# Shamble Testlines

A throwaway feel sandbox for Shamble Frontlines: movement, jumping, camera and gun feel, tuned by playing.
Nothing here is the game, and no value here is a decision.

## Open it

`play/testlines.html` is the whole sandbox in one file. Save it and double-click it: it opens in your browser
with no install, no server and no internet.

Keys: WASD move (away from the camera on W), Shift sprint, Space jump, the mouse aims, the left button fires, hold
the right button (or G) to aim a grenade at the cursor and let go to throw, Q aims down sights, R reloads, hold the
middle button to turn the camera, 1, 2 and 3 change guns (SMG, rifle, shotgun), E gets on and off the Hornet, the
backquote key (`) hides the panel. The Grenade group's "Right button" switch gives the right button back to aiming
down sights, as in the old game (G still throws).

The shotgun (key 3, the Peacekeeper's) starts from the old game's Bagpipe: 8 pellets of 11 damage, 0.85 s between
shots, 2 shells, a 2.6 s reload, 34 m range, spread 0.1 (0.05 aiming). One pull is one round, one click, one view
kick and one hit marker; each pellet scatters on its own. It has falloff sliders, starting at none, as the old
Bagpipe had none. Its reload fills both shells at once, as the old game's did (docs/UNITS.md has shells loading one
by one; that is not built). Its model is the sandbox's own minimal shape (no Art text covers it yet), held like
the rifle.

The grenade (the owner's design): hold the right button (or G) and an arc shows the whole flight to the point
under the cursor (the ground, a block's top or side, the ramp): dots along the path, a bigger dot at each bounce,
and where it goes off a small ring with the blast's reach round it on the floor (smaller for a burst in the air, as
damage is measured to the feet; none if it goes off higher than the blast radius). Let go and it throws; the grenade
flies exactly that arc, bounces exactly there and goes off exactly there (the arc runs the very step function the
grenade flies by, with the same target and place). Aim at a wall's face and it bounces off it. The plain arc is kept
whenever it lands at the cursor before the fuse runs out; if it would hit something first (the edge of a ledge,
cover), lobs 5° at a time up to 80° are tried and the one that goes off closest to the cursor is taken (a ledge top
from beside it), but only if it goes off at least 0.5 m closer than the plain arc, which otherwise stays, shown
hitting whatever is in the way. No charge (the old game shared one charge with the Torque Bow; the
grenade has none now): the throw leaves at 41.3° above level (raised for a target above the hand, in step with its elevation), from the
soldier's middle at 1.5 m (a lob from right behind the cover wall clears it), at the speed that reaches the target,
up to 26 m/s, about 35 m on flat ground; a target further away falls short. While the arc is up the gun is held
(the left button does nothing). A click within one frame still throws, at the cursor. From the old game: the launch angle and top speed, gravity 20, a 1.5 s fuse from
the throw, a 6.5 m blast doing 140 damage at the centre, falling off evenly to nothing at the edge and needing a
clear line from the blast, and the view lurching away from a blast (strength 24, reach 34 m, spring 110, damping 12).
With the 1.5 s fuse, a throw beyond about 24 m goes off in the air before it lands, and a short one bounces and
rolls on past the cursor before it goes off; the arc shows both. Three grenades in hand, one back every 5 s.
Differences from the old game: grenades bounce off blocks and the ramp (the old one only bounced off the ground),
and are swept so they never pass through the thin cover wall or into a block; a real impact bounces with the old
game's shares (0.4 into, 0.6 along the surface), while rolling along a surface slows at a steady 3 per second (the
old game lost speed per frame); a grenade comes to rest only on level ground (on the ramp it rolls back down); the
flight and the fuse run in steps of 1/120 s at either step rate, so a throw flies and goes off the same at 30 or
60. The soldier has no health, so blasts do not hurt him.

Aim down sights (the old game's rules): hold Q, or the right button when it is set to aim (or switch to
click-to-toggle). In Firefox, Shift + right click always opens the browser's own menu, which no page can stop;
since Shift sprints, use Q (or G, for the grenade) there. While aiming
the soldier walks at 0.55 of his speed and cannot sprint, each gun's spread rests at its sights value, and the
screen dead zone shrinks to 0.45. The camera reacts in one of three ways: Flatten (the view tips toward the
cursor, no flatter than 28.5°), Slide (the camera slides toward the cursor, keeping the soldier on screen; the
old Foxhole style) or Still. Two differences from the old game: Flatten tips toward the point the cursor marks in
the resting view, so the view settles instead of creeping on while the cursor is still; and it never tips so far
that the soldier's own feet leave the screen (the old game's 28.5° floor suited its own Iso+ camera). The camera profiles carry
the reaction and the Slide reach (scaled like the look-ahead).

The Hornet (the owner's description; no Art text or old number covers it, so every number is the sandbox's pick,
not a decision): an early Empire vehicle on one wheel with a gun above it, waiting near the start at (6, 1). Walk
up to it (a hint shows within 2 m) and press E to ride it; E again gets off, onto a free spot beside it. It is not
solid while it stands (the soldier walks through it). Riding: W drives forward, S brakes and then backs up, A and D
turn it on the spot or on the move (12 m/s top speed, 7 m/s² to get there, 14 m/s² braking, 4 m/s backwards, 140°
a second). It drives on the soldiers' own ground rules with its own body (0.45 m radius, so it fits the 1.0 m
doorway; 0.3 m step-up, so it rolls over a curb and up the stair and the ramp but not the 0.55 m step; the rider on
its footplates stands 2.05 m, just under the 2.1 m lintel), in sub-steps no longer than half its radius, so no
speed carries it through a wall. It pushes the dummies aside and is not pushed. The lean is in the picture only:
the body pitches forward as it speeds up (12° at full throttle) and back as it brakes or starts backwards (22° at
full braking); a spring rights it (recovery 7/s, settling 0.35), so it swings past the lean (as if it will fall)
and settles. Nothing the Hornet does reads the lean: where it goes and where its shots land are the same with any
lean setting (a scripted check proves it). The gun turns to the cursor and fires level from 1.25 m. A tap of the
left button fires 8 pellets (12 damage each, 22 m, spread ±8° without charge); holding it charges (1 s), and the
pellets close in as it charges; let go at full charge and it fires one slug as a short purple beam (120 damage,
40 m, spread at full charge 0). A full-charge shot tips the body away from the shot (35°, the tip is in the
picture only; aimed behind, it tips forward) and slides the Hornet 6 cm away from the shot, the one movement a shot
makes (the same 6 cm at either step rate; a wall stops it); then comes a weak moment (0.9 s): it cannot fire and
turns at 0.3 of its rate. 0.45 s between shots. A button held through the gap or the weak moment starts charging as
soon as the gun is ready; a let-go before then does nothing. Pellets against infantry and the beam against
vehicles is an idea, not settled: the two damages are separate sliders. Getting on or off, or the page losing
focus, drops a charge. While riding, the soldier's own gun, grenades and aiming down sights wait; the size readout
measures him on the footplates. Its look is a blockout in the Empire's colours with the ink line, and is not
judged here.

Active reload (simplified, as Slice 1 has it): during a reload, tap R while the bar is inside the gold window and
the reload ends at once. A miss is a normal reload, with no jam; one try per reload. The window's start and width
are sliders per gun, as shares of the reload time. An R press within 0.25 s of a reload starting by itself (the
rifle after every shot, any gun on its last round) counts as the press that started it, not as the tap.

Camera profiles (in the panel's Camera group; each sets the whole camera, framing included):
- **Original** (the default): the old game's camera as the owner's screenshot shows it. Fitted to the screenshot's
  path tiles, it is the old Iso camera (40 m up, 56.6 m back, lens 15°) turned 64° to the grid, with the old
  soldier 2.94 m tall on screen; it is scaled by 1.80 / 2.94 so the stand-in fills the screen as the old soldier
  did (24.5 m up, 34.7 m back), with the look-ahead scaled alike.
- **Experimental**: the owner's tweak of Original (19 Nov): lens 13°, look-ahead at least 4.5 m, the look point
  following at 20.5/s, the edge push easing at 2.5/s, no forward or sideways camera shift; the rest as Original.
- **Indie**: the camera of the owner's indie game, judged by eye from one screenshot: about 50° above the feet,
  a 35° lens, straight behind, the character about a tenth of the screen's height.
- The old game's five presets (Classic, Tactical, Iso, Iso+, Foxhole) stay, at the old game's own soldier scale.

Measuring (the panel's "Measuring grid" and "Metrics room" groups): the ground, the yard's blocks and the room carry
a prototype grid laid in world space, so it lines up on every surface: a thick dark line every metre and thinner,
lighter lines inside each square at the thin step (0.5 m to start; 0.5, 0.25, 0.2 or 0.1, the steps that divide a
metre; they fade out where they would be closer than a few pixels). Ground, yard blocks and room each have a colour
choice; switching the grid off brings back the Art colours. The second line top left reads the soldier's height,
measured from the stand-in's geometry (1.80 m), and his height on screen at the camera in use, in CSS pixels and as
a share of the view's height; the Export carries both. It measures feet to the top of his head along his centre
line; his outline on screen is about 10 % taller, because the camera looking down sees his depth as well. To compare him with the grid, stand him in the plane of the
squares you read: the camera looks down at an angle, so against a wall half a metre behind him he reads about
0.35 m short.

The metrics room stands beside the yard at x 20, from z -9 to z -28 (the start is at 0, 0: on the default camera
that is toward the camera and to the right, S and D), its faces toward the default camera: a doorway and a window in two short walls, a
waist-high cover and a stair to a landing. It is free-standing pieces, as in a level blockout's metrics room, not
an enclosed room. Start sizes: the door 1.0 m wide and 2.1 m high (the owner's); everything else is the sandbox's
pick of an ordinary real size, not a decision: walls 3.0 m high, 0.2 m thick and 4 m long, the window 1.2 x 1.2 m
on a 0.9 m sill, the cover 1.0 m high, 2.4 m long and 0.3 m thick, the stair 8 steps of 18 cm rise and 28 cm tread,
1.2 m wide, to a landing 1.5 m deep. Every size is a slider and goes into the Export; the room is rebuilt as you
drag. An opening is held to fit its wall (no wider than the wall less 0.2 m, at least 5 cm of wall over it, the
sill at least 10 cm under the top): the slider's note then says what is built, and the Export lists the built
sizes beside the sliders (derived, metrics_room_built), with the room's layout and the grid's fixed look numbers
(constants). The walls over the door and over the window float: his head bumps the lintel if he jumps in the
doorway, a door lower than his 1.80 m stops him, he cannot step onto the sill (no headroom), grenades bounce off
the lintel's underside and fly through the window. With the old jump reach (3.07 m) he can jump onto a 3.0 m wall;
raise the wall above the reach to stop that. Level shots fly at 1.36 m, so the 1.0 m cover and the 0.9 m sill do
not stop them (how aiming at height works is open in the game). The stair is walked on a slope through the middle
of each tread (his body is wider than a tread, so stepping each one would lurch), with the steps drawn over it: his
feet are at most half a rise above or below a drawn tread. On any slope he is brought onto the block at its head
by walking up (not by an early step-up, and its face is no wall to him), a slope rising faster than he can step
holds him back along itself, and running down an ordinary stair he stays on it at either step rate.

What is in it: a test yard with steps, a cover wall, ledges and a ramp; your soldier; eleven dummies walking loops
in the other two factions' colours, which push softly and never block; the SMG and the rifle, firing at the
dummies (tracers, a muzzle flash, a hit marker on a hit, health bars; a dropped dummy stands again after 4 s).

## The panel

- The camera starts on the Original profile (above). Most other sliders start at the old game's number. A few
  are the sandbox's own picks, because the old game has no number for them: the body radius (from the Art
  brief's soldier), push strength and push radius, the sprint-to-fire delays (0.15 s SMG, 0.25 s rifle, 0.3 s
  shotgun), the active-reload window (40 % to 60 %), the shotgun's falloff (none), the press rule below
  (0.15 s, no slider), the grenade refill (5 s), the grenade's rolling slowdown (3 per second, no slider), where a
  throw starts (the soldier's middle at 1.5 m, no slider) and how an aimed throw picks its angle (raised in step
  with a higher target's elevation; lobs up to 80° when the plain arc is blocked; no slider). Every slider has its own reset (↺, lit when the value has moved);
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
round soldiers, guns and blocks. Using these texts here decides no colour, line width or shading value. The
measuring grid (on at the start) replaces the yard's colours with blockout colours while it is on.

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
- `src/movement.ts`: the movement. `src/yard.ts`: the test blocks and collision. `src/metrics.ts`: the metrics room.
- `src/dummies.ts`: the dummies' loops. `src/push.ts`: soft pushing.
- `src/weapons.ts`: the guns, the hitscan, the reload and the active reload. `src/fx.ts`: shot feedback.
- `src/grenade.ts`: the grenade's flight, preview and blast. `src/nadefx.ts`: its look.
  `src/audio.ts`: the click. `src/hud.ts`: the readout, stamina, ammo and reload bar.
- `src/hornet.ts`: the Hornet's driving, lean and gun. `src/hornetModel.ts`: its blockout. `src/spring.ts`: the
  exact spring (the Hornet's lean, the grenade's camera kick).
- `src/camera.ts`: the follow camera. `src/input.ts`: keys and mouse.
- `src/soldier.ts`, `src/guns.ts`, `src/look.ts`, `src/geom.ts`: the stand-in look (and the measuring grid, in
  `src/look.ts`).

No code here comes from the game's repository or from Shamble VFX; numbers and described behaviour only.
