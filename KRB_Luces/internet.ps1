# ============================================================
#  LUCES KRB - acceso desde internet con Cloudflare (una sola vez)
#  Deja una direccion como https://luces.tudominio.cl que llega al Dell
#  por un tunel seguro de Cloudflare, sin abrir puertos del local.
#  Despues, INICIAR.bat levanta el tunel solo, cada vez que arranca.
# ============================================================
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Una sola carpeta (Kennedy, 25 nov): la clave y el tunel se guardan siempre en C:\Users\<usuario>\KRB_Luces
$casa = Join-Path $env:USERPROFILE "KRB_Luces"
if ((Resolve-Path $dir).Path.TrimEnd('\') -ne $casa.TrimEnd('\')) {
  Write-Host "  Esta copia esta en otra carpeta: se actualiza $casa y se sigue desde alla." -ForegroundColor Yellow
  & (Join-Path $dir "instalar.ps1") -NoArrancar
  & (Join-Path $casa "internet.ps1")
  return
}
$cfgPath = Join-Path $dir "luces.json"
$yml = Join-Path $dir "tunel.yml"
$nombreTunel = "krb-luces"

function Paso($n, $t) { Write-Host ""; Write-Host ("  PASO " + $n + ": " + $t) -ForegroundColor Yellow }
function Pausa($t) { [void](Read-Host ("  " + $t + " (Enter para seguir)")) }

Write-Host ""
Write-Host "  LUCES KRB - acceso desde internet (Cloudflare)" -ForegroundColor Yellow
Write-Host "  Esto se hace una sola vez, en el Dell."

# ---------- 1. Clave obligatoria ----------
Paso 1 "Clave de la suite"
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($cfg.acceso -and $cfg.acceso.clave) {
  Write-Host "  Ya hay una clave configurada en luces.json. Bien." -ForegroundColor Green
} else {
  Write-Host "  Para entrar desde internet la suite DEBE tener clave (minimo 8 caracteres)."
  do {
    $s1 = Read-Host "  Escribe la clave nueva" -AsSecureString
    $s2 = Read-Host "  Repitela" -AsSecureString
    $c1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s1))
    $c2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s2))
    if ($c1 -ne $c2) { Write-Host "  No coinciden. Otra vez." -ForegroundColor Red }
    elseif ($c1.Length -lt 8) { Write-Host "  Muy corta: minimo 8 caracteres." -ForegroundColor Red }
  } while ($c1 -ne $c2 -or $c1.Length -lt 8)
  $esc = $c1.Replace('\', '\\').Replace('"', '\"')
  $txt = Get-Content $cfgPath -Raw -Encoding UTF8
  $txt = [regex]::Replace($txt, '"clave"\s*:\s*"[^"]*"', ('"clave": "' + $esc.Replace('$', '$$') + '"'), 1)
  [IO.File]::WriteAllText($cfgPath, $txt, (New-Object Text.UTF8Encoding($false)))
  Write-Host "  Clave guardada en luces.json." -ForegroundColor Green
}

# ---------- 2. Programa cloudflared ----------
Paso 2 "Programa del tunel de Cloudflare (cloudflared)"
function Buscar-Cloudflared {
  $local = Join-Path $dir "cloudflared.exe"
  if (Test-Path $local) { return $local }
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $pf = Join-Path ${env:ProgramFiles(x86)} "cloudflared\cloudflared.exe"
  if (Test-Path $pf) { return $pf }
  return $null
}
$cf = Buscar-Cloudflared
if (-not $cf) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host "  Se va a instalar cloudflared desde el catalogo oficial de Windows (winget)."
    Pausa "Listo para instalar"
    & winget install --id Cloudflare.cloudflared --exact --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    $cf = Buscar-Cloudflared
  }
  while (-not $cf) {
    Write-Host "  Descarga cloudflared para Windows (64 bits) desde la pagina oficial de Cloudflare," -ForegroundColor White
    Write-Host "  cambiale el nombre a cloudflared.exe y dejalo en esta carpeta:" -ForegroundColor White
    Write-Host "     $dir"
    Start-Process "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    Pausa "Cuando el archivo este en la carpeta"
    $cf = Buscar-Cloudflared
  }
}
Write-Host "  cloudflared: $cf" -ForegroundColor Green

# ---------- 3. Iniciar sesion en Cloudflare ----------
Paso 3 "Iniciar sesion en Cloudflare"
$cert = Join-Path $env:USERPROFILE ".cloudflared\cert.pem"
if (Test-Path $cert) {
  Write-Host "  Ya habia una sesion de Cloudflare en este Dell." -ForegroundColor Green
} else {
  Write-Host "  Se va a abrir el navegador: entra con la cuenta de Cloudflare de KRB"
  Write-Host "  y elige el dominio de la pagina web. Luego vuelve a esta ventana."
  Pausa "Listo"
  & $cf tunnel login
  if (-not (Test-Path $cert)) { throw "No se completo el inicio de sesion en Cloudflare." }
}

# ---------- 4. Direccion ----------
Paso 4 "Direccion para entrar desde internet"
$porDefecto = "luces.krbstage.cl"
Write-Host "  Direccion acordada: $porDefecto  (presiona Enter para usarla)"
do {
  $host_ = (Read-Host "  Direccion").Trim().ToLower()
  if ($host_ -eq "") { $host_ = $porDefecto }
} while ($host_ -notmatch '^[a-z0-9-]+(\.[a-z0-9-]+)+$')

# ---------- 5. Crear el tunel ----------
Paso 5 "Crear el tunel"
$lista = & $cf tunnel list -o json | Out-String | ConvertFrom-Json
$t = $lista | Where-Object { $_.name -eq $nombreTunel } | Select-Object -First 1
if (-not $t) {
  & $cf tunnel create $nombreTunel
  $lista = & $cf tunnel list -o json | Out-String | ConvertFrom-Json
  $t = $lista | Where-Object { $_.name -eq $nombreTunel } | Select-Object -First 1
}
if (-not $t) { throw "No se pudo crear el tunel." }
$id = $t.id
$cred = Join-Path $env:USERPROFILE (".cloudflared\" + $id + ".json")
Write-Host "  Tunel: $nombreTunel ($id)" -ForegroundColor Green

& $cf tunnel route dns --overwrite-dns $nombreTunel $host_

# ---------- 6. Configuracion ----------
$puerto = 8080
if ($cfg.servidor -and $cfg.servidor.puerto) { $puerto = [int]$cfg.servidor.puerto }
$conf = @"
tunnel: $id
credentials-file: $cred
ingress:
  - hostname: $host_
    service: http://localhost:$puerto
  - service: http_status:404
"@
[IO.File]::WriteAllText($yml, $conf, (New-Object Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "  LISTO." -ForegroundColor Green
Write-Host "  Desde ahora, al abrir INICIAR.bat (o al prender el Dell) el tunel se levanta solo."
Write-Host "  Desde cualquier lugar: https://$host_   (pide la clave una vez por aparato)"
Write-Host "  Se reinicia la suite para levantar el tunel..."
Start-Process -FilePath (Join-Path $dir "INICIAR.bat") -WorkingDirectory $dir -WindowStyle Minimized
