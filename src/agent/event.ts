import type { AssistantMessage, ToolCall, ToolMessage, UserMessage } from "../model/types.ts";

type EventMessage = UserMessage | AssistantMessage | ToolMessage;

export type AgentEvent =
    | { type: "agent_start" }
    | { type: "message_start"; message: EventMessage }
    | { type: "message_update"; message: AssistantMessage; delta: string }
    | { type: "message_end"; message: UserMessage | AssistantMessage }
    | { type: "tool_call_start"; toolCall: ToolCall }
    | { type: "tool_call_end"; toolCall: ToolCall; message: ToolMessage }
    | { type: "agent_end"; message: AssistantMessage };

export type AgentEventListener =
    (event: AgentEvent) => void | Promise<void>;
