import { NextRequest } from "next/server";
import { createLLMClient } from "@/lib/llm/client";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { incorrectCellsCount } = body as {
      incorrectCellsCount: number;
    };

    if (!incorrectCellsCount || incorrectCellsCount === 0) {
      return new Response(
        JSON.stringify({ error: "No incorrect cells to analyze" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create the LLM client
    const llm = createLLMClient();

    // Create the prompt for the LLM
    const systemPrompt = `You are a helpful programming tutor helping students learn Python.`;

    const userPrompt = `I'm reviewing a student's notebook and found ${incorrectCellsCount} incorrect code cell(s). 

Please write a brief, friendly welcome message (2-3 sentences) that:
1. Acknowledges their effort
2. Mentions they have ${incorrectCellsCount} ${incorrectCellsCount === 1 ? 'cell' : 'cells'} with errors
3. Explains they can click on the red-bordered cells on the left to ask about them
4. Or they can ask general questions without selecting a cell

Keep it encouraging and supportive!`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    // Stream the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of await llm.chat(messages, { maxTokens: 300 })) {
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
    console.error("Error in analyze route:", error);
    return new Response(
      JSON.stringify({ error: "Failed to analyze code" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
