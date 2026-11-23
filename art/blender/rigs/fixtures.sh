#!/usr/bin/env bash
# fixtures.sh -- rebuilds the rig checker's fixtures, art/scripts/tests/fixtures/rigs (tests/rigs.test.mjs Part A):
# fixtures.py builds them in Blender, then rig-finalize.mjs finishes each rigged GLB.
#   art/blender/rigs/fixtures.sh            (node 22 on PATH; BLENDER overrides ~/.local/blender/b52/blender, 5.2.3 LTS)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
scripts=$(cd "$here/../../scripts" && pwd)
out=$scripts/tests/fixtures/rigs
raw=$(mktemp -d)
trap 'rm -rf "$raw"' EXIT

"${BLENDER:-$HOME/.local/blender/b52/blender}" -b --factory-startup --python-exit-code 1 --python "$here/fixtures.py" -- --out "$out" --raw "$raw" \
  > "$raw/blender.log" 2>&1 || { tail -30 "$raw/blender.log"; exit 1; }
grep '^FIXTURES' "$raw/blender.log"

fin() { node "$scripts/rig-finalize.mjs" "$@"; }    # <raw.glb> <source.glb> <sidecar.json> <out.glb>
for n in good bad_names bad_loop bad_rootmotion bad_tear bad_side; do fin "$raw/$n.glb" "$out/source.glb" "$out/$n.json" "$out/$n.glb"; done
# bad_lid: good's export finalized from a sidecar without lids, so lid_L / lid_R keep their bind scale 1 (the lids show)
fin "$raw/good.glb" "$out/source.glb" "$raw/bad_lid.finalize.json" "$out/bad_lid.glb"
# bad_atlas: good's export as its own source, so the image Blender re-encoded stays in place of the source's bytes
fin "$raw/good.glb" "$raw/good.glb" "$out/bad_atlas.json" "$out/bad_atlas.glb"
