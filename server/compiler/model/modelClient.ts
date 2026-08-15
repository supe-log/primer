/**
 * ModelClient is the seam between the compiler and any language model.
 *
 * It is deliberately tiny: one operation that takes a role, a prompt and a Zod
 * schema, and returns either a parsed value or an abstention. Callers never see a
 * provider SDK, a token count or a retry policy, so swapping MockModelClient for
 * an xAI client changes no caller.
 *
 * Interface contract:
 *  - `complete` never throws for a model or provider failure. It returns
 *    `{ ok: false, abstained: true, reason }`. Abstention is a result, not an error.
 *  - A response that does not parse against `schema` is an abstention, not a
 *    parsing problem to be patched up downstream.
 *  - Implementations must be side-effect free apart from network calls and must not
 *    mutate the input.
 */
export type ModelRole =
  | "curriculum_mapper"
  | "lesson_architect"
  | "content_generator"
  | "item_writer"
  | "learning_science_critic"
  | "standards_auditor"
  | "standards_researcher";

export interface ModelRequest<T> {
  role: ModelRole;
  /** Stable prompt identifier recorded in the run manifest. */
  promptVersion: string;
  /** Fully rendered prompt. The compiler owns prompt construction, not the client. */
  prompt: string;
  /** Parser the response must satisfy. A failure to parse is an abstention. */
  parse: (raw: unknown) => T;
}

export type ModelResponse<T> =
  | { ok: true; value: T; latencyMs: number; inputTokens: number; outputTokens: number }
  | { ok: false; abstained: true; reason: string };

export interface ModelClient {
  /** Human-readable name recorded in the run manifest. */
  readonly name: "mock" | "xai";
  complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>>;
}

/**
 * MockModelClient abstains on every call. That is the honest default for a
 * scaffold with no key configured: the gate then records an abstention rather than
 * a pass, and the deterministic path still produces a full bundle.
 *
 * Engineer 1 adds XaiModelClient next to this file, satisfying the same interface,
 * and switches it on in server/compiler/index.ts. No caller changes.
 */
export class MockModelClient implements ModelClient {
  readonly name = "mock" as const;

  async complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    return {
      ok: false,
      abstained: true,
      reason: `no model client configured for role ${request.role}`,
    };
  }
}
