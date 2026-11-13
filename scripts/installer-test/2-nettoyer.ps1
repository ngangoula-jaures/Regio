$data = "$env:LOCALAPPDATA\org.regio.app\obs"
$obsDir = "$data\33.0.1"; $bak = "$data\33.0.1.bak-test"
$save = "C:\dev\regio-test\sim\sauvegarde-donnees"
"1. Sauvegarde des donnees (deroule, images) -> $save"
Copy-Item "$env:APPDATA\org.regio.app" $save -Recurse -Force
"2. Fermeture de Regio installe et de son OBS"
Get-Process regio -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Get-Process obs64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$obsDir*" } | Stop-Process -Force
Start-Sleep 2
"3. Desinstallation silencieuse"
$p = Start-Process "$env:LOCALAPPDATA\Regio\uninstall.exe" -ArgumentList '/S' -Wait -PassThru
Start-Sleep 3
"   code $($p.ExitCode) ; dossier restant : " + (Test-Path "$env:LOCALAPPDATA\Regio\regio.exe") + " ; raccourci restant : " + [bool](Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu" -Recurse -Filter 'Regio*.lnk')
"   donnees intactes : " + (Test-Path "$env:APPDATA\org.regio.app\data\library.json")
if (-not (Test-Path "$env:APPDATA\org.regio.app\data\library.json")) { Copy-Item "$save\*" "$env:APPDATA\org.regio.app" -Recurse -Force; "   -> donnees restaurees depuis la sauvegarde" }
"4. Remise en place de votre OBS"
if (Test-Path $bak) { Remove-Item $obsDir -Recurse -Force -ErrorAction SilentlyContinue; Rename-Item $bak $obsDir }
"   OBS present : " + (Test-Path "$obsDir\bin\64bit\obs64.exe") + " ; sauvegarde restante : " + (Test-Path $bak)
"5. Relance de votre version habituelle"
Start-Process 'C:\dev\regio\src-tauri\target\debug\regio.exe' -WorkingDirectory 'C:\dev\regio\src-tauri\target\debug'
