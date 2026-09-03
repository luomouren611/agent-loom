import OpenAI from "openai";
import type { ModelProvider } from "./provider.ts";
import type { ModelEvent, ModelRequest } from "./types.ts";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";


// 定义外部api模型
export interface OpenAICompatibleProviderOptions {
    apiKey: string;
    model: string;
    baseURL?: string;
}

export class OpenAICompatibleProvider implements ModelProvider {
    readonly id = "openai-compatible";
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(options: OpenAICompatibleProviderOptions) {
        this.client = new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });
        this.model = options.model;
    }


    async * stream(request: ModelRequest): AsyncIterable<ModelEvent> {
        try {
            yield { type: "start" };

            const stream = await this.client.chat.completions.create({
                model: this.model,
                messages: toChatMessages(request),
                stream: true,
            });

            for await (const chunk of stream) {
                if (request.signal?.aborted) {
                    yield {
                        type: "error",
                        error: new Error("Model request aborted"),
                    };
                    return;
                }

                const delta = chunk.choices[0]?.delta.content;
                if (delta) {
                    yield { type: "text_delta", delta };
                }
            }

            yield { type: "done" };
        } catch (error) {
            yield {
                type: "error",
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }

}

// 转换内部消息格式
export function toChatMessages(request: ModelRequest): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
        messages.push({
            role: "system",
            content: request.systemPrompt,
        });
    }

    for (const message of request.messages) {
        const text = message.content.map((content) => content.text).join("");

        if (message.role === "user") {
            messages.push({ role: "user", content: text });
        } else if (message.role === "assistant") {
            messages.push({ role: "assistant", content: text });
        } else if (message.role === "tool") {
            messages.push({ role: "user", content: `工具 ${message.name} 返回：${text}` });
        }
    }

    return messages;
}