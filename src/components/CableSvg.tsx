import type { ReactNode } from 'react';
import type { Cable, Jumper, TipShape } from '../types/cable';
import { TIP_LIBRARY, jumperLeaves, wireSlots } from '../types/cable';

// Рисуем наконечник в точке (x,y), направление: side=-1 (влево), side=1 (вправо)
function Tip({ x, y, shape, side }: { x: number; y: number; shape: TipShape; side: 1 | -1 }) {
  const s = side; // направление «наружу»
  const stroke = '#111';
  const common = { stroke, strokeWidth: 1.2, fill: 'white' };
  switch (shape) {
    case 'pin': // НШВИ: гильза + штырь
      return (
        <g {...common}>
          <rect x={s === 1 ? x : x - 14} y={y - 3} width={14} height={6} />
          <line x1={s === 1 ? x + 14 : x - 14} y1={y} x2={s === 1 ? x + 26 : x - 26} y2={y} strokeWidth={2} />
        </g>
      );
    case 'ring': // кольцо М4
      return (
        <g {...common}>
          <rect x={s === 1 ? x : x - 12} y={y - 3} width={12} height={6} />
          <circle cx={s === 1 ? x + 19 : x - 19} cy={y} r={7} />
          <circle cx={s === 1 ? x + 19 : x - 19} cy={y} r={3} fill="white" />
        </g>
      );
    case 'fork': // вилочный
      return (
        <g {...common}>
          <rect x={s === 1 ? x : x - 12} y={y - 3} width={12} height={6} />
          <path
            d={`M ${s === 1 ? x + 12 : x - 12} ${y} h ${6 * s} m 0 -5 a 5 5 0 1 0 0 10 m 0 -5 h ${-6 * s}`}
            fill="none"
          />
        </g>
      );
    case 'sleeve': // гильза НКИ
      return <rect {...common} x={s === 1 ? x : x - 18} y={y - 3.5} width={18} height={7} />;
    case 'flat': // плоский РПИ
      return (
        <g {...common}>
          <rect x={s === 1 ? x : x - 10} y={y - 4} width={10} height={8} />
          <rect x={s === 1 ? x + 10 : x - 20} y={y - 2} width={10} height={4} />
        </g>
      );
    case 'none':
      return <line x1={x} y1={y} x2={x + 4 * s} y2={y} stroke={stroke} strokeWidth={1.2} />;
  }
}

// Рисуем датчик (прямоугольник). Текст выносим в SensorLabel и рисуем
// ПОСЛЕ проводов — иначе надпись оказывается под жилами и нечитаема.
function SensorBox({
  x, y, width, height, side
}: {
  x: number; y: number; width: number; height: number; side: 1 | -1;
}) {
  const stroke = '#111';
  const rectX = side === 1 ? x : x - width;
  return (
    <rect
      x={rectX}
      y={y - height / 2}
      width={width}
      height={height}
      stroke={stroke}
      strokeWidth={1.5}
      fill="white"
    />
  );
}

// Подписи датчика поверх проводов, с белым ореолом для читаемости.
// Три строки: название, краткое описание, «Дополнительно» (особенности датчика).
function SensorLabel({
  x, y, width, name, desc, extra, side
}: {
  x: number; y: number; width: number; name: string; desc: string; extra?: string; side: 1 | -1;
}) {
  const rectX = side === 1 ? x : x - width;
  const textX = rectX + width / 2;
  return (
    <g>
      <text
        x={textX}
        y={y - 4}
        fontSize={12}
        textAnchor="middle"
        fontWeight="bold"
        stroke="white"
        strokeWidth={5}
        paintOrder="stroke"
      >
        {name || 'Датчик'}
      </text>
      <text
        x={textX}
        y={y + 10}
        fontSize={9}
        textAnchor="middle"
        fill="#333"
        stroke="white"
        strokeWidth={4}
        paintOrder="stroke"
      >
        {desc}
      </text>
      {extra && (
        <text
          x={textX}
          y={y + 23}
          fontSize={8}
          textAnchor="middle"
          fill="#555"
          stroke="white"
          strokeWidth={4}
          paintOrder="stroke"
        >
          {extra}
        </text>
      )}
    </g>
  );
}

export interface CableSvgProps {
  cable: Cable;
  width?: number;
  wireStart?: number;
  wireCount?: number;
}

export default function CableSvg({
  cable,
  width = 760,
  wireStart = 0,
  wireCount = cable.cores,
}: CableSvgProps) {
  const wires = cable.wires.slice(wireStart, wireStart + wireCount);
  const n = Math.max(wires.length, 1);
  const W = width;
  const spreadStep = 30;         // вертикальный шаг одного слота (жила или конец перемычки)
  const LEVEL_W = 46;            // горизонтальный шаг на один уровень гирлянды
  const bodyL = W * 0.36;
  const bodyR = W * 0.64;
  const fanL = 70;               // длина развода жил
  const label = `${cable.cores}*${cable.section}`;

  // Сколько вертикальных слотов занимает каждая сторона
  // (жила = 1 слот + слоты листьев её перемычек; в режиме датчика перемычки не рисуются)
  const slotsA = wires.reduce((s, w) => s + (cable.sideAMode === 'tips' ? wireSlots(w, 'A') : 1), 0);
  const slotsB = wires.reduce((s, w) => s + (cable.sideBMode === 'tips' ? wireSlots(w, 'B') : 1), 0);
  const maxSlots = Math.max(n, slotsA, slotsB);

  const spread = (i: number) => (i - (n - 1) / 2) * spreadStep;
  const H = Math.max(160, maxSlots * spreadStep + 50);
  const cy = H / 2;

  // Центр k-го слота стороны (стороны центрируются независимо)
  const slotCenter = (total: number, k: number) =>
    cy - (total * spreadStep) / 2 + (k + 0.5) * spreadStep;

  const tipOf = (id: string): TipShape =>
    TIP_LIBRARY.find((t) => t.id === id)?.shape ?? 'none';

  const sensorW = 90;
  // место под третью строку «Дополнительно», если она задана на любой стороне
  const hasExtra = !!(cable.sideASensorExtra || cable.sideBSensorExtra);
  const sensorH = Math.max(50, n * spreadStep + 14 + (hasExtra ? 12 : 0));
  const enterDepth = 25;         // насколько провода заходят внутрь датчика

  // Координаты датчиков
  const sensorAX = bodyL - fanL - 40;          // правая грань датчика А
  const sensorBX = bodyR + fanL + 40;          // левая грань датчика Б

  // Маркировка стороны Б: своя при двойной маркировке, иначе общая
  const markingB = (w: (typeof wires)[number]) =>
    cable.markingMode === 'dual' ? (w.markingB ?? w.marking) : w.marking;

  // Рекурсивная отрисовка перемычек (гирлянды).
  // Дуга идёт из точки (xA, yA); концы перемычек — на уровне xLeaf.
  // dir = -1 (сторона А, влево) или 1 (сторона Б, вправо).
  // Концы раскладываются по слотам строго в порядке списка — дуги не пересекаются.
  // Точка разветвления ставится за GAP до уровня концов — ближе к наконечникам.
  const GAP = 26;
  const renderJumpers = (
    list: Jumper[],
    xA: number,
    yA: number,
    xLeaf: number,
    dir: 1 | -1,
    slotStart: number,
    total: number,
    color: string,
    keyPrefix: string
  ): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let slot = slotStart;
    for (const j of list) {
      const leaves = jumperLeaves(j);
      const dx = Math.max(14, LEVEL_W * 0.5);
      if (j.isJumper && j.chains.length > 0) {
        // Точка разветвления гирлянды — ближе к наконечникам,
        // в центре диапазона слотов её группы
        const xJun = xLeaf + dir * (LEVEL_W - GAP);
        const xNext = xLeaf + dir * LEVEL_W;
        const y1 = slotCenter(total, slot + leaves / 2 - 0.5);
        // Собственный конец перемычки — первый слот её группы
        const yOwn = slotCenter(total, slot);
        nodes.push(
          <path
            key={`${keyPrefix}${j.id}`}
            d={`M ${xA} ${yA} C ${xA + dir * dx} ${yA}, ${xJun - dir * dx} ${y1}, ${xJun} ${y1}`}
            stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
          />,
          <circle key={`${keyPrefix}${j.id}d`} cx={xJun} cy={y1} r={3} fill={color} />,
          <path
            key={`${keyPrefix}${j.id}o`}
            d={`M ${xJun} ${y1} C ${xJun + dir * 12} ${y1}, ${xNext - dir * 12} ${yOwn}, ${xNext} ${yOwn}`}
            stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
          />,
          <Tip key={`${keyPrefix}${j.id}t`} x={xNext} y={yOwn} shape={tipOf(j.tip)} side={dir} />,
          <text
            key={`${keyPrefix}${j.id}m`}
            x={xNext + dir * 32}
            y={yOwn - 6}
            fontSize={10}
            textAnchor={dir === 1 ? 'start' : 'end'}
          >
            {j.marking}
          </text>
        );
        nodes.push(...renderJumpers(j.chains, xJun, y1, xNext, dir, slot + 1, total, color, `${keyPrefix}${j.id}_`));
      } else {
        // Обычная перемычка: дуга + наконечник + маркировка
        const y1 = slotCenter(total, slot);
        nodes.push(
          <path
            key={`${keyPrefix}${j.id}`}
            d={`M ${xA} ${yA} C ${xA + dir * dx} ${yA}, ${xLeaf - dir * dx} ${y1}, ${xLeaf} ${y1}`}
            stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
          />,
          <Tip key={`${keyPrefix}${j.id}t`} x={xLeaf} y={y1} shape={tipOf(j.tip)} side={dir} />,
          <text
            key={`${keyPrefix}${j.id}m`}
            x={xLeaf + dir * 32}
            y={y1 - 6}
            fontSize={10}
            textAnchor={dir === 1 ? 'start' : 'end'}
          >
            {j.marking}
          </text>
        );
      }
      slot += leaves;
    }
    return nodes;
  };

  // Отрисовка стороны в режиме «Свободные концы» (с учётом перемычек)
  const renderTipsSide = (side: 'A' | 'B'): ReactNode[] => {
    const dir: 1 | -1 = side === 'A' ? -1 : 1;
    const total = side === 'A' ? slotsA : slotsB;
    const xBody = side === 'A' ? bodyL : bodyR;
    const xJ = side === 'A' ? bodyL - fanL - 40 + 26 : bodyR + fanL + 40 - 26;
    const nodes: ReactNode[] = [];
    let slot = 0;

    for (const w of wires) {
      const js = (side === 'A' ? w.jumpersA : w.jumpersB) ?? [];
      const wSlots = wireSlots(w, side);
      // Точка соединения — в центре диапазона слотов жилы
      const yJ = slotCenter(total, slot + wSlots / 2 - 0.5);
      const dx = Math.max(24, Math.abs(xBody - xJ) * 0.5);
      const marking = side === 'A' ? w.marking : markingB(w);
      const tip = tipOf(side === 'A' ? w.tipA : w.tipB);

      if (js.length === 0) {
        // Жила без перемычек — как раньше: одна S-кривая + наконечник + маркировка.
        // Маркировка слева — вплотную к наконечнику, по правому краю
        nodes.push(
          <g key={w.id}>
            <path
              d={`M ${xBody} ${cy} C ${xBody - dir * dx} ${cy}, ${xJ + dir * dx} ${yJ}, ${xJ} ${yJ}`}
              stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
            />
            <Tip x={xJ} y={yJ} shape={tip} side={dir} />
            <text
              x={xJ + (side === 'A' ? -30 : 30)}
              y={yJ - 6}
              fontSize={11}
              textAnchor={side === 'A' ? 'end' : 'start'}
            >
              {marking}
            </text>
          </g>
        );
      } else {
        // Жила с гирляндой: точка соединения ближе к наконечникам (за GAP до их уровня)
        const yOwn = slotCenter(total, slot); // собственный конец — первый слот группы
        const xLeaf = xJ + dir * LEVEL_W;
        const xJun = xLeaf - dir * GAP;
        const dxj = Math.max(24, Math.abs(xBody - xJun) * 0.5);
        nodes.push(
          <g key={w.id}>
            <path
              d={`M ${xBody} ${cy} C ${xBody - dir * dxj} ${cy}, ${xJun + dir * dxj} ${yJ}, ${xJun} ${yJ}`}
              stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
            />
            <circle cx={xJun} cy={yJ} r={3.5} fill={w.color} />
            {/* собственный конец жилы */}
            <path
              d={`M ${xJun} ${yJ} C ${xJun + dir * 12} ${yJ}, ${xLeaf - dir * 12} ${yOwn}, ${xLeaf} ${yOwn}`}
              stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
            />
            <Tip x={xLeaf} y={yOwn} shape={tip} side={dir} />
            <text
              x={xLeaf + dir * 32}
              y={yOwn - 6}
              fontSize={11}
              textAnchor={dir === 1 ? 'start' : 'end'}
            >
              {marking}
            </text>
            {/* перемычки от точки соединения */}
            {renderJumpers(js, xJun, yJ, xLeaf, dir, slot + 1, total, w.color, '')}
          </g>
        );
      }
      slot += wSlots;
    }
    return nodes;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Сторона А (слева) */}
      {cable.sideAMode === 'tips' ? (
        renderTipsSide('A')
      ) : (
        // Датчик слева — провода плавно заходят внутрь прямоугольника
        <>
          <SensorBox
            x={sensorAX}
            y={cy}
            width={sensorW}
            height={sensorH}
            side={-1}
          />
          {wires.map((w, i) => {
            const y = cy + spread(i);
            const lineEndX = sensorAX + enterDepth; // заходим внутрь датчика
            // Горизонтальная касательная у грани датчика — провод «втыкается» ровно
            const dx = Math.max(24, (bodyL - lineEndX) * 0.45);
            return (
              <g key={w.id}>
                <path
                  d={`M ${bodyL} ${cy} C ${bodyL - dx} ${cy}, ${lineEndX + dx} ${y}, ${lineEndX} ${y}`}
                  stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
                />
                <text x={sensorAX - 4} y={y - 6} fontSize={11} textAnchor="end">{w.marking}</text>
              </g>
            );
          })}
          {/* Подписи датчика поверх проводов */}
          <SensorLabel
            x={sensorAX}
            y={cy}
            width={sensorW}
            name={cable.sideASensorName}
            desc={cable.sideASensorDesc}
            extra={cable.sideASensorExtra}
            side={-1}
          />
        </>
      )}

      {/* Сторона Б (справа) */}
      {cable.sideBMode === 'tips' ? (
        renderTipsSide('B')
      ) : (
        // Датчик справа — провода плавно заходят внутрь прямоугольника
        <>
          <SensorBox
            x={sensorBX}
            y={cy}
            width={sensorW}
            height={sensorH}
            side={1}
          />
          {wires.map((w, i) => {
            const y = cy + spread(i);
            const lineEndX = sensorBX + sensorW - enterDepth; // заходим внутрь датчика
            const dx = Math.max(24, (lineEndX - bodyR) * 0.45);
            return (
              <g key={w.id}>
                <path
                  d={`M ${bodyR} ${cy} C ${bodyR + dx} ${cy}, ${lineEndX - dx} ${y}, ${lineEndX} ${y}`}
                  stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
                />
                <text x={sensorBX + sensorW + 4} y={y - 6} fontSize={11} textAnchor="start">{markingB(w)}</text>
              </g>
            );
          })}
          {/* Подписи датчика поверх проводов */}
          <SensorLabel
            x={sensorBX}
            y={cy}
            width={sensorW}
            name={cable.sideBSensorName}
            desc={cable.sideBSensorDesc}
            extra={cable.sideBSensorExtra}
            side={1}
          />
        </>
      )}

      {/* тело кабеля: жирный жгут — толстая основа + обводка, провода уходят под оболочку */}
      <line x1={bodyL} y1={cy} x2={bodyR} y2={cy} stroke="#e8e8e8" strokeWidth={16} strokeLinecap="round" />
      <line x1={bodyL} y1={cy - 8} x2={bodyR} y2={cy - 8} stroke="#111" strokeWidth={2.2} />
      <line x1={bodyL} y1={cy + 8} x2={bodyR} y2={cy + 8} stroke="#111" strokeWidth={2.2} />
      {/* маркировка кабеля */}
      <text x={W / 2} y={cy - 12} fontSize={14} textAnchor="middle">{label}</text>
      {/* размер длины */}
      <g stroke="#111" strokeWidth={1}>
        <line x1={bodyL} y1={cy + 16} x2={bodyL} y2={cy + 30} />
        <line x1={bodyR} y1={cy + 16} x2={bodyR} y2={cy + 30} />
        <line x1={bodyL} y1={cy + 24} x2={bodyR} y2={cy + 24} />
        <path d={`M ${bodyL} ${cy + 24} l 9 -3 v 6 z`} fill="#111" />
        <path d={`M ${bodyR} ${cy + 24} l -9 -3 v 6 z`} fill="#111" />
      </g>
      <text x={W / 2} y={cy + 40} fontSize={13} textAnchor="middle">L = {cable.lengthMm} мм</text>
    </svg>
  );
}
