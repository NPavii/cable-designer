import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { importTemplates, onTemplatesChanged, readTemplates, templatesToJson, writeTemplates } from '../lib/templates';
import type { TemplateKind } from '../lib/templates';
import MarkdownEditor from './MarkdownEditor';

export default function TemplateManager({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<TemplateKind>('note');
  const [items, setItems] = useState<string[]>(() => readTemplates('note'));
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState(() => readTemplates('note')[0] ?? '');
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  const saveDraft = useCallback(() => {
    if (!dirty) return;
    const current = readTemplates(kind);
    if (!current[selected]) return;
    const next = [...current];
    next[selected] = draft;
    writeTemplates(kind, next);
    setItems(readTemplates(kind));
    setDirty(false);
    setStatus('Шаблон сохранён');
  }, [dirty, draft, kind, selected]);

  const selectTemplate = useCallback((index: number) => {
    saveDraft();
    const next = readTemplates(kind);
    setItems(next);
    setSelected(index);
    setDraft(next[index] ?? '');
    setDirty(false);
  }, [kind, saveDraft]);

  const changeKind = (nextKind: TemplateKind) => {
    saveDraft();
    const next = readTemplates(nextKind);
    setKind(nextKind);
    setItems(next);
    setSelected(0);
    setDraft(next[0] ?? '');
    setDirty(false);
    setQuery('');
    setStatus('');
  };

  const close = useCallback(() => {
    saveDraft();
    onClose();
  }, [onClose, saveDraft]);

  useEffect(() => onTemplatesChanged(() => {
    const next = readTemplates(kind);
    setItems(next);
    if (!dirty) setDraft(next[selected] ?? '');
  }), [dirty, kind, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDraft();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, saveDraft]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !q || item.toLocaleLowerCase('ru-RU').includes(q));
  }, [items, query]);

  const exportAll = async () => {
    if (!window.cableTemplates) return;
    saveDraft();
    try {
      const result = await window.cableTemplates.export('cable-templates.json', templatesToJson());
      if (!result.canceled) setStatus('Библиотека и вложения экспортированы');
    } catch {
      setStatus('Не удалось экспортировать шаблоны');
    }
  };

  const importAll = async () => {
    if (!window.cableTemplates) return;
    saveDraft();
    try {
      const result = await window.cableTemplates.import();
      if (result.canceled || !result.content) return;
      const added = importTemplates(result.content);
      const next = readTemplates(kind);
      setItems(next);
      setDraft(next[selected] ?? '');
      setDirty(false);
      setStatus(`Импортировано: примечания — ${added.note}, перемычки — ${added.jumper}`);
    } catch {
      setStatus('Файл не содержит корректную библиотеку шаблонов');
    }
  };

  const addTemplate = () => {
    saveDraft();
    const next = [...readTemplates(kind), '## Новый шаблон\n\nВведите текст примечания…'];
    writeTemplates(kind, next);
    setItems(next);
    setSelected(next.length - 1);
    setDraft(next[next.length - 1]);
    setDirty(false);
    setStatus('Создан новый шаблон');
  };

  const removeTemplate = (index: number) => {
    saveDraft();
    const next = readTemplates(kind).filter((_, itemIndex) => itemIndex !== index);
    writeTemplates(kind, next);
    const nextSelected = Math.max(0, Math.min(selected >= index ? selected - 1 : selected, next.length - 1));
    setItems(next);
    setSelected(nextSelected);
    setDraft(next[nextSelected] ?? '');
    setDirty(false);
    setStatus('Шаблон удалён');
  };

  const openEditor = async () => {
    saveDraft();
    if (!items[selected]) return;
    await window.cableTemplateAssets?.openEditor(kind, selected);
  };

  return (
    <div className="template-modal no-print" onClick={close}>
      <div className="template-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="template-dialog-header">
          <div>
            <h2>Библиотека шаблонов</h2>
            <p>Markdown, документы и изображения — общие для всех проектов на этом компьютере</p>
          </div>
          <button className="icon-button" onClick={close} title="Закрыть"><X size={18} /></button>
        </div>
        <div className="template-toolbar">
          <div className="template-tabs">
            <button className={kind === 'note' ? 'active' : ''} onClick={() => changeKind('note')}>Примечания</button>
            <button className={kind === 'jumper' ? 'active' : ''} onClick={() => changeKind('jumper')}>Перемычки</button>
          </div>
          <button className="win-button" onClick={addTemplate}><Plus size={15} /> Шаблон</button>
          <button className="win-button" onClick={importAll} disabled={!window.cableTemplates}><Upload size={15} /> Импорт</button>
          <button className="win-button primary" onClick={exportAll} disabled={!window.cableTemplates}><Download size={15} /> Экспорт</button>
        </div>
        <div className="template-workspace">
          <aside className="template-sidebar">
            <div className="template-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по шаблонам…" />
            </div>
            <div className="template-count">{filtered.length} из {items.length}</div>
            <div className="template-list">
              {filtered.map(({ item, index }) => (
                <article className={`template-item ${selected === index ? 'active' : ''}`} key={`${index}-${item.slice(0, 24)}`}>
                  <FileText size={16} />
                  <button className="template-item-select" onClick={() => selectTemplate(index)}>{item}</button>
                  <button title="Удалить шаблон" onClick={() => removeTemplate(index)}><Trash2 size={15} /></button>
                </article>
              ))}
              {filtered.length === 0 && (
                <div className="template-empty">
                  <FileText size={28} />
                  <b>{items.length ? 'Ничего не найдено' : 'Шаблонов пока нет'}</b>
                  <span>{items.length ? 'Измените поисковый запрос' : 'Создайте шаблон или импортируйте библиотеку'}</span>
                </div>
              )}
            </div>
          </aside>
          <section className="template-quick-editor">
            {items[selected] ? (
              <>
                <div className="template-editor-heading">
                  <div>
                    <b>Быстрое редактирование</b>
                    <span>{dirty ? 'Есть несохранённые изменения' : 'Шаблон сохранён'}</span>
                  </div>
                  <button className="win-button compact" onClick={saveDraft} disabled={!dirty}><Save size={14} /> Сохранить</button>
                  <button className="win-button compact" onClick={openEditor}><ExternalLink size={14} /> В новом окне</button>
                </div>
                <MarkdownEditor
                  value={draft}
                  compact
                  onChange={(value) => { setDraft(value); setDirty(true); setStatus(''); }}
                  onSave={saveDraft}
                />
              </>
            ) : (
              <div className="template-editor-placeholder"><FileText size={34} /><span>Выберите или создайте шаблон для редактирования</span></div>
            )}
          </section>
        </div>
        <div className="template-footer">
          <span>{status || 'Экспорт включает вложения. Импорт объединяет библиотеки и не удаляет существующие шаблоны.'}</span>
          <button className="win-button" onClick={close}>Готово</button>
        </div>
      </div>
    </div>
  );
}
