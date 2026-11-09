import type { Cable, Project, Wire } from '../types/cable';
import { TIP_LIBRARY, WIRE_COLORS, cableHasJumpers, paginateCables } from '../types/cable';
import CableSvg from './CableSvg';
import MarkdownView from './MarkdownView';

const tipName = (id: string) => TIP_LIBRARY.find((t) => t.id === id)?.name ?? '—';

function cellValue(w: Wire, idx: number, key: string, markingMode: 'single' | 'dual') {
  switch (key) {
    case 'num': return String(idx + 1);
    case 'marking': {
      if (w.hiddenA && w.hiddenB) return '—';
      // Двойная маркировка: скрытый конец явно обозначаем прочерком.
      if (markingMode === 'dual') {
        return `${w.hiddenA ? '—' : w.marking} / ${w.hiddenB ? '—' : (w.markingB ?? w.marking)}`;
      }
      return w.marking;
    }
    case 'color': return WIRE_COLORS.find((c) => c.id === w.color)?.name ?? w.color;
    case 'tipA': return w.hiddenA ? '—' : tipName(w.tipA);
    case 'tipB': return w.hiddenB ? '—' : tipName(w.tipB);
    default: return (w as any).custom?.[key] ?? '';
  }
}

export function CableBlock({
  cable,
  wireStart = 0,
  wireCount = cable.cores,
  animated = false,
}: {
  cable: Cable;
  wireStart?: number;
  wireCount?: number;
  animated?: boolean;
}) {
  const wires = cable.wires.slice(wireStart, wireStart + wireCount);
  const visibleColumns = cable.columns.filter((c) => !c.hidden);
  return (
    <div style={{ marginBottom: '3mm' }}>
      <div style={{ border: '1px solid #000', padding: '1mm' }}>
        <CableSvg cable={cable} width={720} wireStart={wireStart} wireCount={wireCount} animated={animated} />
      </div>
      <table className="gost-table">
        <thead>
          <tr>
            {visibleColumns.map((c) => (
              <th key={c.id}>{
                c.key === 'marking' && cable.markingMode === 'dual'
                  ? 'Маркировка А / Б'
                  : c.title
              }</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wires.map((w, i) => (
            <tr key={w.id}>
              {visibleColumns.map((c) => (
                <td key={c.id}>{cellValue(w, wireStart + i, c.key === 'custom' ? c.customKey ?? '' : c.key, cable.markingMode)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: '9pt', marginTop: '0.5mm' }}>
        <b>{cable.designation}</b>
        {cable.name ? ` ${cable.name}` : ''} — Кабель {cable.cores}х{cable.section} — L={cable.lengthMm} мм
        {cable.cores > wireCount && (
          <span> (жилы {wireStart + 1}—{wireStart + wireCount} из {cable.cores})</span>
        )}
      </div>
      {cable.note && (
        <div className="sheet-note">
          <b>Примечание:</b>
          <MarkdownView value={cable.note} />
        </div>
      )}
      {cableHasJumpers(cable) && cable.jumperNote && (
        <div className="sheet-note">
          <b>Примечание для перемычки:</b>
          <MarkdownView value={cable.jumperNote} />
        </div>
      )}
    </div>
  );
}

/** Максимальное количество строк перечня кабелей на одном листе А4 */
const SUMMARY_ROWS_PER_SHEET = 25;

/** Финальный лист А4 — динамический перечень всех кабелей проекта */
function SummarySheet({
  cables,
  startIdx,
  sheetNum,
  totalSheets,
  docNumber,
  sheetId,
}: {
  cables: Cable[];
  startIdx: number;
  sheetNum: number;
  totalSheets: number;
  docNumber: string;
  sheetId: string;
}) {
  return (
    <div className="a4-sheet" id={sheetId}>
      <div className="a4-frame">
        <div style={{ padding: '3mm 5mm 18mm 5mm' }}>
          <div style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 'bold', marginBottom: '4mm' }}>
            Перечень кабелей
          </div>
          <table className="gost-table">
            <thead>
              <tr>
                <th style={{ width: '10mm' }}>№</th>
                <th>Обозначение</th>
                <th>Наименование</th>
                <th style={{ width: '26mm' }}>Кабель</th>
                <th style={{ width: '22mm' }}>Длина, мм</th>
              </tr>
            </thead>
            <tbody>
              {cables.map((c, i) => (
                <tr key={c.id}>
                  <td>{startIdx + i + 1}</td>
                  <td>{c.designation}</td>
                  <td>{c.name || '—'}</td>
                  <td>{c.cores}х{c.section}</td>
                  <td>{c.lengthMm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Упрощённая рамка / штамп */}
        <div
          style={{
            position: 'absolute',
            bottom: '5mm',
            left: '6mm',
            right: '6mm',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1.5px solid #000',
            paddingTop: '2mm',
          }}
        >
          <div style={{ fontSize: '11pt', fontWeight: 'bold' }}>
            {docNumber}
          </div>
          <div style={{ fontSize: '10pt' }}>
            Лист {sheetNum} из {totalSheets}
          </div>
        </div>
      </div>
    </div>
  );
}

// Лист А4 с рамкой и штампом по ГОСТ 2.301
export default function SheetA4({
  project,
  cables,
  renderWrap,
  animated = false,
}: {
  project: Project;
  cables: Cable[];
  /** Опциональная обёртка каждого листа (например, карточка с чекбоксом выбора) */
  renderWrap?: (node: React.ReactElement, sheetIdx: number, total: number) => React.ReactElement;
  animated?: boolean;
}) {
  const sheets = paginateCables(cables);
  const summarySheets: Cable[][] = [];
  for (let i = 0; i < cables.length; i += SUMMARY_ROWS_PER_SHEET) {
    summarySheets.push(cables.slice(i, i + SUMMARY_ROWS_PER_SHEET));
  }
  const totalSheets = sheets.length + summarySheets.length;

  const elements: React.ReactElement[] = [
    ...sheets.map((pageGroup, sheetIdx) => {
      const sheetNum = sheetIdx + 1;
      // На одном листе ровно 1 CablePage
      const page = pageGroup[0];
      return (
        <div className="a4-sheet" key={`sheet-${sheetNum}`} id={`sheet-cable-${page.cable.id}-page-${page.pageNum}`}>
          <div className="a4-frame">
            <div style={{ padding: '3mm 5mm 18mm 5mm' }}>
              <CableBlock
                cable={page.cable}
                wireStart={page.wireStart}
                wireCount={page.wireCount}
                animated={animated}
              />
            </div>

            {/* Упрощённая рамка / штамп */}
            <div
              style={{
                position: 'absolute',
                bottom: '5mm',
                left: '6mm',
                right: '6mm',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                borderTop: '1.5px solid #000',
                paddingTop: '2mm',
              }}
            >
              <div style={{ fontSize: '11pt', fontWeight: 'bold' }}>
                {project.docNumber}
              </div>
              <div style={{ fontSize: '10pt' }}>
                Лист {sheetNum} из {totalSheets}
              </div>
            </div>
          </div>
        </div>
      );
    }),
    ...summarySheets.map((group, i) => (
      <SummarySheet
        key={`summary-${i}`}
        cables={group}
        startIdx={i * SUMMARY_ROWS_PER_SHEET}
        sheetNum={sheets.length + i + 1}
        totalSheets={totalSheets}
        docNumber={project.docNumber}
        sheetId={`sheet-summary-${i}`}
      />
    )),
  ];

  if (!renderWrap) return <>{elements}</>;
  return <>{elements.map((el, i) => renderWrap(el, i, totalSheets))}</>;
}
