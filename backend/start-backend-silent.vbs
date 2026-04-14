Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & WScript.ScriptFullName & Chr(34), 0, False
Dim batPath
batPath = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\")) & "start-backend.bat"
WshShell.Run Chr(34) & batPath & Chr(34), 0, False
Set WshShell = Nothing
