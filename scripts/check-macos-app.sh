#!/usr/bin/env bash
# Checks a Mac app that `tauri build` just made, on the macOS runner, before
# its disk image is uploaded:
#
#   scripts/check-macos-app.sh <path/to/Name.app> <bundle ID> <program> <arm64|x86_64>
#
# Without a Mac at hand to try them on, this is the proof that each app came
# out as intended: its bundle ID (Gitaway Dev's own, so its own WebKit storage
# and its own farm), the program inside it, the processor it is built for, the
# macOS it needs (tauri.conf.json), the folder-access reasons from
# src-tauri/Info.plist, and an ad-hoc signature that seals the whole bundle,
# which an Apple Silicon Mac needs before it opens a downloaded app. Once the
# apps are signed with a Developer ID, the last check should look for that.

set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: scripts/check-macos-app.sh <path/to/Name.app> <bundle ID> <program> <arm64|x86_64>" >&2
  exit 2
fi
app=$1 id=$2 program=$3 arch=$4
plist="$app/Contents/Info.plist"
# The oldest macOS the apps are for, as tauri.conf.json sets it.
config="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/tauri.conf.json"
minimum=$(node -p 'require(process.argv[1]).bundle.macOS.minimumSystemVersion' "$config")
problems=0

fail() {
  echo "  - $*" >&2
  problems=$((problems + 1))
}
value() {
  local out
  if out=$(plutil -extract "$1" raw -o - "$plist" 2>/dev/null); then echo "$out"; else echo "(not set)"; fi
}
expect() {
  local actual
  actual=$(value "$1")
  [ "$actual" = "$2" ] || fail "$1 is \"$actual\", not \"$2\""
}

if [ ! -f "$plist" ]; then
  echo "$app: no such app (no Contents/Info.plist)" >&2
  exit 1
fi

echo "$app:"
expect CFBundleIdentifier "$id"
expect CFBundleExecutable "$program"
expect LSMinimumSystemVersion "$minimum"
for key in NSDocumentsFolderUsageDescription NSDesktopFolderUsageDescription NSDownloadsFolderUsageDescription; do
  [ "$(value "$key")" != "(not set)" ] || fail "Info.plist has no $key"
done

binary="$app/Contents/MacOS/$program"
if [ -f "$binary" ]; then
  archs=$(lipo -archs "$binary" || true)
  [ "$archs" = "$arch" ] || fail "the program is built for \"$archs\", not \"$arch\""
  # The macOS version the program itself was linked for (MACOSX_DEPLOYMENT_TARGET).
  # Shown, not checked: LSMinimumSystemVersion above is what stops older Macs.
  minos=$( (otool -l "$binary" || true) | awk '/cmd LC_BUILD_VERSION/ { found = 1 } found && $1 == "minos" { print $2; exit }')
  echo "  program: $program, $archs, linked for macOS ${minos:-unknown} or later"
else
  fail "there is no program at Contents/MacOS/$program"
fi

signature=$(codesign --display --verbose=2 "$app" 2>&1 || true)
grep -E '^(Identifier|Format|CodeDirectory|Signature|Sealed Resources|TeamIdentifier)' <<<"$signature" | sed 's/^/  /' || true
grep -q '^Signature=adhoc$' <<<"$signature" || fail "the app is not signed ad hoc"
grep -q '^Sealed Resources version=' <<<"$signature" || fail "the signature does not seal the whole bundle"
codesign --verify --deep --strict "$app" || fail "codesign --verify rejects the app"

if [ "$problems" -gt 0 ]; then
  echo "$app is not as it should be ($problems problems)." >&2
  exit 1
fi
echo "  ok: $id, macOS $minimum or later, signed ad hoc"
