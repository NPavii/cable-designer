import { useEffect, useRef, useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import type { Cable, Jumper, TipShape } from '../types/cable';
import { TIP_LIBRARY, jumperLeaves, wireSlots } from '../types/cable';

/** Лёгкая пружинная модель для SVG: координаты кривой догоняют новую
 *  раскладку с инерцией и затуханием. Подходит технической схеме лучше
 *  полноценного physics engine — не влияет на геометрию печати. */
function AnimatedPath({ d, animate = false, ...props }: SVGProps<SVGPathElement> & { animate?: boolean }) {
  const target = String(d ?? '');
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  const velocityRef = useRef<number[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frameRef.current);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = currentRef.current.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    const to = target.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    if (!animate || reduceMotion || from.length !== to.length || from.length === 0) {
      currentRef.current = target;
      velocityRef.current = [];
      setCurrent(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      // Фиксированный шаг общий для кривой, наконечника и узла:
      // независимые часы давали небольшое расхождение на промежуточных кадрах.
      const dt = 1 / 60;
      const stiffness = 190;
      const damping = 25;
      const values = to.map((end, i) => {
        const value = from[i];
        const velocity = (velocityRef.current[i] ?? 0) + ((end - value) * stiffness - (velocityRef.current[i] ?? 0) * damping) * dt;
        velocityRef.current[i] = velocity;
        return value + velocity * dt;
      });
      let index = 0;
      const next = target.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, () => String(values[index++] ?? 0));
      from.splice(0, from.length, ...values);
      currentRef.current = next;
      setCurrent(next);
      const settled = values.every((v, i) => Math.abs(v - to[i]) < 0.02 && Math.abs(velocityRef.current[i]) < 0.05);
      if (!settled && now - start < 1800) frameRef.current = requestAnimationFrame(tick);
      else {
        currentRef.current = target;
        setCurrent(target);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, animate]);

  return <path {...props} d={current} />;
}

/** Та же пружина для присоединённых элементов. Наконечник и конец кривой
 *  используют одинаковые параметры, поэтому не расходятся во время движения. */
function useSpringNumber(target: number, animate: boolean): number {
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  const velocityRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frameRef.current);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduceMotion) {
      currentRef.current = target;
      velocityRef.current = 0;
      setCurrent(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      // Фиксированный шаг общий для кривой, наконечника и узла:
      // независимые часы давали небольшое расхождение на промежуточных кадрах.
      const dt = 1 / 60;
      const velocity = velocityRef.current + ((target - currentRef.current) * 190 - velocityRef.current * 25) * dt;
      velocityRef.current = velocity;
      currentRef.current += velocity * dt;
      setCurrent(currentRef.current);
      const settled = Math.abs(currentRef.current - target) < 0.02 && Math.abs(velocity) < 0.05;
      if (!settled && now - start < 1800) frameRef.current = requestAnimationFrame(tick);
      else {
        currentRef.current = target;
        velocityRef.current = 0;
        setCurrent(target);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, animate]);

  return current;
}

function AnimatedCircle({ cy, animate = false, ...props }: SVGProps<SVGCircleElement> & { animate?: boolean }) {
  const springCy = useSpringNumber(Number(cy ?? 0), animate);
  return <circle {...props} cy={springCy} />;
}

// Рисуем наконечник в точке (x,y), направление: side=-1 (влево), side=1 (вправо)
function Tip({ x, y: targetY, shape, side, animate = false }: { x: number; y: number; shape: TipShape; side: 1 | -1; animate?: boolean }) {
  const y = useSpringNumber(targetY, animate);
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

// Подписи квадратного разъёма выносим за контур: название сверху,
// описание и дополнительные сведения снизу, чтобы текст не пересекал жилы.
function SensorLabel({
  x, y, width, height, name, desc, extra, side
}: {
  x: number; y: number; width: number; height: number; name: string; desc: string; extra?: string; side: 1 | -1;
}) {
  const rectX = side === 1 ? x : x - width;
  const textX = rectX + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  return (
    <g data-connector-label="">
      <text
        x={textX}
        y={top - 12}
        fontSize={12}
        textAnchor="middle"
        fontWeight="bold"
        stroke="white"
        strokeWidth={5}
        paintOrder="stroke"
      >
        {name || 'Квадрат'}
      </text>
      <text
        x={textX}
        y={bottom + 16}
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
          y={bottom + 28}
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

// Подпись круглого разъёма выносится за контур, чтобы не перекрывать контакты.
function CircleConnectorLabel({
  x, y, radius, name, desc, extra
}: {
  x: number; y: number; radius: number; name: string; desc: string; extra?: string;
}) {
  return (
    <g textAnchor="middle">
      <text
        x={x}
        y={y - radius - 66}
        fontSize={12}
        fontWeight="bold"
        stroke="white"
        strokeWidth={5}
        paintOrder="stroke"
      >
        {name || 'Круг'}
      </text>
      <text
        x={x}
        y={y + radius + 64}
        fontSize={9}
        fill="#333"
        stroke="white"
        strokeWidth={4}
        paintOrder="stroke"
      >
        {desc}
      </text>
      {extra && (
        <text
          x={x}
          y={y + radius + 76}
          fontSize={8}
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
  /** Плавная экранная анимация; на печати всегда статичная схема. */
  animated?: boolean;
}

export default function CableSvg({
  cable,
  width = 760,
  wireStart = 0,
  wireCount = cable.cores,
  animated = false,
}: CableSvgProps) {
  const wires = cable.wires.slice(wireStart, wireStart + wireCount);
  const n = Math.max(wires.length, 1);
  const W = width;
  const LEVEL_W = 46;            // горизонтальный шаг на один уровень гирлянды
  const bodyL = W * 0.36;
  const bodyR = W * 0.64;
  const fanL = 70;               // длина развода жил
  const label = `${cable.cores}*${cable.section}`;

  // Сколько вертикальных слотов занимает каждая сторона
  // (жила = 1 слот + слоты листьев её перемычек; скрытые жилы — 0;
  // в режиме датчика перемычки не рисуются)
  const slotsA = wires.reduce((s, w) => s + (cable.sideAMode === 'tips' ? wireSlots(w, 'A') : (w.hiddenA ? 0 : 1)), 0);
  const slotsB = wires.reduce((s, w) => s + (cable.sideBMode === 'tips' ? wireSlots(w, 'B') : (w.hiddenB ? 0 : 1)), 0);
  const maxSlots = Math.max(1, n, slotsA, slotsB);
  // На одном листе до 24 жил: при большой плотности уменьшаем вертикальный шаг,
  // сохраняя кабель и таблицу в пределах печатной страницы.
  const spreadStep = maxSlots > 16 ? Math.max(12, Math.min(24, 480 / maxSlots)) : 30;

  const hasCircleConnector = cable.sideAMode === 'circle' || cable.sideBMode === 'circle';
  const hasSensorConnector = cable.sideAMode === 'sensor' || cable.sideBMode === 'sensor';
  const H = Math.max(hasCircleConnector ? 250 : 160, maxSlots * spreadStep + (hasSensorConnector ? 110 : 50));
  const cy = H / 2;
  const springCy = useSpringNumber(cy, animated);

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
          <AnimatedPath
            animate={animated}
            key={`${keyPrefix}${j.id}`}
            d={`M ${xA} ${yA} C ${xA + dir * dx} ${yA}, ${xJun - dir * dx} ${y1}, ${xJun} ${y1}`}
            stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
          />,
          <AnimatedCircle animate={animated} key={`${keyPrefix}${j.id}d`} cx={xJun} cy={y1} r={3} fill={color} />,
          <AnimatedPath
            animate={animated}
            key={`${keyPrefix}${j.id}o`}
            d={`M ${xJun} ${y1} C ${xJun + dir * 12} ${y1}, ${xNext - dir * 12} ${yOwn}, ${xNext} ${yOwn}`}
            stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
          />,
          <Tip animate={animated} key={`${keyPrefix}${j.id}t`} x={xNext} y={yOwn} shape={tipOf(j.tip)} side={dir} />,
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
          <AnimatedPath
            animate={animated}
            key={`${keyPrefix}${j.id}`}
            d={`M ${xA} ${yA} C ${xA + dir * dx} ${yA}, ${xLeaf - dir * dx} ${y1}, ${xLeaf} ${y1}`}
            stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
          />,
          <Tip animate={animated} key={`${keyPrefix}${j.id}t`} x={xLeaf} y={y1} shape={tipOf(j.tip)} side={dir} />,
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
    if (total === 0) return []; // все жилы скрыты на этой стороне
    const xBody = side === 'A' ? bodyL : bodyR;
    const xJ = side === 'A' ? bodyL - fanL - 40 + 26 : bodyR + fanL + 40 - 26;
    const nodes: ReactNode[] = [];
    let slot = 0;

    for (const w of wires) {
      const js = (side === 'A' ? w.jumpersA : w.jumpersB) ?? [];
      const wSlots = wireSlots(w, side);
      if (wSlots === 0) continue; // жила скрыта на этой стороне
      // Точка соединения — в центре диапазона слотов жилы
      const yJ = slotCenter(total, slot + wSlots / 2 - 0.5);
      // Отдельный слот на торце сохраняет порядок жил и убирает общую точку старта.
      const startY = cy + ((slot + wSlots / 2) / total - 0.5) * 14;
      const dx = Math.abs(xBody - xJ) * 0.45;
      const marking = side === 'A' ? w.marking : markingB(w);
      const tip = tipOf(side === 'A' ? w.tipA : w.tipB);

      if (js.length === 0) {
        // Плавная S-кривая без обратного хода и огибания наконечника.
        nodes.push(
          <g key={w.id}>
            <AnimatedPath
              animate={animated}
              data-wire-path=""
              d={`M ${xBody} ${startY} C ${xBody + dir * dx} ${startY}, ${xJ - dir * dx} ${yJ}, ${xJ} ${yJ}`}
              stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
            />
            <Tip animate={animated} x={xJ} y={yJ} shape={tip} side={dir} />
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
        const dxj = Math.abs(xBody - xJun) * 0.45;
        nodes.push(
          <g key={w.id}>
            <AnimatedPath
              animate={animated}
              data-wire-path=""
              d={`M ${xBody} ${startY} C ${xBody + dir * dxj} ${startY}, ${xJun - dir * dxj} ${yJ}, ${xJun} ${yJ}`}
              stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
            />
            <AnimatedCircle animate={animated} cx={xJun} cy={yJ} r={3.5} fill={w.color} />
            {/* собственный конец жилы */}
            <AnimatedPath
              animate={animated}
              d={`M ${xJun} ${yJ} C ${xJun + dir * 12} ${yJ}, ${xLeaf - dir * 12} ${yOwn}, ${xLeaf} ${yOwn}`}
              stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
            />
            <Tip animate={animated} x={xLeaf} y={yOwn} shape={tip} side={dir} />
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

  // Круглый разъём: каждая видимая жила получает свой контакт на окружности.
  // Контакты следуют по часовой стрелке, а маркировка выносится за контур.
  const renderCircleSide = (side: 'A' | 'B'): ReactNode => {
    const dir: 1 | -1 = side === 'A' ? -1 : 1;
    const visible = wires.filter((w) => !(side === 'A' ? w.hiddenA : w.hiddenB));
    const radius = Math.min(58, Math.max(40, visible.length * 7));
    const centerX = side === 'A' ? sensorAX - radius : sensorBX + radius;
    const xBody = side === 'A' ? bodyL : bodyR;
    const contactDepth = visible.length > 16 ? 11 : 14;
    const name = side === 'A' ? cable.sideASensorName : cable.sideBSensorName;
    const desc = side === 'A' ? cable.sideASensorDesc : cable.sideBSensorDesc;
    const extra = side === 'A' ? cable.sideASensorExtra : cable.sideBSensorExtra;

    return (
      // Смена плотности — новая топология: не смешиваем старые кривые с новой раскладкой.
      <g key={`${side}-${visible.length}`} className="circle-connector" data-connector="circle" data-side={side}>
        <AnimatedCircle
          animate={animated}
          cx={centerX}
          cy={cy}
          r={radius}
          fill="white"
          stroke="#111"
          strokeWidth={1.5}
        />
        {visible.map((w, i) => {
          // Смещение на полшага убирает горизонтальные траектории через соседние контакты.
          const angle = -Math.PI / 2 + ((i + 0.5) * Math.PI * 2) / visible.length;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const contactX = centerX + (radius - contactDepth) * cos;
          const contactY = cy + (radius - contactDepth) * sin;
          // Старты повторяют положение контактов на торце в двух осях.
          // Даже симметричные пары не имеют общей начальной точки.
          const startX = xBody + cos * 7;
          const startY = cy + sin * 7;
          const nearBody = side === 'A' ? cos > 0.2 : cos < -0.2;
          const labelRadius = radius + (visible.length > 12 && i % 2 ? 25 : 16);
          const labelX = centerX + labelRadius * cos;
          // На стороне кабеля сдвигаем подпись по вертикали с радиальной линии провода.
          const labelY = cy + labelRadius * sin + (nearBody ? (sin > 0 ? 24 : -24) : 0);
          // Плавная S-кривая: обе контрольные точки строго между торцом и контактом,
          // поэтому провод красиво изгибается, но не образует петлю у подключения.
          const spanX = Math.abs(startX - contactX);
          const control1X = startX + dir * spanX * 0.45;
          const control2X = contactX - dir * spanX * 0.45;
          const control1Y = startY;
          const control2Y = contactY;
          const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
          return (
            <g key={w.id} data-contact={w.id}>
              <AnimatedPath
                animate={animated}
                data-wire-path=""
                d={`M ${startX} ${startY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${contactX} ${contactY}`}
                stroke={w.color}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
              />
              <AnimatedCircle
                animate={animated}
                cx={contactX}
                cy={contactY}
                r={visible.length > 16 ? 3 : 3.8}
                fill="white"
                stroke="#111"
                strokeWidth={1.1}
              />
              <AnimatedCircle
                animate={animated}
                cx={contactX}
                cy={contactY}
                r={1.35}
                fill={w.color}
              />
              <text
                data-wire-label=""
                x={labelX}
                y={labelY + 3}
                fontSize={visible.length > 12 ? 9 : 10}
                textAnchor={anchor}
                stroke="white"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {side === 'A' ? w.marking : markingB(w)}
              </text>
            </g>
          );
        })}
        <CircleConnectorLabel
          x={centerX}
          y={springCy}
          radius={radius}
          name={name}
          desc={desc}
          extra={extra}
        />
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Сторона А (слева) */}
      {cable.sideAMode === 'circle' ? renderCircleSide('A') : cable.sideAMode === 'tips' ? (
        renderTipsSide('A')
      ) : (
        // Датчик слева — провода плавно заходят внутрь прямоугольника
        <>
          <SensorBox
            x={sensorAX}
            y={springCy}
            width={sensorW}
            height={sensorH}
            side={-1}
          />
          {wires.filter((w) => !w.hiddenA).map((w, i, vis) => {
            const y = cy + (i - (vis.length - 1) / 2) * spreadStep;
            const startY = cy + (i - (vis.length - 1) / 2) * (14 / Math.max(vis.length - 1, 1));
            const lineEndX = sensorAX + enterDepth; // заходим внутрь датчика
            // Обе контрольные точки остаются между кабелем и контактом: без петли у квадрата.
            const dx = Math.abs(bodyL - lineEndX) * 0.45;
            return (
              <g key={w.id}>
                <AnimatedPath
                  animate={animated}
                  data-wire-path=""
                  data-wire-side="A"
                  d={`M ${bodyL} ${startY} C ${bodyL - dx} ${startY}, ${lineEndX + dx} ${y}, ${lineEndX} ${y}`}
                  stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
                />
                <text data-wire-label="" x={sensorAX - 4} y={y - 6} fontSize={11} textAnchor="end">{w.marking}</text>
              </g>
            );
          })}
          {/* Подписи разъёма за контуром, вне траекторий проводов */}
          <SensorLabel
            x={sensorAX}
            y={springCy}
            width={sensorW}
            height={sensorH}
            name={cable.sideASensorName}
            desc={cable.sideASensorDesc}
            extra={cable.sideASensorExtra}
            side={-1}
          />
        </>
      )}

      {/* Сторона Б (справа) */}
      {cable.sideBMode === 'circle' ? renderCircleSide('B') : cable.sideBMode === 'tips' ? (
        renderTipsSide('B')
      ) : (
        // Датчик справа — провода плавно заходят внутрь прямоугольника
        <>
          <SensorBox
            x={sensorBX}
            y={springCy}
            width={sensorW}
            height={sensorH}
            side={1}
          />
          {wires.filter((w) => !w.hiddenB).map((w, i, vis) => {
            const y = cy + (i - (vis.length - 1) / 2) * spreadStep;
            const startY = cy + (i - (vis.length - 1) / 2) * (14 / Math.max(vis.length - 1, 1));
            const lineEndX = sensorBX + sensorW - enterDepth; // заходим внутрь датчика
            const dx = Math.abs(lineEndX - bodyR) * 0.45;
            return (
              <g key={w.id}>
                <AnimatedPath
                  animate={animated}
                  data-wire-path=""
                  data-wire-side="B"
                  d={`M ${bodyR} ${startY} C ${bodyR + dx} ${startY}, ${lineEndX - dx} ${y}, ${lineEndX} ${y}`}
                  stroke={w.color} strokeWidth={3} fill="none" strokeLinecap="round"
                />
                <text data-wire-label="" x={sensorBX + sensorW + 4} y={y - 6} fontSize={11} textAnchor="start">{markingB(w)}</text>
              </g>
            );
          })}
          {/* Подписи разъёма за контуром, вне траекторий проводов */}
          <SensorLabel
            x={sensorBX}
            y={springCy}
            width={sensorW}
            height={sensorH}
            name={cable.sideBSensorName}
            desc={cable.sideBSensorDesc}
            extra={cable.sideBSensorExtra}
            side={1}
          />
        </>
      )}

      {/* Тело и размерная линия движутся синхронно с началами проводов. */}
      <g transform={`translate(0 ${springCy - cy})`}>
        <line x1={bodyL} y1={cy} x2={bodyR} y2={cy} stroke="#e8e8e8" strokeWidth={16} strokeLinecap="round" />
        <line x1={bodyL} y1={cy - 8} x2={bodyR} y2={cy - 8} stroke="#111" strokeWidth={2.2} />
        <line x1={bodyL} y1={cy + 8} x2={bodyR} y2={cy + 8} stroke="#111" strokeWidth={2.2} />
        <text x={W / 2} y={cy - 12} fontSize={14} textAnchor="middle">{label}</text>
        <g stroke="#111" strokeWidth={1}>
          <line x1={bodyL} y1={cy + 16} x2={bodyL} y2={cy + 30} />
          <line x1={bodyR} y1={cy + 16} x2={bodyR} y2={cy + 30} />
          <line x1={bodyL} y1={cy + 24} x2={bodyR} y2={cy + 24} />
          <path d={`M ${bodyL} ${cy + 24} l 9 -3 v 6 z`} fill="#111" />
          <path d={`M ${bodyR} ${cy + 24} l -9 -3 v 6 z`} fill="#111" />
        </g>
        <text x={W / 2} y={cy + 40} fontSize={13} textAnchor="middle">L = {cable.lengthMm} мм</text>
      </g>
    </svg>
  );
}
