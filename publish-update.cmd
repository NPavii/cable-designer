@echo off
setlocal
rem ============================================================
rem  Publikaciya obnovleniya na servernuyu papku.
rem  Ispolzovanie:
rem    publish-update.cmd [put_k_papke] ["chto novogo"]
rem  Bez parametrov - put i zametki po umolchaniyu nizhe.
rem  VNIMANIE: fajl dolzhen ostavatsya v kodirovke cp866 (OEM)!
rem ============================================================

set SERVER=%~1
if "%SERVER%"=="" set SERVER=Z:\Документы. Электроника\Новопашин\!Kimi\cable-designer
set NOTES=%~2
if "%NOTES%"=="" set NOTES=Обновление

set APPDIR=%~dp0cable-designer-win32-x64

for /f %%a in ('powershell -NoProfile -Command "(Get-Content '%APPDIR%\resources\app\package.json' -Raw | ConvertFrom-Json).version"') do set VER=%%a

echo Publikuyu versiyu %VER% v %SERVER% ...
if not exist "%SERVER%" mkdir "%SERVER%"
rem /COPY:D /DCOPY:D - tolko dannye: setevye diski (WebDAV) ne dayut
rem zapisat atributy/vremya, i robocopy visnet s ERROR 5
robocopy "%APPDIR%" "%SERVER%\app" /MIR /COPY:D /DCOPY:D /NFL /NDL /NJH /R:2 /W:2
powershell -NoProfile -Command "[IO.File]::WriteAllText('%SERVER%\version.json', '{ \"version\": \"%VER%\", \"notes\": \"%NOTES%\" }', [Text.UTF8Encoding]::new($false))"
echo Gotovo. Kollegi uvidyat obnovlenie %VER% pri sleduyushchei proverke.
endlocal
