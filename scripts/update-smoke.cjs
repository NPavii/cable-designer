const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const release = path.resolve(root, '../release/cable-designer-win32-x64');
const testRoot = path.join(root, '.update-test');
const install = path.join(testRoot, 'install');
const server = path.join(testRoot, 'server');
const profile = path.join(testRoot, 'profile');
const installExe = path.join(install, 'cable-designer.exe');
const installPackage = path.join(install, 'resources/app/package.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child;
let ws;
let nextId = 1;
let debugPort = 9224;
const pending = new Map();

function stopByExe() {
  const quoted = installExe.replace(/'/g, "''");
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${quoted}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
  } catch {}
}

async function launch() {
  const port = debugPort++;
  child = spawn(installExe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
  let page;
  for (let i = 0; i < 100; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      page = pages.find((p) => p.type === 'page');
      if (page) break;
    } catch {}
    await sleep(200);
  }
  if (!page) throw new Error(`Test application did not start on debug port ${port}`);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else if (msg.result.exceptionDetails) reject(new Error(msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails.text));
    else resolve(msg.result.result?.value);
  };
}

async function evaluate(expression) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout')); } }, 15000);
  });
}

async function waitFor(expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await sleep(150);
  }
  throw new Error(`Timeout waiting for ${expression}`);
}

(async () => {
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.cpSync(release, install, { recursive: true });
    fs.cpSync(install, path.join(server, 'app'), { recursive: true });
    const serverPackage = path.join(server, 'app/resources/app/package.json');
    const pkg = JSON.parse(fs.readFileSync(serverPackage, 'utf8'));
    pkg.version = '9.9.9';
    fs.writeFileSync(serverPackage, JSON.stringify(pkg, null, 2));
    fs.writeFileSync(path.join(server, 'version.json'), JSON.stringify({ version: '9.9.9', notes: 'Тест полного цикла обновления' }));
    fs.writeFileSync(path.join(profile, 'update-settings.json'), JSON.stringify({ updateDir: server, defaultDir: '' }));
    fs.writeFileSync(path.join(profile, 'keep-user-file.txt'), 'do-not-delete');

    await launch();
    await waitFor('!!document.querySelector(".update-dialog")');
    if (!await evaluate('document.querySelector(".update-dialog").textContent.includes("Тест полного цикла обновления")')) throw new Error('Update notes are missing');
    await evaluate(`(() => {
      localStorage.setItem('cable-designer-note-templates-v1', JSON.stringify(['Сохранённый шаблон']));
      const key = Object.keys(localStorage).find(k => k.startsWith('cable-designer-project-v2'));
      const project = JSON.parse(localStorage.getItem(key));
      project.docNumber = 'PRESERVED-PROJECT';
      localStorage.setItem(key, JSON.stringify(project));
    })()`);
    await evaluate(`[...document.querySelectorAll('.update-dialog button')].find(b => b.textContent.trim() === 'Нет').click()`);
    await sleep(200);
    if (await evaluate('!!document.querySelector(".update-dialog")')) throw new Error('No button did not close update dialog');
    if (JSON.parse(fs.readFileSync(installPackage, 'utf8')).version !== JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version) throw new Error('No button changed application files');
    await sleep(500);
    await evaluate('window.close()');
    ws.close();
    await sleep(1000);
    stopByExe();
    await sleep(500);

    await launch();
    await waitFor('!!document.querySelector(".update-dialog")');
    await evaluate(`[...document.querySelectorAll('.update-dialog button')].find(b => b.textContent.trim() === 'Да').click()`);
    const start = Date.now();
    while (Date.now() - start < 120000) {
      try {
        if (JSON.parse(fs.readFileSync(installPackage, 'utf8')).version === '9.9.9') break;
      } catch {}
      await sleep(500);
    }
    if (JSON.parse(fs.readFileSync(installPackage, 'utf8')).version !== '9.9.9') throw new Error('Update was not applied');
    if (fs.readFileSync(path.join(profile, 'keep-user-file.txt'), 'utf8') !== 'do-not-delete') throw new Error('User data was changed');
    stopByExe();
    await sleep(500);

    await launch();
    await waitFor('!!document.querySelector(".editor-panel")');
    const preservedTemplates = await evaluate('localStorage.getItem("cable-designer-note-templates-v1")');
    if (!preservedTemplates?.includes('Сохранённый шаблон')) throw new Error(`Templates were not preserved: ${preservedTemplates}`);
    if (await evaluate('document.querySelector(".editor-panel input.win-input").value') !== 'PRESERVED-PROJECT') throw new Error('Project was not preserved');
    if (JSON.parse(fs.readFileSync(installPackage, 'utf8')).version !== '9.9.9') throw new Error('Updated version did not restart correctly');
    console.log(JSON.stringify({ ok: true, noPreservesFiles: true, yesDownloadsAndApplies: true, restart: true, projectsPreserved: true, templatesPreserved: true }));
  } finally {
    try { ws?.close(); } catch {}
    try { child?.kill(); } catch {}
    stopByExe();
    await sleep(1000);
    if (!process.env.KEEP_UPDATE_TEST) {
      for (let i = 0; i < 5; i++) {
        try { fs.rmSync(testRoot, { recursive: true, force: true }); break; }
        catch { await sleep(500); }
      }
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
