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
