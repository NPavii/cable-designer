import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Search, Trash2, Upload, X } from 'lucide-react';
import { importTemplates, onTemplatesChanged, readTemplates, templatesToJson, writeTemplates } from '../lib/templates';
import type { TemplateKind } from '../lib/templates';

export default function TemplateManager({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<TemplateKind>('note');
  const [items, setItems] = useState<string[]>(() => readTemplates('note'));
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => onTemplatesChanged(() => setItems(readTemplates(kind))), [kind]);
  useEffect(() => {
    setItems(readTemplates(kind));
    setQuery('');
  }, [kind]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return q ? items.filter((item) => item.toLocaleLowerCase('ru-RU').includes(q)) : items;
  }, [items, query]);

  const exportAll = async () => {
    if (!window.cableTemplates) return;
    try {
      const result = await window.cableTemplates.export('cable-templates.json', templatesToJson());
      if (!result.canceled) setStatus('Библиотека экспортирована');
    } catch {
      setStatus('Не удалось экспортировать шаблоны');
    }
  };

  const importAll = async () => {
    if (!window.cableTemplates) return;
    try {
      const result = await window.cableTemplates.import();
      if (result.canceled || !result.content) return;
      const added = importTemplates(result.content);
      setItems(readTemplates(kind));
      setStatus(`Импортировано: примечания — ${added.note}, перемычки — ${added.jumper}`);
    } catch {
      setStatus('Файл не содержит корректную библиотеку шаблонов');
    }
  };

  return (
    <div className="template-modal no-print" onClick={onClose}>
      <div className="template-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="template-dialog-header">
          <div>
            <h2>Библиотека шаблонов</h2>
            <p>Общие примечания для всех проектов на этом компьютере</p>
          </div>
          <button className="icon-button" onClick={onClose} title="Закрыть"><X size={18} /></button>
        </div>
        <div className="template-toolbar">
          <div className="template-tabs">
            <button className={kind === 'note' ? 'active' : ''} onClick={() => setKind('note')}>Примечания</button>
            <button className={kind === 'jumper' ? 'active' : ''} onClick={() => setKind('jumper')}>Перемычки</button>
          </div>
          <button className="win-button" onClick={importAll} disabled={!window.cableTemplates}><Upload size={15} /> Импорт</button>
          <button className="win-button primary" onClick={exportAll} disabled={!window.cableTemplates}><Download size={15} /> Экспорт</button>
        </div>
        <div className="template-search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по шаблонам…" />
        </div>
        <div className="template-count">{filtered.length} из {items.length}</div>
        <div className="template-list">
          {filtered.map((item) => (
            <article className="template-item" key={item}>
              <FileText size={16} />
              <div>{item}</div>
              <button
                title="Удалить шаблон"
                onClick={() => writeTemplates(kind, items.filter((value) => value !== item))}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="template-empty">
              <FileText size={28} />
              <b>{items.length ? 'Ничего не найдено' : 'Шаблонов пока нет'}</b>
              <span>{items.length ? 'Измените поисковый запрос' : 'Сохраните примечание как шаблон или импортируйте библиотеку'}</span>
            </div>
          )}
        </div>
        <div className="template-footer">
          <span>{status || 'Импорт объединяет библиотеки и не удаляет существующие шаблоны.'}</span>
          <button className="win-button" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
