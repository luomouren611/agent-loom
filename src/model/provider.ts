import type { ModelEvent, ModelRequest } from "./types.ts";

export interface ModelProvider {
    readonly id: string;
    stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}
