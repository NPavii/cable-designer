export type TipShape = 'pin' | 'ring' | 'fork' | 'sleeve' | 'flat' | 'none';

export interface TipType {
  id: string;
  name: string;      // например «НШВИ 0,75-8»
  shape: TipShape;
}

export interface Jumper {
  id: string;
  marking: string;    // собственная маркировка перемычки
  tip: string;        // id наконечника на конце перемычки
  isJumper: boolean;  // галочка «перемычка»: из этого провода можно вывести ещё (гирлянда)
  chains: Jumper[];   // перемычки, выведенные из этой перемычки (при isJumper)
}

export interface Wire {
  id: string;
  marking: string;    // маркировка (сторона А и, в моно-режиме, сторона Б)
  markingB?: string;  // маркировка стороны Б (только при markingMode = 'dual')
  color: string;      // цвет изоляции
  tipA: string;       // id наконечника, сторона А
  tipB: string;       // id наконечника, сторона Б
  custom?: Record<string, string>;  // значения пользовательских столбцов (по customKey)
  jumpersA?: Jumper[];  // перемычки со стороны А (гирлянда от конца жилы)
  jumpersB?: Jumper[];  // перемычки со стороны Б
}

/** Режим маркировки: одна на оба конца или своя на каждый конец */
export type MarkingMode = 'single' | 'dual';

export type ColumnKey = 'num' | 'marking' | 'color' | 'tipA' | 'tipB' | 'custom';

export interface TableColumn {
  id: string;
  title: string;
  key: ColumnKey;      // 'custom' — произвольный текст
  customKey?: string;  // для custom: ключ в wire.custom
}

export type SideMode = 'tips' | 'sensor';

export interface Cable {
  id: string;
  designation: string;  // обозначение, например «АНК 601Н-45 01 00»
  name: string;         // наименование, например «Отвод короба (XS4)»
  cores: number;        // количество жил
  section: string;      // сечение, например «0,75»
  lengthMm: number;     // длина, мм
  markingMode: MarkingMode;  // маркировка: одна на два конца / у каждого конца своя
  wires: Wire[];        // длина массива = cores
  columns: TableColumn[];
  note: string;         // примечания
  sideAMode: SideMode;  // сторона А: наконечники или датчик
  sideBMode: SideMode;  // сторона Б: наконечники или датчик
  sideASensorName: string;  // название квадрата датчика, сторона А
  sideASensorDesc: string;  // краткое описание датчика, сторона А
  sideASensorExtra: string; // дополнительно: особенности датчика, сторона А
  sideBSensorName: string;  // название квадрата датчика, сторона Б
  sideBSensorDesc: string;  // краткое описание датчика, сторона Б
  sideBSensorExtra: string; // дополнительно: особенности датчика, сторона Б
}

export interface Project {
  docNumber: string;   // АНК 601Н-45 00 00 МЭ
  cables: Cable[];
}

export const TIP_LIBRARY: TipType[] = [
  { id: 'nshvi',  name: 'НШВИ (штыревой)',  shape: 'pin' },
  { id: 'ring4',  name: 'РФ-М4 (кольцо)',   shape: 'ring' },
  { id: 'ring5',  name: 'РФ-М5 (кольцо)',   shape: 'ring' },
  { id: 'fork',   name: 'РВИ (вилочный)',   shape: 'fork' },
  { id: 'sleeve', name: 'НКИ (гильза)',     shape: 'sleeve' },
  { id: 'flat',   name: 'РПИ (плоский)',    shape: 'flat' },
  { id: 'none',   name: 'Без наконечника',  shape: 'none' },
];

export const WIRE_COLORS = [
  { id: '#8B4513', name: 'Коричневый' },
  { id: '#000000', name: 'Чёрный' },
  { id: '#808080', name: 'Серый' },
  { id: '#0000CC', name: 'Синий' },
  { id: '#00AA00', name: 'Ж/З (земля)' },
  { id: '#CC0000', name: 'Красный' },
  { id: '#FFFFFF', name: 'Белый' },
  { id: '#FF8800', name: 'Оранжевый' },
  { id: '#FFD700', name: 'Жёлтый' },
  { id: '#800080', name: 'Фиолетовый' },
];

let counter = 1;
export const uid = () => `id_${Date.now().toString(36)}_${counter++}`;

export const makeJumper = (marking = ''): Jumper => ({
  id: uid(),
  marking,
  tip: 'nshvi',
  isJumper: false,
  chains: [],
});

/** Число концевых точек (листьев), которые занимает перемычка на схеме:
 *  обычная перемычка — 1 точка; точка гирлянды — свой конец + листья цепочки */
export function jumperLeaves(j: Jumper): number {
  return j.isJumper && j.chains.length > 0
    ? 1 + j.chains.reduce((s, c) => s + jumperLeaves(c), 0)
    : 1;
}

/** Сколько вертикальных слотов занимает жила на стороне:
 *  собственный конец + листья всех перемычек */
export function wireSlots(w: Wire, side: 'A' | 'B'): number {
  const js = (side === 'A' ? w.jumpersA : w.jumpersB) ?? [];
  return 1 + js.reduce((s, j) => s + jumperLeaves(j), 0);
}

/** Иммутабельное обновление перемычки по id в дереве гирлянды.
 *  fn возвращает обновлённую перемычку или null для удаления. */
export function updateJumperTree(
  list: Jumper[],
  id: string,
  fn: (j: Jumper) => Jumper | null
): Jumper[] {
  const out: Jumper[] = [];
  for (const j of list) {
    if (j.id === id) {
      const r = fn(j);
      if (r) out.push(r);
    } else {
      out.push({ ...j, chains: updateJumperTree(j.chains, id, fn) });
    }
  }
  return out;
}

export function makeWires(cores: number, prev: Wire[] = []): Wire[] {
  const defaults = ['U', 'V', 'W', 'PE', '1', '2', '3', '4', '5', '6', '7', '8'];
  const defColors = ['#8B4513', '#000000', '#808080', '#00AA00', '#0000CC', '#CC0000', '#FF8800', '#FFD700', '#800080', '#FFFFFF', '#00AAAA', '#AA5555'];
  return Array.from({ length: cores }, (_, i) =>
    prev[i] ?? {
      id: uid(),
      marking: defaults[i] ?? String(i + 1),
      color: defColors[i % defColors.length],
      tipA: 'nshvi',
      tipB: 'nshvi',
    }
  );
}

export function makeCable(n: number): Cable {
  const cores = 4;
  return {
    id: uid(),
    designation: `Кабель ${n}`,
    name: '',
    cores,
    section: '0,75',
    lengthMm: 4000,
    markingMode: 'single',
    wires: makeWires(cores),
    columns: [
      { id: uid(), title: '№ жилы', key: 'num' },
      { id: uid(), title: 'Маркировка', key: 'marking' },
      { id: uid(), title: 'Цвет', key: 'color' },
      { id: uid(), title: 'Наконечник стор. А', key: 'tipA' },
      { id: uid(), title: 'Наконечник стор. Б', key: 'tipB' },
    ],
    note: '',
    sideAMode: 'tips',
    sideBMode: 'tips',
    sideASensorName: '',
    sideASensorDesc: '',
    sideASensorExtra: '',
    sideBSensorName: '',
    sideBSensorDesc: '',
    sideBSensorExtra: '',
  };
}

/** Максимальное количество жил на одном листе А4 */
export const MAX_WIRES_PER_SHEET = 16;

/** Разбивает кабель на страницы (каждая страница — часть кабеля для одного листа А4) */
export interface CablePage {
  cable: Cable;
  wireStart: number;   // индекс начала жил (0-based)
  wireCount: number;   // количество жил на этой странице
  pageNum: number;     // номер страницы кабеля (1-based)
  totalPages: number;  // всего страниц у этого кабеля
}

/** Разбивает все кабели проекта на листы А4 */
export function paginateCables(cables: Cable[]): CablePage[][] {
  const pages: CablePage[][] = [];

  for (const cable of cables) {
    const totalPages = Math.ceil(cable.cores / MAX_WIRES_PER_SHEET);
    const cablePages: CablePage[] = [];
    for (let p = 0; p < totalPages; p++) {
      const wireStart = p * MAX_WIRES_PER_SHEET;
      const wireCount = Math.min(MAX_WIRES_PER_SHEET, cable.cores - wireStart);
      cablePages.push({ cable, wireStart, wireCount, pageNum: p + 1, totalPages });
    }
    // Каждый cablePage идёт на отдельный лист А4
    for (const cp of cablePages) {
      pages.push([cp]);
    }
  }

  return pages;
}
