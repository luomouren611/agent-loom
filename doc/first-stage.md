# 第一部分：流式对话 Agent 基础框架

这份文档用于回顾第一阶段已经完成的内容：项目是什么、用了哪些基础技术、每个文件负责什么，以及一次用户输入是如何从 CLI 进入 Agent、再通过模型 Provider 变成流式输出的。

## 1. 第一部分完成了什么

第一部分搭建的是一个最小可运行的 Agent Harness。

这里的 Agent Harness 可以理解为“Agent 的运行框架”。它暂时不追求真实调用大模型，也不处理工具调用、任务规划、文件修改这些复杂能力，而是先把 Agent 最核心的一条链路跑通：

1. 接收用户输入。
2. 把用户输入保存成标准消息。
3. 调用一个模型提供者，也就是 `ModelProvider`。
4. 逐段接收模型返回的文本。
5. 一边输出文本，一边累计成完整助手消息。
6. 把用户消息和助手消息都保存到会话历史中。
7. 在关键节点发出事件，方便 CLI、测试或将来的 UI 监听。

这一阶段的重点不是“模型有多聪明”，而是先把 Agent 的骨架搭稳。后面接真实模型、工具调用、任务循环时，都会复用这套结构。

## 2. 第一部分用到的东西

### TypeScript

项目使用 TypeScript 来写代码。它的作用是提前定义清楚数据结构，比如用户消息是什么样、助手消息是什么样、模型事件有哪些类型。

这样做的好处是：当项目变复杂后，很多错误可以在运行前被 TypeScript 检查出来。

例如 `AssistantMessage` 必须有：

- `role: "assistant"`
- `content`
- `stopReason`
- `timestamp`

如果后面写代码时漏掉这些字段，`npm run check` 就能发现问题。

### Node.js

项目运行在 Node.js 上。当前 `package.json` 要求 Node 版本至少是 `22.18.0`。

第一阶段直接用 Node 运行 `.ts` 文件：

```bash
npm start -- "你好"
```

这是因为当前 Node 版本已经支持更现代的 TypeScript 运行方式。项目也通过 `tsconfig.json` 的 `erasableSyntaxOnly` 限制，只使用可以被 Node 安全处理的 TypeScript 写法。

### ESM 模块

`package.json` 里设置了：

```json
"type": "module"
```

这表示项目使用 ESM 模块系统，也就是：

```ts
import { Agent } from "../agent/agent.ts";
export { Agent } from "./agent/agent.ts";
```

所以项目里的导入路径都显式写了 `.ts` 后缀。

### AsyncIterable

模型返回不是一次性返回完整文本，而是通过 `AsyncIterable<ModelEvent>` 一段一段返回。

这就是流式输出的基础。

例如 `FauxProvider` 会依次产生：

```ts
{ type: "start" }
{ type: "text_delta", delta: "你" }
{ type: "text_delta", delta: "好" }
{ type: "done" }
```

Agent 使用：

```ts
for await (const event of stream) {
  ...
}
```

来逐个处理这些事件。

### node:test

测试使用 Node 自带的 `node:test`，不需要额外引入 Jest 或 Vitest。

测试文件在 `test/agent.test.ts`，运行方式是：

```bash
npm test
```

第一阶段主要测试两件事：

- 正常流式返回时，Agent 能正确累计文本和保存会话。
- Provider 出错时，Agent 能把错误标准化成助手消息。

## 3. 目录结构

当前第一阶段的目录结构如下：

```text
my-agent-harness-practice/
├── doc/
│   └── first-stage.md
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
│   └── index.ts
├── test/
│   └── agent.test.ts
├── .gitignore
├── IMPLEMENTATION-GUIDE.md
├── package.json
├── package-lock.json
└── tsconfig.json
```

可以把它分成四层：

- `src/model`：定义模型相关协议。
- `src/agent`：实现 Agent 的核心运行逻辑。
- `src/cli`：提供命令行入口。
- `test`：验证第一阶段行为是否正确。

## 4. 各个文件的作用

### `package.json`

这是项目的 Node 配置文件。

它定义了项目名称、模块类型、脚本命令、Node 版本要求和开发依赖。

当前最重要的脚本是：

```json
"start": "node src/cli/main.ts",
"check": "tsc --noEmit",
"test": "node --test test/*.test.ts"
```

它们分别表示：

- `npm start`：运行命令行 Agent。
- `npm run check`：只做 TypeScript 类型检查，不生成构建产物。
- `npm test`：运行测试文件。

### `tsconfig.json`

这是 TypeScript 配置文件。

它告诉 TypeScript 这个项目应该用什么规则检查代码。

几个关键配置：

- `strict: true`：开启严格类型检查。
- `noEmit: true`：只检查类型，不输出 JavaScript 文件。
- `module: "NodeNext"`：使用适配 Node 的现代模块解析方式。
- `allowImportingTsExtensions: true`：允许导入路径写 `.ts` 后缀。
- `erasableSyntaxOnly: true`：限制使用 Node 可以直接处理的 TypeScript 语法。

这个配置让项目保持简单：第一阶段先不引入构建流程，只专注于源码结构和运行逻辑。

### `.gitignore`

这个文件告诉 Git 哪些文件不应该提交。

当前忽略了：

- `node_modules/`
- `dist/`
- `coverage/`
- `.env`
- 日志文件
- 系统临时文件

其中最重要的是 `node_modules/` 和 `.env`。前者体积很大，不应该上传；后者可能包含密钥，也不应该上传。

### `src/model/types.ts`

这是第一阶段最底层的数据结构定义文件。

它定义了：

- `TextContent`：文本内容块。
- `UserMessage`：用户消息。
- `AssistantMessage`：助手消息。
- `AssistantStopReason`：助手停止原因。
- `Message`：用户消息和助手消息的联合类型。
- `ModelRequest`：发送给模型的请求。
- `ModelEvent`：模型流式返回的事件。

这个文件的作用是统一协议。

后面的 `Agent`、`Provider`、测试和 CLI 都围绕这些类型工作。只要协议稳定，内部实现就可以逐步替换，例如后面把 `FauxProvider` 换成真实 OpenAI Provider。

### `src/model/provider.ts`

这个文件定义了模型提供者接口：

```ts
export interface ModelProvider {
  readonly id: string;
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}
```

它不关心具体模型是谁，只要求对方能做到两件事：

- 有一个 `id`，用于标识 Provider。
- 有一个 `stream` 方法，接收 `ModelRequest`，返回流式 `ModelEvent`。

这个接口是后面扩展真实模型的关键。

当前 Agent 并不依赖某个具体模型类，而是依赖 `ModelProvider` 这个抽象。因此后面可以接入不同模型，只要它们实现同一个接口。

### `src/model/faux-provider.ts`

这是一个假的模型提供者，用于学习和测试。

它不会联网，也不会调用真实 AI。它只会按照构造函数里提前传入的文本片段，模拟模型流式返回。

例如：

```ts
new FauxProvider([["你", "好"]])
```

它会在调用时依次返回：

```text
你
好
```

这个文件的价值很大，因为它让第一阶段可以在没有 API Key、没有网络、没有真实模型费用的情况下测试 Agent 主流程。

它还记录了收到的请求：

```ts
readonly requests: ModelRequest[] = [];
```

测试可以通过这个字段确认 Agent 是否把 `systemPrompt` 和消息历史正确传给了 Provider。

### `src/agent/event.ts`

这个文件定义 Agent 自己对外发出的事件。

这些事件不是模型事件，而是 Agent 运行过程中的生命周期事件。

当前有：

- `agent_start`：Agent 开始处理一次输入。
- `message_start`：某条消息开始。
- `message_update`：助手消息新增了一段文本。
- `message_end`：某条消息结束。
- `agent_end`：Agent 完成一次输入处理。

为什么需要事件？

因为 Agent 核心逻辑不应该直接绑定 CLI 或 UI。Agent 只负责发事件，外部想怎么展示都可以。

当前 CLI 监听 `message_update`，然后把每个 `delta` 输出到终端。后面如果做网页 UI，也可以监听同样的事件来更新页面。

### `src/agent/agent.ts`

这是第一阶段最核心的文件。

它实现了 `Agent` 类，负责把用户输入变成一次完整的 Agent 运行。

核心字段：

- `messages`：保存当前会话历史。
- `listeners`：保存事件监听函数。
- `provider`：保存模型提供者。
- `systemPrompt`：保存系统提示词。

核心方法：

- `subscribe(listener)`：注册事件监听器，并返回取消订阅函数。
- `emit(event)`：按顺序通知所有监听器。
- `prompt(text, signal?)`：处理一次用户输入。

`prompt` 方法的流程是：

1. 创建用户消息。
2. 发出 `agent_start` 和用户消息相关事件。
3. 把用户消息保存到 `messages`。
4. 创建空的助手消息。
5. 调用 `provider.stream(...)`。
6. 遇到 `text_delta` 时，把文本追加到助手消息里。
7. 遇到错误时，把停止原因改成 `error` 或 `aborted`。
8. 把助手消息保存到 `messages`。
9. 发出结束事件。
10. 返回助手消息。

这就是第一阶段的核心链路。

### `src/cli/main.ts`

这是命令行入口。

运行：

```bash
npm start -- "你好"
```

时，Node 会执行这个文件。

它做了几件事：

1. 从命令行参数读取用户输入。
2. 如果没有输入，就打印使用方式。
3. 创建 `FauxProvider`，模拟一段模型回复。
4. 创建 `Agent`。
5. 订阅 Agent 事件。
6. 当收到 `message_update` 时，把文本片段输出到终端。
7. 调用 `agent.prompt(prompt)` 开始执行。
8. 如果结果不是正常停止，就输出错误信息。

这个文件不是 Agent 核心，只是 Agent 的一个使用者。

第一阶段把 CLI 和 Agent 分开，是为了后面可以轻松增加其他入口，比如 Web UI、脚本调用或测试调用。

### `src/index.ts`

这是项目的统一导出口。

它把外部可能用到的类和类型集中导出。

例如后面其他项目或测试可以从这里导入：

```ts
export { Agent, type AgentOptions } from "./agent/agent.ts";
export { FauxProvider } from "./model/faux-provider.ts";
```

第一阶段它的作用还不明显，但随着项目变大，统一导出口能减少外部使用者对内部目录结构的依赖。

### `test/agent.test.ts`

这是第一阶段的测试文件。

第一个测试验证正常流程：

- FauxProvider 返回两段文本。
- Agent 把两段文本合并成完整助手回复。
- Agent 保存了用户消息和助手消息。
- Provider 收到了正确的 `systemPrompt`。
- Agent 发出的事件顺序符合预期。

第二个测试验证错误流程：

- FauxProvider 没有可用回复。
- Agent 不让错误直接崩溃。
- Agent 把错误保存成一条助手消息。
- 助手消息的 `stopReason` 是 `error`。

这些测试确保第一阶段的主流程是稳定的。

### `IMPLEMENTATION-GUIDE.md`

这是手动实现指南。

它主要服务于“自己从零敲一遍”的学习过程，记录创建项目、安装依赖、创建文件、写代码、运行检查和测试的具体步骤。

它和当前这份文档的区别是：

- `IMPLEMENTATION-GUIDE.md` 偏操作步骤。
- `doc/first-stage.md` 偏理解和复习。

## 5. 一次运行的完整链路

以这个命令为例：

```bash
npm start -- "你好"
```

运行过程如下：

1. `src/cli/main.ts` 读取到输入 `"你好"`。
2. CLI 创建 `FauxProvider`，准备模拟回复。
3. CLI 创建 `Agent`，并传入 Provider 和系统提示词。
4. CLI 通过 `agent.subscribe(...)` 监听 `message_update`。
5. CLI 调用 `agent.prompt("你好")`。
6. Agent 创建用户消息，并保存到 `messages`。
7. Agent 创建空助手消息。
8. Agent 调用 `provider.stream(...)`。
9. FauxProvider 一段一段产生文本。
10. Agent 收到 `text_delta` 后追加到助手消息。
11. Agent 发出 `message_update`。
12. CLI 收到事件，把文本片段输出到终端。
13. 流结束后，Agent 保存助手消息。
14. Agent 返回最终助手消息。

可以把它理解成：

```text
CLI 输入
  -> Agent.prompt
  -> 保存用户消息
  -> ModelProvider.stream
  -> 接收 text_delta
  -> 更新助手消息
  -> 发事件给 CLI
  -> 保存助手消息
  -> 返回结果
```

## 6. 当前阶段还没有做什么

第一阶段故意没有做以下事情：

- 没有接真实大模型。
- 没有工具调用。
- 没有多轮任务循环。
- 没有让 Agent 读写文件。
- 没有复杂错误恢复。
- 没有上下文压缩。
- 没有 UI。

这些不是缺陷，而是阶段划分。

第一阶段只解决一个问题：先让“用户消息 -> 模型流 -> 助手消息 -> 事件输出”这条主链路成立。

## 7. 学习时要抓住的核心概念

第一阶段最重要的概念有四个：

- 消息协议：用标准结构保存用户和助手的对话。
- Provider 抽象：Agent 不直接依赖具体模型，只依赖统一接口。
- 流式事件：模型输出可以一段一段返回，Agent 逐段处理。
- Agent 事件：Agent 内部状态变化可以通知外部使用者。

这四个概念是后面阶段的基础。

第二阶段如果继续推进，通常会在这个基础上加入工具调用。到那时，Agent 不只是接收文本和返回文本，还会根据模型指令去调用工具，并把工具结果继续交给模型。

