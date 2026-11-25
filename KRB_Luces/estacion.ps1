# ============================================================
#  LUCES KRB - ESTACION DE RITMO (se instala UNA vez, en el computador donde entra la mezcla, el de OBS)
#  Deja el panel del DJ abriendose solo al prender el computador, en una ventana propia de Edge:
#  - escucha la entrada de linea siempre (Ritmo se prende solo, con la entrada elegida la primera vez),
#  - el navegador no la frena aunque quede detras de OBS,
#  - la clave queda guardada (la sesion se renueva sola y no vence),
#  - si el Dell o internet no estan listos al prender, espera y se conecta sola.
#  El DJ maneja las escenas desde su celular, por todo el local.
# ============================================================
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:LOCALAPPDATA "KRB_Estacion"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host ""
Write-Host "  LUCES KRB - estacion de ritmo" -ForegroundColor Yellow
Write-Host ""

# 1) Direccion de las luces: si la suite corre en este mismo computador, por localhost; si no, por internet
$enEste = Test-Path (Join-Path $env:USERPROFILE "KRB_Luces\krb_luces.ps1")
$porDefecto = if ($enEste) { "http://localhost:8080" } else { "https://luces.krbstage.cl" }
Write-Host "  Direccion de las luces: $porDefecto  (Enter para usarla)"
$base = (Read-Host "  Direccion").Trim().TrimEnd('/')
if ($base -eq "") { $base = $porDefecto }
$url = $base + "/dj?estacion=1"

# 2) Navegador: Edge (viene con Windows) o Chrome
$nav = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $nav) { throw "No se encontro Edge ni Chrome en este computador." }
Write-Host "  Navegador: $nav" -ForegroundColor Green

# 3) Pagina de espera: se conecta sola cuando el Dell responde (al prender, internet o el Dell pueden tardar)
$espera = @"
<!doctype html><meta charset="utf-8"><title>Estacion de ritmo KRB</title>
<body style="margin:0;background:#0c0d10;color:#eceef2;font:16px system-ui;display:grid;place-items:center;height:100vh;text-align:center">
<div><b style="font-size:20px">Estacion de ritmo KRB</b><p id="t">Conectando con las luces...</p></div>
<script>
var url = "$url", base = "$base", n = 0;
function probar(){ n++; document.getElementById('t').textContent = 'Conectando con las luces... (intento ' + n + ')';
  fetch(base + '/api/dj?' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).then(function(){ location.replace(url); })
  .catch(function(){ setTimeout(probar, 5000); }); }
probar();
</script>
"@
$pEspera = Join-Path $dir "arranque.html"
[IO.File]::WriteAllText($pEspera, $espera, (New-Object Text.UTF8Encoding $false))

# 4) Acceso directo: ventana propia (perfil aparte), permiso de audio dado y sin frenos en segundo plano
$perfil = Join-Path $dir "perfil"
$args_ = @(
  "--user-data-dir=`"$perfil`"",
  "--app=`"file:///" + ($pEspera -replace '\\', '/') + "`"",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--hide-crash-restore-bubble",
  "--no-first-run", "--no-default-browser-check",
  "--window-size=480,860"
) -join " "
$sh = New-Object -ComObject WScript.Shell
foreach ($lnk in @((Join-Path ([Environment]::GetFolderPath("Startup")) "Estacion de ritmo KRB.lnk"),
                   (Join-Path ([Environment]::GetFolderPath("Desktop")) "Estacion de ritmo KRB.lnk"))) {
  $s = $sh.CreateShortcut($lnk)
  $s.TargetPath = $nav; $s.Arguments = $args_; $s.WorkingDirectory = $dir
  $s.Description = "Luces KRB - estacion de ritmo (escucha la mezcla y manda el ritmo a las luces)"
  $s.Save()
}
Write-Host "  Listo: se abre sola al prender este computador (y hay un acceso directo en el Escritorio)." -ForegroundColor Green

# 5) Abrirla ahora para poner la clave y elegir la entrada de linea (solo esta vez)
Start-Process -FilePath $nav -ArgumentList $args_
Write-Host ""
Write-Host "  Se abrio la estacion. SOLO ESTA VEZ:" -ForegroundColor Yellow
Write-Host "   1. Poner la clave de las luces."
Write-Host "   2. En 'Entrada', elegir la entrada de linea donde llega la mezcla (la barrita verde se mueve)."
Write-Host "  Desde ahi queda fija: no hay que volver a tocarla."
