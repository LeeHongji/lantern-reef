# Lantern Reef — project guide

A real-time procedural sea in one self-contained `index.html`: a sunken atoll you can swim through and surface
from, and beside it an island with a harbor town, painted in the colours of a Studio Ghibli background. WebGPU
and Web Audio only. No libraries, no textures, no models, no sound files.

This file holds what was learned from studying a stronger reference project, the brief this project is now
built against, and the rules for working on it. Read it before changing anything.

## Hard rules

- **English only.** No other language in source, comments, UI text, docs or commit messages.
- **One deliverable:** `index.html`, built from `src/` by `node build.mjs`. No runtime dependencies, no CDN,
  no fetch of any asset. The build has no npm dependencies either.
- **Everything procedural.** Geometry, textures, animation and sound are computed. Nothing is loaded.
- **No per-frame allocation.** Frame state lives in preallocated typed arrays; render-pass descriptors and
  bind groups are built once (or on resize) and reused.
- **Never ship `window` debug hooks in `index.html`.** They live in `src/60-dev.js` and only `dev.html` has them.
- Edit `src/`, then rebuild. Never hand-edit `index.html`.

## The reference and what it taught

Reference: *Abyssal Garden* by Maksymilian Dendura (MIT), studied from its readable `source/` folder on
2026-11-18. It reaches a far higher density of detail than this project's first version. The reasons are
structural, not a matter of tuning.

### Why version 1 fell short

Version 1 ray-marched a height field plus a handful of analytic SDF props in a full-screen pass. That design
caps detail hard: every pixel pays for every feature, so the world stayed a sand plain with five landmarks.
It had no rock relief, no ground cover, no shadow map, no skylight occlusion and no anti-aliasing, and its
kelp was about 700 stems with flat-shaded blades. Measured cost was also poor: it could not hold 60 fps at
2560x1440 on an Apple GPU, and needed 50-75% render scale.

### Lessons, in order of impact

1. **Build the world once, then rasterize it.** A GPU compute pass fills a voxel density field
   (0.75 m cells); the CPU turns it into a mesh with surface nets. Overhangs, arches, tunnels and caves come
   for free, and per-frame cost no longer depends on world complexity. Density must be positive inside rock.
   Rock that is not connected to the seabed is flood-filled away, or surface nets turns noise specks into
   floating boxes.
2. **Author the layout with a few primitives, let noise do the rest.** The reference describes its whole
   canyon system with four lists: mesas (capsule footprint, radius, top height, overhang, waist), ring arches,
   carved tunnels and clearings. Domain warping, two Worley layers, fbm and a strata term turn those clean
   shapes into rock. Layout stays editable; nothing is hand-sculpted.
3. **Dress every surface.** The richness is instance count: about two million leaf instances, 60k rock
   chunks, 170k pebbles, thousands of sponges and corals, all placed by sampling random terrain vertices and
   filtering on normal, height, zone masks and distance from the camera path. One 36-byte leaf instance
   (base, length, yaw, tilt, width, height-on-stem, type, two seeds, bend) drives a strip whose curl, twist,
   ruffle, flutter and sway are all computed in the vertex shader. Eight leaf types share one pipeline.
4. **Light with baked data, not rays.** One static 4096 shadow map from the sun covers the world. A
   half-resolution 3D texture stores openness (from density) and skylight (light propagated downward with a
   small blur, absorbed by rock and by kelp columns). Ambient occlusion, sky ambient, side light and mist all
   read that texture. This is what makes canyon floors dark and kelp interiors moody.
5. **Give materials real texture.** A 1024 tileable detail texture (slope in rg, height in b, mottling in a)
   is baked once with mips and sampled triplanar at four scales. Rock albedo comes from bedding layers keyed
   on height, encrustation, algae on up-facing parts and sand on flats. Version 1 used smooth noise blobs.
6. **Water as a texture.** A 512 texture re-rendered every frame holds the caustic pattern (r) and summed
   wave slopes (ba), with mips. Caustics, the surface normal and the god-ray pattern all sample it, so they
   agree with each other and cost one fetch each.
7. **Fog is physics, in closed form.** In-scatter along a ray is integrated analytically for ambient light
   that falls off with depth: `I = (1 - exp(-a d)) / a` with `a = sigma - k * rd.y`. Absorption is per
   channel, so distance shifts everything from cyan to deep blue. Beyond 150 m everything meets the same haze,
   which hides the draw distance.
8. **God rays read the shadow map.** Half-resolution march of 34 steps, shadow-tested per step, modulated by
   the water texture and by openness (mist), then a depth-aware blur and a depth-aware upsample. Version 1's
   shafts ignored occluders entirely.
9. **Finish the image.** 4x MSAA into an HDR target, reverse-Z depth, a six-level bloom with Karis-weighted
   first downsample, ACES-style curve, a contrast S-curve on luminance only, and two-sample dither.
10. **Cull and LOD in cells.** Instances are sorted into a 16x16 XZ grid. Each frame merges visible cells
    into runs, nearest rows first. Leaves use 9, 5 or 3 rows by distance, and a decimated wider set far away.
    Leaf width fades to zero at the draw distance instead of popping.
11. **Tune to the frame, persistently.** Pixels drop first, then draw distance, then the remaining pixels;
    the way back up is the same path. With GPU timestamps the load is held in a band; without them it probes
    upward with a doubling back-off. The result is stored and reused on the next visit. A crashed load starts
    one detail level lower.
12. **Collision from the same field.** A compact signed-distance copy of the density near surfaces gives a
    sliding camera with sub-stepping, so tunnels and arches are passable and walls are solid.
13. **Sound is a fixed graph.** Built once, driven by a 10 Hz timer rather than the frame loop. A seamless
    brown-noise loop played at two rates gives rumble, wash and a rush that follows camera speed. Voices are
    pooled oscillators with envelope, pan and a reverb send. A limiter protects the output. Chimes in a
    pentatonic scale give the scene a mood, not just noise.
14. **Verify with eyes that have not seen the code.** The reference brief demands a visual critic that sees
    only renders, plus a scripted fly-through benchmark reporting average, 99th percentile and worst frame.
    The world generator keeps the fly path and the viewpoints clear of clutter and dresses the scene around
    them, so every preset view is composed.

### Techniques adopted directly

Surface nets, the mesh builder (box sweep, tube, lathe), the leaf vertex model, the analytic fog integral and
the shadow/skylight bakes follow the reference's approach. Generic helpers in `src/10-math.js` are ported from
it under its MIT license (notice kept in that file). World layout, set pieces, the above-water world, the
extra creatures and the audio layers are this project's own.

## The brief (what "done" means)

Build a real-time ocean that is beautiful from the seabed to above the waves, flown with a free camera.

**Priorities when they conflict:** visual quality, then stable frame pacing, then bundle size.

**Target:** 60 fps on a current desktop GPU at up to 2560x1440. On this machine (Apple GPU, 120 Hz, DPR 2)
the scene must hold 60 fps by scaling pixels and draw distance on its own.

**Below the surface**
- Sculpted rock: canyons, overhangs, arches, tunnels, a deep rift, an atoll ring that breaks the surface
- Dense swaying kelp with gold and green glints; ribbon grasses, hanging fronds, magenta ground cover
- Barrel and tube sponges, branching coral, sea fans, starfish, urchins, pebbles, floating boulders
- A purple grotto with glowing crystal clusters and a skylight
- Set pieces: a wrecked galleon held between rock walls, a stone whale-fluke monolith, a drowned colonnade
- Life: fish schools in several liveries, manta rays, jellyfish that glow in the rift, sea turtles, one
  humpback passing in the distance; bubbles from vents; drifting particles
- Light: shadowed god rays, caustics that soften with depth, Snell's window, depth-dependent colour

**Above the surface**
- A real sky: sun, drifting cloud, horizon haze
- Open water with Fresnel reflection, sun glitter, foam where rock meets the sea, and the reef visible
  through the shallows
- Emergent crags and sea stacks, a lighthouse on its islet, an anchored ketch whose hull and chain are
  visible from below, a dinghy on a mooring buoy, gulls, sails out at sea
- Crossing the surface changes the light, the fog and the sound

**The island (added 2026-11-20)**
- Port Amaro: about 145 houses in six variants on streets that ring the bay and step up the hill; a clock
  tower whose hands move, a church, a market square with stalls and a fountain, street lamps, washing lines,
  chimney smoke, garden walls
- A harbor: curved stone quay with a flight of steps to the water, two breakwaters with harbor lights,
  timber jetties, moored fishing boats in every colour
- Country: a forested hill with one great tree on its summit, a windmill whose sails turn, farmland in
  hedged patches with farmhouses, cypress-lined tracks, a beach, cliffs on the north shore
- The look: see "The painted look" below

**Sound, synthesized live**
- Below: rumble, wash, speed rush, a slow drone, bubbles near vents, chimes in the grotto, whale song
  panned toward the whale
- Above: wind, lapping water, gulls, a buoy bell, rigging creak; a splash on crossing
- On the island: cicadas, halyards tapping in the harbor, the windmill working, the clock tower's bell

**Controls:** mouse look with pointer lock, WASD, Q/E down/up, Shift faster, 1-9 and 0 viewpoints (1 Monolith
Basin, 2 Kelp Cathedral, 3 Wreck Gorge, 4 Arch Row, 5 Amethyst Grotto, 6 The Rift, 7 The Anchorage, 8 Lantern
Rock, 9 Port Amaro, 0 The Overlook), M mute, H stats, Esc menu. The camera may roam a capsule that joins the
atoll to the island, up to 150 m; on the island it stays 1.5 m above the ground.

**Verification gates**
1. No WGSL or validation errors; no console errors.
2. The preset renders reviewed by a critic that sees only the images. Iterate until nothing above "minor".
3. Scripted fly-through: report average, 99th percentile and worst frame time, and GPU time when available.

## World design

Units are metres, y up, sea level y = 0. The voxel grid spans x,z in [-180, 180] and y in [-58, 20].

| Zone | Where | What it is |
|---|---|---|
| Monolith Basin | centre | the stone fluke in a kelp clearing; the ketch floats overhead on its chain |
| Kelp Cathedral | south | the tallest, densest kelp over a wide basin |
| Wreck Gorge | east | the galleon propped against a rock wall, open and sunlit on its south side |
| Arch Row | south-west | three rock arches in line, the colonnade at their far end |
| Amethyst Grotto | north | roofed cave, purple water, crystal clusters, skylight shaft |
| The Rift | west | narrow canyon to -56 m, dark, jellyfish and glow plankton |
| Lantern Rock | north-east rim | islet with the lighthouse, sea stacks, dinghy and buoy |
| Atoll ring | radius 150-170 | the boundary: cliffs above water, reef wall below |
| Port Amaro | island, centre (335, 335), radius 175 | bay at (211, 211) facing the atoll; town behind it, hill behind the town |

The island lies outside the voxel grid and is a height field (`src/17-land.js`). The bay, the lighthouse and
the atoll's centre lie on one diagonal, so each is in view from the others. The town is a theatre: streets
are level arcs round the bay centre (`RINGS`), stair lanes climb through them (`LANES`), and a house row
stands on each side of every street.

## The painted look

Researched 2026-11-20 (sources at the end). No source gives colours sampled from the films, so the palette
is a working estimate, written in sRGB hex in the shaders and converted when they are built.

- **Shade is coloured.** Light is warm, shade is blue-violet and stays saturated. Above water the ambient
  term is sky blue from above and a warm bounce from below; nothing is lit grey.
- **Foliage is massed.** A tree is a handful of lumpy volumes whose normals are pulled toward the direction
  from the middle of the crown, lit in three flat tones with soft joins: yellow-green light, mid green,
  blue-green shade. Crowns come down to head height so trunks do not read as poles.
- **Clouds have a level base and a heaped crown.** A bank of cumulus stands on the horizon, built from azimuth
  and elevation so it never comes closer; overhead only a few firm-edged puffs. A sparse sky reads as painted.
- **Hard edges on buildings, soft edges on plants.** Houses are boxes with real window, shutter, sill and
  flower-box geometry tagged per part; colour comes from a small palette picked per house.
- **Roofs are a family, not one colour.** Terracotta in several values plus a few red-brown and slate, each
  roof faded by its own amount.
- **The sea grades from turquoise shallows to deep blue**, with sparkle only near the eye.
- **The sun stands in the south, a little west**, so the town's sea front is lit and its side walls are in shade.

Real-world anchors used for proportions and behaviour:
- Snell's window is a cone of about 97 degrees (critical angle 48.6); outside it the surface mirrors the dim
  water below.
- Water absorbs red within the first few metres; blue-green carries furthest. Caustics are sharp in the
  shallows and wash out with depth.
- Giant kelp (*Macrocystis*) grows 30-50 m, in bundles of stipes from one holdfast, one float at the base of
  each blade, and spreads into a canopy at the surface.
- Humpback song units last about 0.1-5 s, grouped into phrases of 5-30 s, with most energy between a few
  hundred hertz and 1 kHz. The fluke has a notch and a ragged trailing edge.
- A bubble rings at roughly `3.26 / radius` Hz (radius in metres): 1 mm is about 3.3 kHz, 1 cm about 330 Hz.

## Architecture

```
src/00-quality.js   detail level, persisted settings
src/10-math.js      rng, noise, quaternions, surface nets, mesh builder (ported helpers, MIT notice inside)
src/15-world.js     layout primitives, zones, viewpoints, placement of everything (before the WGSL: shaders read its constants)
src/16-meshes.js    procedural meshes: rocks, sponges, coral, ruins, ships, lighthouse, animals
src/17-land.js      the island: height field, town layout, houses, landmarks, trees, harbor, land map
src/20-wgsl-bake.js noise, density field, detail texture, water texture, blit/bloom
src/21-wgsl-scene.js shared scene code, solids, leaves, animals, sky and sea surface, sprites
src/22-wgsl-post.js light shafts, blur, composite
src/40-main.js      device, resources, bakes, render loop, camera, collision, input, menu
src/50-audio.js     the soundscape
src/60-dev.js       fly-through, benchmark and test hooks (dev.html only)
src/90-start.js     first frame, then the menu over the live scene
template.html       page, menu and styles
build.mjs           concatenates src into index.html (and dev.html with --dev); prints sizes
.test/              headless Chrome scripts: renders, pacing, input
```

Frame: water texture and mips, scene (MSAA HDR, reverse-Z), light shafts at half resolution, shaft blur,
bloom chain, composite.

The island reuses the solid pipeline with materials 14-19 and its own data: a second baked shadow map
(a point north or east of the voxel grid uses it), a 1024 land map (paving, crops, surf, height) read by the
ground and by the sea surface, and a 9x9 culling grid that `drawCells` switches to. Trees have three levels of
detail whose distances shrink with the draw-distance scale.

## Working on it

```bash
node build.mjs          # index.html
node build.mjs --dev    # dev.html with fly-through (F), benchmark (B) and window.__reef hooks
```

- `.test/shot.mjs` renders the ten viewpoints, `.test/gpu.mjs` times each of them, `.test/cam.mjs` any camera, `.test/fly.mjs` runs the 60 s
  benchmark, `.test/input.mjs` drives the real controls and the audio graph. All load `dev.html` in headless
  Chrome with the real GPU. Close the in-app browser pane before timing anything: it competes for the GPU.
- `?lv=0|1|2` in the URL forces a detail level without touching the stored one.
- World layout lives in the lists at the top of `src/15-world.js`. That file is concatenated before the WGSL
  because shaders read its constants.

### Pitfalls already paid for

- WGSL: `patch`, `mod`, `filter`, `target`, `ref`, `pass`, `smooth`, `common` are reserved words; `pow` of a
  negative base is NaN; swizzles cannot be assigned; use the local `ss()` instead of `smoothstep`.
- WGSL: `textureSample` (and `fwidth`) must come before any branch on a varying. Every fragment shader here
  takes its derivative-based samples at the top; anything later uses `textureSampleLevel`.
- A pattern channel is not a 0-1 mask. The caustic value peaks near 3.5; fed straight into a foam threshold it
  covered the whole sea in flecks arranged in visible rows. Clamp it, and gate foam by distance to rock.
- Tiled wave layers show as rows toward the horizon. Rotate each layer by a different angle, warp the main one
  with slow noise, and fade wave detail and sun glitter out with distance.
- Rock-scale normal layers on made objects (hull, lighthouse, carved stone) read as crumpled paper. Only rock,
  sponges and coral get the two coarse layers.
- A page laid out at 0 x 0 while loading (a hidden pane) must not be tuned or persisted: the controller once
  saved a 4-pixel budget. It ignores tiny canvases, clamps what it restores, and a `ResizeObserver` recovers.
- A page whose `requestAnimationFrame` is throttled is not a slow GPU. With timestamp queries the controller
  looks only at GPU time, so throttling cannot push quality down.
- Timestamp queries in headless Chrome on Apple GPUs read about 10-12 ms even for light frames. For pacing,
  trust frame intervals at a pinned resolution.
- Flying an animal on a wide orbit sends it through rock unless the orbit is above every plateau. The whale
  swims high, close under the swell.
- A palette written as it should look in sunlight is not an albedo. Sun plus sky here adds up to about 2.6,
  so island albedos are scaled by 0.62; without that every green was neon and every roof traffic orange.
- Caustics are tuned for 40 m of water. In a metre of water their dark cells read as spots on the sand and a
  breakwater's shadow reads as a seam in the sea: over the island's shelf both are compressed.
- Two ways of colouring open water (the background pass, and the surface where it is opaque) must be the same
  formula, or the border between them shows as rings and wedges in the sea.
- A shadow map sampled outside its bounds returns edge texels. Treat out-of-range as lit.
- Blending a flat zone (town, farmland) into a hill over a short distance makes a cliff. Either blend over
  40 m or more, or only flatten where the ground is already low.
- A foam band defined by a distance field has contour lines parallel to the shore. Break it with noise and
  keep it narrow, or it reads as a ribbon.
- When the sun is behind the facades the whole town is flat. Choose the sun for the subject.

## Status (2026-11-20)

- Builds: `index.html` 229 kB (74 kB gzipped), `dev.html` 285 kB. No WGSL, validation or console errors at
  High, Medium or Low. Load time in headless Chrome on this machine: 6-12 s.
- Content at Medium (the default on Apple GPUs): 1.75 M reef triangles, 1.07 M leaves, 65 k rock chunks,
  22 k sponges, corals, starfish and urchins, 4,680 fish; the island adds 248 k ground triangles and about
  3,300 placed things (146 houses, about 2,300 trees, 310 bushes, 485 shore rocks, boats, lamps).
- Input test passes on Low: dive, swim, surface and submerge, seabed collision, all ten viewpoints, standing
  on the island's ground, resting on the harbor floor, stats, mute, menu. The audio graph runs without errors;
  nobody has listened to it.
- Per-viewpoint GPU time (Medium, 960x540, draw distance 80%, headless, measured before the last visual fixes): the two island views 9.6-10.4 ms,
  Lantern Rock 10.1, grotto and rift 11, wreck 12, kelp views and The Anchorage 16-20. The island is the
  cheapest thing in the scene; the kelp is the dearest.
- Fly-through (Medium, headless, 60 s, now also over the island): at 1280x720 frame avg 18.8-20.8 ms, p99
  33-50 ms across four runs; with draw distance 60% avg 17.0-18.7 ms. That is 1-3 ms slower than the
  2026-11-18 figures (17.96 and 16.70). Swapping the new shadow and volume lookups back made no measurable
  difference, so the cause is not established: it may be the longer path or the state of the machine.
- Visual review of the island: two passes by a critic that saw only twelve renders. Pass 1: eight blockers
  (a seam in the harbor water, spots on wet sand, chrome rocks, noisy flower boxes, sea halos, unreadable
  windmill and summit views). Pass 2, after fixes: three blockers left, all in close-up test cameras that
  are not preset viewpoints (a foam streak on the beach, a summit camera that missed the great tree, a farm
  camera that missed the farmhouses), and the far views judged to read as intended. Fixes after pass 2 (sun
  moved to light the sea front, surf narrowed, open-water colour unified, rock repainted, great tree
  enlarged) **have not been reviewed**. Gate 2 is not met.
- The underwater viewpoints were re-rendered after the sun moved and still look right to me; no critic has
  seen them since 2026-11-18.
- Not tested: any browser other than Chrome, any GPU other than this one, touch input, the fallback controller
  path without timestamp queries, long sessions, the controller on a visible display.

### Known weak spots

- Up close the island is plainly low-poly: canopies are faceted, trunks are prisms, walls are flat colour.
  It is built to be seen from the water, the air and the street, not from a metre away.
- No people, vehicles or animals on the island. Life is smoke, washing, the clock, the windmill and gulls.
- Houses, trees and boats have no collision; only the ground does.
- A faint paler disc still surrounds the atoll from high up, and the sea still sparkles more than a painted
  sea would.
- Reef rock above water is repainted warmer but is still far more detailed than the town beside it.
- Arch Row is the least composed underwater viewpoint. Crystals are faceted emitters, not refractive glass.
- The ketch has no reflection in the water.

## Credits

Rendering approach and several helper algorithms are adapted from *Abyssal Garden*
(https://github.com/Noniv/abyssal-garden), copyright (c) 2026 Maksymilian Dendura, MIT License.

Sources read for the painted look (working values and techniques, not film samples):
- https://lavaritte.com/blogs/cloud-tutorial/
- https://github.com/nicksonthc/ghibli-threejs
- https://danieljohnmorris.com/writing/ghibli-shader-parallax-scene/
- https://trungduyng.substack.com/p/tutorial-blender-anime-foliage-pipeline
