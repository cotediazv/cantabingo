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
  [switch]$NoArrancar,
  [switch]$SoloRecuperar
)
$ErrorActionPreference = "Stop"
$origen = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object Text.UTF8Encoding $false

# ---------- Recuperar lo que quedo en otras copias de la suite (Kennedy, 25 nov) ----------
# Busca todas las carpetas del usuario que tengan la suite (krb_luces.ps1) y trae a la carpeta oficial
# lo que le falte: la calibracion mas completa (datos.json), la clave (luces.json) y el tunel (tunel.yml).
function Marcas($txt) { if (-not $txt) { return 0 }; return ([regex]::Matches($txt, '"(abajo|ei|ed|fi|fd)"\s*:')).Count }
function Recuperar {
  New-Item -ItemType Directory -Force -Path $Destino | Out-Null
  $raices = @(Get-ChildItem -Path $env:USERPROFILE -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "AppData" -and $_.Name -notlike ".*" } | ForEach-Object { $_.FullName })
  $raices += $env:TEMP
  $copias = @()
  foreach ($r in $raices) {
    $copias += @(Get-ChildItem -Path $r -Filter "krb_luces.ps1" -Recurse -Depth 6 -File -Force -ErrorAction SilentlyContinue |
      ForEach-Object { $_.DirectoryName } | Where-Object { $_.TrimEnd('\') -ne $Destino.TrimEnd('\') })
  }
  $copias = $copias | Select-Object -Unique
  if (-not $copias) { return }

  # 1) Calibracion: la que tenga mas marcas (y la mas nueva si empatan)
  $pDatos = Join-Path $Destino "datos.json"
  $aqui = if (Test-Path $pDatos) { [IO.File]::ReadAllText($pDatos) } else { "" }
  $aquiFecha = if (Test-Path $pDatos) { (Get-Item $pDatos).LastWriteTime } else { $null }
  $mejor = $null
  foreach ($c in $copias) {
    $f = Join-Path $c "datos.json"; if (-not (Test-Path $f)) { continue }
    $t = [IO.File]::ReadAllText($f); $m = Marcas $t; if ($m -eq 0) { continue }
    $w = (Get-Item $f).LastWriteTime
    if ($aquiFecha -and $w -le $aquiFecha) { continue }          # solo si es mas nueva (asi no vuelve una calibracion borrada a proposito)
    if (-not $mejor -or $m -gt $mejor.m -or ($m -eq $mejor.m -and $w -gt $mejor.w)) { $mejor = @{ f = $f; t = $t; m = $m; w = $w; c = $c } }
  }
  if ($mejor -and $mejor.m -gt (Marcas $aqui)) {
    if ($aqui) {
      $dir = Join-Path $Destino "respaldos"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
      [IO.File]::WriteAllText((Join-Path $dir ("datos-antes-de-recuperar-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")), $aqui, $utf8)
    }
    [IO.File]::WriteAllText($pDatos, $mejor.t, $utf8)
    Write-Host ("  Calibracion recuperada de: " + $mejor.f + " (" + $mejor.m + " marcas, " + $mejor.w + ")") -ForegroundColor Green
  }

  # 2) Clave: si la carpeta oficial no tiene, la de la copia mas nueva que tenga
  $pCfg = Join-Path $Destino "luces.json"
  if (Test-Path $pCfg) {
    $cfgTxt = [IO.File]::ReadAllText($pCfg)
    $tiene = $false; try { $tiene = [bool](($cfgTxt | ConvertFrom-Json).acceso.clave) } catch {}
    if (-not $tiene) {
      $con = $copias | ForEach-Object { $f = Join-Path $_ "luces.json"
        if (Test-Path $f) { try { $k = ([IO.File]::ReadAllText($f) | ConvertFrom-Json).acceso.clave; if ($k) { [pscustomobject]@{ k = [string]$k; w = (Get-Item $f).LastWriteTime } } } catch {} } } |
        Sort-Object w -Descending | Select-Object -First 1
      if ($con) {
        $esc = ($con.k -replace '\\', '\\' -replace '"', '\"').Replace('$', '$$')
        $nuevo = [regex]::Replace($cfgTxt, '"clave":\s*"[^"]*"', ('"clave": "' + $esc + '"'), 1)
        try { $null = $nuevo | ConvertFrom-Json; [IO.File]::WriteAllText($pCfg, $nuevo, $utf8); Write-Host "  Clave recuperada de otra copia de la suite." -ForegroundColor Green } catch {}
      }
    }
  }

  # 3) Tunel de internet y cloudflared: si faltan en la carpeta oficial
  foreach ($n in @("tunel.yml", "cloudflared.exe")) {
    $dst = Join-Path $Destino $n
    if (Test-Path $dst) { continue }
    $src = $copias | ForEach-Object { Join-Path $_ $n } | Where-Object { Test-Path $_ } |
      Sort-Object { (Get-Item $_).LastWriteTime } -Descending | Select-Object -First 1
    if ($src) { Copy-Item $src $dst; Write-Host ("  " + $n + " recuperado de otra copia de la suite.") -ForegroundColor Green }
  }
}
if ($SoloRecuperar) { Recuperar; return }

Write-Host ""
Write-Host "  LUCES KRB - instalacion" -ForegroundColor Yellow
Write-Host "  Carpeta: $Destino"
Write-Host ""

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

# Archivos del programa: siempre se actualizan
# (momentos.txt = las luces de cada momento de los juegos, para que el GC Master funcione aunque nadie haya abierto el iPad;
#  el iPad lo vuelve a generar desde luces.json cada vez que se abre)
$programa = @("INICIAR.bat", "INICIAR_OCULTO.vbs", "DETENER.bat", "krb_luces.ps1", "ipad.html", "vista3d.js", "instalar.ps1", "INSTALAR.bat", "internet.ps1", "CONFIGURAR_INTERNET.bat", "ESTACION_RITMO.bat", "estacion.ps1", "LEEME.txt", "momentos.txt", "lib\three.module.min.js", "lib\three-LICENSE.txt")
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
# El programa de Cloudflare y el tunel, si estan junto al instalador y faltan en la carpeta oficial
foreach ($n in @("cloudflared.exe", "tunel.yml")) {
  $src = Join-Path $origen $n
  if ((Test-Path $src) -and -not (Test-Path (Join-Path $Destino $n))) { Copy-Item $src $Destino }
}
# La calibracion, la clave y el tunel que hayan quedado en otras copias de la suite
try { Recuperar } catch { Write-Host ("  No se pudo revisar otras copias: " + $_.Exception.Message) -ForegroundColor DarkYellow }

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
  # Se cierra la copia anterior (tambien la oculta) y la nueva queda corriendo en segundo plano, con su vigilante
  Remove-Item (Join-Path $Destino "detenida.txt") -ErrorAction SilentlyContinue
  $viejas = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*krb_luces.ps1*" -and $_.ProcessId -ne $PID }
  $viejas | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + (Join-Path $Destino "INICIAR_OCULTO.vbs") + '"') -WorkingDirectory $Destino
  Write-Host "  La suite nueva quedo corriendo en segundo plano (sin ventana). Lo que pasa queda en registro.txt."
}
