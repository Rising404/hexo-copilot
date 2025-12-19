import React, { useState } from 'react';
import { AppConfig, LLMProvider } from '../services/realFileService';
import { realFileService } from '../services/realFileService';
import { PROVIDER_DEFAULTS } from '../services/llmService';

type Props = {
  open: boolean;
  onClose: () => void;
  config: AppConfig | null;
  onSaved?: (resp: any, savedConfig: AppConfig) => void;
};

const PROVIDER_OPTIONS: LLMProvider[] = ['openai', 'claude', 'gemini', 'qwen', 'deepseek'];

export default function QuickSettings({ open, onClose, config, onSaved }: Props) {
  const [localConfig, setLocalConfig] = useState<AppConfig | null>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  React.useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  if (!open) return null;

  const currentProvider = localConfig?.llm_provider || 'openai';
  const currentProviderConfig = localConfig?.providers[currentProvider];
  const providerInfo = PROVIDER_DEFAULTS[currentProvider];

  const handleProviderChange = (provider: LLMProvider) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      llm_provider: provider
    });
  };

  const handleProviderConfigChange = (field: 'api_key' | 'base_url' | 'model', value: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      providers: {
        ...localConfig.providers,
        [currentProvider]: {
          ...localConfig.providers[currentProvider],
          [field]: value || null
        }
      }
    });
  };

  const handleSave = async () => {
    if (!localConfig) return;
    setIsSaving(true);
    try {
      const resp = await realFileService.saveConfig(localConfig);
      onSaved?.(resp, localConfig);
      onClose();
    } catch (e: any) {
      alert(`保存失败: ${e?.response?.data?.detail || e?.message || e}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetBaseUrl = () => {
    handleProviderConfigChange('base_url', providerInfo.defaultBaseUrl);
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-gray-900 text-gray-100 rounded-xl shadow-2xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold">⚙️ 设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 工作目录 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">📁 工作目录路径</label>
            <input
              value={localConfig?.hexo_path || ''}
              onChange={(e) => setLocalConfig(prev => prev ? { ...prev, hexo_path: e.target.value } : prev)}
              className="w-full p-2.5 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
              placeholder="例如: D:/Blog/my-hexo-site"
            />
            <p className="text-xs text-gray-500">设置后会递归扫描该目录下所有文件和文件夹</p>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-3">🤖 AI 模型配置</h4>
          </div>

          {/* 模型选择 */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">选择模型提供商</label>
            <div className="grid grid-cols-5 gap-2">
              {PROVIDER_OPTIONS.map(provider => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    currentProvider === provider
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {provider === 'openai' && 'GPT'}
                  {provider === 'claude' && 'Claude'}
                  {provider === 'gemini' && 'Gemini'}
                  {provider === 'qwen' && 'Qwen'}
                  {provider === 'deepseek' && 'DeepSeek'}
                </button>
              ))}
            </div>
          </div>

          {/* 当前提供商信息 */}
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-blue-400">{providerInfo.name}</span>
            </div>
            <p className="text-xs text-gray-500">{providerInfo.description}</p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={currentProviderConfig?.api_key || ''}
                onChange={(e) => handleProviderConfigChange('api_key', e.target.value)}
                className="w-full p-2.5 pr-10 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                placeholder={providerInfo.placeholder}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showApiKey ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* 模型名称 */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">模型名称</label>
            <input
              value={currentProviderConfig?.model || ''}
              onChange={(e) => handleProviderConfigChange('model', e.target.value)}
              className="w-full p-2.5 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
              placeholder={providerInfo.defaultModel}
            />
          </div>

          {/* API 基地址 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm text-gray-400">API 基地址 (可选，用于代理)</label>
              <button
                onClick={handleResetBaseUrl}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                重置为默认
              </button>
            </div>
            <input
              value={currentProviderConfig?.base_url || ''}
              onChange={(e) => handleProviderConfigChange('base_url', e.target.value)}
              className="w-full p-2.5 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
              placeholder={providerInfo.defaultBaseUrl}
            />
            <p className="text-xs text-gray-500">
              💡 国内用户可填写代理地址，例如: https://your-proxy.com/v1
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-700 bg-gray-800/30">
          <button 
            onClick={onClose} 
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            取消
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            {isSaving ? '保存中...' : '💾 保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
