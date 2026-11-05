import { useEffect, useState } from 'react';
import { FolderOpen, RotateCcw, X } from 'lucide-react';

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [defaultDir, setDefaultDir] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.cableSettings?.get().then((settings) => setDefaultDir(settings.defaultDir));
  }, []);

  const choose = async () => {
    const result = await window.cableSettings?.chooseDefaultDir();
    if (result && !result.canceled && result.path) {
      setDefaultDir(result.path);
      setStatus('Нажмите «Сохранить», чтобы применить папку');
    }
  };

  const save = async () => {
    if (!window.cableSettings) return;
    setSaving(true);
    const result = await window.cableSettings.setDefaultDir(defaultDir);
    setSaving(false);
    if (result.ok) {
      setStatus(defaultDir ? 'Рабочая папка сохранена' : 'Используется системная папка по умолчанию');
      setTimeout(onClose, 350);
    } else setStatus(result.error || 'Не удалось сохранить папку');
  };

  return (
    <div className="template-modal no-print" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="template-dialog-header">
          <div>
            <h2>Рабочая папка</h2>
            <p>Начальный каталог для проектов и библиотек шаблонов</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="settings-content">
          <label>Папка по умолчанию</label>
          <div className="settings-path">
            <input
              value={defaultDir}
              onChange={(e) => setDefaultDir(e.target.value)}
              placeholder="Системная папка (например, «Загрузки»)"
            />
            <button className="win-button" onClick={choose}><FolderOpen size={16} /> Обзор…</button>
          </div>
          <p>Используется в командах «Открыть», «Сохранить как», а также при импорте и экспорте шаблонов.</p>
          <button className="settings-reset" onClick={() => setDefaultDir('')}><RotateCcw size={14} /> Сбросить на системную папку</button>
          {status && <div className="settings-status">{status}</div>}
        </div>
        <div className="template-footer">
          <span>Настройка общая для всех окон проекта</span>
          <div className="flex gap-2">
            <button className="win-button" onClick={onClose}>Отмена</button>
            <button className="win-button primary" onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
