export {};

declare global {
  interface Window {
    /** Независимое окно проекта и идентификатор его локального черновика. */
    cableWindow?: { id: string };
    /** API работы с файлами проекта, предоставляется Electron preload (electron/preload.cjs) */
    cableFiles?: {
      saveAs(defaultPath: string, content: string): Promise<{ canceled: boolean; path?: string }>;
      save(path: string, content: string): Promise<{ ok: boolean }>;
      open(): Promise<{ canceled: boolean; path?: string; content?: string }>;
      onMenuCommand(cb: (command: 'new' | 'open' | 'save' | 'saveAs' | 'undo' | 'redo') => void): () => void;
    };
    /** Перенос и управление библиотекой шаблонов примечаний. */
    cableTemplates?: {
      export(defaultPath: string, content: string): Promise<{ canceled: boolean; path?: string }>;
      import(): Promise<{ canceled: boolean; path?: string; content?: string }>;
      onMenu(cb: () => void): () => void;
    };
    /** Файлы шаблонов, изображения и отдельные окна Markdown-редактора. */
    cableTemplateAssets?: {
      choose(): Promise<{ canceled: boolean; files: Array<{ name: string; url: string; image: boolean; size: number }> }>;
      saveBuffer(name: string, data: ArrayBuffer): Promise<{ name: string; url: string; image: boolean; size: number }>;
      open(url: string): Promise<{ ok: boolean; error?: string }>;
      openEditor(kind: 'note' | 'jumper', index: number): Promise<{ ok: boolean }>;
    };
    /** Рабочая папка файловых диалогов проекта и шаблонов. */
    cableSettings?: {
      get(): Promise<{ updateDir: string; defaultDir: string }>;
      chooseDefaultDir(): Promise<{ canceled: boolean; path?: string }>;
      setDefaultDir(defaultDir: string): Promise<{ ok: boolean; error?: string }>;
      onMenu(cb: () => void): () => void;
    };
    /** API автообновления через серверную папку */
    cableUpdates?: {
      getSettings(): Promise<{ updateDir: string; defaultDir?: string }>;
      setSettings(s: { updateDir: string }): Promise<{ ok: boolean }>;
      check(): Promise<
        | { ok: true; hasUpdate: boolean; localVersion: string; remoteVersion: string; notes: string }
        | { ok: false; error: string }
      >;
      download(): Promise<{ ok: boolean; staging: string }>;
      apply(staging: string): Promise<{ ok: boolean; error?: string }>;
      /** Подписка на пункт меню Setting → «Обновления…»; возвращает функцию отписки */
      onMenuUpdates(cb: () => void): () => void;
    };
    /** Возвращает true, если в проекте есть несохранённые изменения (читает главный процесс при закрытии окна) */
    __cableIsDirty?: () => boolean;
  }
}
