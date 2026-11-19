export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: MessageRole;
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMRequest {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMRequestPacer {
  waitForSlot(): Promise<void>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  costUsd: number;
  attempts?: number;
  activeTimeMs?: number;
  waitTimeMs?: number;
  rateLimitCount?: number;
  toolCallFailureCount?: number;
  failedAttempts?: LLMAttemptFailure[];
}

export type LLMAttemptReason =
  | 'rate_limited'
  | 'tool_call_failed'
  | 'transient_server'
  | 'other_error';

export interface LLMAttemptFailure {
  attempt: number;
  reason: LLMAttemptReason;
  status: number;
  message: string;
  errorBody?: string;
  waitMs: number;
  activeTimeMs: number;
}

export class LLMRequestError extends Error {
  readonly attempts: number;
  readonly activeTimeMs: number;
  readonly waitTimeMs: number;
  readonly rateLimitCount: number;
  readonly toolCallFailureCount: number;
  readonly failedAttempts: LLMAttemptFailure[];
  readonly lastErrorClass: LLMAttemptReason;
  readonly failureReason: string;
  readonly errorBody: string;

  constructor(message: string, details: {
    attempts: number;
    activeTimeMs: number;
    waitTimeMs: number;
    rateLimitCount: number;
    toolCallFailureCount: number;
    failedAttempts: LLMAttemptFailure[];
    lastErrorClass: LLMAttemptReason;
    failureReason: string;
    errorBody: string;
  }) {
    super(message);
    this.name = 'LLMRequestError';
    this.attempts = details.attempts;
    this.activeTimeMs = details.activeTimeMs;
    this.waitTimeMs = details.waitTimeMs;
    this.rateLimitCount = details.rateLimitCount;
    this.toolCallFailureCount = details.toolCallFailureCount;
    this.failedAttempts = details.failedAttempts;
    this.lastErrorClass = details.lastErrorClass;
    this.failureReason = details.failureReason;
    this.errorBody = details.errorBody;
  }
}

export interface LLMClient {
  chat(request: LLMRequest): Promise<LLMResponse>;
  getDefaultModel(): string;
}
