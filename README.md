# fivem_conflicttool

![fivem_conflicttool in game](docs/preview.png)

In-game map conflict scanner and resolver for FiveM. It scans every started resource for conflicting `.ymap`, `.ytyp`, `.ybn`, `.ydr`, `.ydd`, `.ytd` and `.yft` files, shows each conflict in the world, and resolves them with keep, move, remove or edit decisions. Standalone, no framework required.

## Features

- **Full server scan**: lists all started resources, reads their folders, and hashes and parses every map file. RSC7 parsing of ymap, ytyp and ybn runs on the server.
- **Conflict types**: duplicate files across resources, props removed, moved or re-modelled between versions of a ymap, double placements of the same prop, overlapping box occluders, duplicate collision files, and archetypes defined more than once across ytyp files. Duplicate files carry badges for vanilla overrides, LOD distance disagreements and stale LOD data.
- **Auto resolve**: queues the safe fixes in one click, such as identical duplicate copies and double-placed props.
- **Manual resolve**: keep, move or remove each conflict, with in-world preview of both sides.
- **Occluder tools**: shrink one box until the overlap clears, remove a single box, or merge a whole cluster into one volume. The merge checks how much empty space the result would swallow and refuses when it would hide geometry it should not.
- **In-game occluder editor**: move, rotate and resize a box occluder with the gizmo, or right click one face to extrude just that side. The wireframe follows the gizmo live and the edit is written straight into the ymap.
- **In-game collision editor**: move and rotate a collision bound with the gizmo, or move a whole `.ybn` as one, with the red mesh following the drag live. Composite bounds get move and rotate, a single bound with no composite wrapper gets move.
- **Collision surfaces**: read every material slot in a bound and set its surface from the full GTA V list, plus the sixteen collision flags such as see through, shoot through, walkable path and no navmesh.
- **Face painting**: collision faces draw in their surface colour, the same colours Sollumz uses in Blender. Tap a face to select it, hold and sweep to paint a whole area, or grab every face sharing a surface, then set the selection to any surface.
- **Face moving**: grab a face selection with the gizmo and move or rotate it. The vertex array is requantised, the bound's BVH and every bounding volume above it are rebuilt to match.
- **In-place file edits**: props that survive runtime removal are buried inside the ymap, and occluder changes rewrite only the fields that changed, so the resource keeps loading from its original file.
- **World markers**: every conflict is marked with a color-coded beam, occluder clusters get one beam per box, and selecting one in the list flies the camera to it.
- **World action menu**: right click a marker or an occluder box for the actions that apply to it, without going back to the list.
- **Filters**: narrow the list by resource, by file type, or by asset kind, so vehicle, ped and weapon packs can be hidden while working on the map.
- **In-game editing**: move and rotate objects with the native gizmo, with local or global axes, grid snap, snap to ground and numeric transform inputs.
- **Collision and occluder display**: collision triangles of conflicting `.ybn` files draw in red, box occluders in amber.
- **X-ray**: draws markers, meshes and boxes through walls and terrain.
- **Streaming weight**: per-resource map asset size ranking, with a warning for files over 16 MB that may fail to stream.
- **Undo and restore**: decisions can be undone with Ctrl+Z, and Apply copies every touched file into timestamped backup bundles that can be restored with sha1 verification.
- **Persistent decisions**: entity decisions apply at runtime for every player on spawn, and file decisions persist because the files are changed on disk.
- **Remappable keys**: every bind is a FiveM key mapping and can be changed per player.

## Install

1. Download the latest `fivem_conflicttool-vX.Y.Z.zip` from [Releases](https://github.com/kkMihai/fivem_conflicttool/releases) and unzip it into your `resources` folder. The zip ships a built UI and is ready to start.

   To use a source checkout instead, build the UI first:

   ```
   git clone https://github.com/kkMihai/fivem_conflicttool
   cd fivem_conflicttool/web
   npm install
   npm run build
   ```

2. Add to `server.cfg`:

   ```
   ensure fivem_conflicttool
   add_ace group.admin fivem_conflicttool allow
   add_unsafe_child_process_permission fivem_conflicttool
   ```

3. Restart the server. Permissions are read at boot only.

4. Join the server as an admin and run `/conflicttool`.

## Permissions

Changing files inside other resources requires a filesystem grant. Either of these works:

- `add_unsafe_child_process_permission fivem_conflicttool`, which covers every resource in one line.
- `add_filesystem_permission fivem_conflicttool write <resource>` lines. Every scan writes a ready-made list to `fivem_conflicttool/data/fs-permissions.cfg`, which can be loaded with `exec ./resources/[standalone]/fivem_conflicttool/data/fs-permissions.cfg`. Run one scan, then restart so the grants load.

Without a grant, scanning, previewing and entity decisions still work, and only the file changes are blocked. The Apply dialog reports it when that happens.

## Settings

Optional convars, set before the resource starts:

```
set fivem_conflicttool_bury_depth -99000
set fivem_conflicttool_update_check false
```

`bury_depth` forces how far under the map a buried prop drops, written with or without the minus sign. Left unset, each prop drops just past its own draw distance, which is the smallest drop that keeps it from rendering.

## Controls

| Key                     | Action                                              |
| ----------------------- | --------------------------------------------------- |
| Hold RMB                | Look around                                         |
| Tap RMB                 | Action menu, or pick an occluder face while editing |
| WASD + E/Q + Shift/Ctrl | Fly the freecam                                     |
| LMB                     | Select a marked object or drag the gizmo            |
| Tab                     | Next conflict                                       |
| K / R                   | Keep or remove the selected conflict                |
| 1 / 2 / 3               | Review, move or rotate mode                         |
| 4                       | Resize mode while editing an occluder               |
| X                       | Local or global gizmo axes                          |
| G                       | Toggle grid snap                                    |
| F                       | Snap object to ground                               |
| Enter                   | Finish transform or apply the occluder edit         |
| Ctrl+Z                  | Undo last decision                                  |
| H                       | Hide or show the UI                                 |

The UI and the world are both live: the cursor drives the interface while it is over a panel, and the camera and gizmo while it is over the world. Typing in a field pauses game keys.

Binds are remappable in FiveM Settings, under Key Bindings, FiveM. Key mappings register on first connect, so reconnect once if a key does not respond after installing or updating.

## Usage

1. Run **Scan** to index every started resource.
2. Pick a conflict from the list, or click a marked object in the world.
3. Decide with **Keep**, **Move** or **Remove**, or use **Auto** for the safe cases. Right clicking a marker offers the same actions in the world.
4. Run **Resolve** to apply the queued decisions. Fixed conflicts pulse green and their markers clear.
5. Run **Scan** again so the list matches the files on disk.

Entity decisions apply live for everyone. File changes take effect after a server restart. **Backups** lists every apply bundle with a restore button, and **Weight** ranks resources by streaming size.

### Collision

Selecting a collision conflict splits the detail panel into two tabs, **Conflict** and **Collision editor**, so the editor never crowds out the world view. The editor lists every bound as one row, and opening a row shows that bound's tools and surfaces. Each bound can be moved and rotated with the gizmo, or the whole file can be moved as one rigid unit. Right clicking a bound in the world offers the same actions.

Each material slot shows its current surface and can be set from the full surface list, with the sixteen collision flags beside it. Changes are written into the `.ybn` in place, so the resource keeps loading from its original file.

**Paint faces** colours every face by its surface and turns the cursor into a brush. Tap a face to select it, hold and sweep to paint over an area, hold Ctrl to erase, and scroll to size the brush. Clicking a surface in the list selects every face using it. Pick a surface for the selection and it is written per face.

A bound stores its surfaces in a fixed size list, so painting a surface the bound does not already carry needs a slot. The editor reuses a slot that already matches, retypes one the selection covers completely, takes over a slot nothing points at any more, or appends a new one where the file has room. Painting frees slots as it goes, so a bound gets easier to work with the more it is edited. When none of those fit it says so and names the smallest surface in the bound, which is the cheapest one to select whole and retype.

**Move / rotate selected faces** puts the gizmo on the selection and moves the geometry itself. Collision vertices are stored as quantised integers packed against the edge of their range, so a move rewrites the whole vertex array with a new scale and rebuilds the bound's BVH along with every bounding volume above it. This needs a bound made only of triangles and without an octant index, and the editor says so when a bound does not qualify.

Bounds built from box, sphere, capsule and cylinder shapes have no faces, so painting and moving are unavailable on them. Their surface is still editable through the material slot list.

Queued changes show in the world straight away and survive reselecting the conflict, switching copy or leaving the face editor. Nothing reaches disk until **Resolve**.

When several resources ship the same `.ybn`, pick which copy to edit from the resource row at the top of the section. It defaults to the copy that loads last.

When several resources ship the same file, the game registers streaming files in resource name order and the last one to register overrides the rest, so the copy marked active is the one players get. Restarting a resource while the server runs re-registers it and hands it the win instead.

**Check against world** confirms it from the game rather than from that rule. It compares the copies, finds the faces each one has that the others do not, and probes only those, so a shared surface cannot vote. The copy whose own faces are really there is the one loaded. If the probe and the name order disagree, the panel says so, which is the sign a resource was restarted at runtime.

### Overlapping occluders

Selecting an occluder conflict draws every box in the cluster, each in its own color. Each box can be shrunk until it clears its neighbours, removed on its own, or the whole cluster merged into one volume. **Edit** puts the gizmo on a box for free movement, and right clicking a face switches to extruding that single side.

## Vanilla file index (optional)

With `server/data/vanilla-files.json.gz` present, conflicts that override base-game files are labelled as vanilla overrides. The index is a list of base-game file names, generated from an unmodified GTA V installation:

```
node tools/build-vanilla-index.mjs my-vanilla-file-list.txt
```

The file list can be exported with an RPF explorer. Only names are stored, and no game data is redistributed. Without the index everything else works the same.

## Where decisions are stored

- Entity decisions (remove and move) are stored in `data/decisions.json` and enforced at runtime with `CreateModelHide` plus a local replacement object for moves. No files are changed.
- Asset decisions (disabling a losing duplicate) move the file into `data/backups/<timestamp>/<resource>/<path>` after a sha1-verified copy.
- Collision decisions (moving or rotating a bound, changing a surface, its flags, or the surface of individual faces) rewrite fields inside the ybn.
- Edit decisions (burying a prop, shrinking, removing or merging an occluder) rewrite fields inside the ymap. The original file is copied into the same bundle first, so Restore brings it back byte for byte.

Each bundle has a `manifest.json`, and Restore skips files that changed since the bundle was made.

## Support

If this tool saved you some pain, you can support it on [Ko-fi](https://ko-fi.com/kkmihai).

## License

GPL-3.0. See [LICENSE](LICENSE). This tool can be used, studied, modified and redistributed, including commercially, and any distributed modified version must stay open source under the same license.
