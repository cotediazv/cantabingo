' LUCES KRB - abre la suite sin ventana (la usa el arranque automatico de Windows).
' Para verla con ventana, abrir INICIAR.bat (cierra solo la copia oculta). Para detenerla: DETENER.bat
Set sh = CreateObject("WScript.Shell")
carpeta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & carpeta & "\krb_luces.ps1""", 0, False
