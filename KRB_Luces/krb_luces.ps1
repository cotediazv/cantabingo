# ============================================================
#  LUCES KRB - servidor DMX para el Dell (Windows)
#  Recibe ordenes del iPad por WiFi y las envia al cable USB a DMX 512.
#  No necesita instalar nada: usa PowerShell y .NET que ya vienen en Windows.
#  Se inicia con INICIAR.bat (doble clic).
# ============================================================
param([string]$Config = "")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$configDada = $Config -ne ""

# UNA SOLA CARPETA (Kennedy, 25 nov: la calibracion quedo en una copia y despues se abrio otra que no la tenia).
# La suite corre siempre desde C:\Users\<usuario>\KRB_Luces, que guarda la calibracion (datos.json) y la clave.
# Si se abre INICIAR.bat desde otra carpeta (el ZIP bajado, el Escritorio), primero se actualiza esa carpeta
# (sin borrar la calibracion ni la clave) y la suite se abre desde alla.
$casa = Join-Path $env:USERPROFILE "KRB_Luces"
if (-not $configDada -and (Resolve-Path $root).Path.TrimEnd('\') -ne $casa.TrimEnd('\')) {
  Write-Host ""
  Write-Host "  Esta copia esta en otra carpeta: se actualiza $casa y la suite se abre desde alla." -ForegroundColor Yellow
  & (Join-Path $root "instalar.ps1") -NoArrancar
  Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + (Join-Path $casa "INICIAR_OCULTO.vbs") + '"') -WorkingDirectory $casa
  exit
}

# Si ya habia otra copia de la suite abierta (de esta o de CUALQUIER otra carpeta, tambien la oculta), se cierra:
# dos copias se pelean el cable USB-DMX y cada una guarda su propia calibracion (Kennedy, 24 y 25 nov).
try {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like "*krb_luces.ps1*" -and
    (($configDada -and $_.CommandLine -like "*$Config*") -or (-not $configDada -and $_.CommandLine -notlike "*-Config*"))
  } | ForEach-Object {
    Write-Host ("  Se cerro una copia anterior de la suite (proceso " + $_.ProcessId + ").") -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
} catch {}

# Calibracion: si aca no hay, se busca la mas reciente que haya quedado en otra carpeta y se recupera
if (-not $configDada) { try { & (Join-Path $root "instalar.ps1") -SoloRecuperar } catch {} }

# Corre oculta: lo que muestra la ventana queda tambien en registro.txt (para revisar si algo falla)
if (-not $configDada) { try { Start-Transcript -Path (Join-Path $root "registro.txt") -Force | Out-Null } catch {} }

if ($Config -eq "") { $Config = Join-Path $root "luces.json" }
$cfg = Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json

$cs = @'
using System;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace KRB {

  // ---------- Cable FTDI por su driver propio (ftd2xx.dll), como Freestyler ----------
  // Muchos cables USB-DMX baratos (FTDI) no crean un puerto COM: los programas como Freestyler les hablan
  // directo por el driver de FTDI. Si no hay puerto COM, la suite usa este camino.
  public static class Ftdi {
    [DllImport("ftd2xx.dll")] public static extern uint FT_CreateDeviceInfoList(ref uint n);
    [DllImport("ftd2xx.dll")] public static extern uint FT_Open(int idx, ref IntPtr h);
    [DllImport("ftd2xx.dll")] public static extern uint FT_Close(IntPtr h);
    [DllImport("ftd2xx.dll")] public static extern uint FT_ResetDevice(IntPtr h);
    [DllImport("ftd2xx.dll")] public static extern uint FT_SetBaudRate(IntPtr h, uint baud);
    [DllImport("ftd2xx.dll")] public static extern uint FT_SetDataCharacteristics(IntPtr h, byte bits, byte stop, byte parity);
    [DllImport("ftd2xx.dll")] public static extern uint FT_SetFlowControl(IntPtr h, ushort flow, byte xon, byte xoff);
    [DllImport("ftd2xx.dll")] public static extern uint FT_ClrRts(IntPtr h);
    [DllImport("ftd2xx.dll")] public static extern uint FT_Purge(IntPtr h, uint mask);
    [DllImport("ftd2xx.dll")] public static extern uint FT_SetBreakOn(IntPtr h);
    [DllImport("ftd2xx.dll")] public static extern uint FT_SetBreakOff(IntPtr h);
    [DllImport("ftd2xx.dll")] public static extern uint FT_Write(IntPtr h, byte[] buf, uint len, ref uint escritos);
  }

  // ---------- Cable uDMX (Anyma, USB 16C0:05DC) por WinUSB ----------
  // El uDMX no es FTDI ni crea puerto COM: genera el DMX solo y recibe los canales por "control transfers" USB.
  // Necesita el driver WinUSB (viene con Windows), asignado una vez con la herramienta Zadig.
  public static class UDmx {
    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVICE_INTERFACE_DATA { public int cbSize; public Guid InterfaceClassGuid; public int Flags; public IntPtr Reserved; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct SETUP { public byte RequestType; public byte Request; public ushort Value; public ushort Index; public ushort Length; }
    [DllImport("setupapi.dll", SetLastError = true)] static extern IntPtr SetupDiGetClassDevs(ref Guid g, IntPtr enumerador, IntPtr ventana, int flags);
    [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr info, ref Guid g, int i, ref SP_DEVICE_INTERFACE_DATA d);
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceInterfaceDetailW(IntPtr set, ref SP_DEVICE_INTERFACE_DATA d, IntPtr detalle, int tam, ref int req, IntPtr info);
    [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateFileW(string nombre, uint acceso, uint compartir, IntPtr seg, uint disp, uint flags, IntPtr plantilla);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("winusb.dll", SetLastError = true)] static extern bool WinUsb_Initialize(IntPtr dev, ref IntPtr iface);
    [DllImport("winusb.dll")] static extern bool WinUsb_Free(IntPtr iface);
    [DllImport("winusb.dll", SetLastError = true)] static extern bool WinUsb_ControlTransfer(IntPtr iface, SETUP setup, byte[] buf, uint largo, ref uint pasados, IntPtr ov);

    // libusb-win32 (libusb0.dll): el driver que recomienda el fabricante del uDMX. Con WinUSB algunos uDMX
    // quedan con "codigo 10" en Windows; con libusb-win32 funcionan. Se instala tambien con Zadig.
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern void usb_init();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern int usb_find_busses();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern int usb_find_devices();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr usb_get_busses();
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr usb_open(IntPtr dev);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern int usb_close(IntPtr h);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern int usb_set_configuration(IntPtr h, int conf);
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern int usb_control_msg(IntPtr h, int tipo, int pedido, int valor, int indice, byte[] datos, int largo, int espera);
    static IntPtr lusb = IntPtr.Zero;

    // Busca el uDMX con libusb-win32. Estructuras de lusb0_usb.h (LIBUSB_PATH_MAX = 512):
    // usb_bus { next, prev, dirname[512], devices, ... }   usb_device { next, prev, filename[512], bus, descriptor{...idVendor en +8, idProduct en +10} }
    static string AbrirLibusb() {
      try {
        usb_init(); usb_find_busses(); usb_find_devices();
        int P = IntPtr.Size, ofDevices = 2 * P + 512, ofDesc = 3 * P + 512;
        int vistos = 0;
        for (IntPtr bus = usb_get_busses(); bus != IntPtr.Zero; bus = Marshal.ReadIntPtr(bus)) {
          for (IntPtr dev = Marshal.ReadIntPtr(bus, ofDevices); dev != IntPtr.Zero; dev = Marshal.ReadIntPtr(dev)) {
            vistos++;
            int vid = (ushort)Marshal.ReadInt16(dev, ofDesc + 8), pid = (ushort)Marshal.ReadInt16(dev, ofDesc + 10);
            if (vid != 0x16C0 || pid != 0x05DC) continue;
            IntPtr h = usb_open(dev);
            if (h == IntPtr.Zero) return "libusb-win32 ve el uDMX pero no lo pudo abrir";
            usb_set_configuration(h, 1);
            lusb = h; return null;
          }
        }
        return "libusb-win32 no ve un uDMX (" + vistos + " dispositivos con ese driver)";
      } catch (DllNotFoundException) { return "libusb-win32 no esta instalado"; }
      catch (Exception e) { return "libusb-win32: " + e.Message; }
    }

    static IntPtr archivo = IntPtr.Zero, iface = IntPtr.Zero;
    public static bool Abierto { get { return iface != IntPtr.Zero || lusb != IntPtr.Zero; } }
    public static string Driver { get { return lusb != IntPtr.Zero ? "libusb-win32" : "WinUSB"; } }

    // Abre el primer uDMX: primero con WinUSB y, si no, con libusb-win32. Devuelve null si quedo listo, o el motivo si no.
    public static string Abrir() {
      string w = AbrirWinUsb();
      if (w == null) return null;
      string l = AbrirLibusb();
      if (l == null) return null;
      return "WinUSB: " + w + " / " + l;
    }
    static string AbrirWinUsb() {
      Cerrar();
      Guid usb = new Guid("A5DCBF10-6530-11D2-901F-00C04FB951ED");     // interfaz de todos los dispositivos USB con driver
      IntPtr set = SetupDiGetClassDevs(ref usb, IntPtr.Zero, IntPtr.Zero, 0x12);   // PRESENT | DEVICEINTERFACE
      if (set == new IntPtr(-1)) return "no se pudo listar los dispositivos USB";
      string ruta = null; int revisados = 0;
      try {
        for (int i = 0; ; i++) {
          SP_DEVICE_INTERFACE_DATA d = new SP_DEVICE_INTERFACE_DATA(); d.cbSize = Marshal.SizeOf(d);
          if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref usb, i, ref d)) break;
          revisados++;
          int req = 0; SetupDiGetDeviceInterfaceDetailW(set, ref d, IntPtr.Zero, 0, ref req, IntPtr.Zero);
          if (req <= 0) continue;
          IntPtr buf = Marshal.AllocHGlobal(req);
          try {
            Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
            if (SetupDiGetDeviceInterfaceDetailW(set, ref d, buf, req, ref req, IntPtr.Zero)) {
              string p = Marshal.PtrToStringUni(new IntPtr(buf.ToInt64() + 4));
              if (p != null && p.ToLower().Contains("vid_16c0&pid_05dc")) { ruta = p; break; }
            }
          } finally { Marshal.FreeHGlobal(buf); }
        }
      } finally { SetupDiDestroyDeviceInfoList(set); }
      if (ruta == null) return VistoSinDriver() ? "no lo usa (el uDMX esta enchufado pero sin WinUSB funcionando)" : "no hay un uDMX (" + revisados + " dispositivos USB revisados)";
      IntPtr h = CreateFileW(ruta, 0xC0000000, 3, IntPtr.Zero, 3, 0x40000080, IntPtr.Zero);   // lectura/escritura, OPEN_EXISTING, OVERLAPPED
      if (h == new IntPtr(-1)) return "no se pudo abrir el uDMX (error " + Marshal.GetLastWin32Error() + "; esta abierto en otro programa?)";
      IntPtr w = IntPtr.Zero;
      if (!WinUsb_Initialize(h, ref w)) { int err = Marshal.GetLastWin32Error(); CloseHandle(h); return "el uDMX no tiene el driver WinUSB (error " + err + "): instalarlo con Zadig"; }
      archivo = h; iface = w; return null;
    }
    // Se enchufo alguna vez un uDMX (aunque no tenga driver)?
    static bool VistoSinDriver() {
      try { using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\USB\VID_16C0&PID_05DC")) { return k != null; } } catch { return false; }
    }
    public static void Cerrar() {
      try { if (iface != IntPtr.Zero) WinUsb_Free(iface); } catch {}
      try { if (archivo != IntPtr.Zero) CloseHandle(archivo); } catch {}
      try { if (lusb != IntPtr.Zero) usb_close(lusb); } catch {}
      iface = IntPtr.Zero; archivo = IntPtr.Zero; lusb = IntPtr.Zero;
      previo = new byte[513]; maxUsado = 0; ultimoEnvio = DateTime.MinValue;   // al volver a abrir, se manda todo de nuevo
    }
    // Envio al uDMX (Kennedy, 24 nov): el uDMX es USB de baja velocidad y no le gustan los paquetes grandes.
    // Se mandan solo los canales en uso (hasta el ultimo distinto de 0), en paquetes de 128, y solo cuando algo
    // cambia (mas un refresco cada 1 s). El uDMX sigue repitiendo solo los ultimos valores que recibio.
    static byte[] previo = new byte[513];
    static int maxUsado = 0;
    static DateTime ultimoEnvio = DateTime.MinValue;
    public static string UltimoError = "";
    [DllImport("libusb0.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr usb_strerror();
    public static bool Enviar(byte[] frame) {
      int hasta = maxUsado;
      for (int i = 512; i > hasta; i--) if (frame[i] != 0) { hasta = i; break; }
      maxUsado = hasta;
      bool cambio = false;
      for (int i = 1; i <= hasta; i++) if (frame[i] != previo[i]) { cambio = true; break; }
      if (!cambio && (DateTime.UtcNow - ultimoEnvio).TotalMilliseconds < 1000) return true;
      int n = Math.Max(hasta, 1);
      for (int ini = 0; ini < n; ini += 128) {
        int c = Math.Min(128, n - ini);
        byte[] datos = new byte[c]; Array.Copy(frame, 1 + ini, datos, 0, c);
        if (!Control(c, ini, datos)) return false;
      }
      Array.Copy(frame, previo, 513); ultimoEnvio = DateTime.UtcNow;
      return true;
    }
    // Comando 2 del uDMX (SetChannelRange): Value = cantidad de canales, Index = primer canal (desde 0), datos = valores
    static bool Control(int cant, int inicio, byte[] datos) {
      if (lusb != IntPtr.Zero) {
        int r = usb_control_msg(lusb, 0x40, 2, cant, inicio, datos, cant, 500);
        if (r < 0) { try { UltimoError = "libusb " + r + ": " + Marshal.PtrToStringAnsi(usb_strerror()); } catch { UltimoError = "libusb " + r; } return false; }
        return true;
      }
      if (iface == IntPtr.Zero) { UltimoError = "uDMX cerrado"; return false; }
      SETUP s = new SETUP(); s.RequestType = 0x40; s.Request = 2; s.Value = (ushort)cant; s.Index = (ushort)inicio; s.Length = (ushort)cant;
      uint pasados = 0;
      if (!WinUsb_ControlTransfer(iface, s, datos, (uint)cant, ref pasados, IntPtr.Zero)) { UltimoError = "WinUSB error " + Marshal.GetLastWin32Error(); return false; }
      return true;
    }
  }

  // ---------- Registro de cada noche (Cote, 25 nov): que escenas y momentos se usaron, a que hora y si fallo el cable ----------
  // Un archivo por noche en registro-noches\AAAA-MM-DD.txt. La noche va de las 6 de la manana a las 6 de la manana
  // siguiente: lo que pasa despues de medianoche queda en la noche que empezo el dia anterior.
  public static class Bitacora {
    public static string Carpeta = "";
    static readonly object BL = new object();
    static string ultimo = "";
    public static string Noche(DateTime t) { return t.AddHours(-6).ToString("yyyy-MM-dd"); }
    public static void Anotar(string texto) {
      if (Carpeta == "" || string.IsNullOrEmpty(texto)) return;
      try {
        lock (BL) {
          DateTime ahora = DateTime.Now;
          if (texto == ultimo) return;                       // sin repetir la misma linea seguida
          ultimo = texto;
          string dir = Path.Combine(Carpeta, "registro-noches"); Directory.CreateDirectory(dir);
          File.AppendAllText(Path.Combine(dir, Noche(ahora) + ".txt"), ahora.ToString("HH:mm:ss") + "  " + texto.Replace("\r", " ").Replace("\n", " ") + "\r\n", new UTF8Encoding(false));
        }
      } catch {}
    }
    public static string Leer(string noche) {
      try { string f = Path.Combine(Path.Combine(Carpeta, "registro-noches"), noche + ".txt"); return File.Exists(f) ? File.ReadAllText(f) : ""; } catch { return ""; }
    }
    public static string[] Noches() {
      try { string dir = Path.Combine(Carpeta, "registro-noches"); if (!Directory.Exists(dir)) return new string[0];
        List<string> r = new List<string>(); foreach (string f in Directory.GetFiles(dir, "*.txt")) r.Add(Path.GetFileNameWithoutExtension(f));
        r.Sort(); r.Reverse(); return r.ToArray(); } catch { return new string[0]; }
    }
  }

  // ---------- Aviso al celular (Cote, 25 nov): si se desconecta el cable DMX en horario de funcionamiento ----------
  // Llega como notificacion de la app ntfy (gratis, sin cuenta). El tema (como una clave) se crea al azar en el Dell
  // y queda en aviso-celular.txt, nunca en el repositorio. Horario: jueves, viernes y sabado de 18:30 a 00:30.
  public static class Aviso {
    public static string Tema = "";
    public static int[] Dias = new int[] { 4, 5, 6 };          // dia en que empieza la noche: 4 jueves, 5 viernes, 6 sabado
    public static int Desde = 18 * 60 + 30, Hasta = 24 * 60 + 30; // minutos desde la medianoche del dia de la noche
    public static bool EnHorario(DateTime t) {
      DateTime d = t.AddHours(-6).Date;                        // lo de despues de medianoche es de la noche anterior
      double m = (t - d).TotalMinutes;
      return Array.IndexOf(Dias, (int)d.DayOfWeek) >= 0 && m >= Desde && m < Hasta;
    }
    // Horario de actividades con margen (media hora antes, una hora despues): ahi el Dell no busca actualizaciones ni se reinicia
    public static bool EnActividad(DateTime t) { return EnHorario(t.AddMinutes(30)) || EnHorario(t.AddMinutes(-60)); }
    public static void Mandar(string texto, bool urgente) {
      if (Tema == "") return;
      string tema = Tema;
      new Thread(() => {
        for (int i = 0; i < 4; i++) {
          try {
            ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;   // TLS 1.2
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create("https://ntfy.sh/" + tema);
            r.Method = "POST"; r.Timeout = 15000;
            r.Headers["Title"] = "Luces KRB";
            r.Headers["Priority"] = urgente ? "high" : "default";
            r.Headers["Tags"] = urgente ? "warning" : "white_check_mark";
            byte[] b = Encoding.UTF8.GetBytes(texto); r.ContentType = "text/plain; charset=utf-8"; r.ContentLength = b.Length;
            using (Stream o = r.GetRequestStream()) o.Write(b, 0, b.Length);
            using (WebResponse w = r.GetResponse()) {}
            Bitacora.Anotar("Aviso al celular enviado: " + texto); return;
          } catch { Thread.Sleep(20000); }
        }
        Bitacora.Anotar("No se pudo mandar el aviso al celular (sin internet?): " + texto);
      }) { IsBackground = true }.Start();
    }
  }

  // ---------- OBS: transmite solo en su horario (Cote, 27 nov: «jueves a sabado de 20 a 00:30 hrs») ----------
  // El programa de luces le habla a OBS por su servidor WebSocket (viene con OBS 28 o mas nuevo; se activa una vez en
  // OBS > Herramientas > Ajustes del servidor WebSocket). La clave de OBS se escribe en el panel de luces y queda en
  // obs.txt (nunca en el repositorio). A las 20:00 parte y a las 00:30 para. Si OBS se cae y se vuelve a abrir dentro del
  // horario, vuelve a partir; si alguien la detiene a mano dentro del horario, no se vuelve a prender.
  public static class Obs {
    public static string Clave = "", Archivo = "", Estado = "sin configurar";
    public static bool Transmitiendo = false;
    public const string Horario = "jueves, viernes y sabado de 20:00 a 00:30";
    static int previo = -1;             // -1: no se sabe; 0: fuera del horario; 1: dentro
    static bool caido = true;           // la ultima vez OBS no respondio
    static bool transmitiaAlCaer = false;
    static readonly object OL = new object();
    public static bool EnHorario(DateTime t) {
      DateTime d = t.AddHours(-6).Date; double m = (t - d).TotalMinutes; int dw = (int)d.DayOfWeek;
      return (dw == 4 || dw == 5 || dw == 6) && m >= 20 * 60 && m < 24 * 60 + 30;
    }
    static string B64Sha(string x) { using (System.Security.Cryptography.SHA256 h = System.Security.Cryptography.SHA256.Create()) return Convert.ToBase64String(h.ComputeHash(Encoding.UTF8.GetBytes(x))); }
    static string Recibir(System.Net.WebSockets.ClientWebSocket ws) {
      byte[] buf = new byte[65536]; StringBuilder sb = new StringBuilder();
      while (true) {
        var t = ws.ReceiveAsync(new ArraySegment<byte>(buf), CancellationToken.None);
        if (!t.Wait(5000)) throw new Exception("OBS no contesto");
        sb.Append(Encoding.UTF8.GetString(buf, 0, t.Result.Count));
        if (t.Result.EndOfMessage) return sb.ToString();
      }
    }
    static void Mandar(System.Net.WebSockets.ClientWebSocket ws, string j) {
      byte[] b = Encoding.UTF8.GetBytes(j);
      if (!ws.SendAsync(new ArraySegment<byte>(b), System.Net.WebSockets.WebSocketMessageType.Text, true, CancellationToken.None).Wait(5000)) throw new Exception("no se pudo mandar a OBS");
    }
    static string Campo(string j, string k) { var m = System.Text.RegularExpressions.Regex.Match(j, "\"" + k + "\"\\s*:\\s*\"([^\"]*)\""); return m.Success ? m.Groups[1].Value : null; }
    // Una conexion corta por cada pedido (OBS 5: Hello -> Identify -> Identified -> Request -> Response)
    // Consulta libre para el diagnostico del Dell (estadisticas, codificador, etc.). Nunca cambia nada en OBS.
    public static string Consultar(string tipo, string datos) { try { return Pedir(tipo, datos); } catch (Exception e) { return "{\"error\":\"" + (e.InnerException != null ? e.InnerException.Message : e.Message).Replace("\"", "'") + "\"}"; } }
    static string Pedir(string tipo) { return Pedir(tipo, null); }
    static string Pedir(string tipo, string datos) {
      using (System.Net.WebSockets.ClientWebSocket ws = new System.Net.WebSockets.ClientWebSocket()) {
        if (!ws.ConnectAsync(new Uri("ws://127.0.0.1:4455"), CancellationToken.None).Wait(4000)) throw new Exception("OBS no esta abierto o su servidor WebSocket esta apagado");
        string hola = Recibir(ws), auth = "";
        string ch = Campo(hola, "challenge"), sal = Campo(hola, "salt");
        if (ch != null && sal != null) { if (Clave == "") throw new Exception("falta la clave de OBS"); auth = ",\"authentication\":\"" + B64Sha(B64Sha(Clave + sal) + ch) + "\""; }
        Mandar(ws, "{\"op\":1,\"d\":{\"rpcVersion\":1" + auth + "}}");
        string id = Recibir(ws); if (id.IndexOf("\"op\":2") < 0 && id.IndexOf("\"op\": 2") < 0) throw new Exception("OBS no acepto la clave");
        Mandar(ws, "{\"op\":6,\"d\":{\"requestType\":\"" + tipo + "\",\"requestId\":\"krb\"" + (datos != null ? ",\"requestData\":" + datos : "") + "}}");
        string r = Recibir(ws);
        try { ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).Wait(1000); } catch {}
        return r;
      }
    }
    // Cote (28 nov): «OBS no partio solo a las 20:00». Antes, si OBS rechazaba la orden de partir, se daba por hecha y no se
    // volvia a intentar. Ahora: al entrar al horario queda «por partir» y se insiste cada 10 s hasta que OBS confirma que esta
    // transmitiendo (y se anota el motivo si OBS dice que no); igual al terminar el horario, hasta que confirma que paro.
    static bool porPartir = false, porParar = false; static int intentos = 0;
    public static DateTime? Reloj = null;                    // solo para probar (null = la hora real)
    static string Resultado(string r) {                    // null si OBS dijo que si; si no, su motivo
      if (System.Text.RegularExpressions.Regex.IsMatch(r, "\"result\"\\s*:\\s*true")) return null;
      string c = Campo(r, "comment"); var m = System.Text.RegularExpressions.Regex.Match(r, "\"code\"\\s*:\\s*(\\d+)");
      return (c ?? "sin detalle") + (m.Success ? " (codigo " + m.Groups[1].Value + ")" : "");
    }
    public static void Revisar() {
      lock (OL) {
        bool debe = EnHorario(Reloj ?? DateTime.Now); int ahora = debe ? 1 : 0;
        try {
          string r = Pedir("GetStreamStatus");
          Transmitiendo = System.Text.RegularExpressions.Regex.IsMatch(r, "\"outputActive\"\\s*:\\s*true");
          if (debe && previo != 1) { porPartir = true; porParar = false; intentos = 0; }          // entro al horario (o el programa partio dentro)
          if (!debe && previo == 1) { porParar = true; porPartir = false; intentos = 0; }        // termino el horario
          // «si se cierra OBS y se vuelve a abrir, que se ponga a transmitir de nuevo»
          if (caido && !Transmitiendo && (debe || transmitiaAlCaer)) { porPartir = true; intentos = 0; Bitacora.Anotar("OBS: se volvio a abrir; se retoma la transmision"); }
          if (porPartir) {
            if (Transmitiendo) { porPartir = false; Bitacora.Anotar("OBS: transmitiendo (confirmado por OBS)"); }
            else { intentos++; string no = Resultado(Pedir("StartStream"));
              if (no == null) Bitacora.Anotar("OBS: se pidio partir la transmision (intento " + intentos + ")");
              else if (intentos <= 3 || intentos % 30 == 0) Bitacora.Anotar("OBS NO PARTIO la transmision (intento " + intentos + "): " + no); }
          }
          if (porParar) {
            if (!Transmitiendo) { porParar = false; Bitacora.Anotar("OBS: transmision detenida (horario: " + Horario + ")"); }
            else { intentos++; string no = Resultado(Pedir("StopStream"));
              if (no != null && (intentos <= 3 || intentos % 30 == 0)) Bitacora.Anotar("OBS NO PARO la transmision (intento " + intentos + "): " + no); }
          }
          // Cote (28 nov): «que OBS no grabe cuando transmite» (llenaba el disco). Si esta grabando mientras transmite, se detiene
          if (Transmitiendo) { string rg = Pedir("GetRecordStatus");
            if (System.Text.RegularExpressions.Regex.IsMatch(rg, "\"outputActive\"\\s*:\\s*true")) { Pedir("StopRecord"); Bitacora.Anotar("OBS estaba grabando mientras transmitia: se detuvo la grabacion (para no llenar el disco)"); } }
          if (caido) Bitacora.Anotar("OBS: conectado con el programa de luces");
          caido = false; previo = ahora;
          Estado = "conectado" + (porPartir ? " (intentando partir: " + intentos + " intentos)" : "");
        } catch (Exception e) {
          string m = e.InnerException != null ? e.InnerException.Message : e.Message;
          if (!caido) { Bitacora.Anotar("OBS: no responde (" + m + ")"); transmitiaAlCaer = Transmitiendo || porPartir; }
          caido = true; Estado = m;
        }
      }
    }
    // OBS se abre solo si se cerro (Cote, 28 nov: «que todo funcione en el show… que el Dell no se caiga»): si en su horario (o
    // si estaba transmitiendo) OBS lleva 20 s sin responder y no esta abierto, el Dell lo abre de nuevo, sin la pantalla de
    // «modo seguro» que OBS muestra despues de caerse, y pide transmitir. Como mucho un intento por minuto. Avisa al celular.
    static DateTime caidoDesde = DateTime.MinValue, ultimoAbrir = DateTime.MinValue;
    static string RutaObs() {
      string[] c = { @"C:\Program Files\obs-studio\bin\64bit\obs64.exe", @"C:\Program Files (x86)\obs-studio\bin\64bit\obs64.exe" };
      foreach (string x in c) if (File.Exists(x)) return x;
      try { using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\OBS Studio")) { string d = k == null ? null : k.GetValue("") as string; if (d != null && File.Exists(Path.Combine(d, @"bin\64bit\obs64.exe"))) return Path.Combine(d, @"bin\64bit\obs64.exe"); } } catch {}
      return null;
    }
    public static void Vigilar() {
      if (!caido) { caidoDesde = DateTime.MinValue; return; }
      if (caidoDesde == DateTime.MinValue) caidoDesde = DateTime.Now;
      bool debe = EnHorario(Reloj ?? DateTime.Now);
      if (!(debe || transmitiaAlCaer) || Clave == "") return;
      if ((DateTime.Now - caidoDesde).TotalSeconds < 20 || (DateTime.Now - ultimoAbrir).TotalSeconds < 60) return;
      if (Process.GetProcessesByName("obs64").Length > 0) return;          // esta abierto (quizas cargando): no se toca
      string ruta = RutaObs(); if (ruta == null) { Estado = "OBS cerrado y no se encontro obs64.exe para abrirlo"; return; }
      ultimoAbrir = DateTime.Now;
      try {
        ProcessStartInfo pi = new ProcessStartInfo(ruta, "--disable-shutdown-check --startstreaming");
        pi.WorkingDirectory = Path.GetDirectoryName(ruta); pi.UseShellExecute = true; Process.Start(pi);
        Bitacora.Anotar("OBS estaba cerrado: el Dell lo abrio de nuevo y pidio transmitir");
        Aviso.Mandar("OBS se habia cerrado en el show. El Dell lo abrio de nuevo (" + DateTime.Now.ToString("HH:mm") + ").", true);
      } catch (Exception e) { Bitacora.Anotar("OBS: no se pudo abrir (" + e.Message + ")"); }
    }
    public static void Iniciar(string carpeta) {
      new Thread(() => { Thread.Sleep(15000); while (true) { try { RevisarStandby(); } catch {} Thread.Sleep(20000); } }) { IsBackground = true }.Start();
      Archivo = Path.Combine(carpeta, "obs.txt");
      try { if (File.Exists(Archivo)) Clave = File.ReadAllText(Archivo).Trim(); } catch {}
      new Thread(() => { Thread.Sleep(20000); while (true) { if (Clave != "" || File.Exists(Archivo)) { Revisar(); try { Vigilar(); } catch {} } Thread.Sleep(10000); } }) { IsBackground = true }.Start();
    }
    // Luces en Standby solas a las 19:00, jueves a sabado (Cote, 27 nov). Una vez por noche, hasta las 00:30; si el programa
    // parte dentro de ese rato (por ejemplo, despues de un corte de luz), tambien, porque el cable parte con todo apagado.
    static string standbyNoche = null;
    public static void RevisarStandby() {
      DateTime t = Reloj ?? DateTime.Now, d = t.AddHours(-6).Date; double m = (t - d).TotalMinutes; int dw = (int)d.DayOfWeek;
      string noche = d.ToString("yyyy-MM-dd");
      // la noche ya hecha queda en un archivo: si el programa se vuelve a abrir en pleno show, NO repite el Standby
      // (registro del 27 nov: se repitio a las 20:22 y 20:58, despues de que el programa se cerro solo)
      string marca = Path.Combine(Path.GetDirectoryName(Archivo) ?? ".", "standby-noche.txt");
      if (standbyNoche == null) { try { standbyNoche = File.Exists(marca) ? File.ReadAllText(marca).Trim() : ""; } catch { standbyNoche = ""; } }
      if ((dw == 4 || dw == 5 || dw == 6) && m >= 19 * 60 && m < 24 * 60 + 30 && standbyNoche != noche) {
        standbyNoche = noche; try { File.WriteAllText(marca, noche); } catch {}
        if (Web.MomentoProgramado("standby_inicio")) Bitacora.Anotar("Luces: Standby automatico de las 19:00");
      }
    }
    public static void GuardarClave(string c) {
      Clave = (c ?? "").Trim(); try { File.WriteAllText(Archivo, Clave); } catch {}
      Bitacora.Anotar("OBS: se guardo la clave del servidor WebSocket");
    }
  }

  // ---------- Efectos que corren en el Dell (siguen aunque el iPad se bloquee) ----------
  public class Efecto {
    public string Tipo;                       // "seno" o "sec"
    public int[] Ch; public double[] Centro; public double[] Amp; public double Periodo;
    public List<Dictionary<int, int>> Pasos; public double T; public double Fx;
    public double Inicio;
    public double Ritmo;                      // > 0: avanza con los golpes de la musica (golpes por paso o por vuelta)
    public long PulsoBase;
  }

  // ---------- Salida DMX: un universo de 512 canales, con fundidos ----------
  public static class Dmx {
    static double[] cur = new double[513];
    static double[] tgt = new double[513];
    static double[] rate = new double[513];        // unidades DMX por segundo
    static readonly object L = new object();
    static SerialPort port;
    static Thread th;
    public static string Tipo = "simulacion";
    public static string Puerto = "auto";
    public static string PuertoUsado = "";
    public static bool Conectado = false;
    public static string Error = "";
    public static long Tramas = 0;
    public static long Errores = 0;                 // envios fallidos (para ver en Probar canales)
    static Dictionary<string, Efecto> efectos = new Dictionary<string, Efecto>();
    static Stopwatch reloj = Stopwatch.StartNew();

    public static void PonerEfecto(string id, Efecto e) {
      lock (L) { e.Inicio = reloj.Elapsed.TotalSeconds; e.PulsoBase = Pulsos; efectos[id] = e; }
    }
    // Golpes de la musica (panel del DJ, 25 nov): el panel escucha el bombo y la caja y manda cada golpe.
    // Los efectos con Ritmo avanzan con los golpes; si dejan de llegar, siguen solos con su tiempo.
    public static long Pulsos = 0;
    static double ultimoPulso = -100, intervaloPulso = 0.5;
    public static void Pulsar() {
      lock (L) {
        double ahora = reloj.Elapsed.TotalSeconds, d = ahora - ultimoPulso;
        if (d > 0.2 && d < 2.0) intervaloPulso = intervaloPulso * 0.7 + d * 0.3;
        ultimoPulso = ahora; Pulsos++;
      }
    }
    public static double Bpm { get { return 60.0 / intervaloPulso; } }
    public static bool ConRitmo { get { return reloj.Elapsed.TotalSeconds - ultimoPulso < Math.Max(2.5, 3 * intervaloPulso); } }
    public static void QuitarEfecto(string id) { lock (L) { efectos.Remove(id); } }
    public static void QuitarEfectos() { lock (L) { efectos.Clear(); } }
    public static string[] Efectos() { lock (L) { return new List<string>(efectos.Keys).ToArray(); } }

    static void AplicarEfectos(byte[] frame) {
      double ahora = reloj.Elapsed.TotalSeconds;
      bool conRitmo = ahora - ultimoPulso < Math.Max(2.5, 3 * intervaloPulso);
      double fraccion = Math.Min(1, Math.Max(0, (ahora - ultimoPulso) / intervaloPulso));
      foreach (Efecto e in efectos.Values) {
        double t = ahora - e.Inicio;
        // con ritmo: cuantos golpes van desde que partio el efecto (con la fraccion hasta el proximo golpe)
        double golpes = (e.Ritmo > 0 && conRitmo) ? (Pulsos - e.PulsoBase - 1) + fraccion : -1;
        if (e.Tipo == "seno") {
          for (int k = 0; k < e.Ch.Length; k++) {
            double fase = golpes >= 0 ? golpes / e.Ritmo : t / Math.Max(0.5, e.Periodo);
            double v = e.Centro[k] + e.Amp[k] * Math.Sin(2 * Math.PI * (k + 1) * fase);
            Poner(frame, e.Ch[k], v);
          }
        } else if (e.Tipo == "sec" && e.Pasos.Count > 0) {
          int n = e.Pasos.Count;
          double pos = golpes >= 0 ? golpes / e.Ritmo : t / Math.Max(0.03, e.T);
          if (pos < 0) pos = 0;
          int i = (int)Math.Floor(pos) % n, j = (i + 1) % n;
          double frac = pos - Math.Floor(pos);
          double w = (e.Fx > 0 && frac > 1 - e.Fx) ? (frac - (1 - e.Fx)) / e.Fx : 0;
          HashSet<int> chs = new HashSet<int>();
          foreach (Dictionary<int, int> p in e.Pasos) foreach (int c in p.Keys) chs.Add(c);
          foreach (int c in chs) {
            if (c < 1 || c > 512) continue;
            int a, b;
            if (!e.Pasos[i].TryGetValue(c, out a)) a = frame[c];
            if (!e.Pasos[j].TryGetValue(c, out b)) b = frame[c];
            Poner(frame, c, a + (b - a) * w);
          }
        }
      }
    }
    static void Poner(byte[] frame, int c, double v) {
      if (c < 1 || c > 512) return;
      if (v < 0) v = 0; if (v > 255) v = 255;
      frame[c] = (byte)Math.Round(v);
    }

    public static void Start(string tipo, string puerto) {
      Tipo = tipo.ToLower(); Puerto = puerto;
      Abrir();
      th = new Thread(Loop); th.IsBackground = true; th.Start();
    }

    static IntPtr ftdi = IntPtr.Zero;              // cable abierto por el driver de FTDI (sin puerto COM)

    // Puerto COM de un cable USB (FTDI = \Device\VCPn; otros = USBSER). Asi "auto" no toma un COM de Bluetooth o de la placa.
    static string ComUsb() {
      try {
        using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DEVICEMAP\SERIALCOMM")) {
          if (k == null) return null;
          foreach (string n in k.GetValueNames()) {
            string v = k.GetValue(n) as string, u = n.ToUpper();
            if (v != null && (u.Contains("VCP") || u.Contains("USBSER") || u.Contains("SILABSER") || u.Contains("CH341"))) return v;
          }
        }
      } catch {}
      return null;
    }

    // Abre el primer cable FTDI por su driver (ftd2xx.dll): 250000 baudios, 8 bits, 2 de parada, sin paridad.
    static string AbrirFtdi() {
      try {
        uint n = 0; Ftdi.FT_CreateDeviceInfoList(ref n);
        if (n == 0) return "el driver de FTDI no ve ningun cable";
        IntPtr h = IntPtr.Zero;
        uint r = Ftdi.FT_Open(0, ref h);
        if (r != 0 || h == IntPtr.Zero) return "el driver de FTDI no pudo abrir el cable (codigo " + r + "; puede estar abierto en otro programa, como Freestyler)";
        Ftdi.FT_ResetDevice(h);
        Ftdi.FT_SetBaudRate(h, 250000);
        Ftdi.FT_SetDataCharacteristics(h, 8, 2, 0);
        Ftdi.FT_SetFlowControl(h, 0, 0, 0);
        Ftdi.FT_ClrRts(h);
        Ftdi.FT_Purge(h, 3);
        ftdi = h; return null;
      } catch (DllNotFoundException) { return "no esta instalado el driver de FTDI (ftd2xx.dll)"; }
      catch (Exception e) { return "driver de FTDI: " + e.Message; }
    }

    public static void Abrir() {
      lock (L) {
        try { if (port != null) port.Close(); } catch {}
        try { if (ftdi != IntPtr.Zero) Ftdi.FT_Close(ftdi); } catch {}
        try { UDmx.Cerrar(); } catch {}
        port = null; ftdi = IntPtr.Zero; Conectado = false; PuertoUsado = "";
        if (Tipo == "simulacion") { Error = ""; return; }
        try {
          string p = Puerto;
          bool auto = p == null || p == "" || p.ToLower() == "auto";
          // Sin puerto COM de un cable USB: primero un uDMX (el cable de Kennedy, 24 nov) y despues FTDI por su driver
          if (Tipo == "udmx" || Tipo != "enttec" && (p != null && (p.ToLower() == "ftdi" || p.ToLower() == "udmx") || auto && ComUsb() == null)) {
            string errU = (p != null && p.ToLower() == "ftdi") ? "no se busco" : UDmx.Abrir();
            if (errU == null) { PuertoUsado = "uDMX (" + UDmx.Driver + ")"; Conectado = true; Error = ""; return; }
            string err = (Tipo == "udmx" || p != null && p.ToLower() == "udmx") ? "no se busco" : AbrirFtdi();
            if (err == null) { PuertoUsado = "FTDI (driver directo)"; Conectado = true; Error = ""; return; }
            err = "uDMX: " + errU + ". FTDI: " + err;
            // Ya no se toma "el ultimo COM": en muchos computadores es un puerto de Bluetooth y falla con
            // "se agoto el tiempo de espera del semaforo". Se informa lo que hay para poder elegirlo a mano.
            string[] todos = SerialPort.GetPortNames();
            Error = "No se encontro el cable USB-DMX. Puertos COM: " + (todos.Length == 0 ? "ninguno" : string.Join(", ", todos)) +
                    " (ninguno es de un cable USB). " + err + ".";
            return;
          }
          if (auto) p = ComUsb();
          if (p == null) { Error = "No hay ningun puerto COM de un cable USB. Esta enchufado el cable USB-DMX?"; return; }
          SerialPort s;
          if (Tipo == "enttec") s = new SerialPort(p, 115200, Parity.None, 8, StopBits.One);
          else s = new SerialPort(p, 250000, Parity.None, 8, StopBits.Two);
          s.WriteTimeout = 1000;
          s.Open();
          port = s; PuertoUsado = p; Conectado = true; Error = "";
        } catch (Exception e) { Error = e.Message; }
      }
    }

    public static void Set(int ch, int v, double fade) {
      if (ch < 1 || ch > 512) return;
      if (v < 0) v = 0; if (v > 255) v = 255;
      lock (L) {
        tgt[ch] = v;
        if (fade <= 0) { cur[ch] = v; rate[ch] = 0; }
        else rate[ch] = Math.Abs(v - cur[ch]) / fade;
      }
    }

    public static void Todo(int v, double fade) { for (int i = 1; i <= 512; i++) Set(i, v, fade); }

    public static int[] Objetivo() {
      int[] r = new int[512];
      lock (L) { for (int i = 0; i < 512; i++) r[i] = (int)tgt[i + 1]; }
      return r;
    }

    static byte[] ultimo = new byte[513];       // lo ultimo enviado (con efectos)
    public static int[] Salida() {
      int[] r = new int[512];
      lock (L) { for (int i = 0; i < 512; i++) r[i] = ultimo[i + 1]; }
      return r;
    }

    public static volatile float Master = 1f;                  // 0 a 1
    public static int[] MasterCh = new int[0];                 // canales de intensidad (dimmer, o los colores si no hay dimmer)
    static double ultimaRevision = 0;
    static bool conectadoAntes = false, ritmoAntes = false; static string errorAntes = "";
    static DateTime sinCableDesde = DateTime.MinValue; static bool avisado = false;
    static void RevisarEstado() {
      Web.RevisarNocheMaster();
      if (Tipo == "simulacion") return;
      // Aviso al celular: si lleva 20 s sin cable (no por un tiron de un segundo) en horario de funcionamiento
      if (!Conectado) {
        if (sinCableDesde == DateTime.MinValue) sinCableDesde = DateTime.Now;
        if (!avisado && (DateTime.Now - sinCableDesde).TotalSeconds >= 20 && Aviso.EnHorario(DateTime.Now)) {
          avisado = true;
          Aviso.Mandar("Se desconect\u00f3 el cable de las luces (" + sinCableDesde.ToString("HH:mm") + "). Revisa el cable USB del Dell: desench\u00fafalo y vuelve a enchufarlo.", true);
        }
      } else {
        if (avisado) Aviso.Mandar("Volvi\u00f3 el cable de las luces (" + DateTime.Now.ToString("HH:mm") + "). Todo funcionando.", false);
        sinCableDesde = DateTime.MinValue; avisado = false;
      }
      if (Conectado != conectadoAntes) { Bitacora.Anotar(Conectado ? "Cable DMX conectado (" + PuertoUsado + ")" : "CABLE DMX DESCONECTADO" + (Error != "" ? ": " + Error : "")); conectadoAntes = Conectado; }
      if (Error != errorAntes) { if (Error != "") Bitacora.Anotar("Problema con el cable: " + Error); errorAntes = Error; }
      bool r = ConRitmo;
      if (r != ritmoAntes) { Bitacora.Anotar(r ? "Ritmo: llega la musica (" + Math.Round(Bpm) + " BPM)" : "Ritmo: dejaron de llegar los golpes de la musica"); ritmoAntes = r; }
    }
    static void Loop() {
      byte[] frame = new byte[513];               // frame[0] = codigo de inicio 0
      Stopwatch sw = Stopwatch.StartNew();
      double last = 0, ultimoIntento = 0;
      int fallos = 0;
      while (true) {
        double now = sw.Elapsed.TotalSeconds, dt = now - last; last = now;
        SerialPort s;
        lock (L) {
          for (int i = 1; i <= 512; i++) {
            double d = tgt[i] - cur[i];
            if (d != 0) {
              double paso = rate[i] * dt;
              if (rate[i] <= 0 || Math.Abs(d) <= paso) cur[i] = tgt[i];
              else cur[i] += Math.Sign(d) * paso;
            }
            frame[i] = (byte)Math.Round(cur[i]);
          }
          AplicarEfectos(frame);
          // Intensidad general (Cote, 26 nov: «no funciona»): se aplica aca, a la salida, para que baje TODO
          // (escenas, momentos de los juegos, efectos y escenas del DJ), no solo lo que manda el iPad directo
          if (Master < 0.999) { int[] mc = MasterCh; for (int k = 0; k < mc.Length; k++) { int c = mc[k]; if (c >= 1 && c <= 512) frame[c] = (byte)Math.Round(frame[c] * Master); } }
          Array.Copy(frame, ultimo, 513);
          s = port;
        }
        IntPtr fh = ftdi;
        if (now - ultimaRevision > 1) { ultimaRevision = now; RevisarEstado(); }
        // Si se perdio el cable (o fallo muchas veces), se vuelve a buscar solo cada 3 s
        if (!Conectado && Tipo != "simulacion" && now - ultimoIntento > 3) {
          ultimoIntento = now;
          try { Abrir(); if (Conectado) fallos = 0; } catch {}
        }
        if (UDmx.Abierto && Conectado) {              // uDMX: le manda los canales en uso; el DMX lo genera el cable
          try {
            if (!UDmx.Enviar(frame)) throw new Exception("uDMX: no recibio los canales (" + UDmx.UltimoError + ")");
            Tramas++; fallos = 0;
          } catch (Exception e) {
            Error = e.Message; Errores++;
            if (++fallos > 20) { Conectado = false; }
          }
          Thread.Sleep(20);
        }
        else if (fh != IntPtr.Zero && Conectado) {         // por el driver de FTDI: BREAK, MAB y la trama
          try {
            Ftdi.FT_SetBreakOn(fh); Thread.Sleep(1);
            Ftdi.FT_SetBreakOff(fh);
            uint esc = 0;
            uint r = Ftdi.FT_Write(fh, frame, 513, ref esc);
            if (r != 0) throw new Exception("FTDI: error al enviar (codigo " + r + "); se desenchufo el cable?");
            Tramas++; fallos = 0;
          } catch (Exception e) {
            Error = e.Message;
            if (++fallos > 20) { Conectado = false; }
          }
        }
        else if (s != null && Conectado) {
          try {
            if (Tipo == "enttec") {
              byte[] p = new byte[518];
              p[0] = 0x7E; p[1] = 6; p[2] = (byte)(513 & 0xFF); p[3] = (byte)(513 >> 8);
              Array.Copy(frame, 0, p, 4, 513); p[517] = 0xE7;
              s.Write(p, 0, p.Length);
            } else {
              s.BreakState = true;  Thread.Sleep(1);   // BREAK
              s.BreakState = false;                      // MAB
              s.Write(frame, 0, 513);
            }
            Tramas++; fallos = 0;
          } catch (Exception e) {
            Error = e.Message;
            if (++fallos > 20) { Conectado = false; }
          }
        }
        Thread.Sleep(Tipo == "enttec" ? 25 : 5);
      }
    }
  }

  // ---------- Servidor web minimo (sin permisos de administrador) ----------
  public static class Web {
    public static string Root;
    public static volatile bool PedirDiagnostico = false;
    public static string ConfigPath;
    public static string Clave = "";               // vacia = sin clave
    public static bool PedirEnWifiLocal = false;    // false = en el WiFi del local no se pide clave
    public static string Sala = "kennedy";          // los momentos que traen &sala= solo se aceptan si es esta sala (Mercado Kennedy)
    // Actualizacion automatica (Cote, 25 nov): version instalada, pedido de buscar ya, y ultima vez que alguien uso las luces
    public static string Version = "";
    public static bool PedirActualizar = false;
    public static DateTime UltimaActividad = DateTime.UtcNow;
    static HashSet<string> sesiones = new HashSet<string>();
    static readonly object SL = new object();
    static int fallosLogin = 0;

    static string ArchivoSesiones() { return Path.Combine(Root, "sesiones.txt"); }
    public static void CargarSesiones() {
      try { if (File.Exists(ArchivoSesiones())) foreach (string l in File.ReadAllLines(ArchivoSesiones())) if (l.Trim().Length > 0) sesiones.Add(l.Trim()); } catch {}
    }
    static void GuardarSesiones() {
      try { File.WriteAllLines(ArchivoSesiones(), new List<string>(sesiones).ToArray()); } catch {}
    }

    // Solo las IP de la red local (WiFi) cuentan como "local". 127.0.0.1 NO cuenta,
    // porque un tunel hacia internet entrega las conexiones desde 127.0.0.1.
    static bool EsRedLocal(IPAddress ip) {
      if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
      byte[] b = ip.GetAddressBytes();
      if (b.Length != 4) return false;
      return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168);
    }

    static string Cookie(string cookies, string nombre) {
      if (cookies == null) return null;
      foreach (string c in cookies.Split(';')) {
        string t = c.Trim(); int i = t.IndexOf('=');
        if (i > 0 && t.Substring(0, i) == nombre) return t.Substring(i + 1);
      }
      return null;
    }

    static string NuevoToken() {
      byte[] b = new byte[24];
      using (System.Security.Cryptography.RNGCryptoServiceProvider r = new System.Security.Cryptography.RNGCryptoServiceProvider()) r.GetBytes(b);
      return BitConverter.ToString(b).Replace("-", "").ToLower();
    }

    static bool IgualSeguro(string a, string b) {
      if (a == null || b == null) return false;
      int d = a.Length ^ b.Length;
      for (int i = 0; i < Math.Min(a.Length, b.Length); i++) d |= a[i] ^ b[i];
      return d == 0;
    }

    public static void Start(int puerto) {
      // Tiempo real (Cote, 27 nov: «las luces de correcto, incorrecto y pasa salen con casi un segundo de desfase»):
      // cada pedido se atiende con un hilo de reserva. Las conexiones que los navegadores y el tunel dejan abiertas sin pedir
      // nada ocupan un hilo hasta 5 s y, si se acaban, Windows agrega hilos de a poco (unos 2 por segundo): el aviso del
      // juego quedaba esperando. Se dejan 64 hilos listos desde el principio.
      { int w, io; ThreadPool.GetMinThreads(out w, out io); ThreadPool.SetMinThreads(Math.Max(w, 64), Math.Max(io, 64)); }
      TcpListener l = new TcpListener(IPAddress.Any, puerto);
      l.Start();
      Thread t = new Thread(delegate() {
        while (true) {
          try { TcpClient c = l.AcceptTcpClient(); ThreadPool.QueueUserWorkItem(Atender, c); } catch {}
        }
      });
      t.IsBackground = true; t.Start();
    }

    static void Atender(object o) {
      TcpClient c = (TcpClient)o;
      renovar = null;
      try {
        NetworkStream s = c.GetStream();
        s.ReadTimeout = 3000;
        StreamReader r = new StreamReader(s, Encoding.ASCII);
        string linea = r.ReadLine();
        if (linea == null) return;
        string h, cookies = null, autorizacion = null, sesionCab = null; int largo = 0; bool porTunel = false;
        while (!string.IsNullOrEmpty(h = r.ReadLine())) {
          int i = h.IndexOf(':'); if (i < 0) continue;
          string k = h.Substring(0, i).Trim().ToLower(), v = h.Substring(i + 1).Trim();
          if (k == "cookie") cookies = v;
          if (k == "x-krb") sesionCab = v;                                  // sesion sin cookie: el panel del DJ dentro de otra pagina (GC Light del karaoke)
          if (k == "authorization") autorizacion = v;                      // Authorization: Bearer <clave> (la Sala de juegos en Render)
          if (k == "cf-connecting-ip") porTunel = true;                    // viene de internet por el tunel de Cloudflare
          if (k == "content-length") int.TryParse(v, out largo);
        }
        string cuerpo = "";
        /* cuerpo de hasta ~8 MB (programas grabados) */
        if (largo > 0 && largo < 8000000) { char[] buf = new char[largo]; int n = 0; while (n < largo) { int x = r.Read(buf, n, largo - n); if (x <= 0) break; n += x; } cuerpo = new string(buf, 0, n); }
        string[] partes = linea.Split(' ');
        string url = partes.Length > 1 ? partes[1] : "/";
        string ruta = url, query = "";
        int q = url.IndexOf('?');
        if (q >= 0) { ruta = url.Substring(0, q); query = url.Substring(q + 1); }
        // POST: los parametros pueden venir en el cuerpo (secuencias largas, datos guardados)
        if (partes[0] == "POST" && cuerpo.Length > 0 && ruta != "/api/login") query = query.Length > 0 ? query + "&" + cuerpo : cuerpo;

        // ---- Clave ----
        if (ruta == "/api/login") { Login(s, cuerpo, query); return; }
        if (ruta == "/api/salir") {
          string tk = Cookie(cookies, "krb");
          lock (SL) { if (tk != null && sesiones.Remove(tk)) GuardarSesiones(); }
          Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}"), "krb=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
          return;
        }
        IPAddress ip = ((IPEndPoint)c.Client.RemoteEndPoint).Address;
        bool libre = Clave == "" || (!PedirEnWifiLocal && !porTunel && EsRedLocal(ip));
        if (!libre) {
          string tk = Cookie(cookies, "krb");
          bool ok; lock (SL) { ok = tk != null && sesiones.Contains(tk); if (!ok && sesionCab != null && sesiones.Contains(sesionCab)) { ok = true; tk = null; } }
          // los archivos del panel que ya son publicos (estan en el repositorio) se entregan sin clave: dentro de otra pagina no viaja la cookie
          if (ruta == "/vista3d.js" || ruta == "/lib/three.module.min.js") ok = true;
          // Sesion de por vida (Cote, 25 nov: la estacion de ritmo queda fija): cada vez que se abre la pagina se renueva
          if (ok && tk != null && (ruta == "/" || ruta == "/index.html" || ruta == "/dj")) renovar = CookieSesion(tk);
          // el aviso de un juego tambien puede venir directo desde un aparato del local con la sesion en la direccion (&tk=),
          // sin pasar por Render: llega antes
          if (!ok && ruta == "/api/momento") { string tq = Arg(query, "tk"); lock (SL) { ok = tq != null && sesiones.Contains(tq); } }
          // o con firma (Code 1, 27 nov): el tablero del local es una pagina publica, asi que no lleva la sesion sino una firma
          // que sirve solo para ese aviso: HMAC-SHA256(clave, "<id>|<nombre>") en hexadecimal, los 32 primeros caracteres
          if (!ok && ruta == "/api/momento" && Clave != "") {
            string fi = Arg(query, "firma"), idf = Arg(query, "id"), nf = Arg(query, "nombre");
            if (fi != null && idf != null && nf != null) {
              using (System.Security.Cryptography.HMACSHA256 hm = new System.Security.Cryptography.HMACSHA256(Encoding.UTF8.GetBytes(Clave))) {
                byte[] hb = hm.ComputeHash(Encoding.UTF8.GetBytes(idf + "|" + nf)); StringBuilder hx = new StringBuilder();
                foreach (byte bx in hb) hx.Append(bx.ToString("x2"));
                ok = IgualSeguro(fi.ToLower(), hx.ToString().Substring(0, 32));
              }
            }
          }
          if (!ok && autorizacion != null && autorizacion.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            ok = IgualSeguro(autorizacion.Substring(7).Trim(), Clave);
          if (!ok && ruta != "/" && ruta != "/index.html" && ruta != "/dj") {
            Enviar(s, "401 Unauthorized", "application/json", Encoding.UTF8.GetBytes("{\"login\":true}"));
            return;
          }
        }
        Responder(s, ruta, query);
      } catch {}
      finally { try { c.Close(); } catch {} }
    }

    static string Arg(string query, string nombre) {
      foreach (string par in query.Split('&')) {
        int i = par.IndexOf('=');
        if (i > 0 && par.Substring(0, i) == nombre) return Uri.UnescapeDataString(par.Substring(i + 1).Replace('+', ' '));
      }
      return null;
    }

    static double Num(string v, double def) {
      double d;
      if (v != null && double.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d)) return d;
      return def;
    }

    static void Responder(NetworkStream s, string ruta, string query) {
      if (ruta == "/" || ruta == "/index.html") { Archivo(s, Path.Combine(Root, "ipad.html"), "text/html; charset=utf-8"); return; }
      if (ruta == "/luces.json") { Archivo(s, ConfigPath, "application/json; charset=utf-8"); return; }
      // Vista 3D realista (three.js). Solo estos archivos, nada mas de la carpeta.
      if (ruta == "/vista3d.js") { Archivo(s, Path.Combine(Root, "vista3d.js"), "text/javascript; charset=utf-8"); return; }
      if (ruta == "/lib/three.module.min.js") { Archivo(s, Path.Combine(Root, "lib", "three.module.min.js"), "text/javascript; charset=utf-8"); return; }

      // Golpe de la musica (panel del DJ): respuesta minima, llega varias veces por segundo
      if (ruta == "/api/pulso") { Dmx.Pulsar(); lock (DJL) { djEstacion = DateTime.UtcNow; } Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}")); return; }
      // Estado del panel del DJ, el mismo para todos los aparatos (celular del DJ, estacion que escucha la musica)
      if (ruta == "/api/dj") { Dj(s, query); return; }
      // Fuerza de la musica (la mide la estacion de ritmo cada 5 s): suave, medio o fuerte, para Auto musica
      if (ruta == "/api/energia") { string c = Arg(query, "c") ?? "";
        if (c == "suave" || c == "medio" || c == "fuerte") lock (DJL) { djClase = c; djClaseT = DateTime.UtcNow; }
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}")); return; }
      // Nota del iPad para el registro de la noche (por ejemplo, la escena que se eligio)
      if (ruta == "/api/anotar") { string t = Arg(query, "t") ?? ""; if (t.Length > 200) t = t.Substring(0, 200); Bitacora.Anotar("iPad: " + t);
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}")); return; }
      // Registro de una noche (texto) y lista de noches guardadas
      if (ruta == "/api/registro") {
        string n = Arg(query, "noche") ?? Bitacora.Noche(DateTime.Now);
        StringBuilder b = new StringBuilder("{\"noche\":\"").Append(Esc(n)).Append("\",\"noches\":[");
        string[] ns = Bitacora.Noches(); for (int i = 0; i < ns.Length && i < 60; i++) { if (i > 0) b.Append(','); b.Append('"').Append(Esc(ns[i])).Append('"'); }
        string tx = Bitacora.Leer(n).Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n").Replace("\t", " ");
        b.Append("],\"texto\":\"").Append(tx).Append("\"}");
        Enviar(s, "200 OK", "application/json; charset=utf-8", Encoding.UTF8.GetBytes(b.ToString())); return;
      }
      if (ruta == "/dj") { Archivo(s, Path.Combine(Root, "ipad.html"), "text/html; charset=utf-8"); return; }
      if (Accion(ruta, query)) { Estado(s); return; }

      // ---- Momentos de los juegos (los dispara el iPad o, mas adelante, el GC Master / la Sala de juegos) ----
      if (ruta == "/api/momentos") {                       // guardar la lista de momentos (texto)
        string d = Arg(query, "d");
        if (d != null) { File.WriteAllText(Path.Combine(Root, "momentos.txt"), d, new UTF8Encoding(false)); ParseMomentos(d); }
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true,\"momentos\":" + ContarMomentos() + "}"));
        return;
      }
      if (ruta == "/api/momento") {                        // ejecutar un momento: /api/momento?nombre=base_juegos
        string n = Arg(query, "nombre") ?? "";
        // Escalon de la pregunta («¿Quien quiere ser ganador?», 12 preguntas): nivel 1 (1-4), 2 (5-8) o 3 (9-12), si existe ese momento
        int esc; if (int.TryParse(Arg(query, "escalon") ?? "", out esc) && esc > 0) {
          string alt = n + "_" + (esc <= 4 ? 1 : esc <= 8 ? 2 : 3); bool hay; lock (ML) { hay = momentos.ContainsKey(alt); } if (hay) n = alt; }
        // Solo la Sala de juegos de Mercado Kennedy (Cote, 24 nov): si el aviso dice de que sala viene y no es esta, no se toca nada
        string sala = Arg(query, "sala");
        if (sala != null && sala.ToLower().IndexOf(Sala.ToLower()) < 0) {
          Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":false,\"ignorado\":\"otra sala\",\"sala\":\"" + Esc(sala) + "\"}")); return;
        }
        // El mismo aviso puede llegar dos veces (desde Render y directo desde el local, con el mismo id): vale el primero
        string idAviso = Arg(query, "id");
        // se recuerdan solo 30 s (la Sala vuelve a contar desde 1 cada vez que se reinicia)
        if (idAviso != null) { string claveAviso = idAviso + "|" + (Arg(query, "nombre") ?? ""); DateTime ahoraA = DateTime.UtcNow;
          lock (ML) {
            List<string> viejos = new List<string>(); foreach (KeyValuePair<string, DateTime> kv in avisosVistos) if ((ahoraA - kv.Value).TotalSeconds > 30) viejos.Add(kv.Key);
            foreach (string kx in viejos) avisosVistos.Remove(kx);
            if (avisosVistos.ContainsKey(claveAviso)) { Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true,\"repetido\":true}")); return; }
            avisosVistos[claveAviso] = ahoraA; } }
        // Cuanto tardo en llegar (si el que avisa manda su hora en milisegundos, &t=): queda en el registro de la noche
        double tEnv = Num(Arg(query, "t"), 0);
        if (tEnv > 0) { double ms = (DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds - tEnv;
          if (ms > -5000 && ms < 60000) Bitacora.Anotar("Aviso " + n + " llego en " + Math.Round(ms) + " ms" + (Arg(query, "desde") != null ? " (desde " + Arg(query, "desde") + ")" : "")); }
        if (!EjecutarMomento(n)) { Bitacora.Anotar("Momento desconocido (sin luces): " + n); Enviar(s, "404 Not Found", "application/json", Encoding.UTF8.GetBytes("{\"error\":\"momento desconocido\",\"nombre\":\"" + Esc(n) + "\"}")); return; }
        Estado(s); return;
      }
      if (ruta == "/api/lista-momentos") {                 // nombres disponibles (para Code 1 / GC Master)
        StringBuilder b = new StringBuilder("[");
        lock (ML) { int i = 0; foreach (string k in momentos.Keys) { if (i++ > 0) b.Append(','); b.Append('"').Append(Esc(k)).Append('"'); } }
        b.Append(']');
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes(b.ToString()));
        return;
      }

      // Datos guardados en el Dell (calibracion de las cabezas, etc.)
      if (ruta == "/api/datos") {
        string p = Path.Combine(Root, "datos.json");
        Enviar(s, "200 OK", "application/json; charset=utf-8", File.Exists(p) ? File.ReadAllBytes(p) : Encoding.UTF8.GetBytes("{}"));
        return;
      }
      if (ruta == "/api/guardar") {
        string d = Arg(query, "d");
        string p = Path.Combine(Root, "datos.json");
        if (d == null || !d.StartsWith("{")) { Enviar(s, "400 Bad Request", "application/json", Encoding.UTF8.GetBytes("{\"error\":\"datos\"}")); return; }
        lock (DL) {
          string viejo = File.Exists(p) ? File.ReadAllText(p) : "";
          // Proteccion (Kennedy, 25 nov): nunca borrar la calibracion sin querer (un aparato que no alcanzo a leerla
          // guardaria todo vacio). Solo "Borrar calibracion" manda borrar=1.
          if (Marcas(viejo) > Marcas(d) && Arg(query, "borrar") != "1") {
            Enviar(s, "409 Conflict", "application/json", Encoding.UTF8.GetBytes("{\"error\":\"perderia la calibracion\"}")); return;
          }
          // Respaldo de lo anterior en la carpeta respaldos (se guardan los ultimos 60)
          try {
            if (viejo.Length > 2 && viejo != d) {
              string dir = Path.Combine(Root, "respaldos"); Directory.CreateDirectory(dir);
              File.WriteAllText(Path.Combine(dir, "datos-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".json"), viejo, new UTF8Encoding(false));
              string[] fs = Directory.GetFiles(dir, "datos-*.json"); Array.Sort(fs);
              for (int i = 0; i < fs.Length - 60; i++) File.Delete(fs[i]);
            }
          } catch {}
          string tmp = p + ".tmp";
          File.WriteAllText(tmp, d, new UTF8Encoding(false));
          if (File.Exists(p)) File.Replace(tmp, p, null); else File.Move(tmp, p);
        }
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}"));
        return;
      }
      if (ruta == "/api/reconectar") { Dmx.Abrir(); Estado(s); return; }
      if (ruta == "/api/actualizar") { PedirActualizar = true; Bitacora.Anotar("Pidieron buscar actualizacion ahora");
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}")); return; }
      if (ruta == "/api/master") {                                    // intensidad general: ?v=0-100&ch=1,17,... (los canales los da el iPad)
        double v = Num(Arg(query, "v"), -1); string chs = Arg(query, "ch");
        if (chs != null) { List<int> l = new List<int>(); foreach (string x in chs.Split(',')) { int c; if (int.TryParse(x, out c) && c >= 1 && c <= 512) l.Add(c); } Dmx.MasterCh = l.ToArray(); }
        if (v >= 0) { Dmx.Master = (float)Math.Min(1, v / 100); GuardarMaster(); }
        Estado(s); return; }
      // Diagnostico del Dell (Cote, 28 nov: «revisar por que fallaron las luces y por que se apaga OBS»): lo arma el programa
      // cada 10 minutos (y al pedirlo) en diagnostico.txt; el panel lo muestra para copiarlo al registro
      if (ruta == "/api/diagnostico") {
        if (Arg(query, "nuevo") != null) PedirDiagnostico = true;
        string f = Path.Combine(Root, "diagnostico.txt"), tx = "";
        try { if (File.Exists(f)) tx = File.ReadAllText(f); } catch {}
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"pedido\":" + (PedirDiagnostico ? "true" : "false") + ",\"texto\":\"" + tx.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n").Replace("\t", " ") + "\"}"));
        return; }
      // OBS (transmision automatica): estado, guardar la clave y probar
      if (ruta == "/api/obs") {
        string c = Arg(query, "clave"); if (c != null) Obs.GuardarClave(c);
        if (c != null || Arg(query, "probar") != null) Obs.Revisar();
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"clave\":" + (Obs.Clave != "" ? "true" : "false") + ",\"estado\":\"" + Esc(Obs.Estado) +
          "\",\"transmitiendo\":" + (Obs.Transmitiendo ? "true" : "false") + ",\"enHorario\":" + (Obs.EnHorario(DateTime.Now) ? "true" : "false") + ",\"horario\":\"" + Obs.Horario + "\"}"));
        return; }
      if (ruta == "/api/aviso-prueba") { Aviso.Mandar("Aviso de prueba de las luces KRB. Si te lleg\u00f3, qued\u00f3 listo.", false);
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":" + (Aviso.Tema != "" ? "true" : "false") + "}")); return; }
      if (ruta == "/api/estado") { Estado(s); return; }
      Enviar(s, "404 Not Found", "text/plain", Encoding.UTF8.GetBytes("No encontrado"));
    }

    /* Acciones sobre las luces: las usa la red (/api/...) y tambien los momentos guardados */
    static bool Accion(string ruta, string query) {
      if (ruta == "/api/set" || ruta == "/api/apagar" || ruta == "/api/efecto") UltimaActividad = DateTime.UtcNow;
      if (ruta == "/api/set") {
        // d=canal:valor,canal:valor   f=segundos de fundido
        double f = Num(Arg(query, "f"), 0);
        string d = Arg(query, "d");
        if (d != null) {
          foreach (string par in d.Split(',')) {
            string[] kv = par.Split(':');
            int ch, v;
            if (kv.Length == 2 && int.TryParse(kv[0], out ch) && int.TryParse(kv[1], out v)) Dmx.Set(ch, v, f);
          }
        }
        return true;
      }
      if (ruta == "/api/apagar") { Bitacora.Anotar("APAGAR TODO"); Dmx.QuitarEfectos(); Dmx.Todo(0, Num(Arg(query, "f"), 0)); return true; }
      if (ruta == "/api/efecto") {
        // id=nombre  off=1 | todos=off
        // tipo=seno&ch=113,115&centro=128,100&amp=60,30&periodo=8
        // tipo=sec&pasos=129:255,130:0|129:0,130:0&t=0.15&fx=0
        string id = Arg(query, "id") ?? "efecto";
        if (Arg(query, "todos") == "off") Dmx.QuitarEfectos();
        else if (Arg(query, "off") == "1") Dmx.QuitarEfecto(id);
        else {
          Efecto e = new Efecto();
          e.Tipo = Arg(query, "tipo") ?? "";
          if (e.Tipo == "seno") {
            e.Ch = Enteros(Arg(query, "ch"));
            e.Centro = Reales(Arg(query, "centro"), e.Ch.Length, 128);
            e.Amp = Reales(Arg(query, "amp"), e.Ch.Length, 40);
            e.Periodo = Num(Arg(query, "periodo"), 8);
          } else {
            e.Tipo = "sec";
            e.Pasos = new List<Dictionary<int, int>>();
            foreach (string paso in (Arg(query, "pasos") ?? "").Split('|')) {
              Dictionary<int, int> d2 = new Dictionary<int, int>();
              foreach (string par in paso.Split(',')) {
                string[] kv = par.Split(':'); int ch, v;
                if (kv.Length == 2 && int.TryParse(kv[0], out ch) && int.TryParse(kv[1], out v)) d2[ch] = v;
              }
              e.Pasos.Add(d2);
            }
            e.T = Num(Arg(query, "t"), 0.5);
            e.Fx = Math.Max(0, Math.Min(1, Num(Arg(query, "fx"), 0)));
          }
          e.Ritmo = Math.Max(0, Num(Arg(query, "ritmo"), 0));
          Dmx.PonerEfecto(id, e);
        }
        return true;
      }
      return false;
    }

    /* Momentos: momentos.txt tiene bloques "#nombre" seguidos de acciones ("/api/set?...", "/api/efecto?...", "espera:2").
       Un momento nuevo cancela lo que quedaba pendiente del anterior (por ejemplo, la vuelta a la base despues de 2 s). */
    static Dictionary<string, List<string>> momentos = new Dictionary<string, List<string>>();
    static readonly object ML = new object();
    static int genMomento = 0;
    public static string MomentoActual = "";
    public static int MomentoN = 0;
    static string MomentoEstable = "";
    public static void CargarMomentos() {
      try { string p = Path.Combine(Root, "momentos.txt"); if (File.Exists(p)) ParseMomentos(File.ReadAllText(p)); } catch {}
    }
    static void ParseMomentos(string txt) {
      Dictionary<string, List<string>> d = new Dictionary<string, List<string>>();
      List<string> cur = null;
      foreach (string linea in txt.Split('\n')) {
        string l = linea.Trim(); if (l.Length == 0) continue;
        if (l.StartsWith("#")) { cur = new List<string>(); d[l.Substring(1).Trim()] = cur; }
        else if (cur != null) cur.Add(l);
      }
      lock (ML) { momentos = d; }
    }
    static int ContarMomentos() { lock (ML) { return momentos.Count; } }
    public static bool MomentoProgramado(string n) { return EjecutarMomento(n); }
    static Dictionary<string, DateTime> avisosVistos = new Dictionary<string, DateTime>();
    static bool EjecutarMomento(string nombre) {
      List<string> acc;
      lock (ML) { if (!momentos.TryGetValue(nombre, out acc)) return false; }
      if (acc.Count == 0) return true;                                     // momento sin acciones (p. ej. bingo_numero): no cambia nada
      // Mandan los juegos (Cote, 26 nov): si el DJ apago, cambio o bajo las luces, el momento nuevo del juego deja atras lo del DJ:
      // se apaga su Automatico (si no, a los 3 minutos volveria su escena), su escena queda sin marcar y la intensidad general vuelve al 100 %
      lock (DJL) { if (djAuto || djMusica) Bitacora.Anotar("DJ: Automatico / Auto musica apagado (llego un momento de los juegos)"); djAuto = false; djMusica = false; djEscena = -1; djGrupo = ""; }
      if (Dmx.Master < 0.999) { Dmx.Master = 1f; GuardarMaster(); Bitacora.Anotar("Intensidad general de vuelta al 100 % (momento de los juegos)"); }
      // "@previo" = volver al ultimo momento estable (p. ej. despues del verde de una correcta, al rojo del reloj).
      // Los momentos que terminan en "@previo" son de paso y no cuentan como estables.
      bool dePaso = acc.Contains("@previo") || acc.Contains("paso");      // "paso": destellos que despues vuelven a donde estaba
      int gen = Interlocked.Increment(ref genMomento);
      MomentoActual = nombre; MomentoN++; UltimaActividad = DateTime.UtcNow;
      Bitacora.Anotar("Momento de los juegos: " + nombre + " (" + DateTime.Now.ToString("HH:mm:ss.fff") + ")");
      if (!dePaso) MomentoEstable = nombre;
      Thread t = new Thread(() => {
        foreach (string l in acc) {
          if (gen != genMomento) return;                                   // llego otro momento: se cancela este
          if (l == "paso") continue;
          if (l.StartsWith("espera:")) { Thread.Sleep((int)(Num(l.Substring(7), 0) * 1000)); continue; }
          if (l == "@previo") { if (gen == genMomento && MomentoEstable != "") EjecutarMomento(MomentoEstable); return; }
          if (l.StartsWith("@")) { if (gen == genMomento) EjecutarMomento(l.Substring(1).Trim()); return; }   // pasar a otro momento
          int q = l.IndexOf('?');
          try { Accion(q >= 0 ? l.Substring(0, q) : l, q >= 0 ? l.Substring(q + 1) : ""); } catch {}
        }
      });
      t.IsBackground = true; t.Start();
      return true;
    }

    static int[] Enteros(string t) {
      List<int> r = new List<int>();
      foreach (string x in (t ?? "").Split(',')) { int v; if (int.TryParse(x, out v)) r.Add(v); }
      return r.ToArray();
    }
    static double[] Reales(string t, int n, double def) {
      double[] r = new double[n];
      string[] xs = (t ?? "").Split(',');
      for (int i = 0; i < n; i++) r[i] = i < xs.Length ? Num(xs[i], def) : def;
      return r;
    }

    static readonly object DL = new object();
    // ---- Panel del DJ (Cote, 25 nov): escena, automatico e intensidad compartidos; la estacion de ritmo avisa que esta viva ----
    static readonly object DJL = new object();
    static int djEscena = -1, djInt = 100; static bool djAuto = false, djMusica = false;
    static string djClase = "", djClaseUsada = "", djGrupo = ""; static DateTime djClaseT = DateTime.MinValue;
    static DateTime djCambio = DateTime.MinValue, djEstacion = DateTime.MinValue;
    static Random djAzar = new Random();
    static void Dj(NetworkStream s, string query) {
      bool aplicar = false;
      lock (DJL) {
        string v;
        if ((v = Arg(query, "escena")) != null) { int.TryParse(v, out djEscena); djCambio = DateTime.UtcNow;
          string nom = Arg(query, "nombre") ?? v; Bitacora.Anotar("DJ: escena " + nom);
          // grupo que eligio el DJ («Previa · Piano bar» -> «Previa»): el Automatico no puede salir de el (Cote, 28 nov)
          if (Arg(query, "nombre") != null) { int ix = nom.IndexOf(" \u00b7 "); djGrupo = ix > 0 ? nom.Substring(0, ix) : nom; }
          if (djEscena < 0) djGrupo = "";
          // Cote, 26 nov: la intensidad general baja se mantiene en Standby; al pasar a Previa, Show, Fiesta o Locura vuelve al 100 %
          if (Arg(query, "nombre") != null && !nom.StartsWith("Standby") && Dmx.Master < 0.999) {
            Dmx.Master = 1f; GuardarMaster(); Bitacora.Anotar("Intensidad general de vuelta al 100 % (" + nom + ")"); } }
        if ((v = Arg(query, "auto")) != null) { bool a = v == "1"; if (a != djAuto) Bitacora.Anotar("DJ: Automatico " + (a ? "encendido" : "apagado")); djAuto = a; if (djAuto) djCambio = DateTime.MinValue; }
        // «Auto musica» ya no es aparte: el Automatico escucha la musica dentro del grupo (un aparato viejo que lo pida, prende el Automatico)
        if (Arg(query, "musica") == "1") { if (!djAuto) Bitacora.Anotar("DJ: Automatico encendido"); djAuto = true; djCambio = DateTime.MinValue; }
        djMusica = false;
        if ((v = Arg(query, "int")) != null) int.TryParse(v, out djInt);
        if (Arg(query, "estacion") == "1") djEstacion = DateTime.UtcNow;
        // Automatico: el primer aparato que pregunta cuando ya pasaron 3 minutos recibe la escena nueva y la aplica
        string lista = Arg(query, "turno");
        // Auto musica: cambia cuando la musica pasa a otra fuerza (con 40 s minimo entre cambios) o cada 3 minutos
        string clase = Arg(query, "clase");
        bool cambioClase = clase != null && clase != "" && clase != djClaseUsada && (DateTime.UtcNow - djCambio).TotalSeconds >= 40;
        // solo dentro del grupo que eligio el DJ: si el aparato no dice el grupo (version vieja) o dice otro, no se cambia nada
        string grupoPedido = Arg(query, "grupo");
        bool mismoGrupo = grupoPedido != null && djGrupo != "" && grupoPedido == djGrupo;
        if (lista != null && djAuto && mismoGrupo && ((DateTime.UtcNow - djCambio).TotalSeconds >= 180 || cambioClase)) {
          if (clase != null && clase != "" && clase != djClaseUsada) { Bitacora.Anotar("DJ: la musica esta " + clase + " (" + djGrupo + ")"); djClaseUsada = clase; }
          List<int> op = new List<int>();
          foreach (string x in lista.Split(',')) { int k; if (int.TryParse(x, out k) && k != djEscena) op.Add(k); }
          if (op.Count > 0) { djEscena = op[djAzar.Next(op.Count)]; djCambio = DateTime.UtcNow; aplicar = true; Bitacora.Anotar("DJ: el Automatico cambio a la escena " + djEscena + " (" + djGrupo + ")"); }
        }
      }
      string cl; lock (DJL) { cl = (DateTime.UtcNow - djClaseT).TotalSeconds < 30 ? djClase : ""; }
      string j = "{\"escena\":" + djEscena + ",\"auto\":" + (djAuto ? "true" : "false") + ",\"musica\":" + (djMusica ? "true" : "false") + ",\"clase\":\"" + cl + "\",\"int\":" + djInt +
        ",\"aplicar\":" + (aplicar ? "true" : "false") + ",\"estacion\":" + ((DateTime.UtcNow - djEstacion).TotalSeconds < 10 ? "true" : "false") +
        ",\"ritmo\":" + (Dmx.ConRitmo ? "true" : "false") + ",\"bpm\":" + Math.Round(Dmx.Bpm).ToString(System.Globalization.CultureInfo.InvariantCulture) +
        ",\"pulsos\":" + Dmx.Pulsos + "}";
      Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes(j));
    }
    // Cuantas marcas de calibracion hay en un datos.json (las marcas se llaman abajo, ei, ed, fi y fd)
    static int Marcas(string t) {
      if (string.IsNullOrEmpty(t)) return 0;
      return System.Text.RegularExpressions.Regex.Matches(t, "\"(abajo|ei|ed|fi|fd)\"\\s*:").Count;
    }

    // La intensidad general queda guardada (si el Dell se reinicia o se actualiza, sigue igual)
    static void GuardarMaster() {
      try { File.WriteAllText(Path.Combine(Root, "intensidad.txt"), Math.Round(Dmx.Master * 100) + "|" + string.Join(",", Array.ConvertAll(Dmx.MasterCh, x => x.ToString()))); } catch {}
    }
    // Al terminar la noche (6 de la manana) vuelve al 100 % (Cote, 26 nov). Lo revisa el Dell cada segundo.
    static string nocheMaster = "";
    public static void RevisarNocheMaster() {
      string n = Bitacora.Noche(DateTime.Now);
      if (nocheMaster != "" && n != nocheMaster && Dmx.Master < 0.999) { Dmx.Master = 1f; GuardarMaster(); Bitacora.Anotar("Intensidad general de vuelta al 100 % (termino la noche)"); }
      nocheMaster = n;
    }
    public static void CargarMaster() {
      try { string f = Path.Combine(Root, "intensidad.txt"); if (!File.Exists(f)) return;
        string[] p = File.ReadAllText(f).Trim().Split('|'); double v = Num(p[0], 100);
        if (Bitacora.Noche(File.GetLastWriteTime(f)) != Bitacora.Noche(DateTime.Now)) v = 100;   // quedo de una noche anterior
        if (p.Length > 1 && p[1] != "") { List<int> l = new List<int>(); foreach (string x in p[1].Split(',')) { int c; if (int.TryParse(x, out c)) l.Add(c); } Dmx.MasterCh = l.ToArray(); }
        Dmx.Master = (float)Math.Max(0, Math.Min(1, v / 100)); } catch {}
    }
    static string Esc(string t) { return (t ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " "); }

    static void Estado(NetworkStream s) {
      StringBuilder b = new StringBuilder();
      b.Append("{\"tipo\":\"").Append(Esc(Dmx.Tipo)).Append("\"");
      b.Append(",\"puerto\":\"").Append(Esc(Dmx.PuertoUsado)).Append("\"");
      b.Append(",\"conectado\":").Append(Dmx.Conectado ? "true" : "false");
      b.Append(",\"error\":\"").Append(Esc(Dmx.Error)).Append("\"");
      b.Append(",\"carpeta\":\"").Append(Esc(Root)).Append("\"");
      b.Append(",\"version\":\"").Append(Esc(Version)).Append("\"");
      b.Append(",\"aviso\":\"").Append(Esc(Aviso.Tema)).Append("\"");
      b.Append(",\"master\":").Append(Math.Round(Dmx.Master * 100));
      b.Append(",\"ritmo\":").Append(Dmx.ConRitmo ? "true" : "false").Append(",\"bpm\":").Append(Math.Round(Dmx.Bpm).ToString(System.Globalization.CultureInfo.InvariantCulture));
      b.Append(",\"tramas\":").Append(Dmx.Tramas).Append(",\"errores\":").Append(Dmx.Errores);
      b.Append(",\"momento\":\"").Append(Esc(MomentoActual)).Append("\",\"momentoN\":").Append(MomentoN);
      b.Append(",\"efectos\":[");
      string[] ef = Dmx.Efectos();
      for (int i = 0; i < ef.Length; i++) { if (i > 0) b.Append(','); b.Append('"').Append(Esc(ef[i])).Append('"'); }
      b.Append("],\"canales\":[");
      int[] v = Dmx.Objetivo();
      for (int i = 0; i < v.Length; i++) { if (i > 0) b.Append(','); b.Append(v[i]); }
      b.Append("],\"salida\":[");
      int[] o = Dmx.Salida();
      for (int i = 0; i < o.Length; i++) { if (i > 0) b.Append(','); b.Append(o[i]); }
      b.Append("]}");
      Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes(b.ToString()));
    }

    static void Archivo(NetworkStream s, string path, string tipo) {
      if (!File.Exists(path)) { Enviar(s, "404 Not Found", "text/plain", Encoding.UTF8.GetBytes("Falta " + Path.GetFileName(path))); return; }
      Enviar(s, "200 OK", tipo, File.ReadAllBytes(path));
    }

    static void Login(NetworkStream s, string cuerpo, string query) {
      // El navegador envia la clave en el cuerpo (POST), nunca en la direccion.
      // Con ?ir=/... (la estacion de ritmo entra sola al prender): la clave viene como formulario y se vuelve a esa pagina.
      string ir = Arg(query, "ir"); if (ir != null && (!ir.StartsWith("/") || ir.StartsWith("//"))) ir = null;
      string clave = cuerpo.Trim();
      if (ir != null) { string f = Arg(cuerpo, "clave"); if (f != null) clave = f; }
      if (Clave == "") { if (ir != null) Redirigir(s, ir, null); else Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}")); return; }
      if (fallosLogin >= 5) Thread.Sleep(5000);           // freno contra adivinar la clave
      if (IgualSeguro(clave, Clave)) {
        string tk = NuevoToken();
        lock (SL) { sesiones.Add(tk); GuardarSesiones(); }
        fallosLogin = 0;
        if (ir != null) { Redirigir(s, ir, CookieSesion(tk)); return; }
        // tk tambien en la respuesta: el panel dentro de otra pagina lo guarda y lo manda en X-KRB (ahi no hay cookie)
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true,\"tk\":\"" + tk + "\"}"),
               CookieSesion(tk));
      } else {
        fallosLogin++;
        Bitacora.Anotar("Clave incorrecta (intento " + fallosLogin + ")");
        Thread.Sleep(1500);
        if (ir != null) { Redirigir(s, ir, null); return; }
        Enviar(s, "401 Unauthorized", "application/json", Encoding.UTF8.GetBytes("{\"login\":true,\"error\":\"Clave incorrecta\"}"));
      }
    }
    static void Redirigir(NetworkStream s, string a, string setCookie) {
      string cab = "HTTP/1.1 303 See Other\r\nLocation: " + a.Replace("\r", "").Replace("\n", "") + "\r\nContent-Length: 0\r\nCache-Control: no-store\r\n" +
                   (setCookie != null ? "Set-Cookie: " + setCookie + "\r\n" : "") + "Connection: close\r\n\r\n";
      byte[] c = Encoding.ASCII.GetBytes(cab); s.Write(c, 0, c.Length);
    }

    static void Enviar(NetworkStream s, string estado, string tipo, byte[] cuerpo) { Enviar(s, estado, tipo, cuerpo, null); }
    [ThreadStatic] static string renovar;
    // 400 dias es lo maximo que guardan los navegadores; como se renueva en cada visita, no vence nunca
    static string CookieSesion(string tk) { return "krb=" + tk + "; Max-Age=34560000; Path=/; HttpOnly; SameSite=Lax"; }
    static void Enviar(NetworkStream s, string estado, string tipo, byte[] cuerpo, string setCookie) {
      if (setCookie == null) setCookie = renovar;
      string cab = "HTTP/1.1 " + estado + "\r\nContent-Type: " + tipo + "\r\nContent-Length: " + cuerpo.Length +
                   "\r\nCache-Control: no-store\r\n" + (setCookie != null ? "Set-Cookie: " + setCookie + "\r\n" : "") +
                   "X-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
      byte[] c = Encoding.ASCII.GetBytes(cab);
      s.Write(c, 0, c.Length);
      s.Write(cuerpo, 0, cuerpo.Length);
    }
  }
}
'@

Add-Type -TypeDefinition $cs -ReferencedAssemblies System

$puertoWeb = 8080
if ($cfg.servidor -and $cfg.servidor.puerto) { $puertoWeb = [int]$cfg.servidor.puerto }

[KRB.Dmx]::Start([string]$cfg.salida.tipo, [string]$cfg.salida.puerto)
[KRB.Web]::Root = $root
[KRB.Web]::ConfigPath = $Config
if ($cfg.acceso) {
  if ($cfg.acceso.clave) { [KRB.Web]::Clave = [string]$cfg.acceso.clave }
  [KRB.Web]::PedirEnWifiLocal = [bool]$cfg.acceso.pedir_en_wifi_local
}
if ($cfg.momentos -and $cfg.momentos.sala) { [KRB.Web]::Sala = [string]$cfg.momentos.sala
}
[KRB.Bitacora]::Carpeta = $root
# Aviso al celular: el tema de ntfy se crea una vez al azar y queda en aviso-celular.txt (no esta en el repositorio)
try {
  $pAviso = Join-Path $root "aviso-celular.txt"
  if (-not (Test-Path $pAviso)) {
    $letras = "abcdefghijkmnpqrstuvwxyz23456789"; $rnd = New-Object System.Random
    $tema = "krb-luces-" + (-join (1..12 | ForEach-Object { $letras[$rnd.Next($letras.Length)] }))
    Set-Content -Path $pAviso -Value $tema -Encoding ASCII
  }
  [KRB.Aviso]::Tema = (Get-Content $pAviso -Raw).Trim()
} catch {}
$estadoCable = if ([KRB.Dmx]::Conectado) { "cable conectado (" + [KRB.Dmx]::PuertoUsado + ")" } elseif ([KRB.Dmx]::Tipo -eq "simulacion") { "modo simulacion" } else { "SIN CABLE: " + [KRB.Dmx]::Error }
[KRB.Bitacora]::Anotar("Se abrio la suite de luces (" + $estadoCable + ")")
[KRB.Obs]::Iniciar($root)
[KRB.Web]::CargarMaster()
[KRB.Web]::CargarSesiones()
[KRB.Web]::CargarMomentos()
[KRB.Web]::Start($puertoWeb)

Write-Host ""
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "  LUCES KRB - servidor encendido" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
if ([KRB.Dmx]::Conectado) {
  Write-Host ("  Cable DMX: " + [KRB.Dmx]::PuertoUsado + " (" + [KRB.Dmx]::Tipo + ")") -ForegroundColor Green
} elseif ([KRB.Dmx]::Tipo -eq "simulacion") {
  Write-Host "  Cable DMX: modo simulacion (no se envia nada)" -ForegroundColor Cyan
} else {
  Write-Host ("  Cable DMX: NO CONECTADO - " + [KRB.Dmx]::Error) -ForegroundColor Red
}
Write-Host ""
Write-Host "  En el iPad, abrir Safari y escribir:" -ForegroundColor White
try {
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    ForEach-Object { Write-Host ("     http://" + $_.IPAddress + ":" + $puertoWeb) -ForegroundColor Green }
} catch {}
Write-Host ("  En este computador: http://localhost:" + $puertoWeb)
Write-Host ("  Panel del DJ: la misma direccion terminada en /dj  (ej. http://localhost:" + $puertoWeb + "/dj)") -ForegroundColor Green
Write-Host ("  Carpeta de la suite (calibracion en datos.json): " + $root) -ForegroundColor DarkGray
if ([KRB.Web]::Clave -eq "") {
  Write-Host "  Clave: NO configurada (cualquiera en el WiFi puede usarlo)." -ForegroundColor DarkYellow
} elseif ([KRB.Web]::PedirEnWifiLocal) {
  Write-Host "  Clave: se pide siempre." -ForegroundColor Green
} else {
  Write-Host "  Clave: se pide solo fuera del WiFi del local." -ForegroundColor Green
}

# ---------- Tunel de Cloudflare (si se configuro con CONFIGURAR_INTERNET.bat) ----------
$yml = Join-Path $root "tunel.yml"
if (Test-Path $yml) {
  $hostTunel = ((Get-Content $yml | Where-Object { $_ -match 'hostname:' }) -replace '.*hostname:\s*', '').Trim()
  if ([KRB.Web]::Clave -eq "") {
    Write-Host "  Internet: NO se abrio el tunel porque la suite no tiene clave (luces.json > acceso > clave)." -ForegroundColor Red
  } else {
    $cf = Join-Path $root "cloudflared.exe"
    if (-not (Test-Path $cf)) { $c = Get-Command cloudflared -ErrorAction SilentlyContinue; if ($c) { $cf = $c.Source } }
    if (-not (Test-Path $cf)) { $p = Join-Path ${env:ProgramFiles(x86)} "cloudflared\cloudflared.exe"; if (Test-Path $p) { $cf = $p } }
    if (-not (Test-Path $cf)) {
      Write-Host "  Internet: falta cloudflared.exe. Ejecuta CONFIGURAR_INTERNET.bat." -ForegroundColor Red
    } else {
      $yaCorre = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*tunel.yml*" }
      if (-not $yaCorre) {
        Start-Process -FilePath $cf -ArgumentList @("tunnel", "--config", "`"$yml`"", "run") -WindowStyle Hidden
      }
      $script:tunelCf = $cf; $script:tunelYml = $yml; $script:tunelHost = $hostTunel
      Write-Host ("  Desde internet: https://" + $hostTunel + "  (pide la clave)") -ForegroundColor Green
    }
  }
}
Write-Host ""
Write-Host "  Para apagar el servidor, cerrar esta ventana." -ForegroundColor DarkGray
Write-Host ""

# ---------- Actualizacion automatica (Cote, 25 nov: que no haya que instalar cada vez) ----------
# Cada 5 minutos se revisa en GitHub la rama "luces-estable" (la version publicada; se trabaja en otra rama). Si hay una
# version nueva, se bajan solo los archivos que cambiaron y se instalan sin tocar la calibracion, la clave ni el tunel.
# El panel queda nuevo al instante. Si cambio este programa, se reinicia solo cuando nadie uso las luces en 20 minutos
# (o al pedirlo con "Buscar actualizacion ahora"); el vigilante (INICIAR_OCULTO.vbs) lo vuelve a abrir.
$repo = "cotediazv/cantabingo"; $rama = "luces-estable"
$pVer = Join-Path $root "version.json"
$script:reiniciar = $false
function Leer-Version { if (Test-Path $pVer) { try { return (Get-Content $pVer -Raw -Encoding UTF8 | ConvertFrom-Json) } catch {} }; return $null }
function Mostrar-Version { $v = Leer-Version; if ($v -and $v.sha) { [KRB.Web]::Version = $v.sha.Substring(0, 7) + " (" + $v.fecha + ")" } else { [KRB.Web]::Version = "sin actualizacion automatica todavia" } }
function Huella-Git($f) {
  $b = [IO.File]::ReadAllBytes($f); $h = [Text.Encoding]::ASCII.GetBytes("blob " + $b.Length + [char]0)
  $todo = New-Object byte[] ($h.Length + $b.Length); [Array]::Copy($h, $todo, $h.Length); [Array]::Copy($b, 0, $todo, $h.Length, $b.Length)
  return (([Security.Cryptography.SHA1]::Create().ComputeHash($todo) | ForEach-Object { $_.ToString("x2") }) -join "")
}
function Revisar-Actualizacion {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $h = @{ "User-Agent" = "krb-luces"; "Accept" = "application/vnd.github+json" }
    $sha = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/commits/$rama" -Headers $h -TimeoutSec 20).sha
    $ver = Leer-Version
    if ($ver -and $ver.sha -eq $sha) { return }
    $arbol = Invoke-RestMethod -Uri ("https://api.github.com/repos/$repo/git/trees/" + $sha + "?recursive=1") -Headers $h -TimeoutSec 30
    # se compara cada archivo del Dell con el de GitHub por su huella de Git: solo se baja lo que de verdad cambio
    $cambios = @()
    foreach ($it in $arbol.tree) {
      if ($it.type -ne "blob" -or -not $it.path.StartsWith("KRB_Luces/")) { continue }
      $rel = $it.path.Substring(10); $local = Join-Path $root ($rel -replace '/', '\')
      if (-not (Test-Path $local) -or (Huella-Git $local) -ne $it.sha) { $cambios += $rel }
    }
    $tmp = Join-Path $env:TEMP ("krb-actualizar-" + $sha.Substring(0, 7))
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    foreach ($rel in $cambios) {
      $dst = Join-Path $tmp ($rel -replace '/', '\'); New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
      Invoke-WebRequest -Uri ("https://raw.githubusercontent.com/$repo/$sha/KRB_Luces/" + $rel) -OutFile $dst -UseBasicParsing -TimeoutSec 90
    }
    if (-not (Test-Path (Join-Path $tmp "instalar.ps1"))) { Copy-Item (Join-Path $root "instalar.ps1") $tmp }
    & (Join-Path $tmp "instalar.ps1") -Destino $root -NoArrancar -SinInicio -SinRecuperar | Out-Null
    $fecha = Get-Date -Format "dd-MM HH:mm"
    [IO.File]::WriteAllText($pVer, (@{ sha = $sha; fecha = $fecha } | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Mostrar-Version
    [KRB.Bitacora]::Anotar("Actualizada a la version " + $sha.Substring(0, 7) + ": " + ($(if ($cambios.Count) { $cambios -join ", " } else { "sin cambios en los archivos" })))
    if ($cambios -contains "momentos.txt") { [KRB.Web]::CargarMomentos() }
    if ($cambios -contains "krb_luces.ps1") { $script:reiniciar = $true }
  } catch { [KRB.Bitacora]::Anotar("No se pudo buscar actualizacion: " + $_.Exception.Message) }
}
# Consumo del Dell (Cote, 27 nov: OBS se cerro 3 veces; ver que esta consumiendo): cada 10 minutos queda en el registro de la
# noche el uso del procesador y de la memoria, y los 5 programas que mas procesador usaron en esos 10 minutos.
$script:cpuAntes = @{}; $script:cpuCuando = Get-Date; $script:ultimoConsumo = "(todavia no medido)"; $script:avisoReinicio = $false
function Anotar-Consumo {
  try {
    $ahora = Get-Date; $seg = ($ahora - $script:cpuCuando).TotalSeconds; $nucleos = [Environment]::ProcessorCount
    $uso = @{}; $nuevo = @{}
    foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
      try { $c = $p.TotalProcessorTime.TotalSeconds } catch { continue }
      $nuevo[$p.Id] = $c
      if ($script:cpuAntes.ContainsKey($p.Id)) { $d = $c - $script:cpuAntes[$p.Id]; if ($d -gt 0) { $uso[$p.ProcessName] = ($uso[$p.ProcessName] + $d) } }
    }
    $script:cpuAntes = $nuevo; $script:cpuCuando = $ahora
    if ($seg -lt 60 -or $uso.Count -eq 0) { return }
    $total = 0; foreach ($v in $uso.Values) { $total += $v }
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    $ram = if ($os) { [Math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100) } else { "?" }
    $top = $uso.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5 |
      ForEach-Object { $_.Key + " " + [Math]::Round($_.Value / $seg / $nucleos * 100) + "%" }
    $script:ultimoConsumo = "procesador " + [Math]::Round($total / $seg / $nucleos * 100) + "%, memoria " + $ram + "% en uso. Lo que mas usa: " + ($top -join ", ")
    # Aviso al celular antes de que se caiga (Cote, 28 nov): memoria sobre 90 % en horario de actividades
    if ($ram -ne "?" -and [double]$ram -ge 90 -and [KRB.Aviso]::EnActividad((Get-Date))) { [KRB.Aviso]::Mandar("El Dell esta casi sin memoria (" + $ram + "% en uso). Cierra pestanas del navegador que no se usen en el Dell.", $true) }
    [KRB.Bitacora]::Anotar("Consumo del Dell: " + $script:ultimoConsumo)
  } catch {}
}
# ---------- Diagnostico del Dell (Cote, 28 nov) ----------
# Solo lee: equipo, procesador, memoria (y sus ranuras), disco, video, programas que mas gastan, navegadores, inicio de
# Windows, Windows Update, antivirus, temperatura, plan de energia, errores de Windows de las ultimas 24 h y OBS
# (version, codificador, estadisticas y sus caidas). Nunca cambia nada.
function Diagnostico {
  $o = New-Object System.Collections.Generic.List[string]
  $L = { param($t) $o.Add([string]$t) }
  & $L ("DIAGNOSTICO DEL DELL - " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
  try { $cs = Get-CimInstance Win32_ComputerSystem; & $L ("Equipo: " + $cs.Manufacturer + " " + $cs.Model) } catch {}
  try { $os = Get-CimInstance Win32_OperatingSystem
    & $L ("Windows: " + $os.Caption + " " + $os.Version + " - prendido desde " + $os.LastBootUpTime.ToString("dd-MM HH:mm"))
    & $L ("Memoria: " + [Math]::Round($os.TotalVisibleMemorySize/1MB,1) + " GB en total, " + [Math]::Round($os.FreePhysicalMemory/1MB,1) + " GB libres (" + [Math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/$os.TotalVisibleMemorySize*100) + "% en uso)") } catch {}
  try { foreach ($c in Get-CimInstance Win32_Processor) { & $L ("Procesador: " + $c.Name.Trim() + " - " + $c.NumberOfCores + " nucleos / " + $c.NumberOfLogicalProcessors + " hilos - " + $c.CurrentClockSpeed + " de " + $c.MaxClockSpeed + " MHz - carga " + $c.LoadPercentage + "%") } } catch {}
  try { $arr = Get-CimInstance Win32_PhysicalMemoryArray | Select-Object -First 1; $mods = @(Get-CimInstance Win32_PhysicalMemory)
    $tipo = @{20='DDR';21='DDR2';24='DDR3';26='DDR4';34='DDR5'}; $forma = @{8='DIMM (escritorio)';12='SODIMM (notebook)'}
    & $L ("Ranuras de memoria: " + $arr.MemoryDevices + " en total, " + $mods.Count + " ocupadas - maximo " + [Math]::Round($arr.MaxCapacity/1MB) + " GB")
    foreach ($m in $mods) { & $L ("  - " + [Math]::Round($m.Capacity/1GB) + " GB " + $tipo[[int]$m.SMBIOSMemoryType] + " " + $forma[[int]$m.FormFactor] + " a " + $m.Speed + " MHz - " + $m.Manufacturer + " " + ($m.PartNumber -replace '\s+$','') + " - ranura " + $m.DeviceLocator) } } catch {}
  try { foreach ($g in Get-CimInstance Win32_VideoController) { & $L ("Video: " + $g.Name + " (controlador " + $g.DriverVersion + ")") } } catch {}
  try { $d = Get-PSDrive C; & $L ("Disco C: " + [Math]::Round($d.Free/1GB,1) + " GB libres de " + [Math]::Round(($d.Used+$d.Free)/1GB) + " GB") } catch {}
  try { $pp = (powercfg /getactivescheme) -join " "; & $L ("Plan de energia: " + ($pp -replace '.*\(([^)]*)\).*','$1')) } catch {}
  try { $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop
    & $L ("Temperatura: " + (($t | ForEach-Object { [Math]::Round($_.CurrentTemperature/10 - 273.15) }) -join ", ") + " C") } catch { & $L "Temperatura: Windows no la entrega sin permisos de administrador" }
  & $L ""
  & $L ("Consumo de los ultimos 10 minutos: " + $script:ultimoConsumo)
  try { $ps = Get-Process | Sort-Object WorkingSet64 -Descending
    & $L "Los 10 programas que mas memoria usan:"
    foreach ($p in ($ps | Select-Object -First 10)) { & $L ("  - " + $p.ProcessName + ": " + [Math]::Round($p.WorkingSet64/1MB) + " MB") }
    foreach ($n in @('msedge','chrome','firefox','obs64','powershell','cloudflared')) { $g = @($ps | Where-Object { $_.ProcessName -eq $n })
      if ($g.Count) { & $L ("  " + $n + ": " + $g.Count + " procesos, " + [Math]::Round((($g | Measure-Object WorkingSet64 -Sum).Sum)/1MB) + " MB en total") } } } catch {}
  try { $ventanas = Get-Process | Where-Object { $_.MainWindowTitle -and ($_.ProcessName -eq 'msedge' -or $_.ProcessName -eq 'chrome') } | ForEach-Object { $_.ProcessName + ": " + $_.MainWindowTitle }
    & $L ("Ventanas de navegador abiertas: " + (@($ventanas).Count)); foreach ($v in $ventanas) { & $L ("  - " + $v) } } catch {}
  & $L ""
  # Lo que corre escondido del sistema de luces (Cote, 28 nov: revisar todos los procesos ocultos y cuanto gastan)
  try { & $L "Lo que corre escondido del sistema de luces:"
    foreach ($w in Get-CimInstance Win32_Process -Filter "Name='wscript.exe' or Name='powershell.exe' or Name='cloudflared.exe'") {
      $cl = [string]$w.CommandLine; $que = $null
      if ($cl -like "*INICIAR_OCULTO.vbs*") { $que = "vigilante de las luces (vuelve a abrir el programa si se cierra)" }
      elseif ($cl -like "*estacion.vbs*") { $que = "vigilante de la estacion de ritmo" }
      elseif ($cl -like "*krb_luces.ps1*") { $que = "programa de luces (salida DMX, servidor del panel, OBS, avisos)" }
      elseif ($w.Name -eq "cloudflared.exe") { $que = "tunel de internet (luces.krbstage.cl)" }
      if ($que) { $pr = Get-Process -Id $w.ProcessId -ErrorAction SilentlyContinue
        $seg = "?"; try { $seg = [Math]::Round($pr.TotalProcessorTime.TotalSeconds) } catch {}
        & $L ("  - " + $que + ": " + $(if ($pr) { [Math]::Round($pr.WorkingSet64/1MB) } else { "?" }) + " MB, " + $seg + " s de procesador desde que partio") } }
    $est = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { [string]$_.CommandLine -like "*KRB_Estacion*" })
    if ($est.Count) { $mb = 0; foreach ($e in $est) { $pr = Get-Process -Id $e.ProcessId -ErrorAction SilentlyContinue; if ($pr) { $mb += $pr.WorkingSet64 } }
      & $L ("  - estacion de ritmo (navegador escondido que escucha la musica, " + $est.Count + " procesos): " + [Math]::Round($mb/1MB) + " MB") }
    & $L "  Dentro del programa de luces (no son programas aparte, son tareas chicas del mismo): revisar OBS cada 10 s, buscar version nueva cada 5 min (nunca en el horario de actividades), medir el consumo cada 10 min, Standby de las 19:00."
  } catch {}
  # Disco (Cote, 28 nov: al disco le queda poco espacio): que lo esta llenando
  try { & $L "Que ocupa el disco (carpetas que se pueden revisar):"
    $tam = { param($d) if (-not (Test-Path -LiteralPath $d)) { return -1 }; $t = 0; Get-ChildItem -LiteralPath $d -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $t += $_.Length }; return $t }
    $rec = ""; try { $r = [KRB.Obs]::Consultar("GetRecordDirectory", $null); if ($r -match '"recordDirectory"\s*:\s*"([^"]+)"') { $rec = $Matches[1] -replace '\\\\', '\' } } catch {}
    $lista = @(@("Videos", (Join-Path $env:USERPROFILE "Videos")), @("Descargas", (Join-Path $env:USERPROFILE "Downloads")), @("Escritorio", (Join-Path $env:USERPROFILE "Desktop")),
      @("Archivos temporales", $env:TEMP), @("Temporales de Windows", "C:\Windows\Temp"), @("Papelera", 'C:\$Recycle.Bin'), @("Windows.old (version anterior de Windows)", "C:\Windows.old"),
      @("Actualizaciones descargadas de Windows", "C:\Windows\SoftwareDistribution\Download"), @("Registros de OBS", (Join-Path $env:APPDATA "obs-studio\logs")),
      @("Cache de Edge", (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data\Default\Cache")), @("Cache de Chrome", (Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\Default\Cache")),
      @("Carpeta de luces KRB", $root))
    if ($rec) { $lista += ,@(("Grabaciones de OBS (" + $rec + ")"), $rec) }
    foreach ($x in $lista) { $b = & $tam $x[1]; if ($b -ge 0) { & $L ("  - " + $x[0] + ": " + [Math]::Round($b/1GB, 2) + " GB") } }
  } catch {}
  & $L ""
  try { & $L "Programas que parten con Windows:"; foreach ($x in Get-CimInstance Win32_StartupCommand) { & $L ("  - " + $x.Name + " (" + $x.Location + ")") } } catch {}
  try { $wu = Get-Service wuauserv; & $L ("Windows Update: " + $wu.Status)
    $h = Get-HotFix | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1; if ($h) { & $L ("  Ultima actualizacion instalada: " + $h.HotFixID + " el " + $h.InstalledOn.ToString("dd-MM-yyyy")) }
    $ax = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" -ErrorAction SilentlyContinue
    if ($ax -and $ax.ActiveHoursStart -ne $null) { & $L ("  Horas activas (no reinicia en ese rato): " + $ax.ActiveHoursStart + ":00 a " + $ax.ActiveHoursEnd + ":00") } } catch {}
  try { $av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop; & $L ("Antivirus: " + (($av | ForEach-Object displayName) -join ", ")) } catch {}
  try { $mp = Get-MpComputerStatus -ErrorAction Stop; $pr = Get-MpPreference -ErrorAction Stop
    & $L ("Windows Defender: proteccion en tiempo real " + $mp.RealTimeProtectionEnabled + " - ultimo analisis rapido " + $mp.QuickScanEndTime + " - analisis programado dia " + $pr.ScanScheduleDay + " a las " + $pr.ScanScheduleQuickScanTime) } catch {}
  & $L ""
  try { $desde = (Get-Date).AddDays(-1)
    $ev = @(Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000,1002; StartTime=$desde} -ErrorAction SilentlyContinue)
    & $L ("Programas que se cayeron o se colgaron (24 h): " + $ev.Count)
    foreach ($e in ($ev | Select-Object -First 6)) { & $L ("  - " + $e.TimeCreated.ToString("dd-MM HH:mm") + " " + (($e.Message -split "`n")[0]).Trim()) }
    $mem = @(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Resource-Exhaustion-Detector'; StartTime=$desde} -ErrorAction SilentlyContinue)
    & $L ("Avisos de Windows por memoria agotada (24 h): " + $mem.Count)
    foreach ($e in ($mem | Select-Object -First 3)) { & $L ("  - " + $e.TimeCreated.ToString("dd-MM HH:mm") + " " + (($e.Message -split "`n")[0]).Trim()) }
    $kp = @(Get-WinEvent -FilterHashtable @{LogName='System'; Id=41,6008; StartTime=$desde} -ErrorAction SilentlyContinue)
    & $L ("Apagados o reinicios inesperados (24 h): " + $kp.Count) } catch {}
  & $L ""
  try { $od = Join-Path $env:APPDATA "obs-studio"
    $cr = @(Get-ChildItem (Join-Path $od "crashes") -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    & $L ("OBS: informes de caida guardados: " + $cr.Count + $(if ($cr.Count) { " - el ultimo: " + $cr[0].LastWriteTime.ToString("dd-MM HH:mm") } else { "" }))
    if ($cr.Count -and $cr[0].LastWriteTime -gt (Get-Date).AddDays(-2)) { foreach ($x in (Get-Content $cr[0].FullName -TotalCount 12)) { if ($x.Trim()) { & $L ("    " + $x.Trim()) } } }
    $lg = Get-ChildItem (Join-Path $od "logs") -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($lg) { & $L ("OBS: ultimo registro " + $lg.Name)
      foreach ($x in (Select-String -Path $lg.FullName -Pattern 'encoder|x264|qsv|nvenc|amf|bitrate|Output ''|skipped|lagged|dropped|Multiple|rtmp|Max Memory|Physical Memory' -ErrorAction SilentlyContinue | Select-Object -Last 25)) { & $L ("    " + $x.Line.Trim()) } } } catch {}
  foreach ($q in @(@('GetVersion',$null), @('GetStats',$null), @('GetVideoSettings',$null), @('GetStreamStatus',$null), @('GetRecordStatus',$null),
                   @('GetProfileParameter','{"parameterCategory":"Output","parameterName":"Mode"}'),
                   @('GetProfileParameter','{"parameterCategory":"SimpleOutput","parameterName":"StreamEncoder"}'),
                   @('GetProfileParameter','{"parameterCategory":"SimpleOutput","parameterName":"VBitrate"}'),
                   @('GetProfileParameter','{"parameterCategory":"AdvOut","parameterName":"Encoder"}'))) {
    try { $r = [KRB.Obs]::Consultar($q[0], $q[1]); $i = $r.IndexOf('"responseData"'); if ($i -ge 0) { $r = $r.Substring($i + 15).TrimEnd('}') } elseif ($r.IndexOf('"comment"') -ge 0) { $r = "OBS respondio: " + ($r -replace '^.*"comment"\s*:\s*"([^"]*)".*$', '$1') }; & $L ("OBS " + $q[0] + $(if ($q[1]) { " " + $q[1] } else { "" }) + ": " + $r) } catch {}
  }
  [IO.File]::WriteAllText((Join-Path $root "diagnostico.txt"), ($o -join "`r`n"), (New-Object Text.UTF8Encoding $false))
}
# ---------- Registro en linea (Cote, 28 nov: «no voy a ir a buscar el registro al Dell; busquense una forma de verlo online») ----------
# Cada 10 minutos (solo si cambio) el Dell sube a la Sala de juegos (Render) la noche actual, la anterior y el ultimo
# diagnostico, con la clave de las luces. Al terminar cada noche (01:35) arma un diagnostico nuevo y lo sube. Lo leen el
# moderador (Centro de control > Registro de las luces) y Code 4 con su enlace de lectura.
$salaUrl = if ($cfg.sala_url) { [string]$cfg.sala_url } else { "https://cantabingo.onrender.com" }
$script:ultimaSubida = ""
function Subir-Registro {
  if ([KRB.Web]::Clave -eq "") { return }
  try {
    $hoy = [KRB.Bitacora]::Noche((Get-Date)); $ayer = [KRB.Bitacora]::Noche((Get-Date).AddDays(-1))
    $diag = ""; $pd = Join-Path $root "diagnostico.txt"; if (Test-Path $pd) { $diag = [IO.File]::ReadAllText($pd) }
    $cuerpo = @{ version = [KRB.Web]::Version; diagnostico = $diag; noches = @(@{ noche = $hoy; texto = [KRB.Bitacora]::Leer($hoy) }, @{ noche = $ayer; texto = [KRB.Bitacora]::Leer($ayer) }) } | ConvertTo-Json -Depth 4 -Compress
    $huella = [Convert]::ToBase64String([Security.Cryptography.SHA1]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($cuerpo)))
    if ($huella -eq $script:ultimaSubida) { return }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-RestMethod -Uri ($salaUrl.TrimEnd('/') + "/api/luces/registro") -Method Post -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) -Headers @{ Authorization = ("Bearer " + [KRB.Web]::Clave) } -TimeoutSec 30 | Out-Null
    $script:ultimaSubida = $huella
  } catch {}
}
# ---------- Vigilante del tunel (Cote, 28 nov: el diagnostico mostro «Cloudflare Tunnel error» en luces.krbstage.cl) ----------
# Antes el tunel solo se abria al partir el programa: si se cerraba o quedaba pegado, nadie lo volvia a abrir y el panel no
# respondia desde afuera. Ahora, cada 5 minutos, el Dell prueba su propia direccion por internet; si falla dos veces
# seguidas (o el tunel no esta corriendo), lo vuelve a abrir, lo anota y avisa al celular.
$script:tunelFallos = 0
function Revisar-Tunel {
  if (-not $script:tunelCf -or -not $script:tunelHost) { return }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $corre = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*tunel.yml*" }
    $ok = $false
    if ($corre) {
      try { $r = Invoke-WebRequest -Uri ("https://" + $script:tunelHost + "/api/estado") -UseBasicParsing -TimeoutSec 15; $ok = $true }
      catch { $code = 0; try { $code = [int]$_.Exception.Response.StatusCode } catch {}; if ($code -eq 401 -or $code -eq 200) { $ok = $true } }
    }
    if ($ok) { $script:tunelFallos = 0; return }
    $script:tunelFallos++
    if (-not $corre -or $script:tunelFallos -ge 2) {
      foreach ($x in $corre) { try { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
      Start-Sleep -Seconds 2
      Start-Process -FilePath $script:tunelCf -ArgumentList @("tunnel", "--config", "`"$($script:tunelYml)`"", "run") -WindowStyle Hidden
      [KRB.Bitacora]::Anotar("Tunel de internet: no respondia; se volvio a abrir")
      [KRB.Aviso]::Mandar("El tunel de luces.krbstage.cl no respondia. El Dell lo volvio a abrir (" + (Get-Date -Format "HH:mm") + ").", $true)
      $script:tunelFallos = 0
    }
  } catch {}
}
Anotar-Consumo
$proximoConsumo = (Get-Date).AddMinutes(10)
$proximoTunel = (Get-Date).AddMinutes(3)
$proximaSubida = (Get-Date).AddMinutes(2)
$script:diagNoche = ""
Mostrar-Version
$proxima = (Get-Date).AddSeconds(60)
$avisoPausa = $false
while ($true) {
  Start-Sleep -Seconds 1
  if ((Get-Date) -ge $proximoConsumo) { Anotar-Consumo; $proximoConsumo = (Get-Date).AddMinutes(10) }
  # el diagnostico se arma solo cuando se pide con el boton (Cote, 28 nov: «entre mas procesos ocultos, peor»)
  if ([KRB.Web]::PedirDiagnostico) { [KRB.Web]::PedirDiagnostico = $false; try { Diagnostico } catch {}; $proximaSubida = Get-Date }
  # al terminar la noche (01:35, ya fuera del horario de actividades): un diagnostico nuevo, una vez por noche
  $ahoraN = Get-Date; $nocheAyer = [KRB.Bitacora]::Noche($ahoraN)
  if ($ahoraN.Hour -eq 1 -and $ahoraN.Minute -ge 35 -and $script:diagNoche -ne $nocheAyer -and -not $enActividad) { $script:diagNoche = $nocheAyer; try { Diagnostico } catch {}; $proximaSubida = Get-Date }
  if ((Get-Date) -ge $proximaSubida) { Subir-Registro; $proximaSubida = (Get-Date).AddMinutes(10) }
  if ((Get-Date) -ge $proximoTunel) { Revisar-Tunel; $proximoTunel = (Get-Date).AddMinutes(5) }
  $forzar = [KRB.Web]::PedirActualizar
  # Nunca durante las actividades (Cote, 27 nov): en el horario del local (con margen) no se busca ni se reinicia; solo si se
  # pide a mano con "Buscar actualizacion ahora"
  $enActividad = [KRB.Aviso]::EnActividad((Get-Date))
  if ($enActividad -and -not $avisoPausa) { [KRB.Bitacora]::Anotar("Actualizaciones en pausa: horario de actividades"); $avisoPausa = $true }
  if (-not $enActividad) { $avisoPausa = $false }
  if ($forzar -or ((Get-Date) -ge $proxima -and -not $enActividad)) { [KRB.Web]::PedirActualizar = $false; Revisar-Actualizacion; $proxima = (Get-Date).AddMinutes(5) }
  if ($script:reiniciar) {
    $quieto = ([DateTime]::UtcNow - [KRB.Web]::UltimaActividad).TotalMinutes -ge 20 -and -not $enActividad
    # Cote (28 nov): en el show, «Buscar actualizacion ahora» reinicio el programa y las luces se demoraron. En el horario de
    # actividades se instala lo nuevo del panel, pero el programa NO se reinicia hasta que termine la noche
    if ($forzar -and $enActividad -and -not $script:avisoReinicio) { [KRB.Bitacora]::Anotar("Actualizacion instalada; el programa se reinicia cuando termine el horario de actividades"); $script:avisoReinicio = $true }
    if ($quieto -or ($forzar -and -not $enActividad)) {
      [KRB.Bitacora]::Anotar("Se reinicia para terminar la actualizacion (vuelve en unos segundos)")
      try { Stop-Transcript | Out-Null } catch {}
      exit
    }
  }
}
