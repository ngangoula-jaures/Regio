# Simulation d'une 1re installation de Regio sur ce PC (OBS de Regio mis de cote, puis remis).
$ErrorActionPreference = 'Continue'
$out = 'C:\dev\regio-test\sim'
New-Item -ItemType Directory -Force $out | Out-Null
$data = "$env:LOCALAPPDATA\org.regio.app\obs"
$obsDir = "$data\33.0.1"
$bak = "$data\33.0.1.bak-test"
"1. Fermeture de Regio et de son OBS"
Get-Process regio -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Get-Process obs64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$obsDir*" } | Stop-Process -Force
Start-Sleep 2
"2. OBS de Regio mis de cote : $obsDir -> $bak"
if (Test-Path $bak) { "   (une sauvegarde existe deja, on la garde)" } else { Rename-Item $obsDir $bak }
"   OBS present ? " + (Test-Path "$obsDir\bin\64bit\obs64.exe")

"3. Installation silencieuse"
$t = Get-Date
$p = Start-Process 'C:\dev\regio\src-tauri\target\release\bundle\nsis\Regio_0.1.0_x64-setup.exe' -ArgumentList '/S' -Wait -PassThru
"   code $($p.ExitCode) en $([int]((Get-Date)-$t).TotalSeconds) s"
$inst = "$env:LOCALAPPDATA\Regio"
"   dossier : $inst -> " + (Test-Path "$inst\regio.exe")
Get-ChildItem "$inst" -Recurse -File | ForEach-Object { "   - " + $_.FullName.Substring($inst.Length) + " (" + [int]($_.Length/1MB) + " Mo)" }
"   raccourci menu Demarrer : " + ((Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu" -Recurse -Filter 'Regio*.lnk').FullName -join ', ')

"4. Premier lancement de la version installee"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9333'
$t = Get-Date
Start-Process "$inst\regio.exe" -WorkingDirectory $inst
$downloaded = $false; $ok = $false
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep 1
  if (Test-Path "$data\OBS-Studio-33.0.1.zip") { $downloaded = $true }
  $obs = Get-Process obs64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$obsDir*" }
  $page = try { (Invoke-WebRequest 'http://127.0.0.1:47811/render.html' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { 0 }
  if ($obs -and $page -eq 200) { $ok = $true; break }
}
"   pret en $([int]((Get-Date)-$t).TotalSeconds) s : $ok"
"   OBS mis en place depuis l'installeur : " + (Test-Path "$obsDir\bin\64bit\obs64.exe")
"   telechargement d'OBS utilise : $downloaded"
"   archive livree supprimee apres usage : " + (-not (Test-Path "$inst\resources\obs\OBS-Studio-33.0.1-Windows-x64.zip"))
"   page d'affichage servie : HTTP $page"
Set-Content "$out\pret.txt" "ok"
