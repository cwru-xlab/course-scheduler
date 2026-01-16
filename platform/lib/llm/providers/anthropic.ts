import { LLMProvider, Message, ChatOptions, StreamChunk } from "../types";

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private defaultModel: string;

  constructor(config: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }) {
    this.apiKey = config.apiKey || process.env.LLM_API_KEY || "";
    this.defaultModel = config.model || "claude-sonnet-4-5-20250929";
  }

  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<StreamChunk> {
    // Placeholder for Anthropic implementation
    // This would use @anthropic-ai/sdk when implemented
    throw new Error("Anthropic provider not yet implemented. Use OpenAI provider.");
  }

  async chatComplete(
    messages: Message[],
    options?: ChatOptions
  ): Promise<string> {
    // Placeholder for Anthropic implementation
    throw new Error("Anthropic provider not yet implemented. Use OpenAI provider.");
  }
}

