import type { ModelEvent, ModelRequest, ToolMessage, UserMessage } from "./types.ts";
import type { ModelProvider } from "./provider.ts";

/* 没有消息时，返回默认问候。
 最后一条是工具消息时，根据工具结果回答。
 最后一条是用户消息时，根据用户输入判断。
 其他情况返回普通文本。
*/
export class RuleBasedProvider implements ModelProvider {
    readonly id = "rule-based";

    async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
        yield { type: "start" };

        const lastMessage = request.messages.at(-1);

        if (!lastMessage) {
            yield { type: "text_delta", delta: "你好，我是一个练习用 Agent。" };
            yield { type: "done" };
            return;
        }

        if (lastMessage.role === "tool") {
            yield* streamToolResultAnswer(lastMessage);
            return;
        }

        if (lastMessage.role === "user") {
            yield* streamUserAnswer(lastMessage, request);
            return;
        }

        yield { type: "text_delta", delta: "我已经完成处理。" };
        yield { type: "done" };
    }
}

// 实现用户输入判断
async function* streamUserAnswer(
    message: UserMessage,
    request: ModelRequest,
): AsyncIterable<ModelEvent> {
    const text = message.content.map((content) => content.text).join("");
    const expression = extractArithmeticExpression(text);

    if (expression && hasTool(request, "calculator")) {
        yield { type: "text_delta", delta: "我需要调用计算工具。" };
        yield {
            type: "tool_call",
            toolCall: {
                id: `call_${Date.now()}`,
                name: "calculator",
                input: { expression },
            },
        };
        yield { type: "done" };
        return;
    }

    if (expression && !hasTool(request, "calculator")) {
        yield { type: "text_delta", delta: "我识别到了算式，但当前没有可用的计算工具。" };
        yield { type: "done" };
        return;
    }

    yield { type: "text_delta", delta: `你说的是：${text}` };
    yield { type: "done" };
}

// 实现工具结果回答
async function* streamToolResultAnswer(
    message: ToolMessage,
): AsyncIterable<ModelEvent> {
    const text = message.content.map((content) => content.text).join("");

    if (message.isError) {
        yield { type: "text_delta", delta: `工具调用失败：${text}` };
        yield { type: "done" };
        return;
    }

    if (message.name === "calculator") {
        yield { type: "text_delta", delta: `计算结果是 ${text}。` };
        yield { type: "done" };
        return;
    }

    yield { type: "text_delta", delta: `工具返回：${text}` };
    yield { type: "done" };
}

// 工具可用性判断
function hasTool(request: ModelRequest, name: string): boolean {
    return request.tools?.some((tool) => tool.name === name) ?? false;
}


// 算式提取
function extractArithmeticExpression(text: string): string | undefined {
    const match = /([0-9][0-9+\-*/().\s]*[0-9])/u.exec(text);
    return match?.[1]?.trim();
}
