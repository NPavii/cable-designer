export type TipShape = 'pin' | 'ring' | 'fork' | 'sleeve' | 'flat' | 'none';

export interface TipType {
  id: string;
  name: string;      // например «НШВИ 0,75-8»
  shape: TipShape;
}

export interface Wire {
  id: string;
  marking: string;   // U, V, W, PE, 1, 2 ...
  color: string;     // цвет изоляции
  tipA: string;      // id наконечника, сторона А
  tipB: string;      // id наконечника, сторона Б
  custom?: Record<string, string>;  // значения пользовательских столбцов (по customKey)
}

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
  designation: string; // обозначение, например «АНК 601Н-45 01 00»
  name: string;         // наименование, например «Отвод короба (XS4)»
  cores: number;        // количество жил
  section: string;      // сечение, например «0,75»
  lengthMm: number;     // длина, мм
  wires: Wire[];        // длина массива = cores
  columns: TableColumn[];
  note: string;         // примечания
  sideAMode: SideMode;  // сторона А: наконечники или датчик
  sideBMode: SideMode;  // сторона Б: наконечники или датчик
  sideASensorName: string;  // название квадрата датчика, сторона А
  sideASensorDesc: string;  // краткое описание датчика, сторона А
  sideBSensorName: string;  // название квадрата датчика, сторона Б
  sideBSensorDesc: string;  // краткое описание датчика, сторона Б
}

export interface Project {
  docNumber: string;   // АНК 601Н-45 00 00 МЭ
  title: string;       // Кабель двигателя
  developer: string;
  checker: string;
  org: string;         // ВКП «Сигнал-Пак»
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
    sideBSensorName: '',
    sideBSensorDesc: '',
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
