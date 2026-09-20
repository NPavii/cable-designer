import type { Cable, Project, Wire } from '../types/cable';
import { TIP_LIBRARY, WIRE_COLORS, paginateCables } from '../types/cable';
import CableSvg from './CableSvg';

const tipName = (id: string) => TIP_LIBRARY.find((t) => t.id === id)?.name ?? '—';

function cellValue(w: Wire, idx: number, key: string) {
  switch (key) {
    case 'num': return String(idx + 1);
    case 'marking': return w.marking;
    case 'color': return WIRE_COLORS.find((c) => c.id === w.color)?.name ?? w.color;
    case 'tipA': return tipName(w.tipA);
    case 'tipB': return tipName(w.tipB);
    default: return (w as any).custom?.[key] ?? '';
  }
}

export function CableBlock({
  cable,
  wireStart = 0,
  wireCount = cable.cores,
}: {
  cable: Cable;
  wireStart?: number;
  wireCount?: number;
}) {
  const wires = cable.wires.slice(wireStart, wireStart + wireCount);
  return (
    <div style={{ marginBottom: '3mm' }}>
      <div style={{ border: '1px solid #000', padding: '1mm' }}>
        <CableSvg cable={cable} width={720} wireStart={wireStart} wireCount={wireCount} />
      </div>
      <table className="gost-table">
        <thead>
          <tr>
            {cable.columns.map((c) => (
              <th key={c.id}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wires.map((w, i) => (
            <tr key={w.id}>
              {cable.columns.map((c) => (
                <td key={c.id}>{cellValue(w, wireStart + i, c.key === 'custom' ? c.customKey ?? '' : c.key)}</td>
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
        <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap' }}>Примечание: {cable.note}</div>
      )}
    </div>
  );
}

// Лист А4 с рамкой и штампом по ГОСТ 2.301
export default function SheetA4({ project, cables }: { project: Project; cables: Cable[] }) {
  const sheets = paginateCables(cables);
  const totalSheets = sheets.length;

  return (
    <>
      {sheets.map((pageGroup, sheetIdx) => {
        const sheetNum = sheetIdx + 1;
        // На одном листе ровно 1 CablePage
        const page = pageGroup[0];
        return (
          <div className="a4-sheet" key={`sheet-${sheetNum}`}>
            <div className="a4-frame">
              <div style={{ padding: '3mm 5mm 18mm 5mm' }}>
                <CableBlock
                  cable={page.cable}
                  wireStart={page.wireStart}
                  wireCount={page.wireCount}
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
      })}
    </>
  );
}
