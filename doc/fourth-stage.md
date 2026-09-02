# 第四部分：输入感知 Provider 与动态工具触发

这份文档用于指导你从第三阶段继续手动实现第四阶段。

前三个阶段已经完成了 Agent 的基础骨架：

```text
第一阶段：用户输入 -> 模型流式文本 -> 助手消息
第二阶段：模型发出 tool_call -> Agent 执行工具 -> 保存 ToolMessage
第三阶段：工具结果回灌 -> 再次调用模型 -> 生成最终回答
```

但当前还有一个明显问题：`FauxProvider` 是固定脚本。

也就是说，不管用户输入什么，只要你在 `FauxProvider` 里写了 `tool_call`，Agent 就会调用工具。

第四阶段要解决的是：

```text
Provider 开始读取用户输入，并根据输入内容决定要不要发出 tool_call。
```

这一阶段仍然不接真实大模型。我们先做一个简单的 `RuleBasedProvider`，也就是“基于规则的模型替身”。它不会真正理解自然语言，但可以用简单规则模拟真实模型的决策过程。

## 1. 第四阶段要完成什么

第四阶段要把 CLI 从固定演示：

```text
不管输入什么 -> 固定调用 calculator -> 固定得到 5
```

推进到动态行为：

```text
输入：你好
输出：你好，我是一个练习用 Agent。

输入：帮我计算 10 + 20
输出：
我需要调用计算工具。
[tool:calculator] 30
计算结果是 30。
```

这一步的目标不是构建真正智能的模型，而是让你理解 Agent Harness 里一个非常重要的边界：

```text
Provider 决定是否请求工具。
Agent 执行 Provider 请求的工具。
Tool 完成具体能力。
```

## 2. 为什么不让 Agent 直接判断

你前面问过一个很关键的问题：当前是不是只要进了对话就调用工具？

答案是：不应该。

更合理的结构是：

```text
用户输入 -> Provider 判断是否需要工具 -> Provider 发出文本或 tool_call -> Agent 执行
```

如果把判断逻辑写在 Agent 里，Agent 会变得越来越重。

例如以后你有很多工具：

- `calculator`
- `read_file`
- `search_code`
- `run_command`
- `edit_file`

如果 Agent 自己判断，就会变成：

```ts
if (用户想计算) 调 calculator
if (用户想读文件) 调 read_file
if (用户想搜索代码) 调 search_code
```

这样 Agent 核心会逐渐混乱。

所以第四阶段要做的是：先让一个简单 Provider 模拟“模型判断”。

现在它是规则判断，将来可以替换成真实大模型判断。

## 3. 第四阶段新增的核心概念

### Tool Definition

Provider 决定是否调用工具时，需要知道当前有哪些工具可用。

但是 Provider 不应该拿到工具的 `execute(...)` 方法，因为执行工具是 Agent 的职责。

所以第四阶段建议新增一个更轻的工具定义：

```ts
export interface ModelToolDefinition {
  name: string;
  description: string;
}
```

它只告诉 Provider：

```text
现在有哪些工具，每个工具大概能做什么。
```

它不暴露工具执行函数。

### RuleBasedProvider

`RuleBasedProvider` 是一个输入感知的假模型。

它会读取 `ModelRequest.messages`，然后做简单判断：

```text
如果最后一条消息是用户消息，并且里面有算式：
  发出 calculator 工具调用

如果最后一条消息是工具消息：
  根据工具结果生成最终回答

否则：
  返回普通文本
```

它比 `FauxProvider` 更像真实模型，但仍然完全本地、可控、无费用。

### Provider 决策，Agent 执行

第四阶段最重要的是把这句话记住：

```text
Provider 只提出意图，Agent 负责执行动作。
```

Provider 可以说：

```ts
{
  type: "tool_call",
  toolCall: {
    id: "call_1",
    name: "calculator",
    input: { expression: "10 + 20" },
  },
}
```

但 Provider 不应该自己运行 `CalculatorTool`。

真正执行工具的仍然是 Agent。

## 4. 第四阶段完成后的目录结构

建议新增一个文件：

```text
src/model/rule-based-provider.ts
```

完成后结构大致是：

```text
my-agent-harness-practice/
├── doc/
│   ├── first-stage.md
│   ├── second-stage.md
│   ├── third-stage.md
│   └── fourth-stage.md
├── src/
│   ├── agent/
│   │   ├── agent.ts
│   │   └── event.ts
│   ├── cli/
│   │   └── main.ts
│   ├── model/
│   │   ├── faux-provider.ts
│   │   ├── provider.ts
│   │   ├── rule-based-provider.ts
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
└── tsconfig.json
```

第四阶段主要修改：

- 修改 `src/model/types.ts`
- 修改 `src/agent/agent.ts`
- 新增 `src/model/rule-based-provider.ts`
- 修改 `src/cli/main.ts`
- 修改 `src/index.ts`
- 修改或新增测试

## 5. 第一步：给 ModelRequest 增加工具定义

文件：`src/model/types.ts`

新增：

```ts
export interface ModelToolDefinition {
  name: string;
  description: string;
}
```

然后把 `ModelRequest` 从：

```ts
export interface ModelRequest {
  systemPrompt?: string;
  messages: readonly Message[];
  signal?: AbortSignal;
}
```

改成：

```ts
export interface ModelRequest {
  systemPrompt?: string;
  messages: readonly Message[];
  tools?: readonly ModelToolDefinition[];
  signal?: AbortSignal;
}
```

为什么要这样改？

因为 Provider 要负责判断是否需要工具。

但它只有知道“当前可用工具列表”，才能判断自己能不能发出某个 `tool_call`。

例如如果没有注册 `calculator`，Provider 就不应该请求调用 `calculator`。

## 6. 第二步：让 Agent 把工具定义传给 Provider

文件：`src/agent/agent.ts`

在 `runModelTurn(...)` 调用 Provider 前，当前大概是：

```ts
const stream = this.provider.stream({
  systemPrompt: this.systemPrompt,
  messages: requestMessages,
  signal,
});
```

第四阶段要改成：

```ts
const stream = this.provider.stream({
  systemPrompt: this.systemPrompt,
  messages: requestMessages,
  tools: this.tools.list().map((tool) => ({
    name: tool.name,
    description: tool.description,
  })),
  signal,
});
```

为什么只传 `name` 和 `description`？

因为 Provider 只需要知道工具能不能用、叫什么、做什么。

工具的 `execute(...)` 不应该传给 Provider。

这能保持边界清晰：

```text
Provider：判断要不要调用工具
Agent：真正执行工具
```

## 7. 第三步：新增 RuleBasedProvider 文件

文件：`src/model/rule-based-provider.ts`

先创建文件：

```ts
import type { ModelEvent, ModelRequest, ToolMessage, UserMessage } from "./types.ts";
import type { ModelProvider } from "./provider.ts";

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
```

这段代码先搭出结构：

- 没有消息时，返回默认问候。
- 最后一条是工具消息时，根据工具结果回答。
- 最后一条是用户消息时，根据用户输入判断。
- 其他情况返回普通文本。

这里用到了 `yield*`。

`yield*` 的意思是：把另一个生成器里的事件继续往外转发。

## 8. 第四步：实现用户输入判断

文件：`src/model/rule-based-provider.ts`

继续增加：

```ts
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
```

这一步做的是“最小规则判断”：

- 输入里有算式，并且有 `calculator` 工具，就发出 `tool_call`。
- 输入里有算式，但没有工具，就直接说明没有可用工具。
- 输入里没有算式，就普通回复。

这一步回答了你前面的问题：

```text
不是进入对话就调用工具。
只有 Provider 判断需要工具，并发出 tool_call，Agent 才调用工具。
```

## 9. 第五步：实现工具结果回答

文件：`src/model/rule-based-provider.ts`

新增：

```ts
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
```

为什么要看 `ToolMessage`？

因为第三阶段已经实现了工具结果回灌。

当 Agent 执行完工具后，下一次调用 Provider 时，最后一条消息就是工具消息。

这时 Provider 应该根据工具结果生成最终回答。

## 10. 第六步：实现工具可用性判断

文件：`src/model/rule-based-provider.ts`

新增：

```ts
function hasTool(request: ModelRequest, name: string): boolean {
  return request.tools?.some((tool) => tool.name === name) ?? false;
}
```

这一步很小，但很重要。

它让 Provider 不会凭空请求一个 Agent 没有注册的工具。

真实大模型里也是类似思想：模型应该只在给定工具列表里选择工具。

## 11. 第七步：实现算式提取

文件：`src/model/rule-based-provider.ts`

新增：

```ts
function extractArithmeticExpression(text: string): string | undefined {
  const match = /([0-9][0-9+\-*/().\s]*[0-9])/u.exec(text);
  return match?.[1]?.trim();
}
```

它的作用是从用户输入中抓出简单算式。

例如：

```text
帮我计算 10 + 20
```

会提取出：

```text
10 + 20
```

它只支持非常简单的情况，不支持复杂自然语言。

这是刻意的。第四阶段的重点不是做自然语言解析器，而是让 Provider 根据输入动态决定是否发出工具调用。

## 12. 第八步：更新 CLI 使用 RuleBasedProvider

文件：`src/cli/main.ts`

当前 CLI 可能仍然使用 `FauxProvider`：

```ts
import { FauxProvider } from "../model/faux-provider.ts";
```

第四阶段建议改成：

```ts
import { RuleBasedProvider } from "../model/rule-based-provider.ts";
```

然后把固定脚本：

```ts
const provider = new FauxProvider([...]);
```

改成：

```ts
const provider = new RuleBasedProvider();
```

Agent 仍然注册计算工具：

```ts
const agent = new Agent({
  provider,
  systemPrompt: "You are a concise assistant.",
  tools: [new CalculatorTool()],
});
```

这样 CLI 的行为就会从“固定演示”变成“输入感知”。

运行：

```bash
npm start -- "你好"
```

应该只返回普通文本。

运行：

```bash
npm start -- "帮我计算 10 + 20"
```

才会调用工具。

## 13. 第九步：更新统一导出

文件：`src/index.ts`

新增：

```ts
export { RuleBasedProvider } from "./model/rule-based-provider.ts";
```

并把 `ModelToolDefinition` 加进类型导出：

```ts
ModelToolDefinition,
```

这样外部可以直接从项目入口使用新的 Provider。

## 14. 第十步：添加 RuleBasedProvider 测试

建议新增文件：

```text
test/rule-based-provider.test.ts
```

第一个测试：普通输入不调用工具。

```ts
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
```

这个测试证明：

```text
不是每次对话都会调用工具。
```

第二个测试：包含算式时才调用工具。

```ts
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
```

这个测试证明：

```text
Provider 会从用户输入中提取算式，并请求 calculator。
```

第三个测试：没有注册工具时不发起工具调用。

```ts
test("does not call calculator when the tool is unavailable", async () => {
  const agent = new Agent({
    provider: new RuleBasedProvider(),
  });

  const result = await agent.prompt("帮我计算 10 + 20");

  assert.match(result.content[0]?.text ?? "", /没有可用的计算工具/);
  assert.equal(agent.messages.length, 2);
});
```

这个测试证明：

```text
Provider 会尊重 Agent 给出的可用工具列表。
```

## 15. 第十一步：运行检查

改完代码后先运行：

```bash
npm run check
```

再运行：

```bash
npm test
```

最后手动跑 CLI：

```bash
npm start -- "你好"
npm start -- "帮我计算 10 + 20"
```

预期行为：

```text
你好 -> 不调用工具
帮我计算 10 + 20 -> 调用 calculator -> 输出 30
```

## 16. 第四阶段完成后的变化

第四阶段完成后，你的项目会从固定脚本演示变成输入感知演示。

阶段对比：

```text
FauxProvider：
  你提前写什么事件，它就播放什么事件。

RuleBasedProvider：
  它会读取用户输入，根据简单规则决定返回文本还是发出 tool_call。
```

此时你的 Agent Harness 已经具备一个更完整的最小闭环：

```text
用户输入
-> Provider 判断是否需要工具
-> Agent 执行工具
-> 工具结果进入历史
-> Provider 根据工具结果生成最终回答
```

## 17. 第四阶段的核心理解

第四阶段最重要的理解是：

```text
工具不是 Agent 自动乱调的。
工具调用来自 Provider 的结构化请求。
```

在当前项目里：

```text
RuleBasedProvider 用规则模拟模型判断。
未来真实模型 Provider 用大模型判断。
Agent 始终只负责执行 tool_call。
```

这就是 Agent Harness 的稳定边界。

只要这个边界保持清楚，以后接真实模型时，Agent 主流程不用大改。你只需要把 `RuleBasedProvider` 替换成真实模型 Provider。

## 18. 第四阶段不要急着做的事

这一阶段先不要做：

- 不接真实 OpenAI API。
- 不做复杂自然语言理解。
- 不支持多种工具选择。
- 不增加文件读写工具。
- 不实现命令执行工具。
- 不做权限确认。
- 不做 UI。

第四阶段只专注一个目标：

```text
让 Provider 根据用户输入动态决定是否发出 calculator 的 tool_call。
```

## 19. 手动实现建议顺序

建议你按这个顺序实现：

1. 修改 `src/model/types.ts`，新增 `ModelToolDefinition`。
2. 给 `ModelRequest` 增加 `tools?: readonly ModelToolDefinition[]`。
3. 修改 `src/agent/agent.ts`，让 `runModelTurn(...)` 把工具名和描述传给 Provider。
4. 新建 `src/model/rule-based-provider.ts`。
5. 在 `RuleBasedProvider` 中先实现 `stream(...)` 的主分支。
6. 实现 `streamUserAnswer(...)`，根据用户输入决定是否请求工具。
7. 实现 `streamToolResultAnswer(...)`，根据工具结果生成最终回答。
8. 实现 `hasTool(...)`，让 Provider 只使用可用工具。
9. 实现 `extractArithmeticExpression(...)`，提取简单算式。
10. 修改 `src/cli/main.ts`，把 `FauxProvider` 换成 `RuleBasedProvider`。
11. 修改 `src/index.ts`，导出 `RuleBasedProvider` 和 `ModelToolDefinition`。
12. 新增 `test/rule-based-provider.test.ts`。
13. 运行 `npm run check`。
14. 运行 `npm test`。
15. 手动运行普通输入和计算输入，确认只有计算输入会调用工具。

