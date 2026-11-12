# Regio — développement sous WSL uniquement.
# Rend le serveur « caméra téléphone » (port 8443, dans WSL) joignable depuis le Wi-Fi.
# À lancer dans PowerShell en ADMINISTRATEUR. À relancer si WSL a redémarré (son adresse change).
# Inutile avec l'application Windows installée (Tauri).

$ErrorActionPreference = "Stop"
$port = 8443

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Ce script doit être lancé en administrateur (clic droit sur PowerShell > Exécuter en tant qu'administrateur)." -ForegroundColor Red
    exit 1
}

$wslIp = ((wsl.exe hostname -I) -split '\s+' | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
if (-not $wslIp) { Write-Host "Adresse de WSL introuvable. WSL est-il démarré ?" -ForegroundColor Red; exit 1 }

# Redirection Windows:8443 -> WSL:8443 (remplace l'ancienne si elle existe)
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp | Out-Null

# Pare-feu : autoriser le port (tous profils : le Wi-Fi est souvent classé « Public »)
$ruleName = "Regio - Caméra téléphone ($port)"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
}

$lan = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object { $_.IPv4Address.IPAddress }
Write-Host "OK : port $port redirigé vers WSL ($wslIp)." -ForegroundColor Green
foreach ($ip in $lan) { Write-Host "Test depuis le téléphone : https://${ip}:$port/phone.html" }
