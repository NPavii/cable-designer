const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.smoke-profile', 'geometry');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const packagedExe = process.env.CABLE_EXE;
const electron = packagedExe || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [...(packagedExe ? [] : ['.']), '--remote-debugging-port=9225', `--user-data-dir=${profile}`], { cwd: root, env, stdio: 'ignore' });
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

const modeButton = (side, text) => `[...document.querySelectorAll('[data-side="${side}"] .side-mode-switch button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const button = (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))`;

async function setWireCount(count) {
  await evaluate(`(() => {
    const input = document.querySelector('.editor-panel input[type=number][max="24"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${count}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function screenshot(name) {
  await evaluate('document.querySelector(".preview-area .a4-sheet svg").scrollIntoView({ block: "center" })');
  await sleep(150);
  const clip = await evaluate(`(() => {
    const r = document.querySelector('.preview-area .a4-sheet svg').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 2 };
  })()`);
  const image = await cdp('Page.captureScreenshot', { format: 'png', clip });
  const target = path.join(profile, name);
  fs.writeFileSync(target, Buffer.from(image, 'base64'));
  return target;
}

async function audit(mode) {
  return evaluate(`(() => {
    const svg = document.querySelector('.preview-area .a4-sheet svg');
    const width = Number(svg.viewBox.baseVal.width);
    const groups = [...svg.querySelectorAll(':scope > g')].filter(group => group.querySelector(':scope > [data-wire-path]'));
    const numbers = path => path.getAttribute('d').match(/-?\\d*\\.?\\d+/g).map(Number);
    const paths = [];
    let overshootError = 0;
    let squareAlignmentError = 0;
    groups.forEach((group, owner) => {
      const main = group.querySelector(':scope > [data-wire-path]');
      const side = main.dataset.wireSide || (numbers(main)[0] < width / 2 ? 'A' : 'B');
      [...group.querySelectorAll(':scope > path')].forEach(path => {
        const n = numbers(path);
        const start = { x: n[0], y: n[1] }, end = { x: n[n.length - 2], y: n[n.length - 1] };
        const min = Math.min(start.x, end.x), max = Math.max(start.x, end.x);
        for (const x of [n[2], n[4], end.x]) overshootError = Math.max(overshootError, Math.max(0, min - x, x - max));
        paths.push({ path, owner, side, start, end, points: Array.from({ length: 41 }, (_, i) => path.getPointAtLength(path.getTotalLength() * i / 40)) });
      });
      if (${JSON.stringify(mode)} === 'square') {
        const mainNumbers = numbers(main);
        const endX = mainNumbers[mainNumbers.length - 2], endY = mainNumbers[mainNumbers.length - 1];
        const expectedX = side === 'A' ? width * 0.36 - 85 : width * 0.64 + 175;
        const label = group.querySelector(':scope > [data-wire-label]');
        squareAlignmentError = Math.max(squareAlignmentError, Math.abs(endX - expectedX), Math.abs(endY - (Number(label.getAttribute('y')) + 6)));
      }
    });

    let tipConnectionError = 0;
    let junctionConnectionError = 0;
    let continuityError = 0;
    if (${JSON.stringify(mode)} === 'tips') {
      groups.forEach(group => {
        const ownPaths = [...group.querySelectorAll(':scope > path')];
        const endpoints = ownPaths.map(path => {
          const n = numbers(path);
          return { x: n[n.length - 2], y: n[n.length - 1] };
        });
        const tips = [...group.children].filter(el => ['g', 'rect', 'line'].includes(el.tagName.toLowerCase()));
        tips.forEach(tip => {
          const box = tip.getBBox();
          const centerY = box.y + box.height / 2;
          const best = Math.min(...endpoints.map(end => {
            const connectionX = end.x < width / 2 ? box.x + box.width : box.x;
            return Math.max(Math.abs(end.x - connectionX), Math.abs(end.y - centerY));
          }));
          tipConnectionError = Math.max(tipConnectionError, best);
        });
        const junctions = [...group.querySelectorAll(':scope > circle')].map(circle => ({ x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) }));
        junctions.forEach(junction => {
          const best = Math.min(...endpoints.map(end => Math.max(Math.abs(end.x - junction.x), Math.abs(end.y - junction.y))));
          junctionConnectionError = Math.max(junctionConnectionError, best);
        });
        ownPaths.slice(1).forEach(path => {
          const n = numbers(path), start = { x: n[0], y: n[1] };
          const best = Math.min(...junctions.map(junction => Math.max(Math.abs(start.x - junction.x), Math.abs(start.y - junction.y))));
          continuityError = Math.max(continuityError, best);
        });
      });
    }

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
    const wireCrossings = [];
    for (let a = 0; a < paths.length; a++) for (let b = a + 1; b < paths.length; b++) {
      if (paths[a].owner === paths[b].owner || paths[a].side !== paths[b].side) continue;
      let hit = false;
      for (let i = 0; i < 40 && !hit; i++) for (let j = 0; j < 40 && !hit; j++) {
        hit = intersects(paths[a].points[i], paths[a].points[i + 1], paths[b].points[j], paths[b].points[j + 1]);
        if (hit) wireCrossings.push([paths[a].owner, paths[b].owner, paths[a].side]);
      }
    }

    const labelCollisions = [];
    const textCollisions = [];
    groups.forEach(group => {
      const main = group.querySelector(':scope > [data-wire-path]');
      const side = main.dataset.wireSide || (numbers(main)[0] < width / 2 ? 'A' : 'B');
      const sidePaths = paths.filter(item => item.side === side);
      group.querySelectorAll(':scope > text').forEach(label => {
        if (!label.textContent.trim()) return;
        const box = label.getBBox();
        const hit = sidePaths.some(({ path }) => {
          const length = path.getTotalLength();
          for (let i = 0; i <= 80; i++) {
            const point = path.getPointAtLength(length * i / 80);
            if (point.x >= box.x - 2 && point.x <= box.x + box.width + 2 && point.y >= box.y - 2 && point.y <= box.y + box.height + 2) return true;
          }
          return false;
        });
        if (hit) labelCollisions.push(label.textContent);
      });
    });
    svg.querySelectorAll('[data-connector-label] text').forEach(label => {
      if (!label.textContent.trim()) return;
      const box = label.getBBox();
      const hit = paths.some(({ path }) => {
        const length = path.getTotalLength();
        for (let i = 0; i <= 80; i++) {
          const point = path.getPointAtLength(length * i / 80);
          if (point.x >= box.x - 2 && point.x <= box.x + box.width + 2 && point.y >= box.y - 2 && point.y <= box.y + box.height + 2) return true;
        }
        return false;
      });
      if (hit) labelCollisions.push(label.textContent);
    });
    for (const side of ['A', 'B']) {
      const labels = groups.filter(group => {
        const main = group.querySelector(':scope > [data-wire-path]');
        return (main.dataset.wireSide || (numbers(main)[0] < width / 2 ? 'A' : 'B')) === side;
      }).flatMap(group => [...group.querySelectorAll(':scope > text')].filter(label => label.textContent.trim()).map(label => ({ text: label.textContent, box: label.getBBox() })));
      for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
        const x = labels[a].box, y = labels[b].box;
        if (x.x < y.x + y.width + 2 && x.x + x.width + 2 > y.x && x.y < y.y + y.height + 2 && x.y + x.height + 2 > y.y) textCollisions.push([labels[a].text, labels[b].text]);
      }
    }
    return { groups: groups.length, paths: paths.length, overshootError, squareAlignmentError, tipConnectionError, junctionConnectionError, continuityError, wireCrossings, labelCollisions, textCollisions };
  })()`);
}

function assertAudit(result, mode) {
  if (result.groups !== 16) throw new Error(`${mode}: expected 16 wire groups, got ${result.groups}`);
  if (result.overshootError > 0.01) throw new Error(`${mode}: wire bends around contact by ${result.overshootError}`);
  if (result.wireCrossings.length) throw new Error(`${mode}: wires intersect: ${JSON.stringify(result.wireCrossings)}`);
  if (result.labelCollisions.length) throw new Error(`${mode}: labels intersect wires: ${result.labelCollisions.join(', ')}`);
  if (result.textCollisions.length) throw new Error(`${mode}: labels overlap: ${JSON.stringify(result.textCollisions)}`);
  if (mode === 'square' && result.squareAlignmentError > 0.01) throw new Error(`Square contact mismatch: ${result.squareAlignmentError}`);
  if (mode === 'tips' && Math.max(result.tipConnectionError, result.junctionConnectionError, result.continuityError) > 0.01) throw new Error(`Tips/jumpers detached: ${JSON.stringify(result)}`);
}

async function ctrlZ() {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
}

(async () => {
  try {
    let pages;
    for (let i = 0; i < 60; i++) {
      try {
        pages = await (await fetch('http://127.0.0.1:9225/json')).json();
        if (pages.some(page => page.type === 'page')) break;
      } catch {}
      await sleep(250);
    }
    const page = pages?.find(item => item.type === 'page');
    if (!page) throw new Error('Electron page did not start');
    await connect(page);
    await cdp('Page.bringToFront');
    for (let i = 0; i < 50; i++) {
      if (await evaluate('!!document.querySelector(".editor-panel")')) break;
      await sleep(100);
    }
    if (!await evaluate('!!document.querySelector(".editor-panel")')) throw new Error('Editor did not render');

    await setWireCount(8);
    await evaluate(`(() => {
      document.querySelectorAll('.tip-cell select').forEach(select => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'sleeve');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    })()`);
    await sleep(2000);
    const tips = await audit('tips');
    assertAudit(tips, 'tips');
    const tipsScreenshot = await screenshot('tips-result.png');

    const animationConnectionError = await evaluate(`new Promise(resolve => {
      document.querySelector('.tip-cell .wire-visibility').click();
      let maxError = 0;
      const start = performance.now();
      const sample = () => {
        document.querySelectorAll('.preview-area .a4-sheet svg > g').forEach(group => {
          const main = group.querySelector(':scope > [data-wire-path]');
          if (!main) return;
          const paths = [...group.querySelectorAll(':scope > path')];
          const endpoints = paths.map(path => {
            const n = path.getAttribute('d').match(/-?\\d*\\.?\\d+/g).map(Number);
            return { x: n[n.length - 2], y: n[n.length - 1] };
          });
          const tips = [...group.children].filter(el => ['g', 'rect', 'line'].includes(el.tagName.toLowerCase()));
          tips.forEach(tip => {
            const box = tip.getBBox(), centerY = box.y + box.height / 2;
            const best = Math.min(...endpoints.map(end => Math.max(Math.abs(end.x - (end.x < 380 ? box.x + box.width : box.x)), Math.abs(end.y - centerY))));
            maxError = Math.max(maxError, best);
          });
        });
        if (performance.now() - start < 700) requestAnimationFrame(sample);
        else resolve(maxError);
      };
      requestAnimationFrame(sample);
    })`);
    if (animationConnectionError > 0.25) throw new Error(`Tip detached during animation by ${animationConnectionError}`);
    await sleep(1200);
    if (await evaluate('document.querySelectorAll(".preview-area [data-wire-path]").length') !== 15) throw new Error('Hidden wire is still rendered');
    if (await evaluate('document.querySelector(".preview-area .gost-table tbody tr")?.children[3]?.textContent') !== '—') throw new Error('Hidden side must print dash');
    await ctrlZ();
    await sleep(1900);
    if (await evaluate('document.querySelectorAll(".preview-area [data-wire-path]").length') !== 16) throw new Error('Ctrl+Z did not restore hidden wire');

    await evaluate('document.querySelector(".editor-panel button[title^=\\"Перемычки, сторона A\\"]").click()');
    await evaluate(`${button('Добавить перемычку')}.click()`);
    await sleep(100);
    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder="Марк."]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'J1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const checkbox = input.parentElement.querySelector('input[type=checkbox]');
      checkbox.click();
    })()`);
    await sleep(100);
    await evaluate('document.querySelector("button[title=\\"Добавить перемычку из этого провода\\"]").click()');
    await sleep(100);
    await evaluate(`(() => {
      const input = document.querySelectorAll('input[placeholder="Марк."]')[1];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'J1.1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(2000);
    const jumpers = await audit('tips');
    assertAudit(jumpers, 'tips');
    if (jumpers.paths !== 20) throw new Error(`Expected four additional jumper paths, got ${jumpers.paths}`);
    const jumpersScreenshot = await screenshot('jumpers-result.png');

    await evaluate(`${modeButton('A', 'Квадрат')}.click(); ${modeButton('B', 'Квадрат')}.click()`);
    await evaluate(`(() => {
      for (const side of ['A', 'B']) {
        const fields = document.querySelectorAll('[data-side="' + side + '"] input.win-input');
        ['SQ-' + side, 'Квадратный разъём', 'Дополнительная строка'].forEach((value, index) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(fields[index], value);
          fields[index].dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
    })()`);
    await sleep(2000);
    const square = await audit('square');
    assertAudit(square, 'square');
    await evaluate('document.querySelector(".tip-cell .wire-visibility").click()');
    await sleep(1900);
    if (await evaluate('document.querySelectorAll(".preview-area [data-wire-side=\\"A\\"]").length') !== 7) throw new Error('Square hidden wire is still rendered');
    await ctrlZ();
    await sleep(1900);
    if (await evaluate('document.querySelectorAll(".preview-area [data-wire-side=\\"A\\"]").length') !== 8) throw new Error('Ctrl+Z did not restore square wire');
    const squareScreenshot = await screenshot('square-result.png');

    if (errors.length) throw new Error(`Browser exceptions: ${errors.join('; ')}`);
    console.log(JSON.stringify({ ok: true, tips, jumpers, square, animationConnectionError, hiddenAndUndo: true, screenshots: [tipsScreenshot, jumpersScreenshot, squareScreenshot] }));
  } finally {
    try { ws?.close(); } catch {}
    child.kill();
    await sleep(300);
    if (!child.killed) child.kill('SIGKILL');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
