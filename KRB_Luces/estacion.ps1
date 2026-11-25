# ============================================================
#  LUCES KRB - ESTACION DE RITMO (se instala UNA vez, en el computador donde entra la mezcla, el de OBS)
#  Queda corriendo SOLA y en segundo plano cada vez que se prende el computador, sin ventanas ni preguntas:
#  - entra sola con la clave (se pregunta aqui una sola vez),
#  - escucha la entrada de linea elegida aqui y manda el ritmo a las luces,
#  - el navegador no la frena aunque no se vea, y si se cierra o se cae, se vuelve a abrir.
#  El DJ maneja las escenas desde su celular, por todo el local.
# ============================================================
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:LOCALAPPDATA "KRB_Estacion"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false

Write-Host ""
Write-Host "  LUCES KRB - estacion de ritmo (solo esta vez se pregunta la clave)" -ForegroundColor Yellow
Write-Host ""

# 1) Direccion de las luces: si la suite corre en este mismo computador, por localhost; si no, por internet
$enEste = Test-Path (Join-Path $env:USERPROFILE "KRB_Luces\krb_luces.ps1")
$porDefecto = if ($enEste) { "http://localhost:8080" } else { "https://luces.krbstage.cl" }
Write-Host "  1) Direccion de las luces: $porDefecto  (Enter para usarla)"
$base = (Read-Host "     Direccion").Trim().TrimEnd('/')
if ($base -eq "") { $base = $porDefecto }

# 2) Clave de las luces (queda guardada en este computador para entrar sola)
$sec = Read-Host "  2) Clave de las luces (Enter si no tiene)" -AsSecureString
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

# 3) Entrada de audio: SIEMPRE la entrada de linea del computador (Cote, 25 nov), sin preguntar
$ents = @(Get-PnpDevice -Class AudioEndpoint -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -like "*{0.0.1.00000000}*" -and $_.Status -eq "OK" } | ForEach-Object { $_.FriendlyName })
$entrada = $ents | Where-Object { $_ -match "l.nea|line" } | Select-Object -First 1
if ($entrada) { Write-Host "  3) Entrada de linea: $entrada" -ForegroundColor Green }
else {
  # sin nombre todavia (o deshabilitada en Windows): la pagina la busca sola por "linea" / "line" cada vez que parte
  $entrada = "linea"
  Write-Host "  3) No se encontro la entrada de linea activa en Windows. La estacion la buscara sola al partir." -ForegroundColor DarkYellow
  Write-Host "     Si no aparece: Configuracion > Sonido > Entrada > habilitar 'Entrada de linea' / 'Line In'." -ForegroundColor DarkYellow
}

# 4) Navegador: Edge (viene con Windows) o Chrome
$nav = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $nav) { throw "No se encontro Edge ni Chrome en este computador." }

# 5) Pagina de arranque (solo en este computador): espera al Dell y entra sola con la clave
$ir = "/dj?estacion=1&entrada=" + [Uri]::EscapeDataString($entrada)
$jsTxt = { param($t) ($t -replace '\\', '\\' -replace '"', '\"' -replace '<', '<') }
$arranque = @"
<!doctype html><meta charset="utf-8"><title>Estacion de ritmo KRB</title>
<body style="margin:0;background:#0c0d10;color:#eceef2;font:16px system-ui;display:grid;place-items:center;height:100vh;text-align:center">
<div><b style="font-size:20px">Estacion de ritmo KRB</b><p id="t">Conectando con las luces...</p></div>
<form id="f" method="post"><input type="hidden" name="clave" id="c"></form>
<script>
var base = "$(& $jsTxt $base)", ir = "$(& $jsTxt $ir)", clave = "$(& $jsTxt $clave)", n = 0;
function entrar(){ var f = document.getElementById('f'); document.getElementById('c').value = clave;
  f.action = base + '/api/login?ir=' + encodeURIComponent(ir); f.submit(); }
function probar(){ n++; document.getElementById('t').textContent = 'Conectando con las luces... (intento ' + n + ')';
  fetch(base + '/api/dj?' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).then(entrar).catch(function(){ setTimeout(probar, 5000); }); }
probar();
</script>
"@
$pArranque = Join-Path $dir "arranque.html"
[IO.File]::WriteAllText($pArranque, $arranque, $utf8)

# 6) Vigilante: abre el navegador fuera de la pantalla (no se ve, pero corre de verdad) y lo vuelve a abrir si se cierra
$perfil = Join-Path $dir "perfil"
$comun = "--user-data-dir=""$perfil"" --app=""file:///" + ($pArranque -replace '\\', '/') + """ --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --hide-crash-restore-bubble --no-first-run --no-default-browser-check --window-size=480,860"
$vbs = @"
' LUCES KRB - estacion de ritmo en segundo plano: abre el navegador fuera de la pantalla y lo vuelve a abrir si se cierra.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
n = 0
For Each p In wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='wscript.exe'")
  If Not IsNull(p.CommandLine) Then
    If InStr(LCase(p.CommandLine), "estacion.vbs") > 0 Then n = n + 1
  End If
Next
If n > 1 Then WScript.Quit
Do
  If fso.FileExists("$dir\detenida.txt") Then WScript.Quit
  vivo = False
  For Each p In wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='$(Split-Path $nav -Leaf)'")
    If Not IsNull(p.CommandLine) Then
      If InStr(LCase(p.CommandLine), "krb_estacion") > 0 Then vivo = True
    End If
  Next
  If Not vivo Then sh.Run """$nav"" $($comun.Replace('"', '""')) --window-position=-32000,-32000", 0, False
  WScript.Sleep 30000
Loop
"@
$pVbs = Join-Path $dir "estacion.vbs"
[IO.File]::WriteAllText($pVbs, $vbs, (New-Object Text.UnicodeEncoding $false, $true))

# VER: muestra la estacion en pantalla (para revisar); al reiniciar el computador vuelve a quedar oculta
$ver = @"
@echo off
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { `$_.CommandLine -like '*KRB_Estacion*' -and `$_.Name -ne 'powershell.exe' -and `$_.Name -ne 'wscript.exe' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }"
start "" "$nav" $comun --window-position=100,60
"@
[IO.File]::WriteAllText((Join-Path $dir "VER_ESTACION.bat"), $ver.Replace("`n", "`r`n"), (New-Object Text.UTF8Encoding $false))

# 7) Arranque automatico al prender el computador (sin ventana) + acceso para verla en el Escritorio
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Startup")) "Estacion de ritmo KRB.lnk"))
$s.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"; $s.Arguments = '"' + $pVbs + '"'; $s.WorkingDirectory = $dir
$s.Description = "Luces KRB - estacion de ritmo (en segundo plano)"; $s.Save()
$s = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Ver estacion de ritmo KRB.lnk"))
$s.TargetPath = Join-Path $dir "VER_ESTACION.bat"; $s.WorkingDirectory = $dir
$s.Description = "Muestra la estacion de ritmo en pantalla (para revisar)"; $s.Save()
# Si habia un acceso directo de la version anterior (ventana visible), se quita
Remove-Item (Join-Path ([Environment]::GetFolderPath("Desktop")) "Estacion de ritmo KRB.lnk") -ErrorAction SilentlyContinue

# 8) Partir ahora: se cierra la anterior y queda corriendo oculta
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*KRB_Estacion*" -and $_.Name -ne "powershell.exe" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800
Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $pVbs + '"')
Write-Host ""
Write-Host "  LISTO. La estacion de ritmo quedo corriendo en segundo plano y se abre sola al prender el computador." -ForegroundColor Green
Write-Host "  No hay que hacer nada mas. Para revisarla: 'Ver estacion de ritmo KRB' en el Escritorio."
Write-Host "  En el celular del DJ (https://luces.krbstage.cl/dj) debe aparecer 'Ritmo desde la estacion'."
