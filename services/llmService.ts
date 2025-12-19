// services/llmService.ts
// 统一的 LLM 服务，支持多种模型提供商

import { AppConfig, LLMProvider, ProviderConfig } from './realFileService';

// 系统提示词
const SYSTEM_INSTRUCTION = `You are an expert technical writing assistant for a Hexo blog.
Your goal is to help the user write high-quality Markdown content.
You have context about technical topics, coding, and clear writing styles.
When providing code snippets, use standard Markdown code blocks.
Keep your answers concise and ready to be inserted into a blog post.`;

// 各提供商的默认配置
export const PROVIDER_DEFAULTS: Record<LLMProvider, { 
  name: string;
  defaultBaseUrl: string; 
  defaultModel: string;
  placeholder: string;
  description: string;
}> = {
  openai: {
    name: 'OpenAI (GPT)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    placeholder: 'sk-...',
    description: '支持 GPT-4o, GPT-4o-mini, GPT-4-turbo 等'
  },
  claude: {
    name: 'Claude (Anthropic)',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-sonnet-20241022',
    placeholder: 'sk-ant-...',
    description: '支持 Claude 3.5 Sonnet, Claude 3 Opus 等'
  },
  gemini: {
    name: 'Gemini (Google)',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash-exp',
    placeholder: 'AIza...',
    description: '支持 Gemini 2.0 Flash, Gemini 1.5 Pro 等'
  },
  qwen: {
    name: '通义千问 (Qwen)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    placeholder: 'sk-...',
    description: '支持 qwen-turbo, qwen-plus, qwen-max 等'
  },
  deepseek: {
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    placeholder: 'sk-...',
    description: '支持 deepseek-chat, deepseek-coder 等'
  }
};

// 聊天消息格式
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 聊天历史管理
class ChatSession {
  private messages: ChatMessage[] = [];
  private provider: LLMProvider;
  private config: ProviderConfig;

  constructor(provider: LLMProvider, config: ProviderConfig) {
    this.provider = provider;
    this.config = config;
    // 添加系统提示
    this.messages.push({ role: 'system', content: SYSTEM_INSTRUCTION });
  }

  async sendMessage(userMessage: string): Promise<string> {
    // 添加用户消息到历史
    this.messages.push({ role: 'user', content: userMessage });

    try {
      const response = await this.callAPI(this.messages);
      // 添加助手回复到历史
      this.messages.push({ role: 'assistant', content: response });
      return response;
    } catch (error: any) {
      const errorMsg = `Error: ${error?.message || 'Unknown error occurred'}`;
      console.error('LLM API Error:', error);
      return errorMsg;
    }
  }

  private async callAPI(messages: ChatMessage[]): Promise<string> {
    const apiKey = this.config.api_key;
    if (!apiKey) {
      throw new Error('API Key 未配置，请在设置中填写');
    }

    const baseUrl = this.config.base_url || PROVIDER_DEFAULTS[this.provider].defaultBaseUrl;
    const model = this.config.model || PROVIDER_DEFAULTS[this.provider].defaultModel;

    switch (this.provider) {
      case 'openai':
      case 'qwen':
      case 'deepseek':
        return this.callOpenAICompatible(baseUrl, apiKey, model, messages);
      case 'claude':
        // Claude 代理通常也使用 OpenAI 兼容格式
        if (!baseUrl.includes('anthropic.com')) {
          return this.callOpenAICompatible(baseUrl, apiKey, model, messages);
        }
        return this.callClaude(baseUrl, apiKey, model, messages);
      case 'gemini':
        // 如果使用代理（非官方地址），则使用 OpenAI 兼容格式
        if (!baseUrl.includes('googleapis.com')) {
          return this.callOpenAICompatible(baseUrl, apiKey, model, messages);
        }
        return this.callGemini(baseUrl, apiKey, model, messages);
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  // OpenAI 兼容格式 (OpenAI, Qwen, DeepSeek, 以及各种代理)
  private async callOpenAICompatible(
    baseUrl: string, 
    apiKey: string, 
    model: string, 
    messages: ChatMessage[]
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        temperature: 0.7,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${error}`);
    }

    const data = await response.json();
    
    // 处理可能包含思考过程的响应（如 thinking 模型）
    const choice = data.choices?.[0];
    if (!choice) return '';
    
    // 某些模型可能返回多个 content 块，包含思考和最终回复
    const message = choice.message;
    if (!message) return '';
    
    // 如果 content 是字符串，直接返回
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    // 如果 content 是数组（某些 API 返回格式），提取文本部分
    if (Array.isArray(message.content)) {
      const textParts = message.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('\n');
      return textParts || '';
    }
    
    return '';
  }

  // Claude API (Anthropic 格式)
  private async callClaude(
    baseUrl: string, 
    apiKey: string, 
    model: string, 
    messages: ChatMessage[]
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
    
    // Claude 使用 system 参数而不是 system role message
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemMessage,
        messages: chatMessages
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  // Gemini API (Google 格式)
  private async callGemini(
    baseUrl: string, 
    apiKey: string, 
    model: string, 
    messages: ChatMessage[]
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${apiKey}`;
    
    // 转换消息格式为 Gemini 格式
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // 清空聊天历史
  reset() {
    this.messages = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
  }
}

// 导出创建聊天会话的函数
export const createChatSession = (config: AppConfig): ChatSession | null => {
  const provider = config.llm_provider;
  const providerConfig = config.providers[provider];
  
  if (!providerConfig?.api_key) {
    console.warn(`${provider} API Key not configured`);
    return null;
  }
  
  return new ChatSession(provider, providerConfig);
};

// 发送消息到当前会话
export const sendMessage = async (
  session: ChatSession | null, 
  message: string
): Promise<string> => {
  if (!session) {
    return 'Error: 聊天会话未初始化，请先配置 API Key';
  }
  return session.sendMessage(message);
};

// 获取默认配置
export const getDefaultConfig = (): AppConfig => ({
  hexo_path: null,
  llm_provider: 'openai',
  providers: {
    openai: { api_key: null, base_url: PROVIDER_DEFAULTS.openai.defaultBaseUrl, model: PROVIDER_DEFAULTS.openai.defaultModel },
    claude: { api_key: null, base_url: PROVIDER_DEFAULTS.claude.defaultBaseUrl, model: PROVIDER_DEFAULTS.claude.defaultModel },
    gemini: { api_key: null, base_url: PROVIDER_DEFAULTS.gemini.defaultBaseUrl, model: PROVIDER_DEFAULTS.gemini.defaultModel },
    qwen: { api_key: null, base_url: PROVIDER_DEFAULTS.qwen.defaultBaseUrl, model: PROVIDER_DEFAULTS.qwen.defaultModel },
    deepseek: { api_key: null, base_url: PROVIDER_DEFAULTS.deepseek.defaultBaseUrl, model: PROVIDER_DEFAULTS.deepseek.defaultModel }
  }
});

export type { ChatSession };
