import { useEffect, useMemo, useState } from 'react';
import type { Cable, Project, SideMode, Wire } from '../types/cable';
import { TIP_LIBRARY, WIRE_COLORS, makeCable, makeWires, uid } from '../types/cable';
import SheetA4 from '../components/SheetA4';

const LS_KEY = 'cable-designer-project-v2';

const defaultProject = (): Project => ({
  docNumber: 'АНК 601Н-45 00 00 МЭ',
  title: 'Кабель двигателя',
  developer: '',
  checker: '',
  org: '',
  cables: [makeCable(1)],
});

function load(): Project {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Миграция старых данных: добавляем новые поля если их нет
      if (parsed.cables) {
        parsed.cables = parsed.cables.map((c: any) => ({
          sideAMode: 'tips',
          sideBMode: 'tips',
          sideASensorName: '',
          sideASensorDesc: '',
          sideBSensorName: '',
          sideBSensorDesc: '',
          ...c,
        }));
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return defaultProject();
}

export default function Home() {
  const [project, setProject] = useState<Project>(load);
  const [activeId, setActiveId] = useState<string>(project.cables[0]?.id ?? '');

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(project));
  }, [project]);

  const cable = useMemo(
    () => project.cables.find((c) => c.id === activeId) ?? project.cables[0],
    [project, activeId]
  );

  const patch = (p: Partial<Project>) => setProject((pr) => ({ ...pr, ...p }));
  const patchCable = (p: Partial<Cable>) =>
    setProject((pr) => ({
      ...pr,
      cables: pr.cables.map((c) => (c.id === cable.id ? { ...c, ...p } : c)),
    }));
  const patchWire = (wid: string, p: Partial<Wire>) =>
    patchCable({ wires: cable.wires.map((w) => (w.id === wid ? { ...w, ...p } : w)) });

  const setCores = (n: number) => {
    const cores = Math.max(1, Math.min(24, n));
    patchCable({ cores, wires: makeWires(cores, cable.wires) });
  };

  const addCable = () => {
    const c = makeCable(project.cables.length + 1);
    patch({ cables: [...project.cables, c] });
    setActiveId(c.id);
  };

  const removeCable = () => {
    if (project.cables.length <= 1) return;
    const rest = project.cables.filter((c) => c.id !== cable.id);
    patch({ cables: rest });
    setActiveId(rest[0].id);
  };

  const addColumn = () =>
    patchCable({
      columns: [
        ...cable.columns,
        { id: uid(), title: `Столбец ${cable.columns.length + 1}`, key: 'custom', customKey: `c${uid()}` },
      ],
    });

  const inp = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';
  const lbl = 'text-xs text-gray-500 block mb-0.5';

  const SideEditor = ({
    side,
    label,
    mode,
    name,
    desc,
  }: {
    side: 'A' | 'B';
    label: string;
    mode: SideMode;
    name: string;
    desc: string;
  }) => (
    <div className="border rounded p-2 bg-white space-y-2">
      <div className="font-semibold text-xs">{label}</div>
      <div className="flex gap-2">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name={`side${side}Mode`}
            checked={mode === 'tips'}
            onChange={() => patchCable({ [`side${side}Mode`]: 'tips' } as any)}
          />
          Свободные концы
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name={`side${side}Mode`}
            checked={mode === 'sensor'}
            onChange={() => patchCable({ [`side${side}Mode`]: 'sensor' } as any)}
          />
          Датчик
        </label>
      </div>
      {mode === 'sensor' && (
        <div className="space-y-1">
          <div>
            <span className={lbl}>Название квадрата</span>
            <input
              className={inp}
              value={name}
              onChange={(e) => patchCable({ [`side${side}SensorName`]: e.target.value } as any)}
            />
          </div>
          <div>
            <span className={lbl}>Краткое описание</span>
            <input
              className={inp}
              value={desc}
              onChange={(e) => patchCable({ [`side${side}SensorDesc`]: e.target.value } as any)}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen app-root">
      {/* Панель редактора */}
      <div className="w-[460px] shrink-0 overflow-y-auto border-r p-4 space-y-4 no-print bg-gray-50">
        <h1 className="text-lg font-bold">Конструктор кабелей</h1>

        <section className="space-y-2">
          <h2 className="font-semibold text-sm">Документ</h2>
          <div className="grid grid-cols-2 gap-2">
            <div><span className={lbl}>Обозначение</span>
              <input className={inp} value={project.docNumber} onChange={(e) => patch({ docNumber: e.target.value })} /></div>
            <div><span className={lbl}>Наименование</span>
              <input className={inp} value={project.title} onChange={(e) => patch({ title: e.target.value })} /></div>
            <div><span className={lbl}>Разработал</span>
              <input className={inp} value={project.developer} onChange={(e) => patch({ developer: e.target.value })} /></div>
            <div><span className={lbl}>Проверил</span>
              <input className={inp} value={project.checker} onChange={(e) => patch({ checker: e.target.value })} /></div>
            <div className="col-span-2"><span className={lbl}>Организация</span>
              <input className={inp} value={project.org} onChange={(e) => patch({ org: e.target.value })} /></div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Кабели</h2>
            <button className="text-sm bg-blue-600 text-white rounded px-2 py-1" onClick={addCable}>+ Кабель</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {project.cables.map((c) => (
              <button key={c.id}
                className={`text-xs rounded px-2 py-1 border ${c.id === cable.id ? 'bg-blue-600 text-white' : 'bg-white'}`}
                onClick={() => setActiveId(c.id)}>
                {c.designation}
              </button>
            ))}
          </div>
        </section>

        {cable && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Параметры кабеля</h2>
              <button className="text-xs text-red-600" onClick={removeCable}>Удалить</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className={lbl}>Обозначение</span>
                <input className={inp} value={cable.designation} onChange={(e) => patchCable({ designation: e.target.value })} /></div>
              <div><span className={lbl}>Наименование</span>
                <input className={inp} value={cable.name} onChange={(e) => patchCable({ name: e.target.value })} /></div>
              <div><span className={lbl}>Жил, шт</span>
                <input className={inp} type="number" min={1} max={24} value={cable.cores}
                  onChange={(e) => setCores(parseInt(e.target.value) || 1)} /></div>
              <div><span className={lbl}>Сечение, мм²</span>
                <input className={inp} value={cable.section} onChange={(e) => patchCable({ section: e.target.value })} /></div>
              <div><span className={lbl}>Длина, мм</span>
                <input className={inp} type="number" min={0} value={cable.lengthMm}
                  onChange={(e) => patchCable({ lengthMm: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="text-xs text-gray-500">
              Итог: <b>Кабель {cable.cores}х{cable.section} — {(cable.lengthMm / 1000).toLocaleString('ru-RU')} м</b>
            </div>

            {/* Стороны кабеля */}
            <h3 className="font-semibold text-sm pt-2">Стороны кабеля</h3>
            <div className="grid grid-cols-2 gap-2">
              <SideEditor
                side="A"
                label="Сторона А (левая)"
                mode={cable.sideAMode}
                name={cable.sideASensorName}
                desc={cable.sideASensorDesc}
              />
              <SideEditor
                side="B"
                label="Сторона Б (правая)"
                mode={cable.sideBMode}
                name={cable.sideBSensorName}
                desc={cable.sideBSensorDesc}
              />
            </div>

            <h3 className="font-semibold text-sm pt-2">Жилы и наконечники</h3>
            <table className="w-full text-xs border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-1">Марк.</th>
                  <th className="border p-1">Цвет</th>
                  <th className="border p-1">Стор. А</th>
                  <th className="border p-1">Стор. Б</th>
                  {cable.columns.filter((c) => c.key === 'custom').map((c) => (
                    <th key={c.id} className="border p-1">{c.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cable.wires.slice(0, cable.cores).map((w) => (
                  <tr key={w.id}>
                    <td className="border p-0.5">
                      <input className="w-12 text-xs px-1" value={w.marking}
                        onChange={(e) => patchWire(w.id, { marking: e.target.value })} /></td>
                    <td className="border p-0.5">
                      <select className="text-xs" value={w.color}
                        onChange={(e) => patchWire(w.id, { color: e.target.value })}>
                        {WIRE_COLORS.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select></td>
                    {(['tipA', 'tipB'] as const).map((k) => (
                      <td key={k} className="border p-0.5">
                        <select className="text-xs" value={w[k]}
                          onChange={(e) => patchWire(w.id, { [k]: e.target.value })}>
                          {TIP_LIBRARY.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select></td>
                    ))}
                    {cable.columns.filter((c) => c.key === 'custom').map((c) => (
                      <td key={c.id} className="border p-0.5">
                        <input className="w-16 text-xs px-1" value={w.custom?.[c.customKey ?? ''] ?? ''}
                          onChange={(e) => patchWire(w.id, {
                            custom: { ...w.custom, [c.customKey ?? '']: e.target.value },
                          })} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between pt-2">
              <h3 className="font-semibold text-sm">Столбцы таблицы</h3>
              <button className="text-xs bg-gray-200 rounded px-2 py-1" onClick={addColumn}>+ Столбец</button>
            </div>
            {cable.columns.map((col, i) => (
              <div key={col.id} className="flex gap-1 items-center">
                <input className={inp} value={col.title}
                  onChange={(e) =>
                    patchCable({ columns: cable.columns.map((c) => (c.id === col.id ? { ...c, title: e.target.value } : c)) })
                  } />
                {cable.columns.length > 1 && (
                  <button className="text-red-600 text-xs shrink-0"
                    onClick={() => patchCable({ columns: cable.columns.filter((_, j) => j !== i) })}>✕</button>
                )}
              </div>
            ))}

            <h3 className="font-semibold text-sm pt-2">Примечания</h3>
            <textarea className={inp} rows={3} value={cable.note}
              onChange={(e) => patchCable({ note: e.target.value })} />
          </section>
        )}

        <button
          className="w-full bg-green-600 text-white rounded py-2 font-semibold"
          onClick={() => window.print()}>
          Экспорт в PDF (А4)
        </button>
        <p className="text-xs text-gray-500">
          В диалоге печати выберите «Сохранить как PDF», формат А4, поля «Нет».
        </p>
      </div>

      {/* Предпросмотр листа */}
      <div className="flex-1 overflow-auto bg-gray-300 p-6 print-area">
        <SheetA4 project={project} cables={project.cables} />
      </div>
    </div>
  );
}
