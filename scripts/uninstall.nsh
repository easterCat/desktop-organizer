!macro customRemoveFiles
  ; 删除应用安装目录下由 Electron 产生的缓存和数据目录
  ; 确保卸载时一并清除所有运行时产生的文件
  RMDir /r "$INSTDIR\cache"
  RMDir /r "$INSTDIR\session-data"
  RMDir /r "$INSTDIR\crash-dumps"
  RMDir /r "$INSTDIR\logs"
  RMDir /r "$INSTDIR\temp"
  RMDir /r "$INSTDIR\datas"
  RMDir /r "$INSTDIR\icons"
!macroend
