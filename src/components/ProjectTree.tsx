import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, FileText, Folder, FolderOpen, FolderPlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Cable, Project } from '../types/cable';

export type TreeEntity = 'cable' | 'folder';
export type TreeAction = 'duplicate' | 'copy' | 'cut' | 'paste' | 'delete';

interface ProjectTreeProps {
  project: Project;
  activeCableId: string;
  activeSheetId: string;
  onNavigate: (sheetId: string, cableId?: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveCable: (cableId: string, folderId: string | null) => void;
  onAddCable: () => void;
  onDuplicateCable: () => void;
  onContextAction: (action: TreeAction, entity: TreeEntity, id: string, targetFolderId: string | null) => void;
}

type ContextState = { x: number; y: number; entity: TreeEntity; id: string; targetFolderId: string | null } | null;

export default function ProjectTree({
  project,
  activeCableId,
  activeSheetId,
  onNavigate,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveCable,
  onAddCable,
  onDuplicateCable,
  onContextAction,
}: ProjectTreeProps) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [context, setContext] = useState<ContextState>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const active = project.cables.find((c) => c.id === activeCableId);
    if (active?.folderId) setExpandedFolders((old) => new Set([...old, active.folderId!]));
  }, [activeCableId, project.cables]);

  useEffect(() => {
    if (creating) {
      const frame = requestAnimationFrame(() => createInputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [creating]);

  useEffect(() => {
    if (!context) return;
    const close = () => setContext(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [context]);

  const visibleCables = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    if (!q) return project.cables;
    return project.cables.filter((c) => `${c.designation} ${c.name}`.toLocaleLowerCase('ru-RU').includes(q));
  }, [project.cables, query]);

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };

  const startCreate = () => {
    setRenaming(null);
    setNewName('');
    setCreating(true);
  };

  const createFolder = () => {
    const name = newName.trim();
    if (name) onCreateFolder(name);
    setNewName('');
    setCreating(false);
  };

  const openContext = (e: React.MouseEvent, entity: TreeEntity, id: string, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContext({
      x: Math.min(e.clientX, window.innerWidth - 215),
      y: Math.min(e.clientY, window.innerHeight - 245),
      entity,
      id,
      targetFolderId,
    });
  };

  const renderCable = (cable: Cable) => {
    const sheetId = `sheet-cable-${cable.id}-page-1`;
    return (
      <div className="tree-cable" key={cable.id}>
        <div
          className={`tree-row tree-cable-row ${activeCableId === cable.id ? 'active' : ''}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-cable-id', cable.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onContextMenu={(e) => openContext(e, 'cable', cable.id, cable.folderId ?? null)}
        >
          <button className="tree-label tree-cable-label" onClick={() => onNavigate(sheetId, cable.id)}>
            <FileText size={15} />
            <span className="truncate">{cable.designation}</span>
          </button>
        </div>
      </div>
    );
  };

  const rootCables = visibleCables.filter((c) => !c.folderId);
  const summaryCount = Math.max(1, Math.ceil(project.cables.length / 25));

  return (
    <aside className="project-tree no-print">
      <div className="tree-header">
        <div>
          <h2>Страницы</h2>
          <span>{project.cables.length} каб. · {project.folders.length} папок</span>
        </div>
        <div className="tree-header-actions">
          <button className="icon-button" title="Добавить кабель" onClick={onAddCable}><Plus size={17} /></button>
          <button className="icon-button" title="Дублировать выбранный кабель" onClick={onDuplicateCable}><Copy size={15} /></button>
          <button className="icon-button" title="Создать папку" onClick={startCreate}><FolderPlus size={17} /></button>
        </div>
      </div>
      <div className="tree-search">
        <Search size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти кабель…" />
        {query && <button onClick={() => setQuery('')} title="Очистить">×</button>}
      </div>
      {creating && (
        <div className="tree-folder-editor">
          <input
            key="new-folder-name"
            ref={createInputRef}
            value={newName}
            placeholder="Название папки"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreating(false); }}
          />
          <button onClick={createFolder}>✓</button>
        </div>
      )}
      <div className="tree-scroll">
        {project.folders.map((folder) => {
          const cables = visibleCables.filter((c) => c.folderId === folder.id);
          if (query && cables.length === 0 && !folder.name.toLocaleLowerCase('ru-RU').includes(query.toLocaleLowerCase('ru-RU'))) return null;
          const expanded = expandedFolders.has(folder.id) || Boolean(query);
          return (
            <section
              className="tree-folder"
              key={folder.id}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => {
                e.preventDefault();
                const cableId = e.dataTransfer.getData('application/x-cable-id');
                if (cableId) onMoveCable(cableId, folder.id);
              }}
              onContextMenu={(e) => openContext(e, 'folder', folder.id, folder.id)}
            >
              <div className="tree-row tree-folder-row">
                <button className="tree-disclosure" onClick={() => toggleFolder(folder.id)}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {renaming === folder.id ? (
                  <input
                    className="tree-rename"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) onRenameFolder(folder.id, renameValue.trim());
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <button className="tree-label" onClick={() => toggleFolder(folder.id)}>
                    {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                    <span className="truncate">{folder.name}</span>
                    <span className="tree-badge">{cables.length}</span>
                  </button>
                )}
                <button className="tree-tool" title="Переименовать папку" onClick={() => { setRenaming(folder.id); setRenameValue(folder.name); }}>
                  <Pencil size={13} />
                </button>
                <button
                  className="tree-tool danger"
                  title="Удалить папку (кабели останутся)"
                  onClick={() => {
                    if (window.confirm(`Удалить папку «${folder.name}»? Кабели будут перенесены в корень.`)) {
                      setCreating(false);
                      setNewName('');
                      setRenaming(null);
                      onDeleteFolder(folder.id);
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {expanded && <div className="tree-folder-content">{cables.map(renderCable)}</div>}
            </section>
          );
        })}

        <div
          className="tree-root"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const cableId = e.dataTransfer.getData('application/x-cable-id');
            if (cableId) onMoveCable(cableId, null);
          }}
        >
          {(project.folders.length > 0 || rootCables.length > 0) && <div className="tree-root-title">Без папки</div>}
          {rootCables.map(renderCable)}
        </div>

        {visibleCables.length === 0 && <div className="tree-empty">Ничего не найдено</div>}

        <div className="tree-summary">
          <div className="tree-root-title">Документ</div>
          {Array.from({ length: summaryCount }, (_, i) => {
            const id = `sheet-summary-${i}`;
            return (
              <button key={id} className={`tree-page ${activeSheetId === id ? 'active' : ''}`} onClick={() => onNavigate(id)}>
                <FileText size={13} />
                <span>Перечень кабелей{summaryCount > 1 ? ` · ${i + 1}` : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tree-help">Перетащите кабель в папку<br />ПКМ — действия · ← / → — страницы</div>

      {context && (
        <div className="tree-context-menu" style={{ left: context.x, top: context.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { onContextAction('duplicate', context.entity, context.id, context.targetFolderId); setContext(null); }}>Дублировать выбранные</button>
          <button onClick={() => { onContextAction('copy', context.entity, context.id, context.targetFolderId); setContext(null); }}>Скопировать</button>
          <button onClick={() => { onContextAction('cut', context.entity, context.id, context.targetFolderId); setContext(null); }}>Вырезать</button>
          <button onClick={() => { onContextAction('paste', context.entity, context.id, context.targetFolderId); setContext(null); }}>Вставить</button>
          <div className="tree-context-separator" />
          <button className="danger" onClick={() => { onContextAction('delete', context.entity, context.id, context.targetFolderId); setContext(null); }}>Удалить</button>
        </div>
      )}
    </aside>
  );
}
