' LUCES KRB - corre la suite en segundo plano, sin ventana, y la vuelve a abrir sola si se cierra o se cae.
' La usa el arranque automatico de Windows y tambien INICIAR.bat. Para detenerla: DETENER.bat
' (deja el archivo detenida.txt, que le avisa a este vigilante que no la vuelva a abrir).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta
alto = carpeta & "\detenida.txt"
If fso.FileExists(alto) Then fso.DeleteFile alto, True

' Un solo vigilante: si ya hay otro corriendo, este termina (el otro ya se encarga)
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
n = 0
For Each p In wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='wscript.exe' OR Name='cscript.exe'")
  If Not IsNull(p.CommandLine) Then
    If InStr(LCase(p.CommandLine), "iniciar_oculto.vbs") > 0 Then n = n + 1
  End If
Next
If n > 1 Then WScript.Quit

Do
  sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & carpeta & "\krb_luces.ps1""", 0, True
  If fso.FileExists(alto) Then Exit Do
  WScript.Sleep 5000
Loop
