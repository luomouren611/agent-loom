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
