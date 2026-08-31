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
