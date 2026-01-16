import { NextRequest } from "next/server";
import { createLLMClient } from "@/lib/llm/client";
import { Message } from "@/lib/llm/types";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, notebookContext } = body as {
      messages: Message[];
      notebookContext?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid messages in request" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create the LLM client
    const llm = createLLMClient();

    // Prepare messages with system context
    const systemMessage: Message = {
      role: "system",
      content: `You are a helpful programming tutor helping students learn Python. You are assisting a student who is working on Python programming exercises in a Jupyter notebook.

Your role is to:
- Answer questions about Python concepts, syntax, and best practices
- Help debug code issues by asking clarifying questions
- Provide hints and guidance rather than complete solutions
- Encourage good programming practices
- Be patient, supportive, and educational

${notebookContext ? `\n### Current Notebook Context:\n${notebookContext}` : ""}

Remember: Your goal is to help students learn and understand, not just to solve problems for them.`,
    };

    // Combine system message with user messages
    const fullMessages = [systemMessage, ...messages];

    // Stream the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of await llm.chat(fullMessages, { maxTokens: 800 })) {
            if (chunk.content) {
              controller.enqueue(encoder.encode(chunk.content));
            }
            if (chunk.done) {
              controller.close();
              break;
            }
          }
        } catch (error) {
          console.error("Error during streaming:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Error in chat route:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

