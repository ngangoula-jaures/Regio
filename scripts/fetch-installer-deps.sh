#!/usr/bin/env bash
# Regio — récupère les gros fichiers livrés AVEC l'installeur (jamais dans git) :
#   - OBS Studio portable (version figée, empreinte SHA-256 vérifiée, la même que src-tauri/src/obs.rs) ;
#   - le runtime Visual C++ x64 de Microsoft (signature vérifiée sous Windows au moment de la compilation).
# Usage : scripts/fetch-installer-deps.sh   (puis scripts/build-installer.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/src-tauri/resources"
mkdir -p "$DIR/obs"

OBS_VERSION="33.0.1"
OBS_ZIP="$DIR/obs/OBS-Studio-$OBS_VERSION-Windows-x64.zip"
OBS_URL="https://github.com/obsproject/obs-studio/releases/download/$OBS_VERSION/OBS-Studio-$OBS_VERSION-Windows-x64.zip"
OBS_SHA256="$(grep -oP 'const OBS_SHA256: &str = "\K[0-9a-f]{64}' "$ROOT/src-tauri/src/obs.rs")"

if ! echo "$OBS_SHA256  $OBS_ZIP" | sha256sum -c --status 2>/dev/null; then
  echo "Téléchargement d'OBS $OBS_VERSION (224 Mo)…"
  curl -fL --retry 3 -A "regio-build" -o "$OBS_ZIP.part" "$OBS_URL"
  echo "$OBS_SHA256  $OBS_ZIP.part" | sha256sum -c --status || { echo "Empreinte d'OBS incorrecte" >&2; rm -f "$OBS_ZIP.part"; exit 1; }
  mv "$OBS_ZIP.part" "$OBS_ZIP"
fi
echo "OBS : OK ($OBS_ZIP)"

VC="$DIR/vc_redist.x64.exe"
if [ ! -s "$VC" ]; then
  echo "Téléchargement du runtime Visual C++ x64…"
  curl -fL --retry 3 -A "regio-build" -o "$VC" "https://aka.ms/vs/17/release/vc_redist.x64.exe"
fi
echo "Runtime Visual C++ : OK ($VC)"
