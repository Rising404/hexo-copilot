import { GoogleGenAI, Chat } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are an expert technical writing assistant for a Hexo blog.
Your goal is to help the user write high-quality Markdown content.
You have context about technical topics, coding, and clear writing styles.
When providing code snippets, use standard Markdown code blocks.
Keep your answers concise and ready to be inserted into a blog post.`;

export const createChatSession = (apiKey: string): Chat => {
  if (!apiKey) {
    throw new Error("API Key is required");
  }
  const ai = new GoogleGenAI({ apiKey });
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
    },
  });
};

export const sendMessageToGemini = async (
  chat: Chat, 
  message: string
): Promise<string> => {
  try {
    const response = await chat.sendMessage({ message });
    return response.text || "";
  } catch (error) {
    console.error("Error communicating with Gemini:", error);
    return "Error: Could not fetch response from AI. Please check your API Key.";
  }
};