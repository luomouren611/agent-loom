// 文本内容
export interface TextContent {
    type: "text";
    text: string;
}

// 用户消息
export interface UserMessage {
    role: "user";
    content: TextContent[];
    timestamp: number;
}

// 助手消息
// 1.先定义停止原因：
export type AssistantStopReason =
    "stop" | "error" | "aborted" | "max_iterations";

// 2.然后定义消息：
export interface AssistantMessage {
    role: "assistant";
    content: TextContent[];
    stopReason: AssistantStopReason;
    errorMessage?: string;
    timestamp: number;
}

// 消息联合类型
export type Message = UserMessage | AssistantMessage | ToolMessage;

// 模型请求
export interface ModelRequest {
    systemPrompt?: string;
    messages: readonly Message[];
    tools?: readonly ModelToolDefinition[];
    signal?: AbortSignal;
}

// 模型流式事件
export type ModelEvent =
    | { type: "start" }
    | { type: "text_delta"; delta: string }
    | { type: "tool_call"; toolCall: ToolCall }
    | { type: "done" }
    | { type: "error"; error: Error };

// 工具调用类型
export interface ToolCall {
    id: string;
    name: string;
    input: unknown;
}

// 工具消息
export interface ToolMessage {
    role: "tool";
    toolCallId: string;
    name: string;
    content: TextContent[];
    isError: boolean;
    timestamp: number;
}

// 工具增加定义
export interface ModelToolDefinition {
    name: string;
    description: string;
}
