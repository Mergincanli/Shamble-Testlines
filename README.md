# Shamble Testlines

A throwaway feel sandbox for Shamble Frontlines: movement, jumping, camera and gun feel, tuned by playing.
Nothing here is the game, and no value here is a decision.

## Open it

`play/testlines.html` is the whole sandbox in one file. Save it and double-click it: it opens in your browser
with no install, no server and no internet.

Keys: WASD move (away from the camera on W), Shift sprint, Space jump, the mouse aims, the left button fires, the
right button (or Q) aims down sights, G or F readies a grenade (then hold the right button to aim it at the cursor
and let go to throw), R reloads, hold the middle button to turn the camera, 1, 2 and 3 change guns (SMG, rifle,
shotgun), E gets on and off the Hornet, the backquote key (`) hides the panel. Each gun's range is a slider in its
own group (Rifle and Shotgun start folded).

The shotgun (key 3, the Peacekeeper's) starts from the old game's Bagpipe: 8 pellets of 11 damage, 0.85 s between
shots, 2 shells, a 2.6 s reload, 34 m range, spread 0.1 (0.05 aiming). One pull is one round, one click, one view
kick and one hit marker; each pellet scatters on its own. It has falloff sliders, starting at none, as the old
Bagpipe had none. Its reload fills both shells at once, as the old game's did (docs/UNITS.md has shells loading one
by one; that is not built). Its model is the sandbox's own minimal shape (no Art text covers it yet), held like
the rifle.

The grenade (the owner's design): press G or F to ready one (with one in hand): the gun goes away (the left button
does nothing) and aiming down sights ends. Then hold the right button and an arc shows the whole flight to the point
under the cursor (the ground, a block's top or side, the ramp): dots along the path, a bigger dot at each bounce,
and where it goes off a small ring with the blast's reach round it on the floor (smaller for a burst in the air, as
damage is measured to the feet; none if it goes off higher than the blast radius). Let go and it throws, and it is
back to the gun (the sandbox's pick); G or F again, a gun key, getting on the Hornet or the page losing focus puts a
readied grenade away and drops a throw being aimed. The throw needs a fresh press of the right button after G or F.
The grenade
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

The explosion is the owner's own sprite sheet (`art/explosion-sheet.png`: 4 x 4 frames drawn on flat chroma blue),
played as one flat picture: the star flash, the white-hot fireball, the cooling cloud, the wisps, in reading order
and in even steps (no blending between frames), over 1 s (the last three frames are empty, so it shows for about
0.8 s of that). The picture is 8 m wide at the burst (the fireball at its widest is about 0.7 of that). It stands
upright, turned toward the camera, and is stretched up by 1 / cos of the camera's height angle over it (at most 4
times). From a far camera (Original) it then keeps the sheet's shape and size on screen; from a close, steep camera
(Indie, Tactical) its upper part is nearer the camera than its base, so it shows about 11 % taller and 17 % wider
than a picture facing the camera would (the price of never being cut by a wall behind; the width slider sets the
size). Its ground line, measured on the sheet (0.867 of a frame from the
top), sits on the burst point. It is drawn 2 m nearer the camera along the line to it, and shrunk to keep its size
on screen, so the floor under the burst does not cut it; standing upright in front of the burst, it never reaches a
wall behind it, while a block between the camera and the burst still covers it (a wall nearer the camera than the
pull no longer does). The floor cuts the strip under the ground line only when the camera looks at the burst from
lower than about 17 degrees (a wide lens with the view tipped flat, a burst near the top of the screen). Eight can
play at once. It draws over the ground lines and under the aim aids (the sight line, the throw preview) and the
dummies' bars, which stay readable over it. The owner waived the Art texts' no-red rule for explosives. Small dark
fragments still fly out, as LOOK_V2 asks for grenades; a switch turns them off. The earlier plain look (a flash in
the sun colour and a ring on the floor) is kept as a choice. The play time, the width and the pull toward the camera
are sliders; nothing here decides the game's look. The sheet is 1024 x 572 (256 x 143 a frame), so it looks soft
beside the ink lines when drawn this big. A full-size sheet of the same layout drops in: replace the file and run
`npm run key-sheet` (the grid is read as 4 x 4, the frame size from the picture, and the anchor is measured again:
check the numbers it prints).

The blue is keyed out once, at build time, by `tools/key-sheet.mjs` (Node only), not in the browser: each pixel is
read as a mix of a drawn colour and the blue measured on the flat background (0.5, 10.7, 252.7), given the least
cover that explains it, and the drawn colour is taken out of the mix. Cover below 0.2 is clear (the flat background
stays below about 0.03; the faint halo a few pixels round the strokes reaches about 0.2). The page multiplies the
cover into the colours as it loads the picture, so smoothing never pulls a clear pixel's colour into an edge. It
writes `src/assets/explosion-keyed.png` and what it measured beside it (`explosion-keyed.json`, also in the Export).

Aim down sights (the old game's rules): hold the right button or Q (or switch to click-to-toggle). In Firefox,
Shift + right click always opens the browser's own menu, which no page can stop; since Shift sprints, use Q to aim
there, and stop sprinting to throw a grenade (the menu drops the throw). While aiming
the soldier walks at 0.55 of his speed and cannot sprint, each gun's spread rests at its sights value, the
screen dead zone shrinks to 0.45, and a sight line runs from the gun to where the shot would stop: a dummy, a block,
the ground or the gun's range (the old game's line, as described, ran from the muzzle to the aim point; ending it
where the shot stops, and its look, are the sandbox's own: the faction's Top colour, the sun colour on a dummy, a
dot where it stops, and a thin upright mark from the floor beneath it whenever its end is above that floor). It is
the shot's own cast, so the line and the shot agree; a switch turns it off. The camera reacts in one of three ways: Flatten (the view tips toward the
cursor, no flatter than 28.5°), Slide (the camera slides toward the cursor, keeping the soldier on screen; the
old Foxhole style) or Still. Two differences from the old game: Flatten tips toward the point the cursor marks in
the resting view, so the view settles instead of creeping on while the cursor is still; and it never tips so far
that the soldier's own feet leave the screen (the old game's 28.5° floor suited its own Iso+ camera). The camera profiles carry
the reaction and the Slide reach (scaled like the look-ahead).

The Hornet (the owner's description; no Art text or old number covers it, so every number is the sandbox's pick,
not a decision): an early Empire vehicle on one wheel with a gun above it, waiting near the start at (6, 1). Walk
up to it (a hint shows within 2 m, with no wall between) and press E to ride it; E again gets off, onto a free spot
beside it with no wall between (not while it is in the air), keeping his stamina. Pressed away from it, E does
nothing. It is not solid while it stands (the soldier walks through it). Riding: W drives forward, S brakes and then backs up, A and D
turn it on the spot or on the move (12 m/s top speed, 7 m/s² to get there, 14 m/s² braking, 4 m/s backwards, 140°
a second). It drives on the soldiers' own ground rules with its own body (0.45 m radius, so it fits the 1.0 m
doorway; 0.3 m step-up, so it rolls up a low step, the stair and the ramp but not the 0.55 m step; the rider on
its footplates stands 2.05 m, just under the 2.1 m lintel), in sub-steps no longer than half its radius, so no
speed carries it through a wall; pressed against a wall it loses the speed it cannot use at a steady rate (the same
drag at either step rate). It pushes the dummies softly, as the soldiers do (at speed it passes close by them), and
is not pushed. The lean is in the picture only:
the body pitches forward as it speeds up (12° at full throttle) and back as it brakes or starts backwards (22° at
full braking); a spring rights it (recovery 7/s, settling 0.35), so it swings past the lean (as if it will fall)
and settles. Nothing the Hornet does reads the lean: where it goes and where its shots land are the same with any
lean setting (checked with a simulation run while building it, at 30 and 60 steps, every lean slider at its
lowest and at its highest). The gun turns to the cursor and fires level from 1.25 m. A tap of the
left button fires 8 pellets (12 damage each, 22 m, spread ±8° without charge); holding it charges (1 s), and the
pellets close in as it charges; let go at full charge and it fires one slug as a short purple beam (120 damage,
40 m, spread at full charge 0). A full-charge shot tips the body away from the shot (35°, the tip is in the
picture only; aimed behind, it tips forward), slides the Hornet 6 cm away from the shot (the same 6 cm at either
step rate; a wall stops it) and brakes it a little (3 m/s off its speed; it never adds speed); then comes a weak
moment (0.9 s): it cannot fire and turns at 0.3 of its rate. 0.45 s between shots. A button held through the gap or
the weak moment starts charging as soon as the gun is ready; a let-go before then does nothing, and a quick
re-press never fires inside the gap or the weak moment. Pellets against infantry and the beam against
vehicles is an idea, not settled: the two damages are separate sliders. Getting on or off, or the page losing
focus, drops a charge, and a button still held then does not charge until it has been let go. While riding, the soldier's own gun, grenades and aiming down sights wait; the size readout
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
raise the wall above the reach to stop that. A level shot (at 1.36 m) flies over the 1.0 m cover and the 0.9 m sill;
aimed at the point under the cursor, a shot at something behind them passes over or hits them along its line. The stair is walked on a slope through the middle
of each tread (his body is wider than a tread, so stepping each one would lurch), with the steps drawn over it: his
feet are at most half a rise above or below a drawn tread. On any slope he is brought onto the block at its head
by walking up (not by an early step-up, and its face is no wall to him), a slope rising faster than he can step
holds him back along itself, and running down an ordinary stair he stays on it at either step rate.

What is in it: a test yard with steps, a cover wall, ledges and a ramp; your soldier; eleven dummies walking loops
in the other two factions' colours, which push softly and never block (and two more for the vision rule, below);
the SMG and the rifle, firing at the dummies (tracers, a muzzle flash, a hit marker on a hit, health bars; a dropped
dummy stands again after 4 s).

## The vision rule

The owner's rule (26 November), to see and tune before the game builds it; nothing here is decided for the game.
You see a dummy only while some part of its body is inside your vision cone with a clear line from your soldier's
eyes; otherwise it is not drawn at all, also in the open behind your back. It appears and disappears at once.

- The cone starts at the eyes (1.65 m above the feet, a slider; on the Hornet above its footplates) and points where
  the soldier faces. It is 190° wide to start (40 to 360) and has no reach limit; it is a direction on the ground
  only, with no limit up or down.
- Sight is 3D: a straight line from the eyes to nine points of the dummy's body (five up its middle, two each side
  at chest and hip height); it is seen if any of them is inside the cone with nothing solid on the line. So a thing
  lower than your eyes is seen over: a standing dummy's head shows over the 1.5 m cover wall, the Hornet and the
  1.4 m hedge, while what stands right behind them is hidden from the feet up (the closer and higher the cover,
  the deeper that hidden ground). A thing higher than your eyes hides everything behind it. From higher up you see
  over more; a dummy at a ledge's edge is seen from below, and hidden once it steps back.
- What blocks sight: every block of the yard and the metrics room (walls, ledges, steps, posts, the ramp under its
  slope, the pieces over the door and window), the two hedges, the smoke column, and the Hornet (an upright
  cylinder 1.4 m tall) unless you ride it. Soldiers and dummies do not block. The ground, walls and buildings always
  show; only dummies are hidden.
- The white: every surface the eyes see inside the cone (the ground, and the faces of blocks turned to you) is
  lightened toward white, by the same test run per pixel, so the white and the dummies always agree. A dummy can
  show while the ground it stands on is not white: its head is in view while that ground is hidden behind cover.
- Hidden means: its body, ink line, shadow and health bar are not drawn; the cursor's aim point and the sight line
  pass it (the line does not stop on it or take its colour). Your shots still hit it, the hit marker still shows,
  and soft pushing still works. It is decided each drawn frame from the drawn positions.
- Projectiles are always drawn (tracers, grenades), and sounds are heard, whoever made them.
- Stand-ins, in a test corner past the lane (x -22 to -38, z 18 to 32): a 1.4 m hedge (you see over it), a 2.0 m
  hedge (it hides) and a smoke column (3 m across, 3.5 m tall). They block sight only: they are walked through and
  shot through. Test dummies (a switch, on at the start): a walker whose loop runs behind the 3.07 m ledge and
  steps out between the ledges, and a shooter at its post behind the 2.0 m hedge. The shooter (its own switch, off
  at the start) fires a burst of three at your chest every 2.5 s when no block stands between them; its shots pass
  hedges and smoke, stop at blocks, do no damage, and their tracers are drawn whether it is seen or not.
- The panel: the rule on or off, the cone's width, the eyes' height, how white the cone is, outlines of hidden
  dummies (for explaining only, off at the start), the test dummies and the shooter.

The dummies' sounds (the owner's ask): each walking dummy's footstep (one per metre walked, a soft thud) and the
shooter's shots (a click like yours) are heard from your soldier, hidden dummies as well. Their volume follows the
distance as Unreal's attenuation settings do: full inside the inner radius (3 m), nothing beyond the outer radius
(40 m), and between them a linear, logarithmic or inverse falloff; a sound to the left of your soldier on screen comes
from the left speaker (a switch). A volume of 1 is as loud as your own shot's click. All of it is in the panel and
the Export; your own clicks are counted apart.

## The panel

- The camera starts on the Original profile (above). Most other sliders start at the old game's number. A few
  are the sandbox's own picks, because the old game has no number for them: the body radius (from the Art
  brief's soldier), push strength and push radius, the sprint-to-fire delays (0.15 s SMG, 0.25 s rifle, 0.3 s
  shotgun), the active-reload window (40 % to 60 %), the shotgun's falloff (none), the press rule below
  (0.15 s, no slider), the grenade refill (5 s), the grenade's rolling slowdown (3 per second, no slider), where a
  throw starts (the soldier's middle at 1.5 m, no slider) and how an aimed throw picks its angle (raised in step
  with a higher target's elevation; lobs up to 80° when the plain arc is blocked; no slider). Every slider has its own reset (↺, lit when the value has moved);
  hover a name to see where its start value comes from. The Export names the camera profile in use.
- **Export** copies every value as JSON with the date and time, the build it came from (step and commit), units in
  the names and the old game's own names beside them, and lists every value that differs from its start value. The
  JSON also appears in a box, in case the browser blocks copying. **Import** loads a saved Export back (see below).
- Values are kept in the browser between visits. **Reset all** puts everything back to the start values.
- Steps per second: 30 (the game's rate) or 60. The picture is smoothed between steps. The jump follows its exact
  arc at each step, so its height is the same at either rate. At 60 a warning line shows under the buttons and in
  the Export.

## Handing values to the game

- The Export is the only route from this sandbox to the game: the game's builder takes its starting values from
  it (the owner's decision of 19 November). Values flow one way, from here to the game, never back.
- No code is copied either way, between this repository and the game's (or Shamble VFX).
- Nothing here is a decision until the owner says so in the game's builder chat.
- What the Export holds for that: its format name and version (`"format": "testlines-export"`,
  `"format_version": 1`); the build's step (`build`) and the commit it was built from (`build_commit`: the last
  commit that changed anything but the built page, with `-dirty` if the page was built from uncommitted files; the
  page itself is committed after it, in a commit that changes only the page); `changed_from_start`, every value
  that differs from its start value, by its group and name as in `values`, with both values; and `warnings`, which
  holds a line when the step rate is not 30, the game's rate. Everything else is as before. Values are written with
  3 decimals (or the slider's own digits, if more): a value typed into a field with more decimals than that is
  handed over, and backed up, rounded.
- **Import** makes a saved Export a real backup: it loads every value from the file into the panel, after asking.
  A file of another format name or version, with a value a slider cannot take, or with none of this page's values
  is refused, and nothing changes; names this page does not know are passed over, and values missing from the file
  stay as they are (the question says how many of each). A value whose rounded form matches its start value comes
  back exactly as the start value. Exports made before step E have no format name, so Import refuses them. Any file
  name will do: an Export pasted into a text file is judged by what it holds.
- Your tuned values live in your browser, under one fixed name (`shamble-testlines.values.v2`); a new build of this
  page, opened from the same place, keeps them. Only **Reset all** and **Import** replace them all at once, and
  both ask first (the sliders, the resets, the camera profiles and the gun keys change single values or the camera
  as you use them). To carry them to a copy of the page somewhere else (some browsers keep a page's values per
  file), Export in one and Import in the other.

## How the guns differ from the old game

- Shots aim at the point under the cursor (the Soldier group's "Shots aim at", as the old game): the first dummy,
  block, ramp or ground the cursor's ray meets. Each shot flies from the gun at 1.36 m toward that point in a
  straight line, and stops at the first body, block, ramp or ground on its way, or at the gun's range. So a dummy on
  a ledge can be shot from below; a shot at open ground ends on it at the cursor; and from below, the middle of a
  high ledge's top is out of the gun's sight (it sits lower than the camera), so the shot meets the face where its
  line crosses it, as the sight line shows. The soldier faces the point too (within 0.3 m of him, where no
  direction can be read, he and the shot keep the facing he had). Switched to "Level, at gun height", every shot flies level at 1.36 m as
  before, and a level shot still counts within 0.6 m above a dummy's head or below its feet (so the 0.55 m step and
  the foot of the ramp work). How aiming at height works is open in the game (LOOP_V2 section 9): a sandbox option,
  not a decision. The Hornet's gun stays level.
- The sight line ends where the shot would stop (a dummy, a block, the ground or the gun's range), so it shows
  what the shot meets on its way; the old game's line, as described, ran from the muzzle to the aim point.
- Spread scatters shots sideways only (the old game scattered them up and down as well).
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
measuring grid (on at the start) replaces the yard's colours with blockout colours while it is on. The grenade's
explosion is the owner's own sprite sheet (see the grenade above), not from the Art texts.

## Build it

Needs Node 20.19 or newer.

```
npm install
npm run dev      # live page at the address Vite prints
npm run build    # type check, then writes play/testlines.html
npm run key-sheet  # keys art/explosion-sheet.png into src/assets/ (only when the sheet changes)
```

`npm run check` opens `play/testlines.html` from disk in Chromium and in Firefox and plays a short script (walk,
sprint, jump, ledges, steps, panel, Export). It needs the browsers' paths in `CHROMIUM_PATH` and `FIREFOX_PATH`,
and Firefox needs a display (on Linux: `xvfb-run -a npm run check`).

## Where things are

- `src/params.ts`: the one table of every tuned value (the panel, the resets, the saved values and the Export
  all come from it). `src/panel.ts`, `src/exporter.ts`: the panel and the Export.
- `src/main.ts`: the fixed-step loop (30 or 60 per second) and the smoothing between steps.
- `src/movement.ts`: the movement. `src/yard.ts`: the test blocks and collision. `src/metrics.ts`: the metrics room.
- `src/dummies.ts`: the dummies' loops (and the vision rule's two test dummies). `src/push.ts`: soft pushing.
- `src/sight.ts`: the vision rule's sight test (and the cone it hands to the grid shader in `src/look.ts`).
  `src/standins.ts`: the hedges and the smoke column.
- `src/weapons.ts`: the guns, the hitscan, the reload and the active reload. `src/fx.ts`: shot feedback.
- `src/grenade.ts`: the grenade's flight, preview and blast. `src/nadefx.ts`: its look. `src/explosion.ts`: the
  explosion sheet's playback; `tools/key-sheet.mjs` keys `art/explosion-sheet.png` into `src/assets/`.
  `src/audio.ts`: the click, and the dummies' sounds with their falloff. `src/hud.ts`: the readout, stamina, ammo and reload bar.
- `src/hornet.ts`: the Hornet's driving, lean and gun. `src/hornetModel.ts`: its blockout. `src/spring.ts`: the
  exact spring (the Hornet's lean, the grenade's camera kick).
- `src/camera.ts`: the follow camera. `src/input.ts`: keys and mouse.
- `src/soldier.ts`, `src/guns.ts`, `src/look.ts`, `src/geom.ts`: the stand-in look (and the measuring grid, in
  `src/look.ts`).

No code here comes from the game's repository or from Shamble VFX; numbers and described behaviour only.
