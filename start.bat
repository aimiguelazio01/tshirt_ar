@echo off
REM ===========================================================================
REM  start.bat  —  double-click this to run the WebAR experience locally.
REM  ---------------------------------------------------------------------------
REM  WebAR (camera + file loading) is blocked on file:// by every browser, so
REM  the site MUST be served over http(s)://. This launcher boots a tiny local
REM  static server and opens your default browser to it. No install needed.
REM
REM  Phone test:  join the SAME Wi-Fi as this PC, then on your phone open
REM               http://<THIS-PC-IP>:8000/   (see the IP printed below).
REM               NOTE: the phone CAMERA needs HTTPS — plain http:// loads the
REM               page but mobile browsers will block the camera. For real AR
REM               on a phone, deploy to Netlify (https://app.netlify.com/drop)
REM               to get a free https:// URL.
REM ===========================================================================
setlocal
cd /d "%~dp0"
set "PORT=8000"

echo ============================================================
echo  MV WebAR - local server starting on port %PORT% ...
echo  Desktop:  http://localhost:%PORT%/
echo  Phone:    http://^<this-pc-ip^>:%PORT%/   (same Wi-Fi; camera needs HTTPS)
echo  Press Ctrl+C in this window to stop it.
echo ============================================================
echo.

REM Show this machine's LAN IPs so the phone URL is easy to find.
echo Your LAN IP addresses (pick the one matching your Wi-Fi):
ipconfig | findstr /R /C:"IPv4"
echo.

REM Open the desktop browser after a short delay, in the background.
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%/"

REM Serve. Prefer Python (zero-install, already present); fall back to npx.
where py >nul 2>nul && (
  py -m http.server %PORT% --bind 127.0.0.1
  goto :end
)
where python >nul 2>nul && (
  python -m http.server %PORT% --bind 127.0.0.1
  goto :end
)

echo Python not found; trying npx http-server (downloads on first run)...
call npx --yes http-server -p %PORT% -a 127.0.0.1 -c-1

:end
endlocal
