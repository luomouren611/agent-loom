import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "../src/agent/agent.ts";
import type { AgentEvent } from "../src/agent/event.ts";
import { FauxProvider } from "../src/model/faux-provider.ts";
import { CalculatorTool } from "../src/index.ts";

test("executes a tool call and uses the tool result in a follow-up model turn", async () => {
    const provider = new FauxProvider([
        [
            "我来计算。",
            {
                type: "tool_call",
                toolCall: {
                    id: "call_1",
                    name: "calculator",
                    input: { expression: "2 + 3" },
                },
            },
        ],
        ["计算结果是 5。"],
    ]);

    const agent = new Agent({
        provider,
        tools: [new CalculatorTool()],
    });

    const result = await agent.prompt("计算 2 + 3");

    assert.equal(result.content[0]?.text, "计算结果是 5。");
    assert.equal(agent.messages.length, 4);
    assert.equal(agent.messages[0]?.role, "user");
    assert.equal(agent.messages[1]?.role, "assistant");
    assert.equal(agent.messages[2]?.role, "tool");
    assert.equal(agent.messages[3]?.role, "assistant");
    assert.equal(provider.requests.length, 2);

    const secondRequest = provider.requests[1];
    assert.equal(secondRequest?.messages.length, 3);
    assert.equal(secondRequest?.messages[2]?.role, "tool");
});


test("feeds unknown tool errors back into the model", async () => {
    const provider = new FauxProvider([
        [
            {
                type: "tool_call",
                toolCall: {
                    id: "call_1",
                    name: "missing_tool",
                    input: {},
                },
            },
        ],
        ["工具 missing_tool 不存在。"],
    ]);

    const agent = new Agent({ provider });

    const result = await agent.prompt("call missing tool");

    assert.equal(result.content[0]?.text, "工具 missing_tool 不存在。");
    assert.equal(agent.messages.length, 4);
    assert.equal(agent.messages[2]?.role, "tool");
    assert.equal(provider.requests.length, 2);

    const toolMessage = agent.messages[2];
    assert.equal(toolMessage.role, "tool");
    assert.equal(toolMessage.isError, true);
});

test("stops when model turns exceed maxIterations", async () => {
    const provider = new FauxProvider([
        [
            {
                type: "tool_call",
                toolCall: {
                    id: "call_1",
                    name: "calculator",
                    input: { expression: "1 + 1" },
                },
            },
        ],
        [
            {
                type: "tool_call",
                toolCall: {
                    id: "call_2",
                    name: "calculator",
                    input: { expression: "2 + 2" },
                },
            },
        ],
    ]);

    const agent = new Agent({
        provider,
        tools: [new CalculatorTool()],
        maxIterations: 2,
    });

    const result = await agent.prompt("keep calling tools");

    assert.equal(result.stopReason, "max_iterations");
    assert.match(result.errorMessage ?? "", /stopped after 2 iterations/);
});
