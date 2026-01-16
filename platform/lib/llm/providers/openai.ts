import OpenAI from "openai";
import { LLMProvider, Message, ChatOptions, StreamChunk } from "../types";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }) {
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.LLM_API_KEY,
      baseURL: config.baseURL || process.env.LLM_BASE_URL,
    });
    this.defaultModel = config.model || process.env.LLM_MODEL || "gpt-5-mini";
  }

  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<StreamChunk> {
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 500;
    const temperature = options?.temperature || 0.7;

    const stream = await this.client.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: true,
      max_tokens: maxTokens,
      temperature,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      const done = chunk.choices[0]?.finish_reason !== null;
      
      yield {
        content,
        done,
      };
    }
  }

  async chatComplete(
    messages: Message[],
    options?: ChatOptions
  ): Promise<string> {
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 500;
    const temperature = options?.temperature || 0.7;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: maxTokens,
      temperature,
    });

    return response.choices[0]?.message?.content || "";
  }
}

