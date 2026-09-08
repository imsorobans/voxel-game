# Voxel Survival Engine

A browser-based 3D voxel survival game built with vanilla ES Modules, Three.js,
and simplex-noise. No build step, no bundler — just static files.

## Running it

Browsers block ES-module `import` statements over `file://`, so you need a
tiny local static server (any of these work):

```bash
# Option A — Python (built into most systems)
python3 -m http.server 8080

# Option B — Node
npx serve .

# Option C — VS Code
# Install the "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8080` (or whatever port your tool prints) in a
modern desktop browser (Chrome, Edge, or Firefox — Pointer Lock and WebGL2
required).

## Controls

| Input          | Action                          |
|----------------|----------------------------------|
| `W A S D`      | Move                             |
| `Mouse`        | Look around (after clicking to lock the pointer) |
| `Space`        | Jump                              |
| `Shift`        | Sprint                           |
| `Left Click`   | Mine a block / attack a zombie   |
| `Right Click`  | Place the selected hotbar block  |
| `1`–`9`        | Select hotbar slot               |
| `P`            | Manually save the game           |

The game also auto-saves every 15 seconds and on page unload, into
`localStorage`. Reloading the page after a save restores your terrain edits,
health, hunger, position, inventory, and day/night progress.

## Architecture

```
index.html                    Canvas, pointer-lock overlay, SVG HUD, death/victory screens
style.css                     Dark arcade theme, pixel HUD, hit-flash/shake animations
src/
  config.js                   Block IDs, player/mob stats, physics constants
  World/
    TerrainGenerator.js       Simplex-noise heightmap, bedrock, tree scattering
    World.js                  Voxel storage, face-culled mesh building, voxel raycast,
                               block break/place, item-drop physics & pickup
  Entities/
    Player.js                 First-person AABB physics, health/hunger, fall damage,
                               step-up collision, attack raycast
    Mob.js                    Zombie: voxel limb mesh, IDLE→PURSUE→ATTACK state machine,
                               obstacle hopping, flinch/knockback, walk animation
  UI/
    HUD.js                    Hearts, hunger bar, hotbar highlight, floating combat/pickup
                               text, damage flash, death/victory screen toggles
  Storage/
    SaveSystem.js             LocalStorage serialization of terrain diffs, player state,
                               inventory, and day/night progress
  main.js                     Renderer/scene/lighting setup, input handling, day/night
                               cycle, mob spawn manager, combat resolution, game loop
```

## Gameplay notes

- Survive **3 full day/night cycles** to trigger the victory screen.
- Zombies only spawn at night, at a random ring 14–26 blocks from the player,
  up to 8 active at once.
- Falling more than 4 blocks (or starving) damages you; getting hit flashes
  the screen red and briefly shakes the camera.
- Mined blocks pop out as small spinning/bobbing item drops that fly toward
  you-adjacent pickup range and add to your inventory, which backs the hotbar.
