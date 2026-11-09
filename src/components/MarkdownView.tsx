import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element) || !node.hasAttribute('style')) return;
  const style = node.getAttribute('style')?.trim() ?? '';
  // В пользовательской разметке оставляем только цвет текста, не произвольный CSS.
  if (/^color:\s*(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(style)) return;
  node.removeAttribute('style');
});

export function markdownToHtml(value: string): string {
  const rendered = marked.parse(value, { gfm: true, breaks: true, async: false });
  return DOMPurify.sanitize(rendered, {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cable-asset):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
  });
}

export default function MarkdownView({ value, className = '' }: { value: string; className?: string }) {
  const html = useMemo(() => markdownToHtml(value), [value]);
  const openLink = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as Element).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('cable-asset://') && !/^https?:\/\//i.test(href)) return;
    event.preventDefault();
    void window.cableTemplateAssets?.open(href);
  };
  return <div className={`markdown-body ${className}`} onClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />;
}
