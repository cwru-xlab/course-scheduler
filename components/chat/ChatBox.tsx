"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { ScrollShadow } from "@heroui/scroll-shadow";
import { Avatar } from "@heroui/avatar";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { NotebookData } from "@/lib/llm/types";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

interface ChatBoxProps {
  notebookData: NotebookData | null;
  selectedCellIndex: number | null;
  notebookId: string;
  cellsBeforeCount?: number;
  cellsAfterCount?: number;
}

// Local storage key base
const STORAGE_KEY_BASE = "btec420-chat-history";

// Helper function to get storage key for a specific notebook
const getStorageKey = (notebookId: string) => `${STORAGE_KEY_BASE}-${notebookId}`;

// Helper functions for localStorage
const saveToLocalStorage = (notebookId: string, messages: Message[], selectedCellIndex: number | null) => {
  try {
    const data = {
      messages,
      selectedCellIndex,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(getStorageKey(notebookId), JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save to localStorage:", error);
  }
};

const loadFromLocalStorage = (notebookId: string): {
  messages: Message[];
  selectedCellIndex: number | null;
} | null => {
  try {
    const stored = localStorage.getItem(getStorageKey(notebookId));
    if (!stored) return null;
    
    const data = JSON.parse(stored);
    // Convert timestamp strings back to Date objects
    data.messages = data.messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
    return data;
  } catch (error) {
    console.error("Failed to load from localStorage:", error);
    return null;
  }
};

const clearLocalStorage = (notebookId: string) => {
  try {
    localStorage.removeItem(getStorageKey(notebookId));
  } catch (error) {
    console.error("Failed to clear localStorage:", error);
  }
};

export const ChatBox = ({ 
  notebookData, 
  selectedCellIndex,
  notebookId,
  cellsBeforeCount = 2,
  cellsAfterCount = 2 
}: ChatBoxProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveToLocalStorage(notebookId, messages, selectedCellIndex);
    }
  }, [messages, selectedCellIndex, notebookId]);

  // Load from localStorage or analyze on mount
  useEffect(() => {
    if (hasAnalyzed || !notebookData) return;
    
    // Try to load from localStorage first
    const stored = loadFromLocalStorage(notebookId);
    if (stored && stored.messages.length > 0) {
      // Restore state from localStorage
      setMessages(stored.messages);
      setHasAnalyzed(true);
    } else {
      // No stored data, proceed with analysis
      setHasAnalyzed(true);
      analyzeNotebook();
    }
  }, [notebookData, hasAnalyzed, notebookId]);

  const analyzeNotebook = async () => {
    if (!notebookData) return;

    // Count incorrect cells
    const incorrectCount = notebookData.cells.filter(
      (cell) => cell.metadata?.is_incorrect === true
    ).length;

    if (incorrectCount === 0) {
      setMessages([
        {
          id: "no-errors",
          text: "Great job! I don't see any errors in your notebook. Feel free to ask me any questions about Python programming!",
          sender: "assistant",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/chat/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          incorrectCellsCount: incorrectCount,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze code");
      }

      // Read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      if (reader) {
        // Create initial message
        const welcomeMsg: Message = {
          id: "welcome",
          text: "",
          sender: "assistant",
          timestamp: new Date(),
        };
        setMessages([welcomeMsg]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulatedText += chunk;

          // Update the message
          setMessages([{ ...welcomeMsg, text: accumulatedText }]);
        }
      }
    } catch (error) {
      console.error("Error analyzing code:", error);
      setMessages([
        {
          id: "error",
          text: "Sorry, I encountered an error. Please try again.",
          sender: "assistant",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const buildContextForSelectedCell = () => {
    if (!notebookData || selectedCellIndex === null) {
      return null;
    }

    const cells = notebookData.cells;
    const selectedCell = cells[selectedCellIndex];

    if (!selectedCell) return null;

    const contextParts: string[] = [];

    // Add before cells
    const beforeStart = Math.max(0, selectedCellIndex - cellsBeforeCount);
    const beforeCells = cells.slice(beforeStart, selectedCellIndex);

    if (beforeCells.length > 0) {
      contextParts.push("### Context (cells before the selected code):\n");
      beforeCells.forEach((cell, idx) => {
        if (cell.cell_type === "markdown") {
          contextParts.push(`**Cell ${beforeStart + idx + 1}:**\n${cell.source.join("")}\n`);
        } else if (cell.cell_type === "code") {
          contextParts.push(`**Code Cell ${beforeStart + idx + 1}:**\n\`\`\`python\n${cell.source.join("")}\n\`\`\`\n`);
        }
      });
    }

    // Add selected cell
    contextParts.push(`\n### Selected Code (Cell ${selectedCellIndex + 1}):\n`);
    contextParts.push(`\`\`\`python\n${selectedCell.source.join("")}\n\`\`\`\n`);

    // Add after cells
    const afterEnd = Math.min(cells.length, selectedCellIndex + cellsAfterCount + 1);
    const afterCells = cells.slice(selectedCellIndex + 1, afterEnd);

    if (afterCells.length > 0) {
      contextParts.push("\n### Context (cells after the selected code):\n");
      afterCells.forEach((cell, idx) => {
        if (cell.cell_type === "code") {
          contextParts.push(`**Code Cell ${selectedCellIndex + idx + 2}:**\n\`\`\`python\n${cell.source.join("")}\n\`\`\`\n`);
        } else if (cell.cell_type === "markdown") {
          contextParts.push(`**Cell ${selectedCellIndex + idx + 2}:**\n${cell.source.join("")}\n`);
        }
      });
    }

    return contextParts.join("\n");
  };

  const handleSend = async () => {
    if (inputValue.trim() === "" || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Build message history for API
      const messageHistory = messages
        .filter((msg) => msg.text.trim() !== "")
        .map((msg) => ({
          role: msg.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: msg.text,
        }));

      // Build context if a cell is selected
      const context = buildContextForSelectedCell();
      let userContent = userMessage.text;
      
      if (context) {
        userContent = `${context}\n\n### My Question:\n${userMessage.text}`;
      }

      // Add the new user message with context
      messageHistory.push({
        role: "user" as const,
        content: userContent,
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messageHistory,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      // Create a temporary message for streaming
      const tempId = `response-${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
        text: "",
        sender: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, tempMessage]);

      // Read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulatedText += chunk;

          // Update the message with accumulated text
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempId ? { ...msg, text: accumulatedText } : msg
            )
          );
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          text: "Sorry, I encountered an error. Please try again.",
          sender: "assistant",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    clearLocalStorage(notebookId);
    setMessages([]);
    setHasAnalyzed(false);
  };

  const getSelectedCellInfo = () => {
    if (!notebookData || selectedCellIndex === null) return null;
    const cell = notebookData.cells[selectedCellIndex];
    if (!cell) return null;
    return {
      index: selectedCellIndex,
      isIncorrect: cell.metadata?.is_incorrect === true,
    };
  };

  const selectedInfo = getSelectedCellInfo();

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b border-divider flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Chat Assistant</h3>
          {selectedInfo && (
            <Chip 
              color={selectedInfo.isIncorrect ? "danger" : "primary"} 
              variant="flat" 
              size="sm"
            >
              Cell {selectedInfo.index + 1}
            </Chip>
          )}
        </div>
        {messages.length > 0 && (
          <Button
            size="sm"
            variant="flat"
            color="default"
            onPress={handleReset}
          >
            Reset Chat
          </Button>
        )}
      </CardHeader>
      <CardBody className="flex-1 p-0 flex flex-col">
        <ScrollShadow className="flex-1 p-4">
          <div className="space-y-4">
            {/* Initial loading state during analysis */}
            {messages.length === 0 && isLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Spinner size="lg" color="secondary" />
                <div className="text-center">
                  <p className="text-lg font-medium text-default-700">
                    Analyzing your code...
                  </p>
                  <p className="text-sm text-default-400 mt-2">
                    Reviewing your notebook for learning opportunities
                  </p>
                </div>
              </div>
            )}
            
            {messages.length === 0 && !isLoading && (
              <div className="text-center text-default-400 py-8">
                <p>Ask me anything about your Python code!</p>
              </div>
            )}
            
            {messages
              .filter((message) => message.text.trim() !== "")
              .map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.sender === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <Avatar
                    name={message.sender === "user" ? "U" : "AI"}
                    size="sm"
                    color={message.sender === "user" ? "primary" : "secondary"}
                  />
                  <div
                    className={`flex flex-col max-w-[70%] ${
                      message.sender === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`px-4 py-2 rounded-lg ${
                        message.sender === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-default-100 text-foreground"
                      }`}
                    >
                      {message.sender === "assistant" ? (
                        <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{message.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                      )}
                    </div>
                    <span className="text-xs text-default-400 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}

            {isLoading && messages[messages.length - 1]?.text === "" && (
              <div className="flex gap-3">
                <Avatar name="AI" size="sm" color="secondary" />
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-default-100">
                  <Spinner size="sm" />
                  <span className="text-sm text-default-400">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollShadow>
        <div className="p-4 border-t border-divider">
          {selectedInfo && (
            <div className="mb-2 text-xs text-default-500">
              💡 Asking about Cell {selectedInfo.index + 1}. Click another cell or ask a general question.
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={inputValue}
              onValueChange={setInputValue}
              onKeyPress={handleKeyPress}
              fullWidth
              size="lg"
              isDisabled={isLoading}
            />
            <Button
              color="primary"
              onPress={handleSend}
              isDisabled={inputValue.trim() === "" || isLoading}
              size="lg"
            >
              Send
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
