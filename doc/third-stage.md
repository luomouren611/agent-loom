# 第三部分：工具结果回灌与多步 Agent 循环

这份文档用于指导你从第二阶段继续手动实现第三阶段。

第一阶段完成了：

```text
用户输入 -> 模型流式文本 -> 助手消息
```

第二阶段完成了：

```text
用户输入 -> 模型发出 tool_call -> Agent 执行工具 -> 保存 ToolMessage -> 结束
```

第三阶段要继续往前推进一步：工具执行完以后，不立刻结束，而是把工具结果重新交给模型，让模型基于工具结果生成最终回答。

也就是：

```text
用户输入
  -> 第一次调用模型
  -> 模型请求工具
  -> Agent 执行工具
  -> 工具结果写入 messages
  -> 第二次调用模型
  -> 模型看到工具结果
  -> 模型生成最终回答
  -> Agent 结束
```

这个阶段是 Agent Harness 里非常关键的一步。因为从这里开始，Agent 不再只是“调用一次模型”，而是开始具备“模型、工具、历史消息之间循环协作”的能力。

## 1. 第三阶段要完成什么

第三阶段要让 Agent 支持多步运行。

第二阶段中，模型一旦发出工具调用，Agent 会执行工具并保存结果，但不会再问模型：“工具结果已经出来了，你现在要怎么回答用户？”

所以第二阶段的输出更像这样：

```text
我会调用计算工具。
[tool:calculator] 5
```

第三阶段完成后，流程应该更像这样：

```text
我会调用计算工具。
[tool:calculator] 5
计算结果是 5。
```

注意，这里仍然使用 `FauxProvider`。所以“计算结果是 5。”不是模型真的推理出来的，而是我们让假模型在第二次调用时模拟返回最终回答。

第三阶段真正学习的是运行结构，不是真实模型能力。

## 2. 为什么第三阶段重要

工具调用本身只解决了“Agent 能做事”。

但真正有用的 Agent 还需要在做事之后继续思考。

举个例子，用户说：

```text
帮我看一下 package.json 里项目叫什么
```

真实 Agent 可能会经历：

```text
模型：我需要读取 package.json
Agent：调用 read_file
工具：返回 package.json 内容
模型：根据文件内容回答，项目名是 xxx
```

如果没有第三阶段，Agent 只能停在：

```text
[tool:read_file] { package.json 内容... }
```

用户还得自己看工具结果。

第三阶段要解决的就是：工具结果不是最终用户体验，工具结果应该回到模型上下文里，由模型整理成自然语言回答。

## 3. 第三阶段新增的核心概念

### Model Turn

Model Turn 可以理解为“一次模型调用”。

第一阶段和第二阶段里，`agent.prompt(...)` 内部只调用一次：

```ts
this.provider.stream(...)
```

第三阶段会变成可能调用多次：

```text
第 1 次模型调用：输出文本 + 请求工具
第 2 次模型调用：看到工具结果 + 输出最终回答
```

每次模型调用都会产生一条助手消息。

### Agent Loop

Agent Loop 是 Agent 的运行循环。

第三阶段的循环规则可以先设计得很简单：

```text
调用模型
如果模型请求了工具：
  执行工具
  保存工具结果
  继续下一轮模型调用
如果模型没有请求工具：
  结束
```

这就是最小版本的 Agent Loop。

### Max Iterations

只要有循环，就需要上限。

如果模型每次都请求工具，Agent 不能无限跑下去。

所以第三阶段要增加一个最大循环次数，比如：

```ts
maxIterations: 5
```

含义是：一次 `prompt(...)` 最多允许调用模型 5 次。

如果超过这个次数还没有结束，Agent 应该返回一个带错误原因的助手消息。

### Final Assistant Message

第二阶段里，`prompt(...)` 返回的是第一次助手消息。

第三阶段里，如果发生了工具调用，`prompt(...)` 应该返回最后一条助手消息。

例如消息历史变成：

```text
UserMessage: 计算 2 + 3
AssistantMessage: 我会调用计算工具。
ToolMessage: 5
AssistantMessage: 计算结果是 5。
```

那么 `prompt(...)` 应该返回最后这条：

```text
AssistantMessage: 计算结果是 5。
```

因为它才是本轮对用户的最终回答。

## 4. 第三阶段完成后的目录结构

第三阶段不一定需要新增目录，主要是在现有结构上修改：

```text
my-agent-harness-practice/
├── doc/
│   ├── first-stage.md
│   ├── second-stage.md
│   └── third-stage.md
├── src/
│   ├── agent/
│   │   ├── agent.ts
│   │   └── event.ts
│   ├── cli/
│   │   └── main.ts
│   ├── model/
│   │   ├── faux-provider.ts
│   │   ├── provider.ts
│   │   └── types.ts
│   ├── tool/
│   │   ├── calculator-tool.ts
│   │   ├── registry.ts
│   │   └── types.ts
│   └── index.ts
├── test/
│   ├── agent.test.ts
│   └── tool.test.ts
├── package.json
├── package-lock.json
└── tsconfig.json
```

第三阶段主要修改这些文件：

- 修改 `src/model/types.ts`
- 修改 `src/agent/event.ts`
- 修改 `src/agent/agent.ts`
- 修改 `src/cli/main.ts`
- 修改 `test/agent.test.ts`

`FauxProvider` 在第二阶段已经支持多组响应，所以第三阶段大概率不需要大改它。它已经可以模拟：

```ts
new FauxProvider([
  [第一次模型调用的事件],
  [第二次模型调用的事件],
])
```

这正好适合第三阶段。

## 5. 第一步：给停止原因增加循环上限

文件：`src/model/types.ts`

当前停止原因是：

```ts
export type AssistantStopReason = "stop" | "error" | "aborted";
```

第三阶段建议增加一个：

```ts
export type AssistantStopReason =
  | "stop"
  | "error"
  | "aborted"
  | "max_iterations";
```

为什么要加它？

因为第三阶段开始有循环了。

只要 Agent 会循环，就必须考虑循环无法自然结束的情况。例如模型一直说：

```text
调用 calculator
调用 calculator
调用 calculator
...
```

如果没有上限，程序可能一直运行。

`max_iterations` 的意义是：Agent 没有崩溃，也不是工具报错，而是为了防止无限循环主动停下。

## 6. 第二步：补齐 ToolMessage 的消息事件类型

文件：`src/agent/event.ts`

第二阶段审查时提到过一个小问题：现在 `message_start` 和 `message_end` 只支持 `UserMessage | AssistantMessage`，但第三阶段里 `ToolMessage` 会成为消息历史的重要一环。

建议把事件定义改成：

```ts
import type {
  AssistantMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from "../model/types.ts";

type EventMessage = UserMessage | AssistantMessage | ToolMessage;

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "message_start"; message: EventMessage }
  | { type: "message_update"; message: AssistantMessage; delta: string }
  | { type: "message_end"; message: EventMessage }
  | { type: "tool_call_start"; toolCall: ToolCall }
  | { type: "tool_call_end"; toolCall: ToolCall; message: ToolMessage }
  | { type: "agent_end"; message: AssistantMessage };
```

这样做的含义是：所有进入 `messages` 的消息，都可以有统一的开始和结束事件。

之后工具消息的事件顺序可以是：

```text
tool_call_start
message_start: ToolMessage
message_end: ToolMessage
tool_call_end
```

这个顺序表达得更清楚：工具调用开始了，产生了一条工具消息，工具调用结束了。

## 7. 第三步：给 Agent 增加 maxIterations 选项

文件：`src/agent/agent.ts`

当前 `AgentOptions` 是：

```ts
export interface AgentOptions {
  provider: ModelProvider;
  systemPrompt?: string;
  tools?: readonly Tool[];
}
```

第三阶段建议改成：

```ts
export interface AgentOptions {
  provider: ModelProvider;
  systemPrompt?: string;
  tools?: readonly Tool[];
  maxIterations?: number;
}
```

然后在 `Agent` 类里新增字段：

```ts
private readonly maxIterations: number;
```

构造函数里设置默认值：

```ts
this.maxIterations = options.maxIterations ?? 5;
```

为什么默认是 5？

因为学习阶段不需要很大。5 次足够覆盖：

```text
模型 -> 工具 -> 模型 -> 工具 -> 模型
```

如果超过 5 次还没有结束，通常说明模型或工具链路有问题。

## 8. 第四步：把一次模型调用抽成方法

文件：`src/agent/agent.ts`

现在 `prompt(...)` 里同时做了很多事：

- 创建用户消息。
- 创建助手消息。
- 调用 Provider。
- 处理文本。
- 处理工具。
- 处理错误。
- 结束消息。

第三阶段为了实现循环，建议先把“一次模型调用”抽出来。

新增一个返回类型：

```ts
interface ModelTurnResult {
  message: AssistantMessage;
  toolCallCount: number;
}
```

然后新增方法：

```ts
private async runModelTurn(signal?: AbortSignal): Promise<ModelTurnResult> {
  const textContent: TextContent = { type: "text", text: "" };
  const assistantMessage: AssistantMessage = {
    role: "assistant",
    content: [textContent],
    stopReason: "stop",
    timestamp: Date.now(),
  };

  await this.emit({ type: "message_start", message: assistantMessage });

  const requestMessages = this.messages.slice();
  this.messages.push(assistantMessage);

  let toolCallCount = 0;

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
      } else if (event.type === "tool_call") {
        toolCallCount += 1;
        const toolMessage = await this.executeToolCall(event.toolCall, signal);
        this.messages.push(toolMessage);
      } else if (event.type === "error") {
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

  await this.emit({ type: "message_end", message: assistantMessage });

  return {
    message: assistantMessage,
    toolCallCount,
  };
}
```

这个方法的含义是：只负责一次模型调用，并告诉外面这次模型调用里有没有发生工具调用。

第三阶段的循环就可以根据 `toolCallCount` 判断是否继续。

## 9. 第五步：让工具消息也发 message_start 和 message_end

文件：`src/agent/agent.ts`

当前 `executeToolCall(...)` 里创建工具消息后，只发了：

```ts
tool_call_end
```

第三阶段建议在工具消息产生时也发消息事件。

可以把重复逻辑抽成一个小方法：

```ts
private async finishToolCall(
  toolCall: ToolCall,
  content: string,
  isError: boolean,
): Promise<ToolMessage> {
  const message = this.createToolMessage(toolCall, content, isError);

  await this.emit({ type: "message_start", message });
  await this.emit({ type: "message_end", message });
  await this.emit({ type: "tool_call_end", toolCall, message });

  return message;
}
```

然后 `executeToolCall(...)` 里可以从：

```ts
const message = this.createToolMessage(...);
await this.emit({ type: "tool_call_end", toolCall, message });
return message;
```

改成：

```ts
return await this.finishToolCall(toolCall, "...", true);
```

这样做的含义是：工具调用结果不只是一个工具事件，也是会话历史里真实存在的一条消息。

## 10. 第六步：改写 prompt 为循环

文件：`src/agent/agent.ts`

第三阶段最关键的变化在这里。

当前 `prompt(...)` 基本是：

```text
保存用户消息
调用一次模型
返回助手消息
```

第三阶段要变成：

```text
保存用户消息
循环调用模型
  如果没有工具调用，返回最后一条助手消息
  如果有工具调用，继续下一次模型调用
  如果达到最大次数，返回 max_iterations 消息
```

建议把 `prompt(...)` 改成：

```ts
async prompt(text: string, signal?: AbortSignal): Promise<AssistantMessage> {
  const userMessage: UserMessage = {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };

  await this.emit({ type: "agent_start" });
  await this.emit({ type: "message_start", message: userMessage });
  this.messages.push(userMessage);
  await this.emit({ type: "message_end", message: userMessage });

  let lastAssistantMessage: AssistantMessage | undefined;

  for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
    const result = await this.runModelTurn(signal);
    lastAssistantMessage = result.message;

    if (result.message.stopReason !== "stop") {
      await this.emit({ type: "agent_end", message: result.message });
      return result.message;
    }

    if (result.toolCallCount === 0) {
      await this.emit({ type: "agent_end", message: result.message });
      return result.message;
    }
  }

  const message = this.createMaxIterationsMessage();
  this.messages.push(message);
  await this.emit({ type: "message_start", message });
  await this.emit({ type: "message_end", message });
  await this.emit({ type: "agent_end", message });

  return message;
}
```

然后新增：

```ts
private createMaxIterationsMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    stopReason: "max_iterations",
    errorMessage: `Agent stopped after ${this.maxIterations} iterations.`,
    timestamp: Date.now(),
  };
}
```

注意：上面代码里的 `lastAssistantMessage` 当前可以不用，但你也可以不声明它。学习阶段保持简单即可。

这个循环的关键判断是：

```ts
if (result.toolCallCount === 0) {
  return result.message;
}
```

含义是：如果本轮模型没有要求调用工具，说明模型已经给出最终回答，可以结束。

如果本轮模型调用了工具，就继续下一轮，让模型看到工具结果。

## 11. 第七步：理解 messages 的顺序

第三阶段最容易混乱的地方是消息顺序。

正确顺序应该是：

```text
UserMessage
AssistantMessage: 第一次模型输出，包含“我要调用工具”的文字
ToolMessage: 工具执行结果
AssistantMessage: 第二次模型输出，基于工具结果生成最终回答
```

为什么助手消息要在工具消息之前保存？

因为工具调用是助手这次响应提出的。

也就是说，不是工具凭空出现，而是：

```text
assistant -> tool_call -> tool
```

所以历史顺序应该保留这个因果关系。

第三阶段第二次调用模型时，Provider 应该收到完整历史：

```text
UserMessage
AssistantMessage
ToolMessage
```

这样模型才能根据 ToolMessage 继续回答。

## 12. 第八步：更新 CLI 模拟两次模型调用

文件：`src/cli/main.ts`

第二阶段的 `FauxProvider` 只有一组响应：

```ts
const provider = new FauxProvider([
  [
    "我会调用计算工具。",
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
```

第三阶段要改成两组响应：

```ts
const provider = new FauxProvider([
  [
    "我会调用计算工具。",
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
```

含义是：

- 第一次 `provider.stream(...)` 返回文本和工具调用。
- Agent 执行工具，把 `5` 保存成 `ToolMessage`。
- 第二次 `provider.stream(...)` 返回最终回答。

运行效果应该类似：

```text
我会调用计算工具。
[tool:calculator] 5
计算结果是 5。
```

这里仍然是模拟，所以输入什么都还是固定流程。真正根据输入动态决定工具调用，是后面接真实模型或做简单解析时再解决。

## 13. 第九步：更新工具调用测试

文件：`test/tool.test.ts`

第二阶段测试里，工具调用后 `messages.length` 是 3：

```text
UserMessage
AssistantMessage
ToolMessage
```

第三阶段工具调用后应该变成 4：

```text
UserMessage
AssistantMessage
ToolMessage
AssistantMessage
```

建议把测试改成：

```ts
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
```

这个测试的重点不是结果文本，而是：

- Provider 被调用了两次。
- 第二次调用模型时，消息历史里已经包含工具结果。
- `prompt(...)` 返回的是最终助手消息，不是第一次助手消息。

## 14. 第十步：更新未知工具测试

文件：`test/tool.test.ts`

未知工具也可以进入第二轮模型调用。

例如：

```ts
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
```

这个测试表达的是：即使工具失败，失败信息也应该变成 `ToolMessage`，再交给模型生成面向用户的最终回答。

这比第二阶段更接近真实 Agent 行为。

## 15. 第十一步：新增循环上限测试

文件：`test/agent.test.ts` 或 `test/tool.test.ts`

第三阶段必须测试 `maxIterations`，否则循环很容易悄悄失控。

建议新增：

```ts
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
```

这个测试模拟模型连续两次都要求工具调用。

因为 `maxIterations` 是 2，所以 Agent 在第二次工具调用后不能继续无限跑，而是返回 `max_iterations`。

## 16. 第十二步：更新事件顺序测试

文件：`test/tool.test.ts`

如果你按前面建议让工具消息也发 `message_start/message_end`，事件顺序会比第二阶段多。

工具调用加最终回答的大致顺序应该是：

```text
agent_start
message_start    user
message_end      user
message_start    assistant 第一次
message_update
tool_call_start
message_start    tool
message_end      tool
tool_call_end
message_end      assistant 第一次
message_start    assistant 第二次
message_update
message_end      assistant 第二次
agent_end
```

测试时可以只断言事件类型：

```ts
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
    "message_start",
    "message_update",
    "message_end",
    "agent_end",
  ],
);
```

这能帮你确认第三阶段不是简单多保存了一条消息，而是真的形成了更完整的生命周期。

## 17. 第十三步：运行检查

改完代码后先运行：

```bash
npm run check
```

如果类型检查通过，再运行：

```bash
npm test
```

第三阶段完成后，至少应该证明：

- 第一阶段文本流测试仍然通过。
- Provider 错误测试仍然通过。
- 工具调用后会触发第二次模型调用。
- 第二次模型调用能看到 ToolMessage。
- `prompt(...)` 返回最终助手消息。
- 未知工具错误也能回灌给模型。
- 超过 `maxIterations` 会停止。

## 18. 第三阶段完成后的运行效果

运行：

```bash
npm start -- "帮我计算 2 + 3"
```

预期输出类似：

```text
我会调用计算工具。
[tool:calculator] 5
计算结果是 5。
```

注意：如果你输入：

```bash
npm start -- "帮我计算 10 + 20"
```

它可能仍然显示 5。

原因和第二阶段一样：当前 `FauxProvider` 是固定脚本，不会理解你的输入。

第三阶段的目标不是解决动态理解，而是解决工具结果回灌和多步循环。

## 19. 第三阶段的核心理解

第三阶段最重要的是理解这句话：

```text
工具调用不是终点，工具结果要成为下一次模型调用的上下文。
```

第二阶段是：

```text
模型 -> 工具
```

第三阶段是：

```text
模型 -> 工具 -> 模型
```

这一步之后，Agent 才开始接近真实工作方式。

因为真实 Agent 往往不是一次模型调用完成任务，而是不断重复：

```text
思考 -> 调工具 -> 观察结果 -> 再思考 -> 再回答
```

第三阶段先实现最小版本：

```text
如果有工具调用，就再问一次模型。
如果没有工具调用，就结束。
如果超过次数，就停止。
```

这个设计简单，但已经足够支撑后面的阶段。

## 20. 手动实现建议顺序

建议你按下面顺序做：

1. 修改 `src/model/types.ts`，给 `AssistantStopReason` 增加 `"max_iterations"`。
2. 修改 `src/agent/event.ts`，让 `message_start/message_end` 支持 `ToolMessage`。
3. 修改 `src/agent/agent.ts`，给 `AgentOptions` 增加 `maxIterations`。
4. 在 `Agent` 里增加 `maxIterations` 字段，并设置默认值 5。
5. 在 `Agent` 里抽出 `runModelTurn(...)`，表示一次模型调用。
6. 修改 `executeToolCall(...)`，让工具消息也发 `message_start/message_end`。
7. 把 `prompt(...)` 改成循环调用 `runModelTurn(...)`。
8. 增加 `createMaxIterationsMessage(...)`。
9. 修改 `src/cli/main.ts`，让 `FauxProvider` 模拟两次模型调用。
10. 修改工具调用测试，断言 Provider 被调用两次。
11. 修改未知工具测试，断言错误工具结果也会回灌给模型。
12. 新增循环上限测试。
13. 运行 `npm run check`。
14. 运行 `npm test`。
15. 运行 `npm start -- "帮我计算 2 + 3"` 看 CLI 效果。

每完成 2 到 3 个小步骤，就可以跑一次 `npm run check`。第三阶段改动集中在 `Agent`，类型检查会很快帮你发现顺序和类型问题。

## 21. 第三阶段不要急着做的事

这一阶段先不要做：

- 不接真实 OpenAI API。
- 不让模型动态解析用户输入。
- 不增加文件读写工具。
- 不实现命令执行工具。
- 不做复杂工具 schema。
- 不做权限确认系统。
- 不做上下文压缩。
- 不做 UI。

这些以后都会有位置。

第三阶段只专注一个目标：

```text
让工具结果进入下一次模型调用，并让 Agent 返回最终助手回答。
```

