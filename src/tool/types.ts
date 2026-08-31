export interface ToolResult {
    content: string;
    isError?: boolean;
}

export interface Tool {
    readonly name: string;
    readonly description: string;
    execute(input: unknown, signal?: AbortSignal): Promise<ToolResult>;
}
