import type { ModelProvider } from "../model/provider.ts";
import type {
    AssistantMessage,
    Message,
    TextContent,
    UserMessage,
} from "../model/types.ts";
import type { AgentEvent, AgentEventListener } from "./event.ts";

export interface AgentOptions {
    provider: ModelProvider;
    systemPrompt?: string;
}

export class Agent {
    readonly messages: Message[] = [];
    private readonly listeners = new Set<AgentEventListener>();
    private readonly provider: ModelProvider;
    private readonly systemPrompt?: string;

    constructor(options: AgentOptions) {
        this.provider = options.provider;
        this.systemPrompt = options.systemPrompt;
    }

    subscribe(listener: AgentEventListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private async emit(event: AgentEvent): Promise<void> {
        for (const listener of this.listeners) {
            await listener(event);
        }
    }

    async prompt(text: string, signal?: AbortSignal): Promise<AssistantMessage> {
        // 后续内容写在这里
        // 第一部分：创建并保存用户消息。
        const userMessage: UserMessage = {
            role: "user",
            content: [{ type: "text", text }],
            timestamp: Date.now(),
        };

        await this.emit({ type: "agent_start" });
        await this.emit({ type: "message_start", message: userMessage });
        this.messages.push(userMessage);
        await this.emit({ type: "message_end", message: userMessage });

        // 第二部分：创建空助手消息。
        const textContent: TextContent = { type: "text", text: "" };
        const assistantMessage: AssistantMessage = {
            role: "assistant",
            content: [textContent],
            stopReason: "stop",
            timestamp: Date.now(),
        };

        await this.emit({ type: "message_start", message: assistantMessage });


        // 第三部分：调用 Provider 并累计文本。
        try {
            const stream = this.provider.stream({
                systemPrompt: this.systemPrompt,
                messages: this.messages.slice(),
                signal,
            });

            for await (const event of stream) {
                if (event.type === "text_delta") {
                    textContent.text += event.delta;
                    await this.emit({
                        type: "message_update",
                        message: assistantMessage,
                        delta: event.delta,
                    });
                } else if (event.type === "error") {
                    assistantMessage.stopReason = signal?.aborted ? "aborted" : "error";
                    assistantMessage.errorMessage = event.error.message;
                    break;
                }
            }
        } catch (error) {
            assistantMessage.stopReason = signal?.aborted ? "aborted" : "error";
            assistantMessage.errorMessage =
                error instanceof Error ? error.message : String(error);
        }

        // 第四部分：保存助手消息并发出结束事件。
        this.messages.push(assistantMessage);
        await this.emit({ type: "message_end", message: assistantMessage });
        await this.emit({ type: "agent_end", message: assistantMessage });
        return assistantMessage;


    }
}



