import type { AssistantMessage, UserMessage } from "../model/types.ts";

export type AgentEvent =
    | { type: "agent_start" }
    | { type: "message_start"; message: UserMessage | AssistantMessage }
    | { type: "message_update"; message: AssistantMessage; delta: string }
    | { type: "message_end"; message: UserMessage | AssistantMessage }
    | { type: "agent_end"; message: AssistantMessage };

export type AgentEventListener =
    (event: AgentEvent) => void | Promise<void>;
