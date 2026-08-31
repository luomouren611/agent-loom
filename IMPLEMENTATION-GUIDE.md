# Agent Harness 阶段 1：手动实现指南

这个目录是你的练习项目。当前只包含本指南，其余文件全部由你手动创建。

本阶段只实现以下链路：

```text
CLI -> Agent -> ModelProvider -> 流式事件 -> CLI
```

完成后，你的程序应当能够：

1. 接收一条命令行消息。
2. 使用伪 Provider 分段返回文本。
3. 在终端中实时输出每个文本片段。
4. 保存用户消息和助手消息。
5. 使用自动化测试验证消息、请求和事件顺序。

本阶段不实现工具调用、真实模型 API、会话文件和交互式 TUI。

## 实现规则

- 建议逐段手动输入，不要直接复制参考项目的完整文件。
- 每完成一个步骤，先理解这一层解决的问题，再进入下一步。
- 遇到错误时先阅读 TypeScript 或 Node 的完整错误信息。
- 可以查看 `D:\code\my-agent-harness`，但建议先独立思考后再对照。
- 完成整个阶段后先停下复盘，不继续实现工具调用。

## 步骤 0：确认运行环境

在 PowerShell 中进入本目录：

```powershell
cd D:\code\my-agent-harness-practice
node --version
npm --version
```

要求：

- Node.js 不低于 22.18。
- npm 能正常运行。

当前机器已经安装了满足要求的 Node.js。

## 步骤 1：创建 package.json

运行：

```powershell
npm init -y
```

然后用编辑器打开 `package.json`，将它整理为：

```json
{
  "name": "my-agent-harness-practice",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/cli/main.ts",
    "check": "tsc --noEmit",
    "test": "node --test test/*.test.ts"
  },
  "engines": {
    "node": ">=22.18.0"
  }
}
```

理解以下字段：

- `private`：防止误发布。
- `type: module`：使用 ESM 模块。
- `start`：直接运行 TypeScript CLI。
- `check`：只做类型检查，不生成 JavaScript。
- `test`：使用 Node 自带的测试运行器。

检查点：

```powershell
npm run
```

输出中应包含 `start`、`check` 和 `test`。

## 步骤 2：安装 TypeScript 开发依赖

运行：

```powershell
npm install --save-dev --save-exact typescript@5.9.3 @types/node@24.10.1 --ignore-scripts
```

这里使用：

- `--save-dev`：依赖只用于开发和类型检查。
- `--save-exact`：记录精确版本。
- `--ignore-scripts`：不运行依赖包的生命周期脚本。

完成后应出现：

```text
node_modules/
package-lock.json
```

检查 `package.json` 中是否自动增加：

```json
{
  "devDependencies": {
    "@types/node": "24.10.1",
    "typescript": "5.9.3"
  }
}
```

## 步骤 3：创建 TypeScript 配置

在项目根目录创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

重点理解：

- `strict` 强制严格类型检查。
- `noEmit` 表示不生成编译结果。
- `erasableSyntaxOnly` 限制为 Node 可直接运行的 TypeScript 语法。
- `allowImportingTsExtensions` 允许导入路径写成 `./types.ts`。

此时运行：

```powershell
npm run check
```

因为还没有源码，命令可能提示没有输入文件。这不代表配置方向错误；创建源码后再正式验证。

## 步骤 4：创建目录结构

运行：

```powershell
New-Item -ItemType Directory -Force src\model
New-Item -ItemType Directory -Force src\agent
New-Item -ItemType Directory -Force src\cli
New-Item -ItemType Directory -Force test
```

目标结构：

```text
my-agent-harness-practice/
├─ src/
│  ├─ model/
│  ├─ agent/
│  └─ cli/
├─ test/
├─ IMPLEMENTATION-GUIDE.md
├─ package.json
├─ package-lock.json
└─ tsconfig.json
```

先不要创建全部代码文件。后续每一步只创建一个文件。

## 步骤 5：定义消息和流式事件

创建：

```text
src/model/types.ts
```

依次定义以下类型。

### 5.1 文本内容块

```typescript
export interface TextContent {
  type: "text";
  text: string;
}
```

思考：为什么不直接把消息内容定义为 `string`？

答案暂时不要写进代码。后续加入图片和工具调用后再回看这个问题。

### 5.2 用户消息

```typescript
export interface UserMessage {
  role: "user";
  content: TextContent[];
  timestamp: number;
}
```

### 5.3 助手消息

先定义停止原因：

```typescript
export type AssistantStopReason = "stop" | "error" | "aborted";
```

然后定义消息：

```typescript
export interface AssistantMessage {
  role: "assistant";
  content: TextContent[];
  stopReason: AssistantStopReason;
  errorMessage?: string;
  timestamp: number;
}
```

### 5.4 消息联合类型

```typescript
export type Message = UserMessage | AssistantMessage;
```

这里的 `role` 是区分不同消息类型的判别字段。

### 5.5 模型请求

```typescript
export interface ModelRequest {
  systemPrompt?: string;
  messages: readonly Message[];
  signal?: AbortSignal;
}
```

思考：为什么 `messages` 使用 `readonly`？

### 5.6 模型流式事件

```typescript
export type ModelEvent =
  | { type: "start" }
  | { type: "text_delta"; delta: string }
  | { type: "done" }
  | { type: "error"; error: Error };
```

检查点：

```powershell
npm run check
```

应该通过类型检查。

## 步骤 6：定义 Provider 接口

创建：

```text
src/model/provider.ts
```

先导入类型：

```typescript
import type { ModelEvent, ModelRequest } from "./types.ts";
```

然后定义：

```typescript
export interface ModelProvider {
  readonly id: string;
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}
```

这个接口是本阶段最重要的边界。

Agent 以后只能依赖 `ModelProvider`，不能直接依赖 OpenAI、Anthropic 或其他 SDK。

完成后回答：

1. `AsyncIterable` 和 `Promise` 有什么区别？
2. 为什么 `id` 是只读字段？
3. 如果以后增加 `OpenAIProvider`，是否需要修改 Agent？

再次运行：

```powershell
npm run check
```

## 步骤 7：实现 FauxProvider

创建：

```text
src/model/faux-provider.ts
```

导入：

```typescript
import type { ModelProvider } from "./provider.ts";
import type { ModelEvent, ModelRequest } from "./types.ts";
```

先创建类和状态：

```typescript
export class FauxProvider implements ModelProvider {
  readonly id = "faux";
  readonly requests: ModelRequest[] = [];
  private responses: string[][];

  constructor(responses: string[][]) {
    this.responses = responses.map((chunks) => chunks.slice());
  }
}
```

然后在类中加入异步生成器：

```typescript
async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
  this.requests.push({
    ...request,
    messages: request.messages.slice(),
  });

  const chunks = this.responses.shift();
  if (!chunks) {
    yield {
      type: "error",
      error: new Error("No scripted faux response remains"),
    };
    return;
  }

  yield { type: "start" };

  for (const chunk of chunks) {
    if (request.signal?.aborted) {
      yield {
        type: "error",
        error: new Error("Model request aborted"),
      };
      return;
    }

    yield { type: "text_delta", delta: chunk };
  }

  yield { type: "done" };
}
```

注意：这个方法必须写在 `FauxProvider` 类的大括号内部。

理解执行过程：

```typescript
new FauxProvider([
  ["你", "好"],
  ["第", "二", "次", "回答"],
]);
```

表示：

- 第一次 `stream()` 返回“你”“好”。
- 第二次 `stream()` 返回“第”“二”“次”“回答”。
- 第三次 `stream()` 返回错误事件。

检查点：

```powershell
npm run check
```

## 步骤 8：定义 Agent 事件

创建：

```text
src/agent/events.ts
```

输入：

```typescript
import type { AssistantMessage, UserMessage } from "../model/types.ts";

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "message_start"; message: UserMessage | AssistantMessage }
  | { type: "message_update"; message: AssistantMessage; delta: string }
  | { type: "message_end"; message: UserMessage | AssistantMessage }
  | { type: "agent_end"; message: AssistantMessage };

export type AgentEventListener =
  (event: AgentEvent) => void | Promise<void>;
```

思考：为什么 Agent 不直接调用 `console.log()`，而是发送事件？

## 步骤 9：创建 Agent 外壳

创建：

```text
src/agent/agent.ts
```

这个文件分五小步完成，不要一次写完。

### 9.1 导入依赖

```typescript
import type { ModelProvider } from "../model/provider.ts";
import type {
  AssistantMessage,
  Message,
  TextContent,
  UserMessage,
} from "../model/types.ts";
import type { AgentEvent, AgentEventListener } from "./events.ts";
```

### 9.2 定义构造参数

```typescript
export interface AgentOptions {
  provider: ModelProvider;
  systemPrompt?: string;
}
```

### 9.3 定义状态和构造函数

```typescript
export class Agent {
  readonly messages: Message[] = [];
  private readonly listeners = new Set<AgentEventListener>();
  private readonly provider: ModelProvider;
  private readonly systemPrompt?: string;

  constructor(options: AgentOptions) {
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
  }
}
```

这里使用显式字段赋值，不使用构造函数参数属性。

### 9.4 加入订阅和事件发送

在类中加入：

```typescript
subscribe(listener: AgentEventListener): () => void {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
}

private async emit(event: AgentEvent): Promise<void> {
  for (const listener of this.listeners) {
    await listener(event);
  }
}
```

`subscribe()` 返回的是取消订阅函数。

### 9.5 实现 prompt()

先写方法签名：

```typescript
async prompt(text: string, signal?: AbortSignal): Promise<AssistantMessage> {
  // 后续内容写在这里
}
```

第一部分：创建并保存用户消息。

```typescript
const userMessage: UserMessage = {
  role: "user",
  content: [{ type: "text", text }],
  timestamp: Date.now(),
};

await this.emit({ type: "agent_start" });
await this.emit({ type: "message_start", message: userMessage });
this.messages.push(userMessage);
await this.emit({ type: "message_end", message: userMessage });
```

第二部分：创建空助手消息。

```typescript
const textContent: TextContent = { type: "text", text: "" };
const assistantMessage: AssistantMessage = {
  role: "assistant",
  content: [textContent],
  stopReason: "stop",
  timestamp: Date.now(),
};

await this.emit({ type: "message_start", message: assistantMessage });
```

第三部分：调用 Provider 并累计文本。

```typescript
try {
  const stream = this.provider.stream({
    systemPrompt: this.systemPrompt,
    messages: this.messages.slice(),
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
```

第四部分：保存并返回助手消息。

```typescript
this.messages.push(assistantMessage);
await this.emit({ type: "message_end", message: assistantMessage });
await this.emit({ type: "agent_end", message: assistantMessage });
return assistantMessage;
```

确保以上四部分都在 `prompt()` 方法内部。

运行：

```powershell
npm run check
```

先解决所有类型错误，再继续。

## 步骤 10：实现 CLI

创建：

```text
src/cli/main.ts
```

输入：

```typescript
import { Agent } from "../agent/agent.ts";
import { FauxProvider } from "../model/faux-provider.ts";

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  console.error('Usage: npm start -- "your message"');
  process.exitCode = 1;
} else {
  const provider = new FauxProvider([
    ["收到。", "你输入了：", prompt],
  ]);

  const agent = new Agent({
    provider,
    systemPrompt: "You are a concise assistant.",
  });

  agent.subscribe((event) => {
    if (event.type === "message_update") {
      process.stdout.write(event.delta);
    }
  });

  const result = await agent.prompt(prompt);
  process.stdout.write("\n");

  if (result.stopReason !== "stop") {
    console.error(result.errorMessage);
    process.exitCode = 1;
  }
}
```

运行：

```powershell
npm start -- "你好，Agent"
```

预期输出：

```text
收到。你输入了：你好，Agent
```

然后测试空输入：

```powershell
npm start
```

预期输出使用说明，并返回非零退出码。

## 步骤 11：添加自动化测试

创建：

```text
test/agent.test.ts
```

先写正常响应测试：

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "../src/agent/agent.ts";
import type { AgentEvent } from "../src/agent/events.ts";
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
```

再写错误测试：

```typescript
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
```

运行：

```powershell
npm test
```

预期结果：

```text
tests 2
pass 2
fail 0
```

## 步骤 12：创建公共导出入口

创建：

```text
src/index.ts
```

输入：

```typescript
export { Agent, type AgentOptions } from "./agent/agent.ts";
export type { AgentEvent, AgentEventListener } from "./agent/events.ts";
export { FauxProvider } from "./model/faux-provider.ts";
export type { ModelProvider } from "./model/provider.ts";
export type {
  AssistantMessage,
  AssistantStopReason,
  Message,
  ModelEvent,
  ModelRequest,
  TextContent,
  UserMessage,
} from "./model/types.ts";
```

`index.ts` 定义这个包准备暴露给外部使用者的公共 API。

## 步骤 13：最终验证

依次运行：

```powershell
npm run check
npm test
npm start -- "你好，Agent"
```

必须同时满足：

- TypeScript 没有错误。
- 两个测试通过。
- CLI 能分段输出回答。
- `Agent.messages` 包含用户和助手两条消息。
- Provider 错误被保存为助手错误消息，而不是导致未处理异常。

## 步骤 14：手动实验

不要立刻进入下一阶段。先完成以下实验。

### 实验 A：增加流式片段

将 CLI 的预设响应改成五个片段，观察输出是否仍然连续。

### 实验 B：连续调用两次 prompt

临时在 CLI 中依次调用两次：

```typescript
await agent.prompt("第一次");
await agent.prompt("第二次");
```

同时给 `FauxProvider` 两组响应。检查第二次请求中的 `messages` 数量。

### 实验 C：取消订阅

保存 `subscribe()` 的返回值并调用它，确认之后不再输出增量事件。

### 实验 D：观察引用变化

在 `message_update` 中打印 `event.message.content`，观察同一个助手消息如何逐步增长。

## 阶段完成后的复盘问题

在进入工具调用前，请能够用自己的话回答：

1. `ModelProvider` 解决了什么耦合问题？
2. `ModelEvent` 为什么使用联合类型？
3. `AsyncIterable` 为什么适合流式模型输出？
4. Agent 为什么保存结构化消息，而不是字符串？
5. Agent 为什么发出事件，而不直接输出到终端？
6. `FauxProvider` 为什么比真实 API 更适合单元测试？
7. Provider 抛出异常时，Agent 如何将它转换为可保存的消息？
8. 当前实现为什么还不能称为完整的 Agent Loop？

完成后，把你的实现结果、错误信息或上述问题的答案发回来。确认这一阶段理解清楚后，再开始阶段 2。
