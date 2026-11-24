# ============================================================
#  LUCES KRB - instalador para el Dell
#  1) Copia la suite a una carpeta fija:  C:\Users\<usuario>\KRB_Luces
#  2) Hace que arranque sola al prender Windows (acceso directo en Inicio)
#  No pide permisos de administrador. Si se vuelve a ejecutar, actualiza
#  el programa SIN borrar la configuracion (luces.json), la calibracion
#  (datos.json) ni las sesiones guardadas.
# ============================================================
param(
  [string]$Destino = (Join-Path $env:USERPROFILE "KRB_Luces"),
  [switch]$SinInicio,
  [switch]$NoArrancar
)
$ErrorActionPreference = "Stop"
$origen = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  LUCES KRB - instalacion" -ForegroundColor Yellow
Write-Host "  Carpeta: $Destino"
Write-Host ""

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

# Archivos del programa: siempre se actualizan
$programa = @("INICIAR.bat", "krb_luces.ps1", "ipad.html", "vista3d.js", "instalar.ps1", "INSTALAR.bat", "internet.ps1", "CONFIGURAR_INTERNET.bat", "LEEME.txt", "lib\three.module.min.js", "lib\three-LICENSE.txt")
New-Item -ItemType Directory -Force -Path (Join-Path $Destino "lib") | Out-Null
foreach ($f in $programa) {
  $src = Join-Path $origen $f
  if ((Test-Path $src) -and ((Resolve-Path $src).Path -ne (Join-Path $Destino $f))) { Copy-Item $src (Join-Path $Destino $f) -Force }
}

# Configuracion: no se pisa si ya existe
$cfgDestino = Join-Path $Destino "luces.json"
$cfgOrigen = Join-Path $origen "luces.json"
if ((Resolve-Path $cfgOrigen).Path -ne $cfgDestino) {
  if (Test-Path $cfgDestino) {
    Copy-Item $cfgOrigen (Join-Path $Destino "luces.nuevo.json") -Force
    Write-Host "  luces.json ya existia: se mantuvo el tuyo. La version nueva quedo como luces.nuevo.json" -ForegroundColor DarkYellow
  } else {
    Copy-Item $cfgOrigen $cfgDestino
  }
}
# El programa de Cloudflare, si ya se descargo junto al instalador
$cf = Join-Path $origen "cloudflared.exe"
if ((Test-Path $cf) -and -not (Test-Path (Join-Path $Destino "cloudflared.exe"))) { Copy-Item $cf $Destino }

# Arranque automatico al prender Windows
if (-not $SinInicio) {
  $startup = [Environment]::GetFolderPath("Startup")
  $lnk = Join-Path $startup "Luces KRB.lnk"
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut($lnk)
  $s.TargetPath = Join-Path $Destino "INICIAR.bat"
  $s.WorkingDirectory = $Destino
  $s.WindowStyle = 7          # minimizada
  $s.Description = "Luces KRB - servidor DMX"
  $s.Save()
  Write-Host "  Arranque automatico: listo (se abre minimizado al prender Windows)." -ForegroundColor Green
}

Write-Host "  Instalacion lista." -ForegroundColor Green
Write-Host ""
if (-not $NoArrancar) {
  $corriendo = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*krb_luces.ps1*" }
  if ($corriendo) {
    Write-Host "  La suite ya estaba abierta. Cierra esa ventana y abre INICIAR.bat en $Destino para usar la version nueva." -ForegroundColor DarkYellow
  } else {
    Start-Process -FilePath (Join-Path $Destino "INICIAR.bat") -WorkingDirectory $Destino -WindowStyle Minimized
    Write-Host "  Se abrio la suite (ventana minimizada en la barra de tareas)."
  }
}
