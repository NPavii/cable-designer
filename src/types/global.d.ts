export {};

declare global {
  interface Window {
    /** API работы с файлами проекта, предоставляется Electron preload (electron/preload.cjs) */
    cableFiles?: {
      saveAs(defaultPath: string, content: string): Promise<{ canceled: boolean; path?: string }>;
      save(path: string, content: string): Promise<{ ok: boolean }>;
      open(): Promise<{ canceled: boolean; path?: string; content?: string }>;
    };
    /** Возвращает true, если в проекте есть несохранённые изменения (читает главный процесс при закрытии окна) */
    __cableIsDirty?: () => boolean;
  }
}
