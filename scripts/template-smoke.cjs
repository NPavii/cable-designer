const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.smoke-profile', 'templates');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const packagedExe = process.env.CABLE_EXE;
const electron = packagedExe || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [...(packagedExe ? [] : ['.']), '--remote-debugging-port=9226', `--user-data-dir=${profile}`], { cwd: root, env, stdio: 'ignore' });
let ws;
let nextId = 1;
const pending = new Map();
const errors = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdp(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 15000);
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

const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))`;

async function waitFor(expression, message, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(message);
}

async function setTextarea(selector, value) {
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

(async () => {
  try {
    let pages;
    for (let i = 0; i < 60; i++) {
      try {
        pages = await (await fetch('http://127.0.0.1:9226/json')).json();
        if (pages.some((page) => page.type === 'page')) break;
      } catch {}
      await sleep(250);
    }
    const mainPage = pages?.find((page) => page.type === 'page');
    if (!mainPage) throw new Error('Electron page did not start');
    await connect(mainPage);
    await waitFor('!!document.querySelector(".editor-panel")', 'Editor did not render');

    const markdown = [
      '## Проверка Markdown',
      '',
      '**Жирный**, *курсив*, <u>подчёркивание</u>, <span style="color:#ff0000">красный текст</span>.',
      '',
      '| Параметр | Значение |',
      '| --- | --- |',
      '| Сечение | 0,75 мм² |',
    ].join('\n');
    await evaluate(`localStorage.setItem('cable-designer-note-templates-v1', JSON.stringify([${JSON.stringify(markdown)}]))`);
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 10 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 10 });
    await waitFor('!!document.querySelector(".template-dialog .md-editor")', 'Template manager did not open');

    await evaluate(`${button('Просмотр', 'document.querySelector(".template-quick-editor")')}.click()`);
    await waitFor('!!document.querySelector(".template-quick-editor .markdown-body img") || !!document.querySelector(".template-quick-editor .markdown-body strong")', 'Markdown preview did not render');
    const rendered = await evaluate(`(() => {
      const root = document.querySelector('.template-quick-editor .markdown-body');
      const color = root.querySelector('span');
      return {
        bold: root.querySelector('strong')?.textContent,
        underline: root.querySelector('u')?.textContent,
        color: color ? getComputedStyle(color).color : '',
        rows: root.querySelectorAll('table tbody tr').length,
        unsafe: root.querySelectorAll('script, iframe, object').length,
      };
    })()`);
    if (rendered.bold !== 'Жирный' || rendered.underline !== 'подчёркивание' || rendered.color !== 'rgb(255, 0, 0)' || rendered.rows !== 1 || rendered.unsafe) {
      throw new Error(`Markdown rendering failed: ${JSON.stringify(rendered)}`);
    }

    // Ctrl+V двух файлов проверяет и скриншот, и произвольное вложение.
    await evaluate(`${button('Текст', 'document.querySelector(".template-quick-editor")')}.click()`);
    await evaluate(`(() => {
      const textarea = document.querySelector('.template-quick-editor textarea');
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([png], 'screenshot.png', { type: 'image/png' }));
      transfer.items.add(new File(['Технические условия'], 'specification.txt', { type: 'text/plain' }));
      textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    })()`);
    await waitFor('(document.querySelector(".template-quick-editor textarea")?.value.match(/cable-asset:\\/\\//g) || []).length === 2', 'Pasted files were not inserted');
    const links = await evaluate(`(() => {
      const value = document.querySelector('.template-quick-editor textarea').value;
      return { image: /!\\[screenshot\\.png\\]\\(cable-asset:\\/\\//.test(value), document: /[^!]\\[specification\\.txt\\]\\(cable-asset:\\/\\//.test(value) };
    })()`);
    if (!links.image || !links.document) throw new Error(`Asset links are incorrect: ${JSON.stringify(links)}`);
    await evaluate(`${button('Сохранить', 'document.querySelector(".template-editor-heading")')}.click()`);
    await sleep(150);
    if (!await evaluate('localStorage.getItem("cable-designer-note-templates-v1")?.includes("specification.txt")')) throw new Error('Small editor did not save attachments');

    await evaluate(`${button('Просмотр', 'document.querySelector(".template-quick-editor")')}.click()`);
    await waitFor('document.querySelector(".template-quick-editor .markdown-body img")?.naturalWidth > 0', 'cable-asset image did not load');

    await evaluate(`${button('В новом окне', 'document.querySelector(".template-editor-heading")')}.click()`);
    let editorPage;
    for (let i = 0; i < 60; i++) {
      const openPages = await (await fetch('http://127.0.0.1:9226/json')).json();
      editorPage = openPages.find((page) => page.type === 'page' && page.id !== mainPage.id && page.url.includes('templateEditor=1'));
      if (editorPage) break;
      await sleep(100);
    }
    if (!editorPage) throw new Error('Separate template editor did not open');
    ws.close();
    await connect(editorPage);
    await waitFor('!!document.querySelector(".template-editor-window .md-editor")', 'Full template editor did not render');
    if (!await evaluate('document.querySelector(".template-editor-window textarea").value.includes("Проверка Markdown")')) throw new Error('Full editor opened wrong template');
    if (!await evaluate('document.querySelectorAll(".template-editor-window .md-editor-content.with-preview > *").length === 2')) throw new Error('Full editor split preview is missing');

    const editorValue = await evaluate('document.querySelector(".template-editor-window textarea").value');
    await setTextarea('.template-editor-window textarea', `${editorValue}\n\nИзменено во втором окне.`);
    await evaluate('document.querySelector(".template-window-actions .win-button.primary").click()');
    await sleep(250);
    if (await evaluate('window.__cableIsDirty()')) throw new Error('Full editor remained dirty after saving');
    const editorShot = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(profile, 'template-editor.png'), Buffer.from(editorShot, 'base64'));

    ws.close();
    await connect(mainPage);
    await waitFor('localStorage.getItem("cable-designer-note-templates-v1")?.includes("Изменено во втором окне")', 'Template changes did not synchronize to library');
    await evaluate(`${button('Готово')}.click()`);
    await sleep(100);

    await evaluate(`${button('Выбрать и печатать')}.click()`);
    await waitFor('!!document.querySelector(".sel-print-root")', 'Print layer did not render');
    await evaluate('document.querySelector(".sel-card-head input").click()');
    await sleep(100);
    await cdp('Emulation.setEmulatedMedia', { media: 'print' });
    const printLayout = await evaluate(`(() => {
      const selected = [...document.querySelectorAll('.sel-print-card')].filter(card => !card.classList.contains('sheet-skip'));
      const sheet = selected[0]?.querySelector('.a4-sheet');
      return {
        dialog: getComputedStyle(document.querySelector('.sel-root')).display,
        preview: getComputedStyle(document.querySelector('.preview-area')).display,
        printRoot: getComputedStyle(document.querySelector('.sel-print-root')).display,
        selected: selected.length,
        transform: sheet ? getComputedStyle(sheet).transform : '',
        width: sheet?.getBoundingClientRect().width,
      };
    })()`);
    if (printLayout.dialog !== 'none' || printLayout.preview !== 'none' || printLayout.printRoot !== 'block' || printLayout.selected !== 1 || printLayout.transform !== 'none' || printLayout.width < 700) {
      throw new Error(`Full-size print layout failed: ${JSON.stringify(printLayout)}`);
    }
    await cdp('Emulation.setEmulatedMedia', { media: '' });

    if (errors.length) throw new Error(`Browser exceptions: ${errors.join('; ')}`);
    console.log(JSON.stringify({ ok: true, markdown: rendered, attachments: links, imageLoaded: true, separateWindow: true, synchronized: true, printLayout, screenshot: path.join(profile, 'template-editor.png') }));
  } finally {
    try { ws?.close(); } catch {}
    child.kill();
    await sleep(300);
    if (!child.killed) child.kill('SIGKILL');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
