export type TemplateKind = 'note' | 'jumper';

export const TEMPLATE_KEYS: Record<TemplateKind, string> = {
  note: 'cable-designer-note-templates-v1',
  jumper: 'cable-designer-jumper-note-templates-v1',
};

const CHANGED_EVENT = 'cable-templates-changed';

export function readTemplates(kind: TemplateKind): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(TEMPLATE_KEYS[kind]) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function writeTemplates(kind: TemplateKind, templates: string[]) {
  const unique = [...new Set(templates.map((item) => item.trim()).filter(Boolean))];
  localStorage.setItem(TEMPLATE_KEYS[kind], JSON.stringify(unique));
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { kind } }));
}

export function onTemplatesChanged(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key && Object.values(TEMPLATE_KEYS).includes(event.key)) listener();
  };
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function templatesToJson(): string {
  return JSON.stringify({
    app: 'cable-designer-templates',
    version: 2,
    templates: {
      note: readTemplates('note'),
      jumper: readTemplates('jumper'),
    },
  }, null, 2);
}

/** Импорт объединяет библиотеки и удаляет дубли, не затирая шаблоны пользователя. */
export function importTemplates(content: string): { note: number; jumper: number } {
  const parsed = JSON.parse(content);
  if (parsed?.app !== 'cable-designer-templates' || ![1, 2].includes(parsed?.version) || !parsed.templates) {
    throw new Error('invalid templates file');
  }
  const added = { note: 0, jumper: 0 };
  (['note', 'jumper'] as TemplateKind[]).forEach((kind) => {
    const incoming = parsed.templates[kind];
    if (!Array.isArray(incoming) || incoming.some((item: unknown) => typeof item !== 'string')) {
      throw new Error('invalid templates list');
    }
    const current = readTemplates(kind);
    const incomingClean = [...new Set(incoming.map((item: string) => item.trim()).filter(Boolean))];
    writeTemplates(kind, [...current, ...incomingClean]);
    added[kind] = incomingClean.filter((item: string) => !current.includes(item)).length;
  });
  return added;
}
