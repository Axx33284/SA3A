; Extra steps for the SA3A installer / uninstaller (included by electron-builder).

!macro customUnInstall
  ; Remove the "Start with Windows" entry that SA3A registers from its settings.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SA3A"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "SA3A"
!macroend
