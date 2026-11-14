export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface LLMRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text: string;
  usage: TokenUsage;
  costUsd: number;
}

export interface LLMClient {
  chat(request: LLMRequest): Promise<LLMResponse>;
  getDefaultModel(): string;
}
