# 第五部分：接入真实模型 Provider

这份文档用于指导你从第四阶段继续手动实现第五阶段。

前四个阶段里，我们一直使用本地 Provider：

```text
FauxProvider：固定脚本模型
RuleBasedProvider：基于规则的假模型
```

它们的好处是稳定、可控、不花钱，适合学习 Agent Harness 的结构。

第五阶段开始，我们要接入真实模型 API。

这一阶段的目标不是把项目一下子做成完整生产级 Agent，而是先实现一个最小真实 Provider，让你的 Agent 可以真的把用户输入发给模型，并接收模型的流式回答。

## 1. 先说明 API Key 和会员的关系

如果你有 ChatGPT Plus 或 Codex 的会员额度，它通常不能直接当作 OpenAI API Key 的可用额度。

OpenAI API 和 ChatGPT/Codex 订阅是两套计费体系。API 需要在 OpenAI Platform 单独创建 API Key，并配置 API 计费。

如果你已经充值了 DeepSeek API，那么第五阶段可以先用 DeepSeek。DeepSeek 官方 API 兼容 OpenAI API 格式，所以我们可以使用类似 OpenAI SDK 的调用方式，只需要改：

```text
baseURL
apiKey
model
```

这对学习很合适，因为你能先掌握 Provider 的真实 API 接入方式，而不用把 Agent 核心逻辑重写。

## 2. 第五阶段要完成什么

第五阶段要新增一个真实模型 Provider。

建议命名为：

```text
src/model/openai-compatible-provider.ts
```

它的职责是：

```text
接收 ModelRequest
-> 转换成 OpenAI-compatible Chat Completions 请求
-> 调用真实模型 API
-> 读取流式返回
-> 转换成项目内部的 ModelEvent
```

完成后，CLI 可以从：

```text
RuleBasedProvider
```

切换成：

```text
OpenAICompatibleProvider
```

然后你就可以通过环境变量选择使用 OpenAI 或 DeepSeek。

## 3. 为什么做 OpenAI-compatible Provider

你现在有两个可能的 API 来源：

```text
OpenAI API
DeepSeek API
```

如果分别写两个完全不同的 Provider，学习成本会变高。

更好的第五阶段设计是先做一个通用 Provider：

```ts
new OpenAICompatibleProvider({
  baseURL: "...",
  apiKey: "...",
  model: "...",
})
```

这样：

```text
OpenAI:
  baseURL 可以使用 SDK 默认值
  apiKey 使用 OPENAI_API_KEY
  model 使用 OpenAI 模型名

DeepSeek:
  baseURL 使用 https://api.deepseek.com
  apiKey 使用 DEEPSEEK_API_KEY
  model 使用 DeepSeek 模型名
```

这个设计能让你学到一个关键点：

```text
Agent 不关心你用的是 OpenAI 还是 DeepSeek。
Agent 只关心 Provider 是否实现了 ModelProvider 接口。
```

## 4. 第五阶段先做什么，不做什么

这一阶段先做：

- 安装 OpenAI JavaScript SDK
- 新增真实 Provider
- 从环境变量读取 API Key
- 支持普通文本流式输出
- 把内部消息转换成 API 消息
- 把 API 流式响应转换成 `text_delta`
- 保留 `FauxProvider` 和 `RuleBasedProvider` 作为测试用 Provider
- CLI 支持通过环境变量选择 Provider

这一阶段先不做：

- 不实现真实模型 tool calling
- 不把工具 schema 发给真实模型
- 不处理复杂多模态输入
- 不做上下文压缩
- 不做权限系统
- 不提交真实 API Key

为什么先不做真实模型工具调用？

因为它会同时引入三件复杂事：

```text
工具 JSON Schema
流式 tool_calls 参数拼接
工具结果按供应商格式回传
```

这几个点都重要，但如果放在第五阶段一起做，会把学习重点冲散。

所以第五阶段先让真实模型“说话”，第六阶段再让真实模型“调用工具”。

## 5. 第五阶段完成后的目录结构

建议新增：

```text
src/model/openai-compatible-provider.ts
```

如果你想让 CLI 配置更清楚，也可以新增：

```text
src/cli/config.ts
```

完成后结构大致是：

```text
my-agent-harness-practice/
├── doc/
│   ├── first-stage.md
│   ├── second-stage.md
│   ├── third-stage.md
│   ├── fourth-stage.md
│   └── fifth-stage.md
├── src/
│   ├── agent/
│   │   ├── agent.ts
│   │   └── event.ts
│   ├── cli/
│   │   ├── config.ts
│   │   └── main.ts
│   ├── model/
│   │   ├── faux-provider.ts
│   │   ├── openai-compatible-provider.ts
│   │   ├── provider.ts
│   │   ├── rule-based-provider.ts
│   │   └── types.ts
│   ├── tool/
│   │   ├── calculator-tool.ts
│   │   ├── registry.ts
│   │   └── types.ts
│   └── index.ts
└── test/
```

## 6. 第一步：安装 OpenAI SDK

先安装 SDK：

```bash
npm install openai --save-exact
```

为什么用 OpenAI SDK？

因为它可以同时用于：

- OpenAI 官方 API
- 兼容 OpenAI 格式的 API，例如 DeepSeek

为什么加 `--save-exact`？

因为学习项目也要养成稳定依赖习惯。固定版本后，后面别人安装时更容易复现你的环境。

安装后运行：

```bash
npm run check
```

确认依赖和类型没有破坏当前项目。

## 7. 第二步：设计 Provider 配置

新文件：`src/model/openai-compatible-provider.ts`

先定义配置类型：

```ts
export interface OpenAICompatibleProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}
```

含义：

- `apiKey`：真实 API Key，不要写死在代码里
- `model`：要调用的模型名
- `baseURL`：兼容服务地址，OpenAI 可以不传，DeepSeek 要传

然后定义类：

```ts
import OpenAI from "openai";
import type { ModelProvider } from "./provider.ts";
import type { ModelEvent, ModelRequest } from "./types.ts";

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id = "openai-compatible";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.model = options.model;
  }
}
```

这一步先只搭类结构。

## 8. 第三步：转换内部消息格式

真实 API 不认识你项目里的 `UserMessage`、`AssistantMessage`、`ToolMessage`。

所以需要把内部消息转成 Chat Completions 能接受的消息格式。

先导入 SDK 类型：

```ts
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
```

然后新增方法：

```ts
function toChatMessages(request: ModelRequest): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  if (request.systemPrompt) {
    messages.push({
      role: "system",
      content: request.systemPrompt,
    });
  }

  for (const message of request.messages) {
    const text = message.content.map((content) => content.text).join("");

    if (message.role === "user") {
      messages.push({ role: "user", content: text });
    } else if (message.role === "assistant") {
      messages.push({ role: "assistant", content: text });
    } else if (message.role === "tool") {
      messages.push({ role: "user", content: `工具 ${message.name} 返回：${text}` });
    }
  }

  return messages;
}
```

这里有一个刻意简化：

```text
ToolMessage 暂时转成 user 消息。
```

为什么？

因为第五阶段先不实现真实 API 的工具调用协议，只让真实模型能看到工具结果文本。

等第六阶段做真实工具调用时，再把 `ToolMessage` 转成 API 里的 `tool` 消息格式。

## 9. 第四步：实现 stream 方法

文件：`src/model/openai-compatible-provider.ts`

继续给类添加：

```ts
async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
  try {
    yield { type: "start" };

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: toChatMessages(request),
      stream: true,
    });

    for await (const chunk of stream) {
      if (request.signal?.aborted) {
        yield {
          type: "error",
          error: new Error("Model request aborted"),
        };
        return;
      }

      const delta = chunk.choices[0]?.delta.content;
      if (delta) {
        yield { type: "text_delta", delta };
      }
    }

    yield { type: "done" };
  } catch (error) {
    yield {
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

这个方法做了完整转换：

```text
ModelRequest -> API 请求 -> API stream chunk -> ModelEvent
```

也就是说，Agent 仍然只看到：

```ts
{ type: "text_delta", delta: "..." }
```

它不需要知道底层是 OpenAI 还是 DeepSeek。

## 10. 第五步：配置环境变量

不要把 API Key 写进代码，也不要提交到 GitHub。

PowerShell 临时配置 OpenAI：

```powershell
$env:OPENAI_API_KEY="你的 OpenAI API Key"
$env:MODEL_PROVIDER="openai"
$env:OPENAI_MODEL="gpt-5.6"
```

PowerShell 临时配置 DeepSeek：

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:MODEL_PROVIDER="deepseek"
$env:DEEPSEEK_MODEL="deepseek-v4-pro"
```

临时环境变量只在当前终端窗口有效。

如果你要长期保存，可以用：

```powershell
setx DEEPSEEK_API_KEY "你的 DeepSeek API Key"
```

但学习阶段我更建议先用 `$env:`，因为它不会长期留在系统环境里。

## 11. 第六步：新增 CLI 配置文件

新文件：`src/cli/config.ts`

它负责根据环境变量选择 Provider。

```ts
import type { ModelProvider } from "../model/provider.ts";
import { OpenAICompatibleProvider } from "../model/openai-compatible-provider.ts";
import { RuleBasedProvider } from "../model/rule-based-provider.ts";

export function createProviderFromEnv(): ModelProvider {
  const provider = process.env.MODEL_PROVIDER ?? "rule";

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required when MODEL_PROVIDER=deepseek");
    }

    return new OpenAICompatibleProvider({
      apiKey,
      baseURL: "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
    });
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when MODEL_PROVIDER=openai");
    }

    return new OpenAICompatibleProvider({
      apiKey,
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
    });
  }

  return new RuleBasedProvider();
}
```

为什么默认用 `RuleBasedProvider`？

因为这样没有配置 API Key 时，项目仍然可以本地运行。

真实 API 是可选能力，不应该破坏之前的学习阶段。

## 12. 第七步：更新 CLI 入口

文件：`src/cli/main.ts`

当前 CLI 可能直接创建：

```ts
const provider = new RuleBasedProvider();
```

第五阶段改成：

```ts
import { createProviderFromEnv } from "./config.ts";
```

然后：

```ts
const provider = createProviderFromEnv();
```

这样运行方式就变成：

```bash
npm start -- "你好"
```

默认仍然走本地规则 Provider。

如果设置了环境变量，就走真实 API Provider。

## 13. 第八步：更新统一导出

文件：`src/index.ts`

新增：

```ts
export {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderOptions,
} from "./model/openai-compatible-provider.ts";
```

这样外部也可以直接复用这个真实 Provider。

## 14. 第九步：添加单元测试

第五阶段不建议在普通 `npm test` 里直接调用真实 API。

原因：

- 需要 API Key
- 会产生费用
- 网络不稳定会导致测试不稳定

所以测试应该只测转换逻辑和配置逻辑。

建议把 `toChatMessages(...)` 导出为测试用函数：

```ts
export function toChatMessages(...)
```

新增测试文件：

```text
test/openai-compatible-provider.test.ts
```

测试重点：

- systemPrompt 会转成 system 消息
- UserMessage 会转成 user 消息
- AssistantMessage 会转成 assistant 消息
- ToolMessage 暂时会转成 user 消息

示例：

```ts
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
```

## 15. 第十步：手动测试 DeepSeek

如果你要先用 DeepSeek：

```powershell
$env:MODEL_PROVIDER="deepseek"
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-v4-pro"
npm start -- "你好，请用一句话介绍你自己"
```

如果成功，你应该看到真实模型流式输出。

如果报错，优先检查：

- `DEEPSEEK_API_KEY` 是否设置
- 账户余额是否可用
- `baseURL` 是否是 `https://api.deepseek.com`
- 模型名是否正确

## 16. 第十一步：手动测试 OpenAI

如果你要用 OpenAI API：

```powershell
$env:MODEL_PROVIDER="openai"
$env:OPENAI_API_KEY="你的 OpenAI API Key"
$env:OPENAI_MODEL="gpt-5.6"
npm start -- "你好，请用一句话介绍你自己"
```

注意：ChatGPT Plus/Codex 会员不等于 API 余额。你需要在 OpenAI Platform 单独有可用的 API Key 和 API 计费。

## 17. 第十二步：运行检查

实现完以后运行：

```bash
npm run check
npm test
```

然后分别测试：

```bash
npm start -- "你好"
```

如果有 DeepSeek Key：

```powershell
$env:MODEL_PROVIDER="deepseek"
npm start -- "你好"
```

如果有 OpenAI API Key：

```powershell
$env:MODEL_PROVIDER="openai"
npm start -- "你好"
```

## 18. 第五阶段完成后的变化

第五阶段完成后，你的项目会从纯本地模拟进入真实模型调用。

阶段对比：

```text
RuleBasedProvider：
  本地规则判断，适合学习和测试。

OpenAICompatibleProvider：
  调用真实模型 API，适合真实对话体验。
```

此时 Agent 核心不用变。

你只是换了 Provider：

```text
Agent + RuleBasedProvider
Agent + OpenAICompatibleProvider
```

这正是 `ModelProvider` 抽象的价值。

## 19. 第五阶段的核心理解

第五阶段最重要的是理解：

```text
真实模型接入不应该污染 Agent 主流程。
```

Agent 仍然只处理内部协议：

```text
ModelRequest
ModelEvent
Message
ToolMessage
```

真实 API 的请求格式、响应格式、流式 chunk，都应该被封装在 Provider 里。

这样以后你可以继续新增：

```text
OpenAIProvider
DeepSeekProvider
AnthropicProvider
LocalModelProvider
```

但 Agent 主流程仍然保持稳定。

## 20. 第五阶段不要急着做的事

这一阶段先不要做：

- 不把 API Key 写进代码
- 不把 `.env` 提交到 GitHub
- 不在单元测试里调用真实 API
- 不急着做真实工具调用
- 不改写 Agent 核心循环
- 不删除 `FauxProvider` 或 `RuleBasedProvider`

第五阶段只专注一个目标：

```text
新增真实模型 Provider，让 Agent 可以通过统一接口调用 OpenAI-compatible API。
```

## 21. 手动实现建议顺序

建议你按这个顺序实现：

1. 安装 OpenAI SDK：`npm install openai --save-exact`。
2. 新建 `src/model/openai-compatible-provider.ts`。
3. 定义 `OpenAICompatibleProviderOptions`。
4. 创建 `OpenAICompatibleProvider` 类并实现 `ModelProvider`。
5. 实现 `toChatMessages(...)`，把内部消息转换成 API 消息。
6. 实现 `stream(...)`，调用 `chat.completions.create({ stream: true })`。
7. 新建 `src/cli/config.ts`，根据环境变量创建 Provider。
8. 修改 `src/cli/main.ts`，使用 `createProviderFromEnv()`。
9. 修改 `src/index.ts`，导出新 Provider。
10. 新增转换逻辑测试，不在测试中调用真实 API。
11. 运行 `npm run check`。
12. 运行 `npm test`。
13. 不设置 API Key，运行默认本地 Provider。
14. 设置 DeepSeek 环境变量，手动测试真实模型。
15. 如果你有 OpenAI API Key，再测试 OpenAI。

