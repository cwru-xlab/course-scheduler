import { LLMProvider, LLMConfig } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";

export function createLLMClient(config?: LLMConfig): LLMProvider {
  const provider = config?.provider || (process.env.LLM_PROVIDER as "openai" | "anthropic") || "openai";

  switch (provider) {
    case "openai":
      return new OpenAIProvider({
        apiKey: config?.apiKey,
        baseURL: config?.baseURL,
        model: config?.model,
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: config?.apiKey,
        baseURL: config?.baseURL,
        model: config?.model,
      });
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export { OpenAIProvider, AnthropicProvider };
export * from "./types";

