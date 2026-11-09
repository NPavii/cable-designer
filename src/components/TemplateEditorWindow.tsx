import { useCallback, useEffect, useState } from 'react';
import { Check, FileText, Save, X } from 'lucide-react';
import { onTemplatesChanged, readTemplates, writeTemplates } from '../lib/templates';
import type { TemplateKind } from '../lib/templates';
import MarkdownEditor from './MarkdownEditor';

export default function TemplateEditorWindow() {
  const params = new URLSearchParams(window.location.search);
  const kind: TemplateKind = params.get('kind') === 'jumper' ? 'jumper' : 'note';
  const index = Math.max(0, Number.parseInt(params.get('index') ?? '0', 10) || 0);
  const [value, setValue] = useState(() => readTemplates(kind)[index] ?? '');
  const [exists, setExists] = useState(() => Boolean(readTemplates(kind)[index]));
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState('');

  const save = useCallback(() => {
    const items = readTemplates(kind);
    if (!items[index]) {
      setExists(false);
      return;
    }
    const next = [...items];
    next[index] = value;
    writeTemplates(kind, next);
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  }, [index, kind, value]);

  useEffect(() => {
    window.__cableIsDirty = () => dirty;
    return () => { delete window.__cableIsDirty; };
  }, [dirty]);

  useEffect(() => onTemplatesChanged(() => {
    const next = readTemplates(kind)[index];
    setExists(Boolean(next));
    if (!dirty && next !== undefined) setValue(next);
  }), [dirty, index, kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  useEffect(() => window.cableFiles?.onMenuCommand((command) => {
    if (command === 'save' || command === 'saveAs') save();
  }), [save]);

  return (
    <main className="template-editor-window">
      <header className="template-window-header">
        <div className="template-window-title">
          <FileText size={21} />
          <div>
            <h1>Редактор шаблона</h1>
            <p>{kind === 'note' ? 'Примечание' : 'Примечание для перемычки'} · шаблон {index + 1}</p>
          </div>
        </div>
        <div className="template-window-actions">
          <span className={dirty ? 'is-dirty' : ''}>{dirty ? 'Не сохранено' : savedAt ? <><Check size={14} /> Сохранено в {savedAt}</> : 'Все изменения сохранены'}</span>
          <button className="win-button primary" onClick={save} disabled={!dirty || !exists}><Save size={16} /> Сохранить <kbd>Ctrl+S</kbd></button>
          <button className="icon-button" title="Закрыть окно" onClick={() => window.close()}><X size={18} /></button>
        </div>
      </header>
      {exists ? (
        <MarkdownEditor value={value} autoFocus onChange={(next) => { setValue(next); setDirty(true); }} onSave={save} />
      ) : (
        <div className="template-editor-missing">Этот шаблон был удалён в библиотеке. Окно можно закрыть.</div>
      )}
    </main>
  );
}
