// Common types for LLM integration

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  provider?: "openai" | "anthropic";
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>;
  chatComplete(messages: Message[], options?: ChatOptions): Promise<string>;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface NotebookCell {
  cell_type: "markdown" | "code" | "raw";
  source: string[];
  execution_count?: number | null;
  metadata?: CellMetadata;
}

export interface CellMetadata {
  is_incorrect?: boolean;
  [key: string]: any;
}

export interface NotebookData {
  cells: NotebookCell[];
  metadata?: Record<string, any>;
  nbformat?: number;
  nbformat_minor?: number;
}

export interface IncorrectCellContext {
  incorrectCell: NotebookCell;
  cellIndex: number;
  beforeCells: NotebookCell[];
  afterCells: NotebookCell[];
}

