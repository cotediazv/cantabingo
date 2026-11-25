# ============================================================
#  LUCES KRB - servidor DMX para el Dell (Windows)
#  Recibe ordenes del iPad por WiFi y las envia al cable USB a DMX 512.
#  No necesita instalar nada: usa PowerShell y .NET que ya vienen en Windows.
#  Se inicia con INICIAR.bat (doble clic).
# ============================================================
param([string]$Config = "")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
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

  // ---------- Efectos que corren en el Dell (siguen aunque el iPad se bloquee) ----------
  public class Efecto {
    public string Tipo;                       // "seno" o "sec"
    public int[] Ch; public double[] Centro; public double[] Amp; public double Periodo;
    public List<Dictionary<int, int>> Pasos; public double T; public double Fx;
    public double Inicio;
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
    static Dictionary<string, Efecto> efectos = new Dictionary<string, Efecto>();
    static Stopwatch reloj = Stopwatch.StartNew();

    public static void PonerEfecto(string id, Efecto e) {
      lock (L) { e.Inicio = reloj.Elapsed.TotalSeconds; efectos[id] = e; }
    }
    public static void QuitarEfecto(string id) { lock (L) { efectos.Remove(id); } }
    public static void QuitarEfectos() { lock (L) { efectos.Clear(); } }
    public static string[] Efectos() { lock (L) { return new List<string>(efectos.Keys).ToArray(); } }

    static void AplicarEfectos(byte[] frame) {
      double ahora = reloj.Elapsed.TotalSeconds;
      foreach (Efecto e in efectos.Values) {
        double t = ahora - e.Inicio;
        if (e.Tipo == "seno") {
          for (int k = 0; k < e.Ch.Length; k++) {
            double v = e.Centro[k] + e.Amp[k] * Math.Sin(2 * Math.PI * (k + 1) * t / Math.Max(0.5, e.Periodo));
            Poner(frame, e.Ch[k], v);
          }
        } else if (e.Tipo == "sec" && e.Pasos.Count > 0) {
          int n = e.Pasos.Count;
          double pos = t / Math.Max(0.03, e.T);
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
        port = null; ftdi = IntPtr.Zero; Conectado = false; PuertoUsado = "";
        if (Tipo == "simulacion") { Error = ""; return; }
        try {
          string p = Puerto;
          bool auto = p == null || p == "" || p.ToLower() == "auto";
          // "ftdi" (o auto sin puerto COM de un cable USB): por el driver de FTDI, como Freestyler
          if (Tipo != "enttec" && (p != null && p.ToLower() == "ftdi" || auto && ComUsb() == null)) {
            string err = AbrirFtdi();
            if (err == null) { PuertoUsado = "FTDI (driver directo)"; Conectado = true; Error = ""; return; }
            // Ya no se toma "el ultimo COM": en muchos computadores es un puerto de Bluetooth y falla con
            // "se agoto el tiempo de espera del semaforo". Se informa lo que hay para poder elegirlo a mano.
            string[] todos = SerialPort.GetPortNames();
            Error = "No se encontro el cable USB-DMX. Puertos COM: " + (todos.Length == 0 ? "ninguno" : string.Join(", ", todos)) +
                    " (ninguno es de un cable USB). FTDI: " + err + ".";
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

    static void Loop() {
      byte[] frame = new byte[513];               // frame[0] = codigo de inicio 0
      Stopwatch sw = Stopwatch.StartNew();
      double last = 0;
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
          Array.Copy(frame, ultimo, 513);
          s = port;
        }
        IntPtr fh = ftdi;
        if (fh != IntPtr.Zero && Conectado) {         // por el driver de FTDI: BREAK, MAB y la trama
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
    public static string ConfigPath;
    public static string Clave = "";               // vacia = sin clave
    public static bool PedirEnWifiLocal = false;    // false = en el WiFi del local no se pide clave
    public static string Sala = "kennedy";          // los momentos que traen &sala= solo se aceptan si es esta sala (Mercado Kennedy)
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
      try {
        NetworkStream s = c.GetStream();
        s.ReadTimeout = 5000;
        StreamReader r = new StreamReader(s, Encoding.ASCII);
        string linea = r.ReadLine();
        if (linea == null) return;
        string h, cookies = null, autorizacion = null; int largo = 0; bool porTunel = false;
        while (!string.IsNullOrEmpty(h = r.ReadLine())) {
          int i = h.IndexOf(':'); if (i < 0) continue;
          string k = h.Substring(0, i).Trim().ToLower(), v = h.Substring(i + 1).Trim();
          if (k == "cookie") cookies = v;
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
        if (ruta == "/api/login") { Login(s, cuerpo); return; }
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
          bool ok; lock (SL) { ok = tk != null && sesiones.Contains(tk); }
          if (!ok && autorizacion != null && autorizacion.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            ok = IgualSeguro(autorizacion.Substring(7).Trim(), Clave);
          if (!ok && ruta != "/" && ruta != "/index.html") {
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
        // Solo la Sala de juegos de Mercado Kennedy (Cote, 24 nov): si el aviso dice de que sala viene y no es esta, no se toca nada
        string sala = Arg(query, "sala");
        if (sala != null && sala.ToLower().IndexOf(Sala.ToLower()) < 0) {
          Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":false,\"ignorado\":\"otra sala\",\"sala\":\"" + Esc(sala) + "\"}")); return;
        }
        if (!EjecutarMomento(n)) { Enviar(s, "404 Not Found", "application/json", Encoding.UTF8.GetBytes("{\"error\":\"momento desconocido\",\"nombre\":\"" + Esc(n) + "\"}")); return; }
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
        if (d != null && d.StartsWith("{")) File.WriteAllText(Path.Combine(Root, "datos.json"), d, new UTF8Encoding(false));
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}"));
        return;
      }
      if (ruta == "/api/reconectar") { Dmx.Abrir(); Estado(s); return; }
      if (ruta == "/api/estado") { Estado(s); return; }
      Enviar(s, "404 Not Found", "text/plain", Encoding.UTF8.GetBytes("No encontrado"));
    }

    /* Acciones sobre las luces: las usa la red (/api/...) y tambien los momentos guardados */
    static bool Accion(string ruta, string query) {
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
      if (ruta == "/api/apagar") { Dmx.QuitarEfectos(); Dmx.Todo(0, Num(Arg(query, "f"), 0)); return true; }
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
    static bool EjecutarMomento(string nombre) {
      List<string> acc;
      lock (ML) { if (!momentos.TryGetValue(nombre, out acc)) return false; }
      if (acc.Count == 0) return true;                                     // momento sin acciones (p. ej. bingo_numero): no cambia nada
      // "@previo" = volver al ultimo momento estable (p. ej. despues del verde de una correcta, al rojo del reloj).
      // Los momentos que terminan en "@previo" son de paso y no cuentan como estables.
      bool dePaso = acc.Contains("@previo");
      int gen = Interlocked.Increment(ref genMomento);
      MomentoActual = nombre; MomentoN++;
      if (!dePaso) MomentoEstable = nombre;
      Thread t = new Thread(() => {
        foreach (string l in acc) {
          if (gen != genMomento) return;                                   // llego otro momento: se cancela este
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

    static string Esc(string t) { return (t ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " "); }

    static void Estado(NetworkStream s) {
      StringBuilder b = new StringBuilder();
      b.Append("{\"tipo\":\"").Append(Esc(Dmx.Tipo)).Append("\"");
      b.Append(",\"puerto\":\"").Append(Esc(Dmx.PuertoUsado)).Append("\"");
      b.Append(",\"conectado\":").Append(Dmx.Conectado ? "true" : "false");
      b.Append(",\"error\":\"").Append(Esc(Dmx.Error)).Append("\"");
      b.Append(",\"tramas\":").Append(Dmx.Tramas);
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

    static void Login(NetworkStream s, string cuerpo) {
      // El navegador envia la clave en el cuerpo (POST), nunca en la direccion.
      if (Clave == "") { Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}")); return; }
      if (fallosLogin >= 5) Thread.Sleep(5000);           // freno contra adivinar la clave
      if (IgualSeguro(cuerpo.Trim(), Clave)) {
        string tk = NuevoToken();
        lock (SL) { sesiones.Add(tk); GuardarSesiones(); }
        fallosLogin = 0;
        Enviar(s, "200 OK", "application/json", Encoding.UTF8.GetBytes("{\"ok\":true}"),
               "krb=" + tk + "; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax");
      } else {
        fallosLogin++;
        Thread.Sleep(1500);
        Enviar(s, "401 Unauthorized", "application/json", Encoding.UTF8.GetBytes("{\"login\":true,\"error\":\"Clave incorrecta\"}"));
      }
    }

    static void Enviar(NetworkStream s, string estado, string tipo, byte[] cuerpo) { Enviar(s, estado, tipo, cuerpo, null); }
    static void Enviar(NetworkStream s, string estado, string tipo, byte[] cuerpo, string setCookie) {
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
      Write-Host ("  Desde internet: https://" + $hostTunel + "  (pide la clave)") -ForegroundColor Green
    }
  }
}
Write-Host ""
Write-Host "  Para apagar el servidor, cerrar esta ventana." -ForegroundColor DarkGray
Write-Host ""

while ($true) { Start-Sleep -Seconds 1 }
