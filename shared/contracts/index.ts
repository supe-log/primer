/**
 * shared/contracts: the seam between the compiler and the client.
 *
 * Jointly owned by both engineers and frozen at SCHEMA_VERSION 0.1.0 for the
 * hackathon. Everything the server produces and everything the client consumes
 * passes through these schemas. Import from "@contracts" only; do not deep-import
 * individual files from application code.
 *
 * Error modes at this seam:
 *  - A request that fails CompilationRequest parsing is a 400 with the Zod issue
 *    list. It never reaches the compiler.
 *  - A result that fails CompilationResult parsing is a server bug, surfaced as a
 *    500 with the issue list. The client must not attempt to render a partial result.
 *  - An AgentEvent that fails parsing is dropped by the client with a visible
 *    "stream desync" state rather than silently ignored.
 */

export { SCHEMA_VERSION } from "./version";
export type { SchemaVersion } from "./version";

export * from "./primitives";
export * from "./source";
export * from "./graph";
export * from "./course";
export * from "./items";
export * from "./gate";
export * from "./events";
export * from "./request";
export * from "./run";
export * from "./result";
