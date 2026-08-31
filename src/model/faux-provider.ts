import type { ModelProvider } from "./provider.ts";
import type { ModelEvent, ModelRequest, ToolCall } from "./types.ts";

export type FauxScriptEvent =
    | string
    | { type: "tool_call"; toolCall: ToolCall };

export class FauxProvider implements ModelProvider {
    readonly id = "faux";
    readonly requests: ModelRequest[] = [];
    private responses: FauxScriptEvent[][];


    constructor(responses: FauxScriptEvent[][]) {
        this.responses = responses.map((events) => events.slice());
    }

    async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
        this.requests.push({
            ...request,
            messages: request.messages.slice(),
        });

        const events = this.responses.shift();
        if (!events) {
            yield {
                type: "error",
                error: new Error("No scripted faux response remains"),
            };
            return;
        }

        yield { type: "start" };

        for (const scriptedEvent of events) {
            if (request.signal?.aborted) {
                yield {
                    type: "error",
                    error: new Error("Model request aborted"),
                };
                return;
            }

            if (typeof scriptedEvent === "string") {
                yield { type: "text_delta", delta: scriptedEvent };
            } else {
                yield scriptedEvent;
            }
        }


        yield { type: "done" };
    }

}

