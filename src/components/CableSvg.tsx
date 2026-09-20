import type { Cable, TipShape } from '../types/cable';
import { TIP_LIBRARY } from '../types/cable';

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

// Рисуем датчик (прямоугольник с подписями)
function SensorBox({
  x, y, width, height, name, desc, side
}: {
  x: number; y: number; width: number; height: number;
  name: string; desc: string; side: 1 | -1;
}) {
  const stroke = '#111';
  const rectX = side === 1 ? x : x - width;
  const textX = rectX + width / 2;
  return (
    <g>
      <rect
        x={rectX}
        y={y - height / 2}
        width={width}
        height={height}
        stroke={stroke}
        strokeWidth={1.5}
        fill="white"
      />
      <text
        x={textX}
        y={y - 4}
        fontSize={12}
        textAnchor="middle"
        fontWeight="bold"
      >
        {name || 'Датчик'}
      </text>
      <text
        x={textX}
        y={y + 10}
        fontSize={9}
        textAnchor="middle"
        fill="#333"
      >
        {desc}
      </text>
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
  const spreadStep = 30;         // шаг между жилами (уменьшен для компактности)
  const bodyL = W * 0.36;
  const bodyR = W * 0.64;
  const fanL = 70;               // длина развода жил
  const label = `${cable.cores}*${cable.section}`;

  const spread = (i: number) => (i - (n - 1) / 2) * spreadStep;
  const H = Math.max(160, n * spreadStep + 50);
  const cy = H / 2;

  const tipOf = (id: string): TipShape =>
    TIP_LIBRARY.find((t) => t.id === id)?.shape ?? 'none';

  const sensorW = 90;
  const sensorH = Math.max(50, n * spreadStep + 14);
  const enterDepth = 25;         // насколько провода заходят внутрь датчика

  // Координаты датчиков
  const sensorAX = bodyL - fanL - 40;          // правая грань датчика А
  const sensorBX = bodyR + fanL + 40;          // левая грань датчика Б

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Сторона А (слева) */}
      {cable.sideAMode === 'tips' ? (
        // Свободные концы с наконечниками
        wires.map((w, i) => {
          const y = cy + spread(i);
          const xEnd = bodyL - fanL - 40;
          return (
            <g key={w.id}>
              <line x1={bodyL} y1={cy} x2={xEnd + 26} y2={y} stroke={w.color} strokeWidth={3} />
              <Tip x={xEnd + 26} y={y} shape={tipOf(w.tipA)} side={-1} />
              <text x={xEnd - 4} y={y - 6} fontSize={11} textAnchor="start">{w.marking}</text>
            </g>
          );
        })
      ) : (
        // Датчик слева — провода заходят внутрь прямоугольника
        <>
          <SensorBox
            x={sensorAX}
            y={cy}
            width={sensorW}
            height={sensorH}
            name={cable.sideASensorName}
            desc={cable.sideASensorDesc}
            side={-1}
          />
          {wires.map((w, i) => {
            const y = cy + spread(i);
            const lineEndX = sensorAX + enterDepth; // заходим внутрь датчика
            return (
              <g key={w.id}>
                <line x1={bodyL} y1={cy} x2={lineEndX} y2={y} stroke={w.color} strokeWidth={3} />
                <text x={sensorAX - 4} y={y - 6} fontSize={11} textAnchor="end">{w.marking}</text>
              </g>
            );
          })}
        </>
      )}

      {/* Сторона Б (справа) */}
      {cable.sideBMode === 'tips' ? (
        // Свободные концы с наконечниками
        wires.map((w, i) => {
          const y = cy + spread(i);
          const xEnd = bodyR + fanL + 40;
          return (
            <g key={w.id}>
              <line x1={bodyR} y1={cy} x2={xEnd - 26} y2={y} stroke={w.color} strokeWidth={3} />
              <Tip x={xEnd - 26} y={y} shape={tipOf(w.tipB)} side={1} />
              <text x={xEnd + 4} y={y - 6} fontSize={11} textAnchor="start">{w.marking}</text>
            </g>
          );
        })
      ) : (
        // Датчик справа — провода заходят внутрь прямоугольника
        <>
          <SensorBox
            x={sensorBX}
            y={cy}
            width={sensorW}
            height={sensorH}
            name={cable.sideBSensorName}
            desc={cable.sideBSensorDesc}
            side={1}
          />
          {wires.map((w, i) => {
            const y = cy + spread(i);
            const lineEndX = sensorBX + sensorW - enterDepth; // заходим внутрь датчика
            return (
              <g key={w.id}>
                <line x1={bodyR} y1={cy} x2={lineEndX} y2={y} stroke={w.color} strokeWidth={3} />
                <text x={sensorBX + sensorW + 4} y={y - 6} fontSize={11} textAnchor="start">{w.marking}</text>
              </g>
            );
          })}
        </>
      )}

      {/* тело кабеля */}
      <line x1={bodyL} y1={cy - 5} x2={bodyR} y2={cy - 5} stroke="#111" strokeWidth={1.4} />
      <line x1={bodyL} y1={cy + 5} x2={bodyR} y2={cy + 5} stroke="#111" strokeWidth={1.4} />
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
