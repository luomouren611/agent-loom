import assert from "node:assert/strict";
import test from "node:test";
import { toChatMessages } from "../src/model/openai-compatible-provider.ts";

test("converts internal messages into chat messages", () => {
    const messages = toChatMessages({
        systemPrompt: "Be concise.",
        messages: [
            {
                role: "user",
                content: [{ type: "text", text: "你好" }],
                timestamp: 1,
            },
            {
                role: "assistant",
                content: [{ type: "text", text: "我需要计算。" }],
                stopReason: "stop",
                timestamp: 2,
            },
            {
                role: "tool",
                toolCallId: "call_1",
                name: "calculator",
                content: [{ type: "text", text: "30" }],
                isError: false,
                timestamp: 3,
            },
        ],
    });

    assert.deepEqual(messages, [
        { role: "system", content: "Be concise." },
        { role: "user", content: "你好" },
        { role: "assistant", content: "我需要计算。" },
        { role: "user", content: "工具 calculator 返回：30" },
    ]);
});
