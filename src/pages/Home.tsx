import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cable, Project, SideMode, Wire } from '../types/cable';
import { TIP_LIBRARY, WIRE_COLORS, makeCable, makeWires, paginateCables, uid } from '../types/cable';
import SheetA4 from '../components/SheetA4';

const LS_KEY = 'cable-designer-project-v2';
const PANEL_W_KEY = 'cable-designer-panel-w';
const PANEL_MIN = 380;
const PANEL_MAX = 1200;

const defaultProject = (): Project => ({
  docNumber: 'АНК 601Н-45 00 00 МЭ',
  cables: [makeCable(1)],
});

// Миграция старых данных: добавляем новые поля, если их нет; проверяем структуру
function migrateProject(parsed: any): Project {
  if (!parsed || !Array.isArray(parsed.cables) || parsed.cables.length === 0) {
    throw new Error('invalid project file');
  }
  parsed.cables = parsed.cables.map((c: any) => ({
    sideAMode: 'tips',
    sideBMode: 'tips',
    sideASensorName: '',
    sideASensorDesc: '',
    sideASensorExtra: '',
    sideBSensorName: '',
    sideBSensorDesc: '',
    sideBSensorExtra: '',
    markingMode: 'single',
    ...c,
  }));
  if (typeof parsed.docNumber !== 'string') parsed.docNumber = '';
  return parsed as Project;
}

function load(): Project {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      return migrateProject(JSON.parse(raw));
    }
  } catch { /* ignore */ }
  return defaultProject();
}

const inp = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';
const lbl = 'text-xs text-gray-500 block mb-0.5';

// Редактор стороны кабеля. Вынесен из Home на верхний уровень модуля:
// вложенное определение создавало новый тип компонента на каждый рендер,
// React перемонтировал поля и терял фокус после каждой введённой буквы.
function SideEditor({
  side,
  label,
  mode,
  name,
  desc,
  extra,
  onChange,
}: {
  side: 'A' | 'B';
  label: string;
  mode: SideMode;
  name: string;
  desc: string;
  extra: string;
  onChange: (p: Partial<Cable>) => void;
}) {
  return (
    <div className="border rounded p-2 bg-white space-y-2">
      <div className="font-semibold text-xs">{label}</div>
      <div className="flex gap-2">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name={`side${side}Mode`}
            checked={mode === 'tips'}
            onChange={() => onChange({ [`side${side}Mode`]: 'tips' } as any)}
          />
          Свободные концы
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name={`side${side}Mode`}
            checked={mode === 'sensor'}
            onChange={() => onChange({ [`side${side}Mode`]: 'sensor' } as any)}
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
              onChange={(e) => onChange({ [`side${side}SensorName`]: e.target.value } as any)}
            />
          </div>
          <div>
            <span className={lbl}>Краткое описание</span>
            <input
              className={inp}
              value={desc}
              onChange={(e) => onChange({ [`side${side}SensorDesc`]: e.target.value } as any)}
            />
          </div>
          <div>
            <span className={lbl}>Дополнительно</span>
            <input
              className={inp}
              value={extra}
              placeholder="особенности датчика"
              onChange={(e) => onChange({ [`side${side}SensorExtra`]: e.target.value } as any)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [project, setProject] = useState<Project>(load);
  const [activeId, setActiveId] = useState<string>(project.cables[0]?.id ?? '');
  // Путь текущего файла проекта (null — ещё не сохранён)
  const [filePath, setFilePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Признак несохранённых изменений (ref — для window.__cableIsDirty, state — для индикатора)
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const suppressDirty = useRef(true); // первая запись (загрузка из localStorage) — не изменение
  const setDirtyBoth = (v: boolean) => { dirtyRef.current = v; setDirty(v); };

  // Экспортируем проверку для главного процесса Electron (диалог при закрытии окна)
  useEffect(() => {
    window.__cableIsDirty = () => dirtyRef.current;
    return () => { delete window.__cableIsDirty; };
  }, []);

  // --- выборочная печать: окно с чекбоксами листов ---
  const totalSheets = paginateCables(project.cables).length + 1; // листы кабелей + перечень
  const [selOpen, setSelOpen] = useState(false);
  const [selPages, setSelPages] = useState<Set<number>>(new Set());
  const openSel = () => {
    setSelPages(new Set(Array.from({ length: totalSheets }, (_, i) => i)));
    setSelOpen(true);
  };
  const togglePage = (i: number) =>
    setSelPages((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  // Ширина боковой панели — запоминается между запусками
  const [panelW, setPanelW] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(PANEL_W_KEY) || '460');
    return Number.isFinite(v) ? Math.min(PANEL_MAX, Math.max(PANEL_MIN, v)) : 460;
  });
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Зацепили правый край панели — тянем, меняя ширину
  const onPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelW };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPanelW(Math.min(PANEL_MAX, Math.max(PANEL_MIN, d.startW + ev.clientX - d.startX)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setPanelW((w) => {
        localStorage.setItem(PANEL_W_KEY, String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(project));
    // Любое изменение проекта помечает документ как несохранённый,
    // кроме загрузки (старта/открытия файла)
    if (suppressDirty.current) {
      suppressDirty.current = false;
      return;
    }
    setDirtyBoth(true);
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

  // Полная копия выбранного кабеля: новые id у кабеля, жил и столбцов.
  // customKey столбцов сохраняем — по ним привязаны значения жил (wire.custom).
  const duplicateCable = () => {
    if (!cable) return;
    const copy: Cable = JSON.parse(JSON.stringify(cable));
    copy.id = uid();
    copy.designation = `${cable.designation} (копия)`;
    copy.wires = copy.wires.map((w) => ({ ...w, id: uid() }));
    copy.columns = copy.columns.map((c) => ({ ...c, id: uid() }));
    const idx = project.cables.findIndex((c) => c.id === cable.id);
    const cables = [...project.cables];
    cables.splice(idx + 1, 0, copy);
    patch({ cables });
    setActiveId(copy.id);
  };

  // --- Работа с файлом проекта: Сохранить / Сохранить как / Открыть ---
  const serialize = () =>
    JSON.stringify({ app: 'cable-designer', version: 2, docNumber: project.docNumber, cables: project.cables }, null, 2);

  const defaultFileName = () =>
    `${(project.docNumber.trim() || 'проект').replace(/[\\/:*?"<>|]/g, '_')}.json`;

  const applyOpened = (content: string, path: string | null) => {
    try {
      const p = migrateProject(JSON.parse(content));
      suppressDirty.current = true; // загрузка файла — не изменение
      setProject(p);
      setActiveId(p.cables[0]?.id ?? '');
      setFilePath(path);
      setDirtyBoth(false);
    } catch {
      alert('Не удалось открыть файл: это не проект кабельного дизайнера или файл повреждён.');
    }
  };

  const saveAs = async () => {
    if (window.cableFiles) {
      const r = await window.cableFiles.saveAs(defaultFileName(), serialize());
      if (!r.canceled && r.path) {
        setFilePath(r.path);
        setDirtyBoth(false);
      }
    } else {
      // Запасной вариант для браузера: скачивание JSON
      const blob = new Blob([serialize()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = defaultFileName();
      a.click();
      URL.revokeObjectURL(a.href);
      setDirtyBoth(false);
    }
  };

  const save = async () => {
    if (window.cableFiles && filePath) {
      await window.cableFiles.save(filePath, serialize());
      setDirtyBoth(false);
    } else {
      await saveAs();
    }
  };

  const openProject = () => {
    if (dirtyRef.current &&
        !window.confirm('Есть несохранённые изменения. Открыть другой файл без сохранения?')) {
      return;
    }
    if (window.cableFiles) {
      window.cableFiles.open().then((r) => {
        if (r.canceled || !r.content) return;
        applyOpened(r.content, r.path ?? null);
      });
    } else {
      fileInputRef.current?.click();
    }
  };
  // --- конец блока работы с файлом ---

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

  return (
    <div className="flex h-screen app-root">
      {/* Панель редактора */}
      <div
        className="shrink-0 overflow-y-auto border-r p-4 space-y-4 no-print bg-gray-50"
        style={{ width: panelW }}
      >
        <h1 className="text-lg font-bold">Конструктор кабелей</h1>

        <section className="space-y-2">
          <h2 className="font-semibold text-sm">Документ</h2>
          <div>
            <span className={lbl}>Обозначение</span>
            <input className={inp} value={project.docNumber} onChange={(e) => patch({ docNumber: e.target.value })} />
          </div>
          <div className="flex gap-1 items-center">
            <button className="text-sm bg-gray-200 rounded px-2 py-1" onClick={openProject}>Открыть…</button>
            <button className="text-sm bg-gray-200 rounded px-2 py-1" onClick={save}>Сохранить</button>
            <button className="text-sm bg-gray-200 rounded px-2 py-1" onClick={saveAs}>Сохранить как…</button>
            {dirty && (
              <span className="text-xs text-amber-600 ml-1" title="Есть несохранённые изменения">● не сохранено</span>
            )}
          </div>
          {filePath && (
            <div className="text-xs text-gray-500 break-all" title={filePath}>
              Файл: {filePath.split(/[\\/]/).pop()}
            </div>
          )}
          {/* Запасной вариант открытия для запуска в браузере (без Electron) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              f.text().then((t) => applyOpened(t, null));
              e.target.value = '';
            }}
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Кабели</h2>
            <div className="flex gap-1">
              <button className="text-sm bg-gray-200 rounded px-2 py-1" onClick={duplicateCable}>Дублировать</button>
              <button className="text-sm bg-blue-600 text-white rounded px-2 py-1" onClick={addCable}>+ Кабель</button>
            </div>
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
              <div className="col-span-2">
                <span className={lbl}>Маркировка жил</span>
                <div className="flex gap-3 pt-1">
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" name="markingMode" checked={cable.markingMode === 'single'}
                      onChange={() => patchCable({ markingMode: 'single' })} />
                    Одна на два конца
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" name="markingMode" checked={cable.markingMode === 'dual'}
                      onChange={() => patchCable({ markingMode: 'dual' })} />
                    У каждого конца своя
                  </label>
                </div>
              </div>
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
                extra={cable.sideASensorExtra}
                onChange={patchCable}
              />
              <SideEditor
                side="B"
                label="Сторона Б (правая)"
                mode={cable.sideBMode}
                name={cable.sideBSensorName}
                desc={cable.sideBSensorDesc}
                extra={cable.sideBSensorExtra}
                onChange={patchCable}
              />
            </div>

            <h3 className="font-semibold text-sm pt-2">Жилы и наконечники</h3>
            <table className="w-full text-xs border">
              <thead>
                <tr className="bg-gray-100">
                  {cable.markingMode === 'dual' ? (
                    <>
                      <th className="border p-1">Марк. А</th>
                      <th className="border p-1">Марк. Б</th>
                    </>
                  ) : (
                    <th className="border p-1">Марк.</th>
                  )}
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
                    {cable.markingMode === 'dual' ? (
                      <>
                        <td className="border p-0.5">
                          <input className="w-12 text-xs px-1" value={w.marking}
                            onChange={(e) => patchWire(w.id, { marking: e.target.value })} /></td>
                        <td className="border p-0.5">
                          <input className="w-12 text-xs px-1" value={w.markingB ?? ''}
                            placeholder={w.marking}
                            onChange={(e) => patchWire(w.id, { markingB: e.target.value })} /></td>
                      </>
                    ) : (
                      <td className="border p-0.5">
                        <input className="w-12 text-xs px-1" value={w.marking}
                          onChange={(e) => patchWire(w.id, { marking: e.target.value })} /></td>
                    )}
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

        <div className="flex gap-2">
          <button
            className="flex-1 bg-blue-600 text-white rounded py-2 font-semibold"
            onClick={openSel}>
            Выбрать и печатать
          </button>
          <button
            className="flex-1 bg-green-600 text-white rounded py-2 font-semibold"
            onClick={() => window.print()}>
            Экспорт в PDF (А4)
          </button>
        </div>
        <p className="text-xs text-gray-500">
          «Выбрать и печатать» — окно с выбором листов. В диалоге печати выберите «Сохранить как PDF», формат А4, поля «Нет».
        </p>
      </div>

      {/* Ручка изменения ширины панели */}
      <div
        className="no-print shrink-0 w-1.5 cursor-col-resize bg-gray-300 hover:bg-blue-500 active:bg-blue-600 transition-colors"
        onMouseDown={onPanelResizeStart}
        title="Зажмите и потяните, чтобы изменить ширину панели"
      />

      {/* Предпросмотр листа (в печать не идёт, когда открыто окно выбора) */}
      <div className={'flex-1 overflow-auto bg-gray-300 p-6 print-area' + (selOpen ? ' no-print' : '')}>
        <SheetA4 project={project} cables={project.cables} />
      </div>

      {/* Окно «Выбрать и печатать»: предпросмотр листов с чекбоксами */}
      {selOpen && (
        <div className="sel-root">
          <div className="sel-bar no-print">
            <span className="text-sm text-gray-200">Отметьте листы для печати</span>
            <div className="tb-spacer" />
            <button
              className="bg-green-600 text-white rounded px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
              disabled={selPages.size === 0}
              onClick={() => window.print()}>
              Печатать ({selPages.size})
            </button>
            <button
              className="bg-gray-600 text-white rounded px-4 py-1.5 text-sm"
              onClick={() => setSelOpen(false)}>
              Закрыть
            </button>
          </div>
          <div className="sel-list">
            <SheetA4
              project={project}
              cables={project.cables}
              renderWrap={(node, idx, total) => (
                <div
                  key={idx}
                  className={'sel-card' + (selPages.has(idx) ? '' : ' sheet-skip')}>
                  <label className="sel-card-head no-print">
                    <input
                      type="checkbox"
                      checked={selPages.has(idx)}
                      onChange={() => togglePage(idx)}
                    />
                    Лист {idx + 1} из {total}
                  </label>
                  <div className="sel-mini">{node}</div>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
