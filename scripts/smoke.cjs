const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Модульная проверка переноса шаблонов без открытия системных файловых диалогов.
function testTemplateLibrary() {
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(root, 'src/lib/templates.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const store = new Map();
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const window = { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  const templateModule = { exports: {} };
  new Function('exports', 'module', 'localStorage', 'window', 'CustomEvent', code)(templateModule.exports, templateModule, localStorage, window, CustomEvent);
  const api = templateModule.exports;
  api.writeTemplates('note', ['Шаблон А']);
  const exported = api.templatesToJson();
  const added = api.importTemplates(exported.replace('Шаблон А', 'Шаблон Б'));
  if (added.note !== 1 || !exported.includes('cable-designer-templates')) throw new Error('Template library export/import failed');
  if (api.readTemplates('note').join(',') !== 'Шаблон А,Шаблон Б') throw new Error('Template merge/deduplication failed');
  return true;
}
const templateLibrary = testTemplateLibrary();

const profile = path.join(root, '.smoke-profile');
fs.mkdirSync(profile, { recursive: true });
const packagedExe = process.env.CABLE_EXE;
const electron = packagedExe || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = [...(packagedExe ? [] : ['.']), '--remote-debugging-port=9223', `--user-data-dir=${profile}`];
const child = spawn(electron, args, { cwd: root, env, stdio: 'ignore' });
let ws;
let nextId = 1;
const pending = new Map();
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method} ${JSON.stringify(params).slice(0, 180)}`)); } }, 10000);
  });
}

async function evaluate(expression) {
  return cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
}

async function connect(page) {
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else if (message.result.exceptionDetails) reject(new Error(message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text));
      else resolve(message.result.result ? message.result.result.value : message.result.data);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  };
}

function button(text) {
  return `[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))`;
}

(async () => {
  try {
    let pages;
    for (let i = 0; i < 60; i++) {
      try {
        pages = await (await fetch('http://127.0.0.1:9223/json')).json();
        if (pages.some((p) => p.type === 'page')) break;
      } catch {}
      await sleep(250);
    }
    const page = pages?.find((p) => p.type === 'page');
    if (!page) throw new Error('Electron page did not start');
    await connect(page);
    await evaluate('1');
    await cdp('Page.bringToFront');
    for (let i = 0; i < 40; i++) {
      if (await evaluate('!!document.querySelector(".editor-panel")')) break;
      await sleep(100);
    }
    if (!await evaluate('!!document.querySelector(".editor-panel")')) throw new Error('Editor did not render');

    await evaluate(`(() => {
      const input = document.querySelector('.editor-panel input.win-input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'ORIGINAL-PROJECT');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await evaluate('document.activeElement?.blur()');
    await sleep(800);
    await cdp('Page.bringToFront');
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78, nativeVirtualKeyCode: 78, modifiers: 2 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78, nativeVirtualKeyCode: 78, modifiers: 2 });
    let secondPage;
    for (let i = 0; i < 40; i++) {
      const openPages = await (await fetch('http://127.0.0.1:9223/json')).json();
      secondPage = openPages.find((p) => p.type === 'page' && p.id !== page.id);
      if (secondPage) break;
      await sleep(100);
    }
    if (!secondPage) throw new Error('File > New did not open a second project window');
    ws.close();
    await connect(secondPage);
    await cdp('Page.bringToFront');
    for (let i = 0; i < 40; i++) {
      if (await evaluate('!!document.querySelector(".editor-panel")')) break;
      await sleep(100);
    }
    if (await evaluate('document.querySelector(".editor-panel input.win-input").value') === 'ORIGINAL-PROJECT') throw new Error('New window reused the old project');
    if (!await evaluate('localStorage.getItem("cable-designer-project-v2")?.includes("ORIGINAL-PROJECT")')) throw new Error('Old project draft was overwritten');
    if (!await evaluate('Object.keys(localStorage).some(k => k.startsWith("cable-designer-project-v2-project-"))')) throw new Error('Independent window draft was not created');
    if (!await evaluate('!!document.querySelector(".project-tree")')) throw new Error('Project tree did not render');

    await evaluate('document.querySelector("button[title=\\"Создать папку\\"]").click()');
    await evaluate(`(() => {
      const input = document.querySelector('.tree-folder-editor input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Узел 1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    await sleep(120);
    if (!await evaluate('document.querySelector(".tree-folder")?.textContent.includes("Узел 1")')) throw new Error('Folder creation failed');
    if (!await evaluate('!!document.querySelector(".tree-header-actions button[title=\\"Добавить кабель\\"]")')) throw new Error('Cable actions were not moved to pages');
    if (await evaluate('!!document.querySelector(".tree-cable .tree-pages")')) throw new Error('Cable subpages are still visible');
    await evaluate('window.confirm = () => true; document.querySelector(".tree-tool.danger").click()');
    await sleep(100);
    await evaluate('document.querySelector("button[title=\\"Создать папку\\"]").click()');
    await sleep(80);
    if (!await evaluate('document.activeElement === document.querySelector(".tree-folder-editor input")')) throw new Error('Folder name input did not regain focus');
    await evaluate(`(() => {
      const input = document.querySelector('.tree-folder-editor input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Узел 1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    await sleep(100);
    await evaluate(`(() => {
      const select = [...document.querySelectorAll('.editor-panel select.win-input')].find(s => s.options[0]?.textContent === 'Без папки');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, select.options[1].value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(120);
    if (!await evaluate('!!document.querySelector(".tree-folder-content .tree-cable")')) throw new Error('Moving cable to folder failed');

    await evaluate('document.querySelector(".tree-cable-row").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 500, clientY: 250 }))');
    await sleep(60);
    if (!await evaluate('!!document.querySelector(".tree-context-menu")')) throw new Error('Cable context menu did not open');
    await evaluate(`${button('Скопировать')}.click()`);
    ws.close();
    await connect(page);
    await cdp('Page.bringToFront');
    await sleep(120);
    await evaluate('document.querySelector(".tree-cable-row").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 500, clientY: 250 }))');
    await sleep(60);
    await evaluate(`${button('Вставить')}.click()`);
    await sleep(150);
    if (await evaluate('document.querySelectorAll(".tree-cable").length') < 2) throw new Error('Cross-project clipboard paste failed');
    ws.close();
    await connect(secondPage);
    await cdp('Page.bringToFront');
    await sleep(100);

    await evaluate(`${button('Квадрат')}.click()`);
    await sleep(80);
    if (!await evaluate('document.querySelector(".side-mode-switch button.active")?.textContent.includes("Квадрат")')) throw new Error('Side mode slider failed');
    await evaluate(`${button('Свободные концы')}.click()`);

    await evaluate(`(() => {
      const input = document.querySelector('.editor-panel input[type=number][max="24"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '24');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(150);
    if (await evaluate('document.querySelectorAll(".preview-area .a4-sheet").length') !== 2) throw new Error('One cable was split into multiple pages');
    await evaluate(`(() => {
      const input = document.querySelector('.editor-panel input[type=number][max="24"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '4');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(150);

    await evaluate('document.activeElement?.blur()');
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await sleep(150);
    if (!await evaluate('document.querySelector(".tree-page.active")?.id || document.querySelector(".tree-page.active")?.textContent.includes("Перечень")')) throw new Error('ArrowRight navigation failed');
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });

    await evaluate(`(() => {
      const input = document.querySelector('.note-editor textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Тестовый шаблон');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await evaluate(`${button('Сохранить шаблон')}.click()`);
    await sleep(100);
    if (!await evaluate('localStorage.getItem("cable-designer-note-templates-v1")?.includes("Тестовый шаблон")')) throw new Error('Saving note template failed');
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 10 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 10 });
    await sleep(150);
    if (!await evaluate('!!document.querySelector(".template-dialog")')) throw new Error('Template manager did not open');
    if (!await evaluate('document.querySelector(".template-list")?.textContent.includes("Тестовый шаблон")')) throw new Error('Template manager content failed');
    await evaluate(`${button('Готово')}.click()`);

    const directorySettings = await evaluate(`(async () => {
      const before = await window.cableSettings.get();
      const saved = await window.cableSettings.setDefaultDir(${JSON.stringify(root)});
      const changed = await window.cableSettings.get();
      await window.cableSettings.setDefaultDir(before.defaultDir);
      return { saved: saved.ok, changed: changed.defaultDir === ${JSON.stringify(root)}, updatePreserved: changed.updateDir === before.updateDir };
    })()`);
    if (!directorySettings.saved || !directorySettings.changed || !directorySettings.updatePreserved) throw new Error('Default directory setting failed');

    await evaluate(`${button('Выбрать и печатать')}.click()`);
    await sleep(150);
    const initialSelection = await evaluate('document.querySelectorAll(".sel-card-head input:checked").length');
    const printDisabled = await evaluate(`${button('Печатать (')}.disabled`);
    if (initialSelection !== 0 || !printDisabled) throw new Error('Print selection must start empty');
    await evaluate(`${button('Выбрать все')}.click()`);
    await sleep(100);
    const selected = await evaluate('document.querySelectorAll(".sel-card-head input:checked").length');
    const cards = await evaluate('document.querySelectorAll(".sel-card").length');
    if (selected !== cards || cards < 2) throw new Error('Select all pages failed');
    await evaluate(`${button('Снять выбор')}.click()`);
    await sleep(80);
    if (await evaluate('document.querySelectorAll(".sel-card-head input:checked").length') !== 0) throw new Error('Clear page selection failed');
    await evaluate(`${button('Закрыть')}.click()`);

    const beforePath = await evaluate('document.querySelector(".preview-area .a4-sheet svg path")?.getAttribute("d")');
    const wireMotion = await evaluate(`new Promise(resolve => {
      const control = document.querySelector('.tip-cell .wire-visibility');
      if (!control) throw new Error('Wire visibility control missing');
      control.click();
      const samples = [];
      let maxError = 0;
      const start = performance.now();
      const sample = () => {
        const group = document.querySelector('.preview-area .a4-sheet svg > g');
        const wire = group?.querySelector(':scope > path');
        const tip = group?.querySelector(':scope > g line');
        const numbers = wire?.getAttribute('d')?.match(/-?\\d*\\.?\\d+/g) ?? [];
        const endY = Number(numbers[numbers.length - 1]);
        const tipY = Number(tip?.getAttribute('y1'));
        samples.push(wire?.getAttribute('d'));
        maxError = Math.max(maxError, Math.abs(endY - tipY) || 0);
        if (performance.now() - start < 700) requestAnimationFrame(sample);
        else resolve({ samples, maxError });
      };
      requestAnimationFrame(sample);
    })`);
    const animationSamples = wireMotion.samples;
    const tipAlignmentError = wireMotion.maxError;
    const afterPath = animationSamples[animationSamples.length - 1];
    if (beforePath === afterPath) throw new Error('Wire layout did not change after hiding');
    if (new Set(animationSamples).size < 3) throw new Error(`Spring animation was not observed (${animationSamples.length} frames, ${new Set(animationSamples).size} unique)`);
    if (tipAlignmentError > 0.25) throw new Error(`Tip detached from wire by ${tipAlignmentError}`);
    const hiddenCell = await evaluate('document.querySelector(".preview-area .gost-table tbody tr")?.children[3]?.textContent');
    if (hiddenCell !== '—') throw new Error(`Hidden side must print dash, got ${hiddenCell}`);

    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await sleep(250);
    if (await evaluate('document.querySelector(".preview-area .gost-table tbody tr")?.children[3]?.textContent') === '—') throw new Error('Ctrl+Z did not restore hidden wire');

    await evaluate('document.querySelector(".editor-panel button[title^=\\"Перемычки, сторона A\\"]").click()');
    await sleep(80);
    await evaluate(`${button('Добавить перемычку')}.click()`);
    await sleep(1900);
    const jumperAlignmentError = await evaluate(`new Promise(resolve => {
      const controls = document.querySelectorAll('.tip-cell .wire-visibility');
      if (!controls[2]) throw new Error('Second wire control missing: ' + controls.length);
      controls[2].click();
      let maxError = 0;
      const start = performance.now();
      const sample = () => {
        const group = document.querySelector('.preview-area .a4-sheet svg > g');
        const paths = group?.querySelectorAll(':scope > path') ?? [];
        const tips = group?.querySelectorAll(':scope > g') ?? [];
        if (paths.length >= 3 && tips.length >= 2) {
          const endY = (p) => { const n = p.getAttribute('d').match(/-?\\d*\\.?\\d+/g) ?? []; return Number(n[n.length - 1]); };
          const own = Math.abs(endY(paths[1]) - Number(tips[0].querySelector('line').getAttribute('y1')));
          const jumper = Math.abs(endY(paths[2]) - Number(tips[1].querySelector('line').getAttribute('y1')));
          const junction = Math.abs(endY(paths[0]) - Number(group.querySelector(':scope > circle').getAttribute('cy')));
          maxError = Math.max(maxError, own, jumper, junction);
        }
        if (performance.now() - start < 700) requestAnimationFrame(sample);
        else resolve(maxError);
      };
      requestAnimationFrame(sample);
    })`);
    if (jumperAlignmentError > 0.25) throw new Error(`Jumper geometry detached by ${jumperAlignmentError}`);

    await evaluate(`${button('Столбцы таблицы')}.click()`);
    await sleep(80);
    const headersBefore = await evaluate('document.querySelectorAll(".preview-area .gost-table thead th").length');
    const editorsBefore = await evaluate('document.querySelectorAll(".column-editor").length');
    await evaluate('document.querySelector(".column-editor .wire-visibility").click()');
    await sleep(100);
    const headersAfter = await evaluate('document.querySelectorAll(".preview-area .gost-table thead th").length');
    if (headersAfter !== headersBefore - 1) throw new Error('Print column visibility failed');
    if (await evaluate('document.querySelectorAll(".column-editor").length') !== editorsBefore) throw new Error('Hidden column data was removed');

    const shot = await evaluate('new Promise(resolve => { const id = 0; resolve("ready"); })');
    void shot;
    const shotId = nextId++;
    ws.send(JSON.stringify({ id: shotId, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    const image = await new Promise((resolve, reject) => pending.set(shotId, { resolve, reject }));
    fs.writeFileSync(path.join(root, 'smoke-result.png'), Buffer.from(image, 'base64'));
    if (errors.length) throw new Error(`Browser exceptions: ${errors.join('; ')}`);
    console.log(JSON.stringify({ ok: true, multiWindow: true, folders: true, arrowNavigation: true, templateLibrary, directorySettings, initialSelection, selected, cards, hiddenCell, headersBefore, headersAfter, springAnimation: true, tipAlignmentError, jumperAlignmentError, ctrlZ: true }));
  } finally {
    try { ws?.close(); } catch {}
    child.kill();
    await sleep(300);
    if (!child.killed) child.kill('SIGKILL');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
