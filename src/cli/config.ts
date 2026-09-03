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
