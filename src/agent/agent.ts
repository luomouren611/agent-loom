import type { ModelProvider } from "../model/provider.ts";
import type {
    AssistantMessage,
    Message,
    TextContent,
    ToolCall,
    ToolMessage,
    UserMessage,
} from "../model/types.ts";
import { ToolRegistry } from "../tool/registry.ts";
import type { Tool } from "../tool/types.ts";
import type { AgentEvent, AgentEventListener } from "./event.ts";

export interface AgentOptions {
    provider: ModelProvider;
    systemPrompt?: string;
    tools?: readonly Tool[];
    maxIterations?: number;
}

export class Agent {
    readonly messages: Message[] = [];
    private readonly listeners = new Set<AgentEventListener>();
    private readonly provider: ModelProvider;
    private readonly systemPrompt?: string;
    private readonly tools: ToolRegistry;
    private readonly maxIterations: number;


    // 创建工具消息的辅助方法
    private createToolMessage(
        toolCall: ToolCall,
        content: string,
        isError: boolean,
    ): ToolMessage {
        return {
            role: "tool",
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: [{ type: "text", text: content }],
            isError,
            timestamp: Date.now(),
        };
    }


    constructor(options: AgentOptions) {
        this.provider = options.provider;
        this.systemPrompt = options.systemPrompt;
        this.tools = new ToolRegistry(options.tools);
        this.maxIterations = options.maxIterations ?? 5;

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

    private async executeToolCall(
        toolCall: ToolCall,
        signal?: AbortSignal,
    ): Promise<ToolMessage> {
        await this.emit({ type: "tool_call_start", toolCall });

        const tool = this.tools.get(toolCall.name);

        if (!tool) {
            const message = this.createToolMessage(
                toolCall,
                `Unknown tool: ${toolCall.name}`,
                true,
            );

            await this.emit({ type: "tool_call_end", toolCall, message });
            return message;
        }

        try {
            const result = await tool.execute(toolCall.input, signal);
            const message = this.createToolMessage(
                toolCall,
                result.content,
                result.isError ?? false,
            );

            await this.emit({ type: "tool_call_end", toolCall, message });
            return message;
        } catch (error) {
            const message = this.createToolMessage(
                toolCall,
                error instanceof Error ? error.message : String(error),
                true,
            );

            await this.emit({ type: "tool_call_end", toolCall, message });
            return message;
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

        // Keep the provider request limited to completed prior messages while
        // reserving the assistant's correct position in conversation history.
        const requestMessages = this.messages.slice();
        this.messages.push(assistantMessage);


        // 第三部分：调用 Provider 并累计文本。
        try {
            const stream = this.provider.stream({
                systemPrompt: this.systemPrompt,
                messages: requestMessages,
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
                }
                // 工具调用处理
                else if (event.type === "tool_call") {
                    const toolMessage = await this.executeToolCall(event.toolCall, signal);
                    this.messages.push(toolMessage);
                }
                else if (event.type === "error") {
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
        await this.emit({ type: "message_end", message: assistantMessage });
        await this.emit({ type: "agent_end", message: assistantMessage });
        return assistantMessage;


    }
}



