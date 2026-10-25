; Uninstall (not update): give the official AULA drivers their exe names and autostart entries back.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\vendor-restore.ps1"'
    Pop $0
  ${endIf}
!macroend
