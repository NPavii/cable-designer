// Автообновление через серверную папку (SMB/UNC или локальный путь).
//
// Раскладка на «сервере»:
//   \\SERVER\share\cable-designer\
//   ├── version.json   { "version": "1.1.0", "notes": "что нового" }
//   └── app\           полное содержимое папки cable-designer-win32-x64
//
// Приложение сверяет свою версию (package.json) с version.json,
// скачивает app\ robocopy'ем во временную папку, затем cmd-скрипт
// дожидается закрытия приложения, накатывает файлы и запускает его снова.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile, spawn } = require('child_process')

function readJson (p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

// Сравнение версий вида "1.2.3": >0 — a новее, <0 — b новее
function compareVersions (a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  }
  return 0
}

function localVersion (appPath) {
  const pkg = readJson(path.join(appPath, 'package.json'))
  return (pkg && pkg.version) || '0.0.0'
}

// robocopy: коды выхода 0..7 — успех (что-то скопировано/совпадает)
function robocopy (src, dst) {
  return new Promise((resolve, reject) => {
    execFile(
      'robocopy',
      // /COPY:D /DCOPY:D — только данные: сетевые диски (WebDAV и т.п.)
      // отклоняют запись атрибутов/времени (ERROR 5) и копирование виснет
      [src, dst, '/MIR', '/COPY:D', '/DCOPY:D', '/NFL', '/NDL', '/NJH', '/NJS', '/R:2', '/W:2'],
      { windowsHide: true },
      (err) => {
        if (err && typeof err.code === 'number' && err.code > 7) {
          reject(new Error('robocopy failed, code ' + err.code))
        } else {
          resolve()
        }
      }
    )
  })
}

// Проверка обновления. updateDir — папка с version.json и app\
async function check (updateDir, appPath) {
  if (!updateDir) return { ok: false, error: 'Путь к серверной папке не настроен' }
  if (!fs.existsSync(updateDir)) {
    return { ok: false, error: 'Серверная папка недоступна: ' + updateDir }
  }
  const manifest = readJson(path.join(updateDir, 'version.json'))
  if (!manifest || !manifest.version) {
    return { ok: false, error: 'В серверной папке нет version.json' }
  }
  const local = localVersion(appPath)
  const hasUpdate = compareVersions(manifest.version, local) > 0
  return {
    ok: true,
    hasUpdate,
    localVersion: local,
    remoteVersion: manifest.version,
    notes: manifest.notes || '',
  }
}

// Скачивание новой версии во временную папку
async function download (updateDir) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'cable-designer-update-'))
  await robocopy(path.join(updateDir, 'app'), path.join(staging, 'app'))
  return staging
}

// Применение: cmd-скрипт ждёт завершения процесса, накатывает файлы, перезапускает.
// Вызывающая сторона после этого должна завершить приложение (app.quit()).
function applyAndRestart (staging, appRoot, exePath, pid) {
  const scriptPath = path.join(staging, 'apply-update.cmd')
  const lines = [
    '@echo off',
    ':wait',
    `tasklist /FI "PID eq ${pid}" | find "${pid}" >nul`,
    'if %errorlevel%==0 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto wait',
    ')',
    `robocopy "${path.join(staging, 'app')}" "${appRoot}" /MIR /COPY:D /DCOPY:D /NFL /NDL /NJH /NJS /R:3 /W:2 >nul`,
    `start "" "${exePath}"`,
    '',
  ]
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'ascii')
  spawn('cmd', ['/c', scriptPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

module.exports = { check, download, applyAndRestart, compareVersions }
