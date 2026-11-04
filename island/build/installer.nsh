; Extra steps for the WinIsland installer / uninstaller (included by electron-builder).

!macro customInit
  ; Stop the background helper so its files can be replaced.
  nsExec::Exec 'taskkill /F /IM IslandHelper.exe'
!macroend

!macro customUnInstall
  nsExec::Exec 'taskkill /F /IM IslandHelper.exe'
  ; Remove the "Start with Windows" entry that WinIsland registers from its settings.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WinIsland"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.winisland.app"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "WinIsland"
!macroend
