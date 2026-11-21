; Regio — étapes ajoutées à l'installeur Windows (NSIS, généré par Tauri).

!macro NSIS_HOOK_POSTINSTALL
  ; OBS (le moteur vidéo embarqué) a besoin du runtime Visual C++ 2015-2022 (x64).
  ; Déjà présent sur la plupart des PC ; sinon on l'installe (Windows demande alors l'autorisation).
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  SetRegView 32
  ${If} $0 != 1
    ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  ; Installeur léger des mises à jour automatiques : pas de runtime livré (déjà installé avec la 1re version).
  ${If} $0 != 1
  ${AndIf} ${FileExists} "$INSTDIR\resources\vc_redist.x64.exe"
    DetailPrint "Installation du runtime Visual C++ (nécessaire au moteur vidéo)…"
    ExecWait '"$INSTDIR\resources\vc_redist.x64.exe" /install /passive /norestart' $1
    DetailPrint "Runtime Visual C++ : code $1"
  ${EndIf}
  ; L'installeur du runtime ne sert plus.
  Delete "$INSTDIR\resources\vc_redist.x64.exe"
!macroend
