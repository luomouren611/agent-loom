# 第二部分：工具调用 Agent 基础框架

这份文档用于指导你从第一阶段继续手动实现第二阶段。

第一阶段已经完成了这条链路：

```text
用户输入 -> Agent -> ModelProvider -> 流式文本 -> 助手消息
```

第二阶段要在这条链路上加入“工具调用”能力，让 Agent 不只是返回文本，还可以在模型需要时调用本地工具，并把工具结果保存进对话历史。

这一阶段仍然不接真实大模型。我们继续使用 `FauxProvider` 来模拟模型发出工具调用请求，这样可以先把 Agent 的工具调用机制学清楚。

## 1. 第二阶段要完成什么

第二阶段目标是让 Agent 支持下面这条流程：

```text
用户输入
  -> 模型输出文本
  -> 模型请求调用工具
  -> Agent 找到对应工具
  -> Agent 执行工具
  -> Agent 保存工具结果
  -> Agent 结束本轮响应
```

例如用户输入：

```text
请帮我计算 2 + 3
```

模拟模型可以返回：

```text
我需要调用计算工具。
```

然后发出一个工具调用：

```ts
{
  name: "calculator",
  input: { expression: "2 + 3" }
}
```

Agent 执行工具后得到：

```text
5
```

最后把工具结果保存到消息历史中。

## 2. 为什么第二阶段要做工具调用

第一阶段的 Agent 只能“说话”。它接收用户输入，然后从 Provider 得到文字输出。

但真正的 Agent 通常还需要“做事”，比如：

- 读取文件。
- 搜索代码。
- 运行命令。
- 查询接口。
- 计算结果。
- 修改项目。

这些“做事”的能力就是工具。

所以第二阶段的核心不是写一个很强的工具，而是先定义清楚：

- 工具长什么样。
- 模型如何请求调用工具。
- Agent 如何找到工具。
- 工具结果如何回到消息历史。
- 出错时如何记录。

这一步完成后，后面才能继续做更复杂的 Agent 循环。

## 3. 第二阶段新增的核心概念

### Tool

Tool 是 Agent 可以调用的能力。

在代码里，一个工具至少需要包含：

- `name`：工具名称。
- `description`：工具说明。
- `execute(input)`：执行函数。

例如：

```ts
export interface Tool {
  readonly name: string;
  readonly description: string;
  execute(input: unknown, signal?: AbortSignal): Promise<ToolResult>;
}
```

这里先用 `unknown` 表示工具输入，意思是：不同工具需要的输入结构可能不同，Agent 核心不提前假设。

### Tool Call

Tool Call 是模型发出的“我要调用某个工具”的请求。

例如：

```ts
{
  id: "call_1",
  name: "calculator",
  input: { expression: "2 + 3" }
}
```

它表示：请调用名为 `calculator` 的工具，并传入 `{ expression: "2 + 3" }`。

### Tool Result

Tool Result 是工具执行后的结果。

例如：

```ts
{
  content: "5"
}
```

或者出错：

```ts
{
  content: "Unknown tool: calculator",
  isError: true
}
```

### Tool Message

第一阶段只有用户消息和助手消息。

第二阶段需要增加一种消息：工具消息。

它用于把工具执行结果保存回会话历史。

例如：

```ts
{
  role: "tool",
  toolCallId: "call_1",
  name: "calculator",
  content: [{ type: "text", text: "5" }],
  isError: false,
  timestamp: Date.now()
}
```

为什么要保存工具消息？

因为后面如果继续让模型根据工具结果生成最终回答，模型需要知道工具返回了什么。即使第二阶段先不做多轮续跑，也应该先把历史结构设计对。

## 4. 第二阶段完成后的目录结构

在第一阶段基础上，建议新增 `src/tool` 目录：

```text
my-agent-harness-practice/
├── doc/
│   ├── first-stage.md
│   └── second-stage.md
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
│   └── agent.test.ts
├── package.json
├── package-lock.json
└── tsconfig.json
```

第二阶段主要修改和新增这些文件：

- 修改 `src/model/types.ts`
- 新增 `src/tool/types.ts`
- 新增 `src/tool/registry.ts`
- 新增 `src/tool/calculator-tool.ts`
- 修改 `src/agent/event.ts`
- 修改 `src/agent/agent.ts`
- 修改 `src/model/faux-provider.ts`
- 修改 `src/cli/main.ts`
- 修改 `src/index.ts`
- 修改 `test/agent.test.ts`

## 5. 第一步：扩展模型和消息类型

文件：`src/model/types.ts`

第一阶段的 `ModelEvent` 只能表达：

- 开始
- 文本增量
- 完成
- 错误

第二阶段要让模型还能表达“工具调用”。

你需要新增工具调用相关类型：

```ts
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}
```

然后新增工具消息：

```ts
export interface ToolMessage {
  role: "tool";
  toolCallId: string;
  name: string;
  content: TextContent[];
  isError: boolean;
  timestamp: number;
}
```

接着把 `Message` 从：

```ts
export type Message = UserMessage | AssistantMessage;
```

改成：

```ts
export type Message = UserMessage | AssistantMessage | ToolMessage;
```

再把 `ModelEvent` 扩展为支持工具调用：

```ts
export type ModelEvent =
  | { type: "start" }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done" }
  | { type: "error"; error: Error };
```

这样做的含义是：模型流里不只可以流出文本，也可以流出一个结构化动作请求。

## 6. 第二步：新增工具协议

文件：`src/tool/types.ts`

新增目录：

```bash
mkdir src/tool
```

然后创建 `src/tool/types.ts`：

```ts
export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  execute(input: unknown, signal?: AbortSignal): Promise<ToolResult>;
}
```

这里定义的是 Agent 和工具之间的协议。

为什么工具返回 `content: string`？

因为第一阶段的消息内容只有文本，所以第二阶段先保持简单。后面如果要支持图片、文件、JSON 结构，再扩展 `content` 类型。

为什么 `execute` 接收 `AbortSignal`？

因为有些工具以后可能运行较久，比如读文件、跑命令、请求网络。保留 `signal` 可以让 Agent 中断工具执行。

## 7. 第三步：新增工具注册表

文件：`src/tool/registry.ts`

工具注册表负责保存和查找工具。

创建文件：

```ts
import type { Tool } from "./types.ts";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: readonly Tool[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}
```

为什么要有注册表？

因为 Agent 不应该在代码里写死：

```ts
if (name === "calculator") ...
if (name === "read_file") ...
```

写死以后工具一多，Agent 核心会越来越乱。

注册表的意义是把“工具管理”从 Agent 主流程里拆出去。Agent 只需要知道：根据名字找工具，然后执行。

## 8. 第四步：新增一个计算工具

文件：`src/tool/calculator-tool.ts`

第二阶段需要一个足够简单的工具来验证工具调用链路。建议先做计算工具。

创建文件：

```ts
import type { Tool, ToolResult } from "./types.ts";

interface CalculatorInput {
  expression?: unknown;
}

export class CalculatorTool implements Tool {
  readonly name = "calculator";
  readonly description = "Evaluate a simple arithmetic expression.";

  async execute(input: unknown): Promise<ToolResult> {
    if (!isCalculatorInput(input)) {
      return {
        content: "Calculator input must be an object with an expression string.",
        isError: true,
      };
    }

    if (!isSafeExpression(input.expression)) {
      return {
        content: "Calculator expression can only contain numbers, spaces, and arithmetic operators.",
        isError: true,
      };
    }

    const result = Function(`"use strict"; return (${input.expression});`)();

    return {
      content: String(result),
    };
  }
}

function isCalculatorInput(input: unknown): input is CalculatorInput {
  return typeof input === "object" && input !== null && "expression" in input;
}

function isSafeExpression(expression: unknown): expression is string {
  return (
    typeof expression === "string" &&
    /^[0-9+\-*/().\s]+$/.test(expression)
  );
}
```

这个工具里最重要的是输入检查。

因为 `Function(...)` 可以执行 JavaScript，如果不限制输入，会有安全风险。所以这里先只允许数字、空格和常见数学运算符。

这不是生产级计算器，只是第二阶段的学习工具。它的目的是让你看懂工具调用链路，而不是构建完整数学引擎。

## 9. 第五步：扩展 Agent 事件

文件：`src/agent/event.ts`

第一阶段的事件只围绕消息开始、消息更新、消息结束。

第二阶段建议增加工具事件：

```ts
import type {
  AssistantMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from "../model/types.ts";

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "message_start"; message: UserMessage | AssistantMessage | ToolMessage }
  | { type: "message_update"; message: AssistantMessage; delta: string }
  | { type: "message_end"; message: UserMessage | AssistantMessage | ToolMessage }
  | { type: "tool_call_start"; toolCall: ToolCall }
  | { type: "tool_call_end"; toolCall: ToolCall; message: ToolMessage }
  | { type: "agent_end"; message: AssistantMessage };
```

这样外部使用者可以知道工具什么时候开始、什么时候结束。

CLI 可以选择显示：

```text
[tool:calculator] 5
```

测试也可以验证工具调用事件是否按顺序发生。

## 10. 第六步：让 Agent 接收工具

文件：`src/agent/agent.ts`

第一阶段 `AgentOptions` 只有：

```ts
export interface AgentOptions {
  provider: ModelProvider;
  systemPrompt?: string;
}
```

第二阶段建议改成：

```ts
import { ToolRegistry } from "../tool/registry.ts";
import type { Tool } from "../tool/types.ts";

export interface AgentOptions {
  provider: ModelProvider;
  systemPrompt?: string;
  tools?: readonly Tool[];
}
```

然后在 `Agent` 类里增加：

```ts
private readonly tools: ToolRegistry;
```

构造函数里初始化：

```ts
this.tools = new ToolRegistry(options.tools);
```

这样 Agent 创建时就可以接收一批工具。

例如：

```ts
const agent = new Agent({
  provider,
  tools: [new CalculatorTool()],
});
```

## 11. 第七步：在 Agent 中处理工具调用事件

文件：`src/agent/agent.ts`

在 `for await (const event of stream)` 中，第一阶段只处理了：

```ts
if (event.type === "text_delta") {
  ...
} else if (event.type === "error") {
  ...
}
```

第二阶段要增加：

```ts
else if (event.type === "tool_call") {
  const toolMessage = await this.executeToolCall(event.toolCall, signal);
  this.messages.push(toolMessage);
}
```

然后新增私有方法：

```ts
private async executeToolCall(
  toolCall: ToolCall,
  signal?: AbortSignal,
): Promise<ToolMessage> {
  await this.emit({ type: "tool_call_start", toolCall });

  const tool = this.tools.get(toolCall.name);

  if (!tool) {
    const message = this.createToolMessage(
      toolCall,
      `Unknown tool: ${toolCall.name}`,
      true,
    );

    await this.emit({ type: "tool_call_end", toolCall, message });
    return message;
  }

  try {
    const result = await tool.execute(toolCall.input, signal);
    const message = this.createToolMessage(
      toolCall,
      result.content,
      result.isError ?? false,
    );

    await this.emit({ type: "tool_call_end", toolCall, message });
    return message;
  } catch (error) {
    const message = this.createToolMessage(
      toolCall,
      error instanceof Error ? error.message : String(error),
      true,
    );

    await this.emit({ type: "tool_call_end", toolCall, message });
    return message;
  }
}
```

再新增一个创建工具消息的辅助方法：

```ts
private createToolMessage(
  toolCall: ToolCall,
  content: string,
  isError: boolean,
): ToolMessage {
  return {
    role: "tool",
    toolCallId: toolCall.id,
    name: toolCall.name,
    content: [{ type: "text", text: content }],
    isError,
    timestamp: Date.now(),
  };
}
```

这样做以后，Agent 的职责变成：

- 从模型事件中识别工具调用。
- 根据工具名找到工具。
- 执行工具。
- 把工具结果转换成标准消息。
- 继续维护统一的消息历史。

## 12. 第八步：让 FauxProvider 支持工具调用

文件：`src/model/faux-provider.ts`

第一阶段的 `FauxProvider` 只接收 `string[][]`，也就是多组文本片段。

第二阶段建议把它扩展成既能返回文本，也能返回工具调用。

先定义脚本事件类型：

```ts
import type { ModelEvent, ModelRequest, ToolCall } from "./types.ts";

export type FauxScriptEvent =
  | string
  | { type: "tool_call"; toolCall: ToolCall };
```

然后把字段和构造函数改成：

```ts
private responses: FauxScriptEvent[][];

constructor(responses: FauxScriptEvent[][]) {
  this.responses = responses.map((events) => events.slice());
}
```

再改 `stream` 里的循环：

```ts
for (const scriptedEvent of events) {
  if (request.signal?.aborted) {
    yield {
      type: "error",
      error: new Error("Model request aborted"),
    };
    return;
  }

  if (typeof scriptedEvent === "string") {
    yield { type: "text_delta", delta: scriptedEvent };
  } else {
    yield scriptedEvent;
  }
}
```

这样测试里就可以模拟：

```ts
new FauxProvider([
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
])
```

这一步的含义是：我们不用真实模型，也能验证 Agent 是否会响应工具调用。

## 13. 第九步：更新 CLI

文件：`src/cli/main.ts`

CLI 需要注册工具：

```ts
import { CalculatorTool } from "../tool/calculator-tool.ts";
```

创建 Agent 时传入：

```ts
const agent = new Agent({
  provider,
  systemPrompt: "You are a concise assistant.",
  tools: [new CalculatorTool()],
});
```

然后扩展事件监听：

```ts
agent.subscribe((event) => {
  if (event.type === "message_update") {
    process.stdout.write(event.delta);
  } else if (event.type === "tool_call_end") {
    const text = event.message.content[0]?.text ?? "";
    process.stdout.write(`\n[tool:${event.toolCall.name}] ${text}\n`);
  }
});
```

同时可以把 FauxProvider 的模拟响应改成带工具调用：

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

运行后，你应该能看到助手文本和工具结果。

## 14. 第十步：更新统一导出

文件：`src/index.ts`

把第二阶段新增的类型和类导出：

```ts
export { CalculatorTool } from "./tool/calculator-tool.ts";
export { ToolRegistry } from "./tool/registry.ts";
export type { Tool, ToolResult } from "./tool/types.ts";
```

同时从 `src/model/types.ts` 导出里加入：

```ts
ToolCall,
ToolMessage,
```

这样外部使用项目时，不需要知道工具代码分散在哪些目录。

## 15. 第十一步：添加测试

文件：`test/agent.test.ts`

建议新增一个测试，验证 Agent 会执行工具调用：

```ts
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
      "tool_call_end",
      "message_end",
      "agent_end",
    ],
  );
});
```

还建议新增一个未知工具测试：

```ts
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
```

这两个测试分别覆盖：

- 工具正常执行。
- 模型请求不存在的工具。

## 16. 第十二步：运行检查

改完代码后运行：

```bash
npm run check
```

这个命令验证 TypeScript 类型是否正确。

然后运行：

```bash
npm test
```

这个命令验证行为是否正确。

第二阶段完成后，至少应该通过：

- 第一阶段已有测试。
- 工具调用测试。
- 未知工具测试。

## 17. 第二阶段完成后的运行效果

运行：

```bash
npm start -- "帮我计算 2 + 3"
```

你可能会看到类似输出：

```text
我会调用计算工具。
[tool:calculator] 5
```

注意，这里仍然是 FauxProvider 模拟的结果。

也就是说，Agent 并不是真的理解了“帮我计算 2 + 3”，而是我们先用假模型事件验证工具调用链路。

真实模型接入后，模型才会根据用户输入自己决定是否调用工具。

## 18. 第二阶段的核心理解

第二阶段最重要的是把 Agent 从“只会说话”推进到“可以执行动作”。

这一阶段有三个关键边界：

- 模型负责提出工具调用请求。
- Agent 负责调度和执行工具。
- 工具负责完成具体能力。

这三个边界分清楚以后，项目就不会乱。

如果把工具执行逻辑写进模型 Provider，Provider 会变得太重。

如果把所有工具都硬编码进 Agent，Agent 会越来越难维护。

如果工具不返回标准消息，后面的多轮推理就拿不到工具结果。

所以第二阶段真正学习的是：如何让模型、Agent、工具三者通过协议协作。

## 19. 手动实现建议顺序

建议你按这个顺序实现：

1. 先改 `src/model/types.ts`，增加 `ToolCall`、`ToolMessage` 和 `tool_call` 模型事件。
2. 新建 `src/tool/types.ts`，定义工具接口。
3. 新建 `src/tool/registry.ts`，实现工具注册表。
4. 新建 `src/tool/calculator-tool.ts`，实现一个最简单的工具。
5. 修改 `src/agent/event.ts`，增加工具事件。
6. 修改 `src/agent/agent.ts`，让 Agent 接收工具并执行工具调用。
7. 修改 `src/model/faux-provider.ts`，让假模型能模拟工具调用。
8. 修改 `src/cli/main.ts`，让命令行展示工具结果。
9. 修改 `src/index.ts`，导出新类型和新工具。
10. 修改 `test/agent.test.ts`，增加工具调用测试。
11. 运行 `npm run check`。
12. 运行 `npm test`。

每做完一个小步骤，都可以先运行一次 `npm run check`。这样如果有类型错误，范围会很小，比较容易定位。

## 20. 第二阶段不要急着做的事

这一阶段先不要做：

- 不接真实 OpenAI API。
- 不做复杂工具 schema。
- 不做多轮自动续跑。
- 不做文件读写工具。
- 不做命令执行工具。
- 不做权限系统。
- 不做 UI。

这些都很重要，但不是第二阶段的目标。

第二阶段只要把“模型请求工具 -> Agent 执行工具 -> 工具结果进入消息历史”跑通，就已经完成。

