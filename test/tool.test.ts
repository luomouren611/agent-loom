import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "../src/agent/agent.ts";
import type { AgentEvent } from "../src/agent/event.ts";
import { FauxProvider } from "../src/model/faux-provider.ts";
import { CalculatorTool } from "../src/index.ts";

test("executes a tool call and stores the tool result", async () => {
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
    ]);

    const agent = new Agent({
        provider,
        tools: [new CalculatorTool()],
    });

    const events: AgentEvent[] = [];
    agent.subscribe((event) => {
        events.push(event);
    });

    const result = await agent.prompt("计算 2 + 3");

    assert.equal(result.content[0]?.text, "我来计算。");
    assert.equal(agent.messages.length, 3);
    assert.equal(agent.messages[2]?.role, "tool");

    const toolMessage = agent.messages[2];
    assert.equal(toolMessage.role, "tool");
    assert.equal(toolMessage.content[0]?.text, "5");
    assert.equal(toolMessage.isError, false);

    assert.deepEqual(
        events.map((event) => event.type),
        [
            "agent_start",
            "message_start",
            "message_end",
            "message_start",
            "message_update",
            "tool_call_start",
            "message_start",
            "message_end",
            "tool_call_end",
            "message_end",
            "agent_end",
        ],
    );
});

test("stores an error tool message for unknown tools", async () => {
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
    ]);

    const agent = new Agent({ provider });

    await agent.prompt("call missing tool");

    assert.equal(agent.messages[2]?.role, "tool");

    const toolMessage = agent.messages[2];
    assert.equal(toolMessage.role, "tool");
    assert.equal(toolMessage.isError, true);
    assert.match(toolMessage.content[0]?.text ?? "", /Unknown tool/);
});
