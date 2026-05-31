; "Open in Atlas" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInAtlas" "" "Open in Atlas"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInAtlas" "Icon" '"$INSTDIR\atlas.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInAtlas" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInAtlas\command" "" '"$INSTDIR\atlas.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInAtlas" "" "Open in Atlas"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInAtlas" "Icon" '"$INSTDIR\atlas.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInAtlas" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInAtlas\command" "" '"$INSTDIR\atlas.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInAtlas" "" "Open in Atlas"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInAtlas" "Icon" '"$INSTDIR\atlas.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInAtlas" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInAtlas\command" "" '"$INSTDIR\atlas.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInAtlas"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInAtlas"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInAtlas"
!macroend
