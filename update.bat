@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title YouTube Chat Overlay - Update
set "URL=https://github.com/gousi504/youtube-chat-overlay/releases/latest/download/youtube-chat-overlay.zip"
set "WORK=%TEMP%\yco-update-%RANDOM%%RANDOM%"
set "SRC=%WORK%\youtube-chat-overlay"

echo ============================================
echo   YouTube Chat Overlay を最新版に更新します
echo ============================================
echo.
echo  先に、起動中の黒い窓（start.bat）を閉じてください。
echo  今の設定（config.json）はそのまま残ります。
echo.
if exist "%~dp0.git" goto :devfolder
pause

mkdir "%WORK%" || goto :fail
echo [1/3] ダウンロード中...
curl.exe -L --fail --silent --show-error -o "%WORK%\latest.zip" "%URL%" || goto :fail
echo [2/3] 展開中...
tar.exe -xf "%WORK%\latest.zip" -C "%WORK%" || goto :fail
if not exist "%SRC%\server.js" goto :fail
echo [3/3] 上書き中...
robocopy "%SRC%" "%~dp0." /E /XF update.bat config.json /XD node_modules public runtime /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
robocopy "%SRC%\node_modules" "%~dp0node_modules" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
robocopy "%SRC%\public" "%~dp0public" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
robocopy "%SRC%\runtime" "%~dp0runtime" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail

echo.
echo  更新が完了しました。バージョン:
type "%~dp0version.txt"
echo.
echo  start.bat をダブルクリックして起動してください。
echo.
pause
(copy /y "%SRC%\update.bat" "%~f0" >nul & rmdir /s /q "%WORK%" & exit /b 0)

:devfolder
echo  このフォルダは開発用のため、更新を中止しました。
pause
exit /b 1

:fail
echo.
echo  更新に失敗しました。
echo  ・インターネットにつながっているか
echo  ・start.bat の黒い窓を閉じたか
echo  を確認して、もう一度 update.bat を実行してください。
echo.
if exist "%WORK%" rmdir /s /q "%WORK%"
pause
exit /b 1
