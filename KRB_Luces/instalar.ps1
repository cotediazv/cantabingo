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
# (momentos.txt = las luces de cada momento de los juegos, para que el GC Master funcione aunque nadie haya abierto el iPad;
#  el iPad lo vuelve a generar desde luces.json cada vez que se abre)
$programa = @("INICIAR.bat", "INICIAR_OCULTO.vbs", "DETENER.bat", "krb_luces.ps1", "ipad.html", "vista3d.js", "instalar.ps1", "INSTALAR.bat", "internet.ps1", "CONFIGURAR_INTERNET.bat", "LEEME.txt", "momentos.txt", "lib\three.module.min.js", "lib\three-LICENSE.txt")
New-Item -ItemType Directory -Force -Path (Join-Path $Destino "lib") | Out-Null
foreach ($f in $programa) {
  $src = Join-Path $origen $f
  if ((Test-Path $src) -and ((Resolve-Path $src).Path -ne (Join-Path $Destino $f))) { Copy-Item $src (Join-Path $Destino $f) -Force }
}

# Configuracion: se usa la version nueva (direcciones y canales probados en Kennedy), pero se conserva lo
# propio de este Dell: la clave de acceso y la salida (tipo de cable / puerto). El archivo anterior queda como respaldo.
$cfgDestino = Join-Path $Destino "luces.json"
$cfgOrigen = Join-Path $origen "luces.json"
if ((Resolve-Path $cfgOrigen).Path -ne $cfgDestino) {
  if (Test-Path $cfgDestino) {
    $viejoTxt = [IO.File]::ReadAllText($cfgDestino)
    $nuevoTxt = [IO.File]::ReadAllText($cfgOrigen)
    try {
      $viejo = $viejoTxt | ConvertFrom-Json
      # texto para meter dentro de comillas JSON y como reemplazo de regex ($ se escribe $$)
      $esc = { param($s) (($s -replace '\\', '\\' -replace '"', '\"').Replace('$', '$$')) }
      if ($viejo.acceso -and $viejo.acceso.clave) {
        $nuevoTxt = [regex]::Replace($nuevoTxt, '"clave":\s*"[^"]*"', ('"clave": "' + (& $esc ([string]$viejo.acceso.clave)) + '"'), 1)
      }
      if ($viejo.acceso -and $viejo.acceso.pedir_en_wifi_local -ne $null) {
        $nuevoTxt = [regex]::Replace($nuevoTxt, '"pedir_en_wifi_local":\s*(true|false)', ('"pedir_en_wifi_local": ' + ([string]$viejo.acceso.pedir_en_wifi_local).ToLower()), 1)
      }
      if ($viejo.salida -and $viejo.salida.tipo) {
        $nuevoTxt = [regex]::Replace($nuevoTxt, '("salida":\s*\{[^}]*?"tipo":\s*)"[^"]*"', ('$1"' + (& $esc ([string]$viejo.salida.tipo)) + '"'), 1)
      }
      if ($viejo.salida -and $viejo.salida.puerto) {
        $nuevoTxt = [regex]::Replace($nuevoTxt, '("salida":\s*\{[^}]*?"puerto":\s*)"[^"]*"', ('$1"' + (& $esc ([string]$viejo.salida.puerto)) + '"'), 1)
      }
      $null = $nuevoTxt | ConvertFrom-Json            # que quede un JSON valido
      [IO.File]::WriteAllText((Join-Path $Destino "luces.anterior.json"), $viejoTxt, (New-Object Text.UTF8Encoding $false))
      [IO.File]::WriteAllText($cfgDestino, $nuevoTxt, (New-Object Text.UTF8Encoding $false))
      Write-Host "  luces.json actualizado (se mantuvo la clave). El anterior quedo como luces.anterior.json" -ForegroundColor Green
    } catch {
      Copy-Item $cfgOrigen (Join-Path $Destino "luces.nuevo.json") -Force
      Write-Host "  No se pudo actualizar luces.json; se mantuvo el tuyo. La version nueva quedo como luces.nuevo.json" -ForegroundColor DarkYellow
    }
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
  $s.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
  $s.Arguments = '"' + (Join-Path $Destino "INICIAR_OCULTO.vbs") + '"'
  $s.WorkingDirectory = $Destino
  # sin ventana negra (Cote, 24 nov); para verla: INICIAR.bat; para detenerla: DETENER.bat
  $s.Description = "Luces KRB - servidor DMX"
  $s.Save()
  Write-Host "  Arranque automatico: listo (se abre sola y oculta al prender Windows; DETENER.bat la para)." -ForegroundColor Green
}

Write-Host "  Instalacion lista." -ForegroundColor Green
Write-Host ""
if (-not $NoArrancar) {
  # La suite nueva cierra sola cualquier copia anterior (tambien la oculta), asi que se abre siempre
  $viejas = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*krb_luces.ps1*" }
  $viejas | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Process -FilePath (Join-Path $Destino "INICIAR.bat") -WorkingDirectory $Destino -WindowStyle Minimized
  Write-Host "  Se abrio la suite nueva (ventana minimizada en la barra de tareas)."
}
