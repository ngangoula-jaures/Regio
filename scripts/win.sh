#!/usr/bin/env bash
# Regio — lancer une commande Windows sur la copie de compilation.
#
# Le code vit dans WSL ; Windows ne sait pas compiler Tauri depuis un chemin WSL.
# Ce script synchronise le code vers C:\dev\regio (sans node_modules ni target),
# puis y exécute la commande avec PowerShell.
#
#   scripts/win.sh sync                       # synchroniser seulement
#   scripts/win.sh npm.cmd ci                 # installer les dépendances côté Windows
#   scripts/win.sh npx.cmd tauri dev          # lancer l'application en mode développement
#   scripts/win.sh npx.cmd tauri build        # produire l'installeur
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WIN_DIR_WSL="/mnt/c/dev/regio"
WIN_DIR='C:\dev\regio'

mkdir -p "$WIN_DIR_WSL"
rsync -a --delete \
  --exclude node_modules --exclude 'src-tauri/target' --exclude dist \
  --exclude .git --exclude .cert --exclude '*.tsbuildinfo' \
  "$ROOT/" "$WIN_DIR_WSL/"

[ "${1:-}" = "sync" ] && { echo "Synchronisé vers $WIN_DIR"; exit 0; }
[ $# -eq 0 ] && { echo "Usage : scripts/win.sh sync | <commande Windows…>"; exit 1; }

# Installer les dépendances Windows si besoin : première fois, ou liste des dépendances modifiée.
LOCK_HASH="$(sha256sum "$ROOT/package-lock.json" | cut -d' ' -f1)"
STAMP="$WIN_DIR_WSL/node_modules/.regio-lock-hash"
if [ "$1" != "npm.cmd" ] && [ "$(cat "$STAMP" 2>/dev/null)" != "$LOCK_HASH" ]; then
  powershell.exe -NoProfile -Command "\$env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User'); Set-Location '$WIN_DIR'; npm.cmd ci --no-audit --no-fund" && echo "$LOCK_HASH" > "$STAMP"
fi

exec powershell.exe -NoProfile -Command "\$env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User'); Set-Location '$WIN_DIR'; $*; exit \$LASTEXITCODE"
