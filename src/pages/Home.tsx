import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Eye, EyeOff, FileCheck2, Plus, Printer, Redo2, Search, Trash2, Undo2, X } from 'lucide-react';
import type { Cable, Jumper, Project, SideMode, Wire } from '../types/cable';
import { TIP_LIBRARY, WIRE_COLORS, cableHasJumpers, makeCable, makeJumper, makeWires, paginateCables, uid, updateJumperTree } from '../types/cable';
import SheetA4 from '../components/SheetA4';
import ProjectTree from '../components/ProjectTree';
import type { TreeAction, TreeEntity } from '../components/ProjectTree';
import TemplateManager from '../components/TemplateManager';
import SettingsDialog from '../components/SettingsDialog';
import { onTemplatesChanged, readTemplates, writeTemplates } from '../lib/templates';
import type { TemplateKind } from '../lib/templates';
import { cloneCable, readProjectClipboard, writeProjectClipboard } from '../lib/projectClipboard';

const LS_BASE_KEY = 'cable-designer-project-v2';
const WINDOW_ID = window.cableWindow?.id ?? 'main';
// Главное окно использует прежний черновик; новые окна — независимые ключи.
const LS_KEY = WINDOW_ID === 'main' ? LS_BASE_KEY : `${LS_BASE_KEY}-${WINDOW_ID}`;
const PANEL_W_KEY = 'cable-designer-panel-w';
const PANEL_MIN = 380;
const PANEL_MAX = 1200;

const defaultProject = (): Project => ({
  docNumber: 'АНК 601Н-45 00 00 МЭ',
  cables: [makeCable(1)],
  folders: [],
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
    jumperNote: '',
    ...c,
  }));
  if (typeof parsed.docNumber !== 'string') parsed.docNumber = '';
  parsed.folders = Array.isArray(parsed.folders)
    ? parsed.folders.filter((f: any) => f && typeof f.id === 'string' && typeof f.name === 'string')
    : [];
  const folderIds = new Set(parsed.folders.map((f: any) => f.id));
  parsed.cables.forEach((c: any) => { if (!folderIds.has(c.folderId)) c.folderId = null; });
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

const inp = 'win-input text-sm w-full';
const lbl = 'text-xs font-medium text-slate-500 block mb-1';

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
    <div className="border rounded p-2 bg-white space-y-2" data-side={side}>
      <div className="font-semibold text-xs">{label}</div>
      <div className="side-mode-switch">
        <button className={mode === 'tips' ? 'active' : ''} onClick={() => onChange({ [`side${side}Mode`]: 'tips' } as any)}>
          Свободные концы
        </button>
        <button className={mode === 'sensor' ? 'active' : ''} onClick={() => onChange({ [`side${side}Mode`]: 'sensor' } as any)}>
          Квадрат
        </button>
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

// Рекурсивный редактор перемычек (гирлянды). Тоже на уровне модуля — иначе
// поля ввода теряли бы фокус при каждом рендере.
function JumperList({
  items,
  onChange,
  depth,
}: {
  items: Jumper[];
  onChange: (l: Jumper[]) => void;
  depth: number;
}) {
  return (
    <div className="space-y-1" style={{ marginLeft: depth * 18 }}>
      {items.map((j) => (
        <div key={j.id} className="space-y-1">
          <div className="flex gap-1 items-center flex-wrap">
            <span className="text-gray-400 text-xs select-none">⟿</span>
            <input
              className="w-20 text-xs px-1 border border-gray-300 rounded"
              value={j.marking}
              placeholder="Марк."
              onChange={(e) =>
                onChange(updateJumperTree(items, j.id, (x) => ({ ...x, marking: e.target.value })))
              }
            />
            <select
              className="text-xs"
              value={j.tip}
              onChange={(e) =>
                onChange(updateJumperTree(items, j.id, (x) => ({ ...x, tip: e.target.value })))
              }
            >
              {TIP_LIBRARY.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs cursor-pointer" title="Из этого провода можно вывести ещё перемычки (гирлянда)">
              <input
                type="checkbox"
                checked={j.isJumper}
                onChange={(e) =>
                  onChange(updateJumperTree(items, j.id, (x) => ({ ...x, isJumper: e.target.checked })))
                }
              />
              перемычка
            </label>
            {j.isJumper && (
              <button
                className="text-xs bg-gray-200 rounded px-1.5"
                title="Добавить перемычку из этого провода"
                onClick={() =>
                  onChange(updateJumperTree(items, j.id, (x) => ({ ...x, chains: [...x.chains, makeJumper()] })))
                }
              >
                +
              </button>
            )}
            <button
              className="text-red-600 text-xs"
              title="Удалить перемычку (со всей цепочкой)"
              onClick={() => onChange(updateJumperTree(items, j.id, () => null))}
            >
              ✕
            </button>
          </div>
          {j.isJumper && j.chains.length > 0 && (
            <JumperList
              items={j.chains}
              depth={depth + 1}
              onChange={(l) =>
                onChange(updateJumperTree(items, j.id, (x) => ({ ...x, chains: l })))
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Центр обновлений: проверка при старте, диалог «Да / Нет» и настройки в Setting.
function UpdatePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [updateDir, setUpdateDir] = useState('');
  const [savedDir, setSavedDir] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'error' | 'uptodate' | 'available' | 'downloading' | 'applying'>('idle');
  const [info, setInfo] = useState<{ localVersion?: string; remoteVersion?: string; notes?: string; error?: string }>({});
  const [promptOpen, setPromptOpen] = useState(false);
  const dismissed = useRef<Set<string>>(new Set());
  const api = window.cableUpdates;

  const doCheck = async (silent = false) => {
    if (!api) return;
    setStatus('checking');
    const r = await api.check();
    if (!r.ok) {
      setStatus('error');
      setInfo({ error: r.error });
      if (!silent) setPromptOpen(false);
      return;
    }
    setInfo({ localVersion: r.localVersion, remoteVersion: r.remoteVersion, notes: r.notes });
    setStatus(r.hasUpdate ? 'available' : 'uptodate');
    if (r.hasUpdate && WINDOW_ID === 'main' && !dismissed.current.has(r.remoteVersion)) setPromptOpen(true);
  };

  useEffect(() => {
    if (!api) return;
    api.getSettings().then((s) => {
      setUpdateDir(s.updateDir);
      setSavedDir(s.updateDir);
      if (s.updateDir) void doCheck(true);
    });
    const timer = window.setInterval(() => { if (savedDir) void doCheck(true); }, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
    // Проверка выполняется один раз при запуске и далее каждые 6 часов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (open) void doCheck(false); }, [open]);

  if (!api) return null;

  const saveDir = async () => {
    const dir = updateDir.trim();
    await api.setSettings({ updateDir: dir });
    setSavedDir(dir);
    if (dir) await doCheck(false);
    else setStatus('idle');
  };

  const startUpdate = async () => {
    if (window.__cableIsDirty?.()) {
      window.alert('Сохраните проект перед обновлением.');
      return;
    }
    setStatus('downloading');
    try {
      const downloaded = await api.download();
      setStatus('applying');
      const result = await api.apply(downloaded.staging);
      if (!result.ok) throw new Error(result.error || 'Не удалось применить обновление');
    } catch (e: any) {
      setStatus('error');
      setInfo((old) => ({ ...old, error: 'Не удалось обновить: ' + (e?.message || e) }));
    }
  };

  const busy = status === 'downloading' || status === 'applying';

  return (
    <>
      {promptOpen && (
        <div className="template-modal no-print">
          <div className="settings-dialog update-dialog">
            <div className="template-dialog-header">
              <div>
                <h2>Доступно обновление</h2>
                <p>Версия {info.remoteVersion} · установлена {info.localVersion}</p>
              </div>
            </div>
            <div className="update-content">
              <div className="update-label">Что изменилось</div>
              <div className="update-notes">{info.notes || 'Исправления и улучшения приложения.'}</div>
              <p>После скачивания приложение закроется, заменит свои файлы и откроется снова. Ваши проекты и шаблоны сохранятся.</p>
              {status === 'downloading' && <div className="settings-status">Скачивание обновления…</div>}
              {status === 'applying' && <div className="settings-status">Установка и перезапуск…</div>}
              {status === 'error' && <div className="settings-status update-error">{info.error}</div>}
            </div>
            <div className="template-footer">
              <span>Обновить сейчас?</span>
              <div className="flex gap-2">
                <button className="win-button" disabled={busy} onClick={() => {
                  if (info.remoteVersion) dismissed.current.add(info.remoteVersion);
                  setPromptOpen(false);
                }}>Нет</button>
                <button className="win-button primary" disabled={busy} onClick={startUpdate}>{busy ? 'Обновление…' : 'Да'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="template-modal no-print" onClick={onClose}>
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="template-dialog-header">
              <div><h2>Обновления</h2><p>Автоматическая проверка при запуске и каждые 6 часов</p></div>
              <button className="icon-button" onClick={onClose}><X size={18} /></button>
            </div>
            <div className="settings-content">
              <label>Серверная папка с обновлениями</label>
              <div className="settings-path">
                <input value={updateDir} placeholder="Z:\\папка\\cable-designer" onChange={(e) => setUpdateDir(e.target.value)} onBlur={saveDir} />
                <button className="win-button" disabled={!savedDir || busy || status === 'checking'} onClick={() => doCheck(false)}>Проверить</button>
              </div>
              <div className="update-settings-status">
                {status === 'checking' && 'Проверка обновлений…'}
                {status === 'uptodate' && `✓ Установлена актуальная версия ${info.localVersion}`}
                {status === 'available' && `Доступна версия ${info.remoteVersion}`}
                {status === 'error' && info.error}
                {(status === 'downloading' || status === 'applying') && 'Подготовка обновления…'}
                {status === 'idle' && 'Укажите папку с version.json и app'}
              </div>
              {status === 'available' && <button className="win-button primary" onClick={() => setPromptOpen(true)}>Показать обновление</button>}
            </div>
            <div className="template-footer"><span>Проекты и шаблоны не входят в обновление</span><button className="win-button" onClick={onClose}>Закрыть</button></div>
          </div>
        </div>
      )}
    </>
  );
}

// Редактор примечания с раскрывающейся библиотекой шаблонов.
function NoteEditor({
  value,
  onChange,
  kind,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  kind: TemplateKind;
  rows?: number;
}) {
  const [templates, setTemplates] = useState<string[]>(() => readTemplates(kind));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => onTemplatesChanged(() => setTemplates(readTemplates(kind))), [kind]);
  const filtered = templates.filter((item) => item.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));

  const addTemplate = () => {
    const text = value.trim();
    if (!text) return;
    writeTemplates(kind, [...templates, text]);
    setTemplates(readTemplates(kind));
  };

  const insertTemplate = (text: string) => {
    onChange(value.trim() ? `${value.trim()}\n${text}` : text);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="note-editor">
      <textarea className={inp} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="note-template-actions">
        <button className="win-button compact" onClick={() => setOpen((v) => !v)}>
          <BookOpen size={14} /> Шаблоны <span className="template-inline-count">{templates.length}</span>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <button className="win-button compact" disabled={!value.trim()} onClick={addTemplate} title="Сохранить текущий текст как шаблон">
          <Plus size={14} /> Сохранить шаблон
        </button>
      </div>
      {open && (
        <div className="note-template-panel">
          <div className="note-template-search">
            <Search size={14} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти шаблон…" />
            {query && <button onClick={() => setQuery('')}><X size={13} /></button>}
          </div>
          <div className="note-template-list">
            {filtered.map((item) => (
              <div className="note-template-item" key={item}>
                <button onClick={() => insertTemplate(item)} title="Добавить в примечание">{item}</button>
                <button
                  className="note-template-delete"
                  title="Удалить шаблон"
                  onClick={() => writeTemplates(kind, templates.filter((t) => t !== item))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && <div className="note-template-empty">{templates.length ? 'Ничего не найдено' : 'Сохраните текст как шаблон или импортируйте библиотеку через Setting'}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [project, setProject] = useState<Project>(load);
  const [activeId, setActiveId] = useState<string>(project.cables[0]?.id ?? '');
  const [activeSheetId, setActiveSheetId] = useState<string>(() => `sheet-cable-${project.cables[0]?.id}-page-1`);
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

  // --- История изменений: Undo (Ctrl+Z) / Redo (Ctrl+Y, Ctrl+Shift+Z) ---
  const pastRef = useRef<Project[]>([]);
  const futureRef = useRef<Project[]>([]);
  const [histTick, setHistTick] = useState(0); // для перерисовки кнопок ↶/↷

  // Все изменения проекта идут через commit: снапшот в историю, потом setProject
  const commit = (up: (pr: Project) => Project) => {
    pastRef.current.push(project);
    if (pastRef.current.length > 100) pastRef.current.shift();
    futureRef.current = [];
    setHistTick((t) => t + 1);
    setProject(up);
  };

  const undo = () => {
    setProject((pr) => {
      const prev = pastRef.current.pop();
      if (!prev) return pr;
      futureRef.current.push(pr);
      return prev;
    });
    setHistTick((t) => t + 1);
  };

  const redo = () => {
    setProject((pr) => {
      const next = futureRef.current.pop();
      if (!next) return pr;
      pastRef.current.push(pr);
      return next;
    });
    setHistTick((t) => t + 1);
  };

  // Горячие клавиши. В полях ввода Ctrl+Z не перехватываем — там работает
  // штатная отмена текста браузера.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Массовые операции с жилами: выбор чекбоксами ---
  const [selWires, setSelWires] = useState<Set<string>>(new Set());

  // --- Редактор перемычек: какая жила/сторона открыта ---
  const [jumperFocus, setJumperFocus] = useState<{ wireId: string; side: 'A' | 'B' } | null>(null);

  // --- Окно обновлений (открывается из меню Setting → «Обновления…») ---
  const [updatesOpen, setUpdatesOpen] = useState(false);
  useEffect(() => window.cableUpdates?.onMenuUpdates(() => setUpdatesOpen(true)), []);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  useEffect(() => window.cableTemplates?.onMenu(() => setTemplatesOpen(true)), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => window.cableSettings?.onMenu(() => setSettingsOpen(true)), []);

  // --- выборочная печать: окно с чекбоксами листов ---
  const totalSheets = paginateCables(project.cables).length + Math.max(1, Math.ceil(project.cables.length / 25));
  const [selOpen, setSelOpen] = useState(false);
  const [selPages, setSelPages] = useState<Set<number>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const openSel = () => {
    // Никакого неявного выбора: пользователь сам отмечает нужные листы.
    setSelPages(new Set());
    setSelOpen(true);
  };
  const selectAllPages = () => setSelPages(new Set(Array.from({ length: totalSheets }, (_, i) => i)));
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

  const patch = (p: Partial<Project>) => commit((pr) => ({ ...pr, ...p }));
  const patchCable = (p: Partial<Cable>) =>
    commit((pr) => ({
      ...pr,
      cables: pr.cables.map((c) => (c.id === cable.id ? { ...c, ...p } : c)),
    }));
  const patchWire = (wid: string, p: Partial<Wire>) =>
    patchCable({ wires: cable.wires.map((w) => (w.id === wid ? { ...w, ...p } : w)) });

  // При смене кабеля сбрасываем выбор жил и редактор перемычек
  useEffect(() => {
    setSelWires(new Set());
    setJumperFocus(null);
  }, [activeId]);

  // Массовое изменение выбранных жил
  const bulkPatchWires = (p: Partial<Wire>) =>
    patchCable({ wires: cable.wires.map((w) => (selWires.has(w.id) ? { ...w, ...p } : w)) });

  const toggleWireSel = (wid: string) =>
    setSelWires((s) => {
      const n = new Set(s);
      if (n.has(wid)) n.delete(wid);
      else n.add(wid);
      return n;
    });

  const pageWireIds = cable ? cable.wires.slice(0, cable.cores).map((w) => w.id) : [];
  const allSelected = pageWireIds.length > 0 && pageWireIds.every((id) => selWires.has(id));
  const toggleAllWires = () =>
    setSelWires(allSelected ? new Set() : new Set(pageWireIds));

  const focusedJumperWire = jumperFocus
    ? cable.wires.find((w) => w.id === jumperFocus.wireId)
    : undefined;

  const setCores = (n: number) => {
    const cores = Math.max(1, Math.min(24, n));
    patchCable({ cores, wires: makeWires(cores, cable.wires) });
  };

  const navigateSheet = (sheetId: string, cableId?: string) => {
    if (cableId) setActiveId(cableId);
    setActiveSheetId(sheetId);
    setTimeout(() => document.getElementById(sheetId)?.scrollIntoView({ behavior: 'auto', block: 'start' }), 100);
  };

  const selectCable = (id: string) => navigateSheet(`sheet-cable-${id}-page-1`, id);

  const addCable = () => {
    const c = makeCable(project.cables.length + 1);
    patch({ cables: [...project.cables, c] });
    selectCable(c.id);
  };

  const sheetNavigation = useMemo(() => [
    ...paginateCables(project.cables).map((group) => ({
      id: `sheet-cable-${group[0].cable.id}-page-${group[0].pageNum}`,
      cableId: group[0].cable.id,
    })),
    ...Array.from({ length: Math.max(1, Math.ceil(project.cables.length / 25)) }, (_, i) => ({ id: `sheet-summary-${i}`, cableId: undefined })),
  ], [project.cables]);

  // Листание страниц стрелками. В полях ввода стрелки сохраняют штатное поведение.
  useEffect(() => {
    const onArrow = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (selOpen || updatesOpen || templatesOpen || settingsOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const current = Math.max(0, sheetNavigation.findIndex((s) => s.id === activeSheetId));
      const next = Math.min(sheetNavigation.length - 1, Math.max(0, current + (e.key === 'ArrowRight' ? 1 : -1)));
      if (next === current) return;
      e.preventDefault();
      navigateSheet(sheetNavigation[next].id, sheetNavigation[next].cableId);
    };
    window.addEventListener('keydown', onArrow);
    return () => window.removeEventListener('keydown', onArrow);
  });

  // customKey столбцов сохраняется — по нему привязаны значения жил.
  const duplicateCable = () => {
    if (!cable) return;
    const copy = cloneCable(cable, cable.folderId ?? null, ' (копия)');
    const idx = project.cables.findIndex((c) => c.id === cable.id);
    const cables = [...project.cables];
    cables.splice(idx + 1, 0, copy);
    patch({ cables });
    selectCable(copy.id);
  };

  // --- Работа с файлом проекта: Сохранить / Сохранить как / Открыть ---
  const serialize = () =>
    JSON.stringify({ app: 'cable-designer', version: 2, docNumber: project.docNumber, folders: project.folders, cables: project.cables }, null, 2);

  const defaultFileName = () =>
    `${(project.docNumber.trim() || 'проект').replace(/[\\/:*?"<>|]/g, '_')}.json`;

  const applyOpened = (content: string, path: string | null) => {
    try {
      const p = migrateProject(JSON.parse(content));
      suppressDirty.current = true; // загрузка файла — не изменение
      pastRef.current = []; // история отмены привязана к старому проекту — очищаем
      futureRef.current = [];
      setHistTick((t) => t + 1);
      setProject(p);
      setActiveId(p.cables[0]?.id ?? '');
      setActiveSheetId(`sheet-cable-${p.cables[0]?.id}-page-1`);
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

  const newProject = () => {
    if (dirtyRef.current && !window.confirm('Есть несохранённые изменения. Создать новый файл без сохранения?')) return;
    const fresh = defaultProject();
    suppressDirty.current = true;
    pastRef.current = [];
    futureRef.current = [];
    setHistTick((t) => t + 1);
    setProject(fresh);
    setActiveId(fresh.cables[0].id);
    setActiveSheetId(`sheet-cable-${fresh.cables[0].id}-page-1`);
    setFilePath(null);
    setSelWires(new Set());
    setJumperFocus(null);
    setSelOpen(false);
    setDirtyBoth(false);
  };

  // Команды нативных меню File / Edit (и их сочетания клавиш).
  useEffect(() => window.cableFiles?.onMenuCommand((command) => {
    if (command === 'new') newProject();
    else if (command === 'open') openProject();
    else if (command === 'save') void save();
    else if (command === 'saveAs') void saveAs();
    else if (command === 'undo') undo();
    else if (command === 'redo') redo();
  }));
  // --- конец блока работы с файлом ---

  const removeCable = () => {
    if (project.cables.length <= 1) return;
    const rest = project.cables.filter((c) => c.id !== cable.id);
    patch({ cables: rest });
    selectCable(rest[0].id);
  };

  const createFolder = (name: string) => patch({ folders: [...project.folders, { id: uid(), name }] });
  const renameFolder = (id: string, name: string) => patch({
    folders: project.folders.map((f) => f.id === id ? { ...f, name } : f),
  });
  const deleteFolder = (id: string) => patch({
    folders: project.folders.filter((f) => f.id !== id),
    cables: project.cables.map((c) => c.folderId === id ? { ...c, folderId: null } : c),
  });
  const moveCable = (cableId: string, folderId: string | null) => patch({
    cables: project.cables.map((c) => c.id === cableId ? { ...c, folderId } : c),
  });

  const deleteCableById = (id: string) => {
    if (project.cables.length <= 1) return;
    const rest = project.cables.filter((c) => c.id !== id);
    patch({ cables: rest });
    if (id === activeId) selectCable(rest[0].id);
  };

  const handleTreeAction = (action: TreeAction, entity: TreeEntity, id: string, targetFolderId: string | null) => {
    if (action === 'paste') {
      const clipboard = readProjectClipboard();
      if (!clipboard) return;
      if (clipboard.entity === 'folder' && clipboard.folder) {
        const folderId = uid();
        const folder = { id: folderId, name: clipboard.folder.name };
        const copies = clipboard.cables.map((c) => cloneCable(c, folderId));
        patch({ folders: [...project.folders, folder], cables: [...project.cables, ...copies] });
        if (copies[0]) selectCable(copies[0].id);
      } else {
        const copies = clipboard.cables.map((c) => cloneCable(c, targetFolderId));
        patch({ cables: [...project.cables, ...copies] });
        if (copies[0]) selectCable(copies[0].id);
      }
      return;
    }

    if (entity === 'cable') {
      const source = project.cables.find((c) => c.id === id);
      if (!source) return;
      if (action === 'delete') deleteCableById(id);
      else if (action === 'duplicate') {
        const copy = cloneCable(source, source.folderId ?? null, ' (копия)');
        const cables = [...project.cables];
        cables.splice(project.cables.findIndex((c) => c.id === id) + 1, 0, copy);
        patch({ cables });
        selectCable(copy.id);
      } else {
        writeProjectClipboard({ mode: action, entity: 'cable', cables: [source] });
        if (action === 'cut') deleteCableById(id);
      }
      return;
    }

    const folder = project.folders.find((f) => f.id === id);
    if (!folder) return;
    const nested = project.cables.filter((c) => c.folderId === id);
    if (action === 'delete') deleteFolder(id);
    else if (action === 'duplicate') {
      const folderId = uid();
      const copies = nested.map((c) => cloneCable(c, folderId));
      const folders = [...project.folders];
      folders.splice(project.folders.findIndex((f) => f.id === id) + 1, 0, { id: folderId, name: `${folder.name} (копия)` });
      patch({ folders, cables: [...project.cables, ...copies] });
      if (copies[0]) selectCable(copies[0].id);
    } else {
      if (action === 'cut' && nested.length >= project.cables.length) {
        window.alert('Нельзя вырезать папку со всеми кабелями проекта.');
        return;
      }
      writeProjectClipboard({ mode: action, entity: 'folder', folder, cables: nested });
      if (action === 'cut') {
        const rest = project.cables.filter((c) => c.folderId !== id);
        patch({ folders: project.folders.filter((f) => f.id !== id), cables: rest });
        if (nested.some((c) => c.id === activeId) && rest[0]) selectCable(rest[0].id);
      }
    }
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
        className="editor-panel shrink-0 overflow-y-auto p-4 space-y-3 no-print"
        style={{ width: panelW }}
      >
        <div className="app-heading">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Cable Designer</div>
            <h1 className="text-xl font-semibold tracking-tight">Конструктор кабелей</h1>
          </div>
          <div className="flex gap-1" key={histTick}>
            <button className="icon-button" disabled={pastRef.current.length === 0} title="Отменить (Ctrl+Z)" onClick={undo}>
              <Undo2 size={17} />
            </button>
            <button className="icon-button" disabled={futureRef.current.length === 0} title="Повторить (Ctrl+Y)" onClick={redo}>
              <Redo2 size={17} />
            </button>
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="font-semibold text-sm">Документ</h2>
          <div>
            <span className={lbl}>Обозначение</span>
            <input className={inp} value={project.docNumber} onChange={(e) => patch({ docNumber: e.target.value })} />
          </div>
          <div className={`file-status ${dirty ? 'is-dirty' : ''}`}>
            <FileCheck2 size={16} />
            <span className="truncate" title={filePath ?? 'Новый проект'}>
              {filePath ? filePath.split(/[\\/]/).pop() : 'Новый проект'}
            </span>
            <span className="ml-auto shrink-0">{dirty ? 'Не сохранено' : 'Сохранено'}</span>
          </div>
          <div className="file-hint">File → Новый / Открыть / Сохранить · Ctrl+S</div>
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
              <div className="col-span-2"><span className={lbl}>Папка в дереве страниц</span>
                <select className={inp} value={cable.folderId ?? ''} onChange={(e) => moveCable(cable.id, e.target.value || null)}>
                  <option value="">Без папки</option>
                  {project.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select></div>
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

            {/* Панель массовых операций — видна, когда выбрана хотя бы одна жила */}
            {selWires.size > 0 && (
              <div className="border rounded p-2 bg-blue-50 space-y-1 text-xs">
                <div className="font-semibold">Выбрано жил: {selWires.size}</div>
                <div className="flex gap-2 items-center flex-wrap">
                  <label className="flex items-center gap-1">
                    Цвет:
                    <select
                      className="text-xs"
                      value=""
                      onChange={(e) => { if (e.target.value) bulkPatchWires({ color: e.target.value }); }}
                    >
                      <option value="">—</option>
                      {WIRE_COLORS.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    Стор. А:
                    <select
                      className="text-xs"
                      value=""
                      onChange={(e) => { if (e.target.value) bulkPatchWires({ tipA: e.target.value }); }}
                    >
                      <option value="">—</option>
                      {TIP_LIBRARY.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    Стор. Б:
                    <select
                      className="text-xs"
                      value=""
                      onChange={(e) => { if (e.target.value) bulkPatchWires({ tipB: e.target.value }); }}
                    >
                      <option value="">—</option>
                      {TIP_LIBRARY.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                  <button className="text-gray-600 underline" onClick={() => setSelWires(new Set())}>
                    Снять выбор
                  </button>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-gray-600">Видимость:</span>
                  <button
                    className="text-xs bg-gray-200 rounded px-2 py-0.5"
                    title="Скрыть выбранные жилы на схеме со стороны А"
                    onClick={() => bulkPatchWires({ hiddenA: true })}
                  >
                    Скрыть на А
                  </button>
                  <button
                    className="text-xs bg-gray-200 rounded px-2 py-0.5"
                    title="Скрыть выбранные жилы на схеме со стороны Б"
                    onClick={() => bulkPatchWires({ hiddenB: true })}
                  >
                    Скрыть на Б
                  </button>
                  <button
                    className="text-xs bg-gray-200 rounded px-2 py-0.5"
                    title="Показать выбранные жилы на обеих сторонах"
                    onClick={() => bulkPatchWires({ hiddenA: false, hiddenB: false })}
                  >
                    Показать везде
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-xs border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-1" title="Выбрать все жилы">
                    <input type="checkbox" checked={allSelected} onChange={toggleAllWires} />
                  </th>
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
                  <th className="border p-1" title="Перемычки от конца жилы (сторона А / Б)">Перем.</th>
                  {cable.columns.filter((c) => c.key === 'custom').map((c) => (
                    <th key={c.id} className="border p-1">{c.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cable.wires.slice(0, cable.cores).map((w) => (
                  <tr
                    key={w.id}
                    className={(selWires.has(w.id) ? 'bg-blue-50 ' : '') + ((w.hiddenA || w.hiddenB) ? 'opacity-50' : '')}
                    title={w.hiddenA && w.hiddenB ? 'Жила скрыта на обеих сторонах' : w.hiddenA ? 'Жила скрыта на стороне А' : w.hiddenB ? 'Жила скрыта на стороне Б' : undefined}
                  >
                    <td className="border p-0.5 text-center">
                      <input type="checkbox" checked={selWires.has(w.id)} onChange={() => toggleWireSel(w.id)} />
                    </td>
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
                    {(['tipA', 'tipB'] as const).map((k) => {
                      const side = k === 'tipA' ? 'A' : 'B';
                      const hiddenKey = k === 'tipA' ? 'hiddenA' : 'hiddenB';
                      const hidden = Boolean(w[hiddenKey]);
                      return (
                        <td key={k} className="border p-0.5">
                          <div className={`tip-cell ${hidden ? 'is-hidden' : ''}`}>
                            <select className="text-xs" value={w[k]} disabled={hidden}
                              onChange={(e) => patchWire(w.id, { [k]: e.target.value })}>
                              {TIP_LIBRARY.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <button
                              className="wire-visibility"
                              title={hidden ? `Показать жилу на стороне ${side}` : `Скрыть жилу на стороне ${side}`}
                              onClick={() => patchWire(w.id, { [hiddenKey]: !hidden })}
                            >
                              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="border p-0.5 whitespace-nowrap text-center">
                      {(['A', 'B'] as const).map((s) => {
                        const count = (s === 'A' ? w.jumpersA : w.jumpersB)?.length ?? 0;
                        const active = jumperFocus?.wireId === w.id && jumperFocus.side === s;
                        return (
                          <button
                            key={s}
                            className={`text-xs rounded px-1 ${active ? 'bg-blue-600 text-white' : count ? 'bg-amber-200' : 'bg-gray-100'}`}
                            title={`Перемычки, сторона ${s}${count ? ` (${count})` : ''}`}
                            onClick={() => setJumperFocus(active ? null : { wireId: w.id, side: s })}
                          >
                            {s}{count ? `:${count}` : ''}
                          </button>
                        );
                      })}
                    </td>
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

            {/* Редактор перемычек выбранной жилы */}
            {jumperFocus && focusedJumperWire && (
              <div className="border rounded p-2 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs">
                    Перемычки: жила «{jumperFocus.side === 'A' ? focusedJumperWire.marking : (cable.markingMode === 'dual' ? (focusedJumperWire.markingB ?? focusedJumperWire.marking) : focusedJumperWire.marking)}»,
                    сторона {jumperFocus.side}
                  </div>
                  <button className="text-gray-500 text-xs" onClick={() => setJumperFocus(null)}>✕</button>
                </div>
                {(() => {
                  const key = jumperFocus.side === 'A' ? 'jumpersA' : 'jumpersB';
                  const items = focusedJumperWire[key] ?? [];
                  const setItems = (l: Jumper[]) => patchWire(focusedJumperWire.id, { [key]: l } as any);
                  return (
                    <>
                      <JumperList items={items} depth={0} onChange={setItems} />
                      <button
                        className="text-xs bg-gray-200 rounded px-2 py-1"
                        onClick={() => setItems([...items, makeJumper()])}
                      >
                        + Добавить перемычку
                      </button>
                    </>
                  );
                })()}
                <p className="text-xs text-gray-500">
                  У перемычки своя маркировка и наконечник. Галочка «перемычка» превращает провод
                  в точку разветвления — из него можно вывести ещё перемычки (гирлянда).
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button className="section-disclosure" onClick={() => setColumnsOpen((v) => !v)}>
                {columnsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>Столбцы таблицы</span>
                <span className="text-xs font-normal text-slate-500">{cable.columns.filter((c) => !c.hidden).length}/{cable.columns.length}</span>
              </button>
              <button className="win-button compact" onClick={addColumn}><Plus size={14} /> Столбец</button>
            </div>
            {columnsOpen && (
              <div className="column-list">
                <p className="text-xs text-slate-500">Глаз скрывает столбец на печатном листе, не удаляя данные.</p>
                {cable.columns.map((col, i) => (
                  <div key={col.id} className={`column-editor ${col.hidden ? 'is-hidden' : ''}`}>
                    <button
                      className="wire-visibility"
                      title={col.hidden ? 'Показать столбец на печати' : 'Скрыть столбец на печати'}
                      onClick={() => patchCable({ columns: cable.columns.map((c) => c.id === col.id ? { ...c, hidden: !c.hidden } : c) })}
                    >
                      {col.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <input className={inp} value={col.title}
                      onChange={(e) =>
                        patchCable({ columns: cable.columns.map((c) => (c.id === col.id ? { ...c, title: e.target.value } : c)) })
                      } />
                    {cable.columns.length > 1 && (
                      <button className="text-red-600 text-xs shrink-0 px-1" title="Удалить столбец"
                        onClick={() => patchCable({ columns: cable.columns.filter((_, j) => j !== i) })}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h3 className="font-semibold text-sm pt-2">Примечания</h3>
            <NoteEditor
              value={cable.note}
              onChange={(v) => patchCable({ note: v })}
              kind="note"
            />

            {/* Особое примечание — только если у кабеля есть перемычки */}
            {cableHasJumpers(cable) && (
              <>
                <h3 className="font-semibold text-sm pt-2">Примечание для перемычки</h3>
                <NoteEditor
                  value={cable.jumperNote}
                  onChange={(v) => patchCable({ jumperNote: v })}
                  kind="jumper"
                  rows={2}
                />
              </>
            )}
          </section>
        )}

        <div className="print-actions">
          <button className="win-button primary" onClick={openSel}>
            <Printer size={16} /> Выбрать и печатать
          </button>
          <button className="win-button" onClick={() => window.print()}>
            <FileCheck2 size={16} /> Экспорт в PDF (А4)
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
      <div className={'preview-area flex-1 overflow-auto p-6 print-area' + (selOpen ? ' no-print' : '')}>
        <SheetA4 project={project} cables={project.cables} animated />
      </div>

      <ProjectTree
        project={project}
        activeCableId={activeId}
        activeSheetId={activeSheetId}
        onNavigate={navigateSheet}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveCable={moveCable}
        onAddCable={addCable}
        onDuplicateCable={duplicateCable}
        onContextAction={handleTreeAction}
      />

      {/* Окно «Выбрать и печатать»: предпросмотр листов с чекбоксами */}
      {selOpen && (
        <div className="sel-root">
          <div className="sel-bar no-print">
            <div>
              <div className="text-sm font-medium text-white">Листы для печати</div>
              <div className="text-xs text-slate-400">Выбрано: {selPages.size} из {totalSheets}</div>
            </div>
            <button className="sel-action" onClick={selectAllPages}>Выбрать все</button>
            <button className="sel-action" disabled={selPages.size === 0} onClick={() => setSelPages(new Set())}>Снять выбор</button>
            <div className="tb-spacer" />
            <button
              className="win-button primary"
              disabled={selPages.size === 0}
              onClick={() => window.print()}>
              <Printer size={15} /> Печатать ({selPages.size})
            </button>
            <button className="sel-action" onClick={() => setSelOpen(false)}>Закрыть</button>
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

      {templatesOpen && <TemplateManager onClose={() => setTemplatesOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

      {/* Центр обновлений смонтирован всегда: проверка нужна и при запуске. */}
      <UpdatePanel open={updatesOpen} onClose={() => setUpdatesOpen(false)} />
    </div>
  );
}
