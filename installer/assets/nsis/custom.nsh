!macro customInstall
  DetailPrint "CAVALLO: writing install log"
  FileOpen $9 "$INSTDIR\install.log" a
  FileWrite $9 "CAVALLO Studio installed to $INSTDIR$\r$\n"
  FileClose $9
!macroend

!macro customUnInstall
  Delete "$INSTDIR\install.log"
!macroend
