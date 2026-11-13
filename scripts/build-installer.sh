#!/usr/bin/env bash
# Regio — produit l'installeur Windows (NSIS) avec OBS et le runtime Visual C++ embarqués.
# Usage (depuis WSL) : scripts/build-installer.sh
#   → C:\dev\regio\src-tauri\target\release\bundle\nsis\Regio_<version>_x64-setup.exe
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/fetch-installer-deps.sh"
"$ROOT/scripts/win.sh" sync >/dev/null

# Le runtime Visual C++ doit être signé par Microsoft (il vient d'aka.ms, sans empreinte fixe).
SIG="$(powershell.exe -NoProfile -Command "\$s = Get-AuthenticodeSignature 'C:\dev\regio\src-tauri\resources\vc_redist.x64.exe'; '' + \$s.Status + '|' + \$s.SignerCertificate.Subject" | tr -d '\r')"
case "$SIG" in
  Valid\|*"O=Microsoft Corporation"*) echo "Runtime Visual C++ : signature Microsoft valide" ;;
  *) echo "Runtime Visual C++ : signature INVALIDE ($SIG)" >&2; exit 1 ;;
esac

"$ROOT/scripts/win.sh" npx.cmd tauri build --config src-tauri/tauri.installer.conf.json
