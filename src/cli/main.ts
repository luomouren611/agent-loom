import { Agent } from "../agent/agent.ts";
import { CalculatorTool } from "../tool/calculator-tool.ts";
import { createProviderFromEnv } from "./config.ts";

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
    console.error('Usage: npm start -- "your message"');
    process.exitCode = 1;
} else {
    const provider = createProviderFromEnv();

    const agent = new Agent({
        provider,
        systemPrompt: "You are a concise assistant.",
        tools: [new CalculatorTool()],
    });

    agent.subscribe((event) => {
        if (event.type === "message_update") {
            process.stdout.write(event.delta);
        } else if (event.type === "tool_call_end") {
            const text = event.message.content[0]?.text ?? "";
            process.stdout.write(`\n[tool:${event.toolCall.name}] ${text}\n`);
        }
    });


    const result = await agent.prompt(prompt);
    process.stdout.write("\n");

    if (result.stopReason !== "stop") {
        console.error(result.errorMessage);
        process.exitCode = 1;
    }
}
