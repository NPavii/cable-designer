const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.smoke-profile', 'circle');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const packagedExe = process.env.CABLE_EXE;
const electron = packagedExe || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = [...(packagedExe ? [] : ['.']), '--remote-debugging-port=9224', `--user-data-dir=${profile}`];
const child = spawn(electron, args, { cwd: root, env, stdio: 'ignore' });
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
    }, 10000);
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

const circleButton = (side) => `[...document.querySelectorAll('[data-side="${side}"] .side-mode-switch button')].find(b => b.textContent.trim() === 'Круг')`;
const contactCount = (side) => evaluate(`document.querySelectorAll('.preview-area .circle-connector[data-side="${side}"] [data-contact]').length`);

(async () => {
  try {
    let pages;
    for (let i = 0; i < 60; i++) {
      try {
        pages = await (await fetch('http://127.0.0.1:9224/json')).json();
        if (pages.some((p) => p.type === 'page')) break;
      } catch {}
      await sleep(250);
    }
    const page = pages?.find((p) => p.type === 'page');
    if (!page) throw new Error('Electron page did not start');
    await connect(page);
    await cdp('Page.bringToFront');
    for (let i = 0; i < 50; i++) {
      if (await evaluate('!!document.querySelector(".editor-panel")')) break;
      await sleep(100);
    }
    if (!await evaluate('!!document.querySelector(".editor-panel")')) throw new Error('Editor did not render');

    await evaluate(`${circleButton('A')}.click()`);
    await sleep(1900);
    if (await contactCount('A') !== 4) throw new Error('Circle A must have one contact per visible wire');
    if (!await evaluate('document.querySelector(\'[data-side="A"] .side-mode-switch button.active\')?.textContent.includes("Круг")')) throw new Error('Circle mode is not active');
    if (!await evaluate('localStorage.getItem("cable-designer-project-v2")?.includes(\'"sideAMode":"circle"\')')) throw new Error('Circle mode was not saved');

    const alignmentError = await evaluate(`(() => {
      let max = 0;
      document.querySelectorAll('.preview-area .circle-connector[data-side="A"] [data-contact]').forEach(group => {
        const path = group.querySelector('path');
        const ring = group.querySelector('circle');
        const numbers = path.getAttribute('d').match(/-?\\d*\\.?\\d+/g).map(Number);
        const endX = numbers[numbers.length - 2];
        const endY = numbers[numbers.length - 1];
        max = Math.max(max, Math.abs(endX - Number(ring.getAttribute('cx'))), Math.abs(endY - Number(ring.getAttribute('cy'))));
      });
      return max;
    })()`);
    if (alignmentError > 0.25) throw new Error(`Wire detached from circular contact by ${alignmentError}`);

    await evaluate(`(() => {
      const fields = document.querySelectorAll('[data-side="A"] input.win-input');
      const set = (input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(fields[0], 'XR-8');
      set(fields[1], 'Круглый разъём');
    })()`);
    await sleep(150);
    if (!await evaluate('document.querySelector(".preview-area .circle-connector[data-side=\\"A\\"]")?.textContent.includes("XR-8")')) throw new Error('Circle name is not rendered');

    await evaluate('document.querySelector(".tip-cell .wire-visibility").click()');
    await sleep(1900);
    if (await contactCount('A') !== 3) throw new Error('Hidden wire must not have a circular contact');
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await sleep(1900);
    if (await contactCount('A') !== 4) throw new Error('Ctrl+Z did not restore circular contact');

    await evaluate(`${circleButton('B')}.click()`);
    await sleep(1900);
    if (await contactCount('B') !== 4) throw new Error('Circle B must have one contact per visible wire');
    if (await evaluate('document.querySelectorAll(".preview-area .circle-connector").length') !== 2) throw new Error('Both circular connectors were not rendered');

    await evaluate(`(() => {
      const input = document.querySelector('.editor-panel input[type=number][max="24"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '8');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(3000);
    if (await contactCount('A') !== 8 || await contactCount('B') !== 8) throw new Error('Eight-wire connectors must have eight contacts');

    const overshootError = await evaluate(`(() => {
      let max = 0;
      document.querySelectorAll('.preview-area .circle-connector [data-wire-path]').forEach(path => {
        const n = path.getAttribute('d').match(/-?\\d*\\.?\\d+/g).map(Number);
        const startX = n[0], control1X = n[2], control2X = n[4], endX = n[6];
        const min = Math.min(startX, endX), maxX = Math.max(startX, endX);
        for (const x of [control1X, control2X, endX]) {
          max = Math.max(max, Math.max(0, min - x, x - maxX));
        }
      });
      return max;
    })()`);
    if (overshootError > 0.01) throw new Error(`Wire bends around its contact by ${overshootError}`);

    const labelCollisions = await evaluate(`(() => {
      const collisions = [];
      document.querySelectorAll('.preview-area .circle-connector').forEach(connector => {
        const paths = [...connector.querySelectorAll('[data-wire-path]')];
        connector.querySelectorAll('[data-wire-label]').forEach(label => {
          const box = label.getBBox();
          const hit = paths.some(path => {
            const length = path.getTotalLength();
            for (let i = 0; i <= 80; i++) {
              const point = path.getPointAtLength(length * i / 80);
              if (point.x >= box.x - 2 && point.x <= box.x + box.width + 2 && point.y >= box.y - 2 && point.y <= box.y + box.height + 2) return true;
            }
            return false;
          });
          if (hit) collisions.push(label.textContent);
        });
      });
      return collisions;
    })()`);
    if (labelCollisions.length) throw new Error(`Wire labels intersect wires: ${labelCollisions.join(', ')}`);

    const textCollisions = await evaluate(`(() => {
      const collisions = [];
      document.querySelectorAll('.preview-area .circle-connector').forEach(connector => {
        const labels = [...connector.querySelectorAll('text')].filter(label => label.textContent.trim()).map(label => ({ text: label.textContent, box: label.getBBox() }));
        for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
          const x = labels[a].box, y = labels[b].box;
          if (x.x < y.x + y.width + 2 && x.x + x.width + 2 > y.x && x.y < y.y + y.height + 2 && x.y + x.height + 2 > y.y) collisions.push([labels[a].text, labels[b].text]);
        }
      });
      return collisions;
    })()`);
    if (textCollisions.length) throw new Error(`Connector labels overlap: ${JSON.stringify(textCollisions)}`);

    const wireCrossings = await evaluate(`(() => {
      const crossings = [];
      const orientation = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const onSegment = (a, b, p) => p.x >= Math.min(a.x, b.x) - 0.0000001 && p.x <= Math.max(a.x, b.x) + 0.0000001 && p.y >= Math.min(a.y, b.y) - 0.0000001 && p.y <= Math.max(a.y, b.y) + 0.0000001;
      const intersects = (a, b, c, d) => {
        const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
        if (Math.abs(o1) < 0.0000001 && onSegment(a, b, c)) return true;
        if (Math.abs(o2) < 0.0000001 && onSegment(a, b, d)) return true;
        if (Math.abs(o3) < 0.0000001 && onSegment(c, d, a)) return true;
        if (Math.abs(o4) < 0.0000001 && onSegment(c, d, b)) return true;
        return o1 * o2 < 0 && o3 * o4 < 0;
      };
      document.querySelectorAll('.preview-area .circle-connector').forEach(connector => {
        const paths = [...connector.querySelectorAll('[data-wire-path]')].map(path => ({
          id: path.parentElement.dataset.contact,
          d: path.getAttribute('d'),
          points: Array.from({ length: 61 }, (_, i) => path.getPointAtLength(path.getTotalLength() * i / 60)),
        }));
        for (let a = 0; a < paths.length; a++) for (let b = a + 1; b < paths.length; b++) {
          let hit = false;
          for (let i = 0; i < 60 && !hit; i++) for (let j = 0; j < 60 && !hit; j++) {
            hit = intersects(paths[a].points[i], paths[a].points[i + 1], paths[b].points[j], paths[b].points[j + 1]);
            if (hit) crossings.push({ a: paths[a].id, b: paths[b].id, i, j, pa: paths[a].points[i], pb: paths[b].points[j], da: paths[a].d, db: paths[b].d });
          }
        }
      });
      return crossings;
    })()`);
    if (wireCrossings.length) throw new Error(`Wire paths intersect: ${JSON.stringify(wireCrossings)}`);

    await evaluate('document.querySelector(".preview-area .a4-sheet svg").scrollIntoView({ block: "center" })');
    await sleep(150);
    const clip = await evaluate(`(() => {
      const r = document.querySelector('.preview-area .a4-sheet svg').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 2 };
    })()`);
    const image = await cdp('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(path.join(profile, 'circle-result.png'), Buffer.from(image, 'base64'));
    if (errors.length) throw new Error(`Browser exceptions: ${errors.join('; ')}`);
    console.log(JSON.stringify({ ok: true, circleA: 4, circleB: 4, eightContacts: true, hiddenContact: true, undo: true, saved: true, alignmentError, overshootError, labelCollisions: labelCollisions.length, wireCrossings: wireCrossings.length, screenshot: path.join(profile, 'circle-result.png') }));
  } finally {
    try { ws?.close(); } catch {}
    child.kill();
    await sleep(300);
    if (!child.killed) child.kill('SIGKILL');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
