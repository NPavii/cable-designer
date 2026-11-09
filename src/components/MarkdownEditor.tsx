import { useRef, useState } from 'react';
import { Bold, Code2, Eye, Heading2, Image, Italic, Link, List, ListOrdered, Paperclip, Table2, Underline } from 'lucide-react';
import MarkdownView from './MarkdownView';

type Asset = { name: string; url: string; image: boolean; size: number };

export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  compact = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(!compact);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);

  const insert = (before: string, after = before, placeholder = 'текст') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const insertBlock = (text: string) => {
    const textarea = textareaRef.current;
    const position = textarea?.selectionStart ?? value.length;
    const left = value.slice(0, position);
    const right = value.slice(position);
    const prefix = left && !left.endsWith('\n') ? '\n' : '';
    const suffix = right && !right.startsWith('\n') ? '\n' : '';
    onChange(`${left}${prefix}${text}${suffix}${right}`);
    requestAnimationFrame(() => textarea?.focus());
  };

  const insertAssets = (files: Asset[]) => {
    if (!files.length) return;
    const markdown = files.map((file) => `${file.image ? '!' : ''}[${file.name.replace(/[\[\]]/g, '')}](${file.url})`).join('\n\n');
    insertBlock(markdown);
    setStatus(`Добавлено файлов: ${files.length}`);
  };

  const chooseFiles = async () => {
    if (!window.cableTemplateAssets) return;
    try {
      const result = await window.cableTemplateAssets.choose();
      if (!result.canceled) insertAssets(result.files);
    } catch {
      setStatus('Не удалось добавить файл');
    }
  };

  const saveFiles = async (files: File[]) => {
    if (!window.cableTemplateAssets || !files.length) return;
    setStatus('Добавление файлов…');
    try {
      const assets: Asset[] = [];
      for (const file of files) assets.push(await window.cableTemplateAssets.saveBuffer(file.name || `screenshot-${Date.now()}.png`, await file.arrayBuffer()));
      insertAssets(assets);
    } catch {
      setStatus('Не удалось сохранить вложение');
    }
  };

  const indent = (outdent = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const blockStart = value.lastIndexOf('\n', start - 1) + 1;
    const block = value.slice(blockStart, end);
    const changed = block.split('\n').map((line) => outdent ? line.replace(/^(?: {1,2}|\t)/, '') : `  ${line}`).join('\n');
    onChange(`${value.slice(0, blockStart)}${changed}${value.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(blockStart, blockStart + changed.length);
    });
  };

  const tools = [
    { title: 'Заголовок', icon: Heading2, action: () => insertBlock('## Заголовок\n') },
    { title: 'Жирный — Ctrl+B', icon: Bold, action: () => insert('**') },
    { title: 'Курсив — Ctrl+I', icon: Italic, action: () => insert('*') },
    { title: 'Подчёркивание', icon: Underline, action: () => insert('<u>', '</u>') },
    { title: 'Маркированный список', icon: List, action: () => insertBlock('- Пункт\n- Пункт\n') },
    { title: 'Нумерованный список', icon: ListOrdered, action: () => insertBlock('1. Пункт\n2. Пункт\n') },
    { title: 'Таблица Markdown', icon: Table2, action: () => insertBlock('| Колонка | Колонка |\n| --- | --- |\n| Значение | Значение |\n') },
    { title: 'Ссылка', icon: Link, action: () => insert('[', '](https://example.com)', 'текст ссылки') },
    { title: 'Код', icon: Code2, action: () => insert('`') },
  ];

  return (
    <div className={`md-editor ${compact ? 'compact' : ''}`}>
      <div className="md-toolbar" role="toolbar" aria-label="Форматирование Markdown">
        {tools.map(({ title, icon: Icon, action }) => (
          <button type="button" key={title} title={title} onClick={action}><Icon size={15} /></button>
        ))}
        <label className="md-color" title="Цвет выделенного текста">
          <span>A</span>
          <input type="color" defaultValue="#0067c0" onChange={(event) => insert(`<span style="color:${event.target.value}">`, '</span>')} />
        </label>
        <span className="md-toolbar-separator" />
        <button type="button" title="Добавить документ или изображение" onClick={chooseFiles}><Paperclip size={15} /><span>Файл</span></button>
        <button type="button" title="Добавить изображение или скриншот" onClick={chooseFiles}><Image size={15} /></button>
        <span className="md-toolbar-spacer" />
        {compact && <button type="button" className={preview ? 'active' : ''} onClick={() => setPreview((value) => !value)}><Eye size={15} /><span>{preview ? 'Текст' : 'Просмотр'}</span></button>}
      </div>
      <div className={`md-editor-content ${preview && !compact ? 'with-preview' : ''}`}>
        {(!preview || !compact) && (
          <textarea
            ref={textareaRef}
            autoFocus={autoFocus}
            value={value}
            aria-label="Markdown-текст шаблона"
            placeholder="Введите Markdown-текст. Перетащите сюда документ или вставьте скриншот через Ctrl+V…"
            onChange={(event) => onChange(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.length) {
                event.preventDefault();
                void saveFiles(files);
              }
            }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void saveFiles(Array.from(event.dataTransfer.files));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Tab') {
                event.preventDefault();
                indent(event.shiftKey);
              } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
                event.preventDefault(); insert('**');
              } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
                event.preventDefault(); insert('*');
              } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && onSave) {
                event.preventDefault(); onSave();
              }
            }}
          />
        )}
        {preview && <MarkdownView value={value || '*Предпросмотр пустого шаблона*'} />}
        {dragging && <div className="md-drop-hint">Отпустите файлы, чтобы добавить их в шаблон</div>}
      </div>
      <div className="md-editor-status">
        <span>{status || 'Markdown · Tab — отступ · Ctrl+V — вставка скриншота · файлы можно перемещать как ссылки в тексте'}</span>
        <span>{value.length} символов</span>
      </div>
    </div>
  );
}
