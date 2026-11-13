# Regio : export « fidèle » d'une présentation, diapo par diapo, en images, par PowerPoint lui-même
# (polices, mises en page et arrière-plans exactement comme dans PowerPoint). Invisible pour l'utilisateur.
#
# Entrées (variables d'environnement) : REGIO_SRC = fichier .pptx, REGIO_OUT = dossier des images.
# Sortie (une ligne par étape) : « TOTAL n », « DONE i », « SKIP i » (diapo masquée), « ERROR message ».
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$src = $env:REGIO_SRC
$out = $env:REGIO_OUT
$app = $null
$pres = $null
$opened = 0
try {
  try { $app = New-Object -ComObject PowerPoint.Application } catch { 'ERROR NOPOWERPOINT'; exit 2 }
  $opened = $app.Presentations.Count  # PowerPoint déjà ouvert par l'utilisateur : ne pas le fermer
  # Open(fichier, lecture seule, sans titre, SANS fenêtre)
  $pres = $app.Presentations.Open($src, -1, 0, 0)
  $w = $pres.PageSetup.SlideWidth
  $h = $pres.PageSetup.SlideHeight
  # Taille d'export : le plus grand format qui tient dans 1920 × 1080 en gardant les proportions.
  # (Attention : PowerShell ne distingue pas $w et $W.)
  if ($w / $h -ge 16 / 9) { $outW = 1920; $outH = [int][math]::Round(1920 * $h / $w) } else { $outH = 1080; $outW = [int][math]::Round(1080 * $w / $h) }
  $n = $pres.Slides.Count
  "TOTAL $n"
  for ($i = 1; $i -le $n; $i++) {
    $s = $pres.Slides.Item($i)
    if ($s.SlideShowTransition.Hidden -eq -1) { "SKIP $i"; continue }
    $s.Export((Join-Path $out ("{0:D4}.jpg" -f $i)), 'JPG', $outW, $outH)
    "DONE $i"
  }
} catch {
  "ERROR $($_.Exception.Message)"
  exit 1
} finally {
  if ($pres) { try { $pres.Close() } catch {} }
  if ($app -and $opened -eq 0) { try { $app.Quit() } catch {} }
  if ($app) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
}
