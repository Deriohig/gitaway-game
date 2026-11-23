#!/usr/bin/env bash
# build.sh -- builds animal rigs: Blender (art/blender/rigs/<id>.py on its source, public/models/<id>.glb unless SOURCE names
# another), then rig-finalize.mjs, into public/models/<id>_rig.glb, its entry in public/models/rigs.json and
# art/blender/rigs/probes/<id>.probe.json (AR7's probe).
#   art/blender/rigs/build.sh <id>... | all            build and install
#   art/blender/rigs/build.sh --check <id>... | all    rebuild in a temp dir; fails unless all three outputs are byte-identical
# node 22 on PATH; BLENDER overrides ~/.local/blender/b52/blender (5.2.3 LTS). README.md has the workflow.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
models=$root/public/models
blender=${BLENDER:-$HOME/.local/blender/b52/blender}
# a rig whose source is not public/models/<id>.glb: the sheep is the owner's pick, the Meshy sheep fitted to today's sheep.glb
# size (art/scripts/rig-fit-source.mjs; README.md, "Sources"); the hare is visitor_hare.glb, the Meshy hare the game places
# today as the wild visitor (already sized, no fit)
declare -A SOURCE=([sheep]=sheep_meshy_sized.glb [hare]=visitor_hare.glb)
check=0
if [ "${1:-}" = --check ]; then check=1; shift; fi
[ $# -gt 0 ] || { echo "usage: build.sh [--check] <id>... | all" >&2; exit 2; }
ids=("$@")
if [ "$1" = all ]; then
  ids=()
  for id in dog cat_sleeping goat chicken duck sheep hare; do [ -f "$here/$id.py" ] && ids+=("$id"); done
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
for id in "${ids[@]}"; do
  [ -f "$here/$id.py" ] || { echo "build.sh: no $here/$id.py" >&2; exit 2; }
  out=$tmp/$id
  src=$models/${SOURCE[$id]:-$id.glb}
  mkdir -p "$out"
  "$blender" -b --factory-startup --python-exit-code 1 --python "$here/$id.py" -- --source "$src" --out "$out" \
    > "$out/blender.log" 2>&1 || { grep -v -E 'EGL|ZINK' "$out/blender.log" | tail -30; exit 1; }
  grep '^\[rig\]' "$out/blender.log"
  if [ $check = 0 ]; then
    node "$root/art/scripts/rig-finalize.mjs" "$out/$id.glb" "$src" "$out/$id.json" "$models/${id}_rig.glb" \
      --rigs "$models/rigs.json" --id "$id"
    mkdir -p "$here/probes"
    cp "$out/$id.probe.json" "$here/probes/$id.probe.json"
  else
    cp "$models/rigs.json" "$tmp/rigs.json"
    node "$root/art/scripts/rig-finalize.mjs" "$out/$id.glb" "$src" "$out/$id.json" "$out/${id}_rig.glb" \
      --rigs "$tmp/rigs.json" --id "$id" > /dev/null
    same=1
    for pair in "$out/${id}_rig.glb $models/${id}_rig.glb" "$out/$id.probe.json $here/probes/$id.probe.json" \
                "$tmp/rigs.json $models/rigs.json"; do
      set -- $pair
      cmp -s "$1" "$2" || { echo "$id: ${2#"$root"/} differs from a rebuild"; same=0; fail=1; }
    done
    [ $same = 1 ] && echo "$id: identical"
  fi
done
exit $fail
