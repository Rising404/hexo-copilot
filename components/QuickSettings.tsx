import React, { useState } from 'react';
import { AppConfig } from '../services/realFileService';
import { realFileService } from '../services/realFileService';

type Props = {
  open: boolean;
  onClose: () => void;
  config: AppConfig | null;
  onSaved?: (resp: any) => void;
};

export default function QuickSettings({ open, onClose, config, onSaved }: Props) {
  const [localConfig, setLocalConfig] = useState<AppConfig | null>(config);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  if (!open) return null;

  const handleSave = async () => {
    if (!localConfig) return;
    setIsSaving(true);
    try {
      const resp = await realFileService.saveConfig(localConfig);
      onSaved?.(resp);
      onClose();
    } catch (e: any) {
      alert(`Failed to save config: ${e?.response?.data?.detail || e?.message || e}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-gray-900 text-gray-100 rounded shadow-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Quick Settings</h3>
          <button onClick={onClose} className="text-sm text-gray-300">Close</button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-300">工作目录路径</label>
            <input
              value={localConfig?.hexo_path || ''}
              onChange={(e) => setLocalConfig(prev => ({ ...(prev || { hexo_path: '' , llm_provider: 'gemini', providers: { gemini: { api_key: null }, openai: { api_key: null } } }), hexo_path: e.target.value }))}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
              placeholder="例如: D:/Blog/my-hexo-site"
            />
            <p className="text-xs text-gray-500 mt-1">设置后会递归扫描该目录下所有文件和文件夹</p>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={handleSave} disabled={isSaving} className="px-3 py-1 bg-blue-600 rounded text-sm">{isSaving ? '保存中...' : '保存'}</button>
            <button onClick={onClose} className="px-3 py-1 bg-gray-800 rounded text-sm">取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}
