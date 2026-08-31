import type { ModelProvider } from "./provider.ts";
import type { ModelEvent, ModelRequest } from "./types.ts";

export class FauxProvider implements ModelProvider {
    readonly id = "faux";
    readonly requests: ModelRequest[] = [];
    private responses: string[][];

    constructor(responses: string[][]) {
        this.responses = responses.map((chunks) => chunks.slice());
    }

    async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
        this.requests.push({
            ...request,
            messages: request.messages.slice(),
        });

        const chunks = this.responses.shift();
        if (!chunks) {
            yield {
                type: "error",
                error: new Error("No scripted faux response remains"),
            };
            return;
        }

        yield { type: "start" };

        for (const chunk of chunks) {
            if (request.signal?.aborted) {
                yield {
                    type: "error",
                    error: new Error("Model request aborted"),
                };
                return;
            }

            yield { type: "text_delta", delta: chunk };
        }

        yield { type: "done" };
    }

}

