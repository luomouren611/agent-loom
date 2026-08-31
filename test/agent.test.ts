import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "../src/agent/agent.ts";
import type { AgentEvent } from "../src/agent/event.ts";
import { FauxProvider } from "../src/model/faux-provider.ts";

test("streams a response and stores the conversation", async () => {
    const provider = new FauxProvider([["你", "好"]]);
    const agent = new Agent({
        provider,
        systemPrompt: "Be concise.",
    });
    const events: AgentEvent[] = [];

    agent.subscribe((event) => {
        events.push(event);
    });

    const result = await agent.prompt("你好");

    assert.equal(result.content[0]?.text, "你好");
    assert.equal(result.stopReason, "stop");
    assert.equal(agent.messages.length, 2);
    assert.equal(agent.messages[0]?.role, "user");
    assert.equal(agent.messages[1]?.role, "assistant");
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0]?.systemPrompt, "Be concise.");

    assert.deepEqual(
        events.map((event) => event.type),
        [
            "agent_start",
            "message_start",
            "message_end",
            "message_start",
            "message_update",
            "message_update",
            "message_end",
            "agent_end",
        ],
    );
});

// 错误测试
test("normalizes provider errors into an assistant message", async () => {
    const agent = new Agent({
        provider: new FauxProvider([]),
    });

    const result = await agent.prompt("hello");

    assert.equal(result.stopReason, "error");
    assert.match(
        result.errorMessage ?? "",
        /No scripted faux response/,
    );
    assert.equal(agent.messages.length, 2);
});
