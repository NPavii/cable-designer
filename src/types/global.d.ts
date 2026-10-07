export {};

declare global {
  interface Window {
    /** API работы с файлами проекта, предоставляется Electron preload (electron/preload.cjs) */
    cableFiles?: {
      saveAs(defaultPath: string, content: string): Promise<{ canceled: boolean; path?: string }>;
      save(path: string, content: string): Promise<{ ok: boolean }>;
      open(): Promise<{ canceled: boolean; path?: string; content?: string }>;
    };
    /** API автообновления через серверную папку */
    cableUpdates?: {
      getSettings(): Promise<{ updateDir: string }>;
      setSettings(s: { updateDir: string }): Promise<{ ok: boolean }>;
      check(): Promise<
        | { ok: true; hasUpdate: boolean; localVersion: string; remoteVersion: string; notes: string }
        | { ok: false; error: string }
      >;
      download(): Promise<{ ok: boolean; staging: string }>;
      apply(staging: string): Promise<{ ok: boolean }>;
    };
    /** Возвращает true, если в проекте есть несохранённые изменения (читает главный процесс при закрытии окна) */
    __cableIsDirty?: () => boolean;
  }
}
