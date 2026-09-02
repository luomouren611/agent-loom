# Agent Loom

Agent Loom 是一个从零开始学习和实现 Agent Harness 的 TypeScript 练习项目。

这个项目不是一次性做出完整 Agent，而是按阶段逐步搭建：先实现最小对话骨架，再加入工具调用、工具结果回灌、多步循环，最后让 Provider 根据用户输入动态决定是否调用工具。

这里的 Agent Harness 可以理解为 Agent 的运行框架。它负责把用户输入、模型输出、工具调用、工具结果和消息历史组织成一条稳定的执行链路。

## 项目目标

这个项目主要用于学习：

- Agent 的基础运行结构
- 流式模型输出如何处理
- 消息协议如何设计
- Provider 抽象如何隔离模型实现
- 工具调用如何进入 Agent 流程
- 工具结果如何回灌给模型继续生成回答
- 如何用测试保护每个阶段的行为

项目当前仍然是学习版本，不接真实大模型，也不调用远程 API。当前使用本地的 `FauxProvider` 和 `RuleBasedProvider` 来模拟模型行为。

## 当前能力

当前项目已经支持：

- 命令行输入用户消息
- 流式输出助手文本
- 保存用户消息、助手消息和工具消息
- 通过事件监听 Agent 运行过程
- 注册和查找本地工具
- 执行 `calculator` 计算工具
- 将工具结果写入会话历史
- 工具调用后再次调用 Provider 生成最终回答
- 根据用户输入中的算式动态触发工具调用
- 使用 TypeScript 检查和 Node.js 内置测试验证行为

## 阶段拆解

### 第一阶段：流式对话 Agent 基础框架

第一阶段搭建了最小可运行的 Agent 主链路：

```text
用户输入 -> Agent -> ModelProvider -> 流式文本 -> 助手消息
```

这一阶段完成了：

- 定义基础消息类型：`UserMessage`、`AssistantMessage`、`TextContent`
- 定义模型请求和模型流式事件：`ModelRequest`、`ModelEvent`
- 抽象模型接口：`ModelProvider`
- 实现可测试的假模型：`FauxProvider`
- 实现 Agent 的消息保存和事件通知
- 实现 CLI 命令行入口
- 添加基础测试，验证文本流和错误处理

学习文档：[doc/first-stage.md](doc/first-stage.md)

### 第二阶段：工具调用 Agent 基础框架

第二阶段让 Agent 从“只能说话”变成“可以执行工具调用”：

```text
模型发出 tool_call -> Agent 查找工具 -> Agent 执行工具 -> 保存 ToolMessage
```

这一阶段完成了：

- 扩展 `ModelEvent`，支持 `tool_call`
- 新增 `ToolCall` 和 `ToolMessage`
- 新增工具协议：`Tool`、`ToolResult`
- 新增工具注册表：`ToolRegistry`
- 实现计算工具：`CalculatorTool`
- 让 Agent 在模型流中识别并执行工具调用
- 新增 `tool_call_start` 和 `tool_call_end` 事件
- 扩展 `FauxProvider`，让它可以模拟工具调用
- 添加工具调用和未知工具测试

学习文档：[doc/second-stage.md](doc/second-stage.md)

### 第三阶段：工具结果回灌与多步 Agent 循环

第三阶段解决了工具调用之后如何继续回答的问题：

```text
模型 -> 工具 -> 工具结果进入历史 -> 再次调用模型 -> 最终回答
```

这一阶段完成了：

- 给 Agent 增加 `maxIterations` 循环上限
- 把一次模型调用抽成 `runModelTurn(...)`
- 将 `prompt(...)` 改造成多步循环
- 让工具消息也进入 `message_start` / `message_end` 生命周期
- 工具调用后继续下一轮模型调用
- 让 `prompt(...)` 返回最终助手消息
- 增加循环上限停止原因：`max_iterations`
- 添加工具结果回灌和循环上限测试

学习文档：[doc/third-stage.md](doc/third-stage.md)

### 第四阶段：输入感知 Provider 与动态工具触发

第四阶段让工具调用从固定脚本变成根据用户输入动态触发：

```text
用户输入 -> Provider 判断是否需要工具 -> 发出 tool_call 或普通文本 -> Agent 执行
```

这一阶段完成了：

- 给 `ModelRequest` 增加可用工具定义
- 让 Agent 把工具名称和描述传给 Provider
- 新增 `RuleBasedProvider`
- 从用户输入中提取简单算式
- 只有识别到算式且存在 `calculator` 工具时才发出工具调用
- 根据 `ToolMessage` 生成最终回答
- CLI 改用 `RuleBasedProvider`
- 添加普通输入、计算输入、工具不可用等测试

学习文档：[doc/fourth-stage.md](doc/fourth-stage.md)

## 核心执行流程

当前项目的核心流程是：

```text
用户输入
  -> Agent.prompt(...)
  -> 保存 UserMessage
  -> 调用 Provider.stream(...)
  -> Provider 返回 text_delta 或 tool_call
  -> Agent 累计助手文本
  -> 如果出现 tool_call，Agent 执行工具
  -> 工具结果保存为 ToolMessage
  -> Agent 再次调用 Provider
  -> Provider 根据 ToolMessage 生成最终回答
  -> Agent 返回最终 AssistantMessage
```

其中职责边界是：

- `Provider`：决定输出文本，或者请求调用工具
- `Agent`：维护消息历史，调度模型和工具
- `Tool`：执行具体能力
- `CLI`：把 Agent 事件展示到终端

## 目录结构

```text
src/
├── agent/
│   ├── agent.ts
│   └── event.ts
├── cli/
│   └── main.ts
├── model/
│   ├── faux-provider.ts
│   ├── provider.ts
│   ├── rule-based-provider.ts
│   └── types.ts
├── tool/
│   ├── calculator-tool.ts
│   ├── registry.ts
│   └── types.ts
└── index.ts
```

主要文件说明：

- `src/agent/agent.ts`：Agent 核心调度逻辑
- `src/agent/event.ts`：Agent 生命周期事件定义
- `src/model/types.ts`：消息、模型请求、模型事件等协议类型
- `src/model/provider.ts`：模型 Provider 抽象接口
- `src/model/faux-provider.ts`：固定脚本模型，用于测试和学习
- `src/model/rule-based-provider.ts`：基于规则的输入感知模型
- `src/tool/types.ts`：工具协议类型
- `src/tool/registry.ts`：工具注册和查找
- `src/tool/calculator-tool.ts`：计算工具
- `src/cli/main.ts`：命令行入口
- `src/index.ts`：统一导出入口

## 快速开始

安装依赖：

```bash
npm install
```

运行 CLI：

```bash
npm start -- "你好"
```

计算示例：

```bash
npm start -- "帮我计算 10 + 20"
```

预期效果类似：

```text
我需要调用计算工具。
[tool:calculator] 30
计算结果是 30。
```

## 检查和测试

运行 TypeScript 检查：

```bash
npm run check
```

运行测试：

```bash
npm test
```

## 当前限制

当前项目仍然是学习版，有意保持简单：

- 没有接入真实大模型
- 只支持一个示例工具 `calculator`
- 算式提取只支持简单数字和运算符
- 没有文件读写工具
- 没有命令执行工具
- 没有权限确认系统
- 没有 UI

这些限制是阶段设计的一部分。项目会通过后续阶段逐步扩展。

## 学习路线

推荐按下面顺序阅读：

1. [第一阶段文档](doc/first-stage.md)
2. [第二阶段文档](doc/second-stage.md)
3. [第三阶段文档](doc/third-stage.md)
4. [第四阶段文档](doc/fourth-stage.md)

每个阶段都对应一次能力演进，适合一边阅读一边手动实现。

