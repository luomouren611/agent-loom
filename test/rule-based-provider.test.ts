import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "../src/agent/agent.ts";
import type { AgentEvent } from "../src/agent/event.ts";
import { FauxProvider } from "../src/model/faux-provider.ts";
import { CalculatorTool, RuleBasedProvider } from "../src/index.ts";

// 普通输入不调用工具。
test("answers normal text without calling tools", async () => {
    const agent = new Agent({
        provider: new RuleBasedProvider(),
        tools: [new CalculatorTool()],
    });

    const result = await agent.prompt("你好");

    assert.equal(result.stopReason, "stop");
    assert.equal(agent.messages.length, 2);
    assert.equal(agent.messages[0]?.role, "user");
    assert.equal(agent.messages[1]?.role, "assistant");
});

// 包含算式时才调用工具。
test("calls calculator when user input contains arithmetic", async () => {
    const agent = new Agent({
        provider: new RuleBasedProvider(),
        tools: [new CalculatorTool()],
    });

    const result = await agent.prompt("帮我计算 10 + 20");

    assert.equal(result.content[0]?.text, "计算结果是 30。");
    assert.equal(agent.messages.length, 4);
    assert.equal(agent.messages[2]?.role, "tool");
    assert.equal(agent.messages[2]?.content[0]?.text, "30");
});

// 没有注册工具时不发起工具调用
test("does not call calculator when the tool is unavailable", async () => {
    const agent = new Agent({
        provider: new RuleBasedProvider(),
    });

    const result = await agent.prompt("帮我计算 10 + 20");

    assert.match(result.content[0]?.text ?? "", /没有可用的计算工具/);
    assert.equal(agent.messages.length, 2);
});
