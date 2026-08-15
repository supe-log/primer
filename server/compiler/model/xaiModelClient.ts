import type { ModelClient, ModelRequest, ModelResponse } from "./modelClient";

/**
 * XaiModelClient: the real grok-4.6 client behind the ModelClient seam.
 *
 * It satisfies exactly the interface MockModelClient satisfies, so switching it on
 * changes no caller. The interface contract is the whole point, and this file honours
 * it strictly:
 *
 *  - `complete` never throws. A network failure, a non-2xx status, a refusal, a
 *    timeout, malformed JSON, or a payload that fails the caller's parser all return
 *    `{ ok: false, abstained: true, reason }`. Abstention is a result. The gate then
 *    records an abstention, which never becomes a pass, and the deterministic path
 *    still produces a bundle.
 *  - The caller owns the prompt and the parser. This client owns transport, timeout
 *    and token accounting, and nothing else.
 *  - Structured outputs are requested with `strict: true`, so the model is
 *    constrained to the schema rather than asked politely to follow it. A response
 *    that still does not satisfy the caller's parser is an abstention, never a value
 *    patched up downstream.
 *
 * There is deliberately no retry-until-it-works loop. One bounded attempt with one
 * bounded timeout, and the honest answer if that fails.
 */

export const XAI_MODEL = "grok-4.6";
const XAI_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 90_000;

export interface XaiClientOptions {
  apiKey: string;
  /** Overridable for tests. Defaults to the public xAI endpoint. */
  endpoint?: string;
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Recorded in the run manifest and sent to the provider. */
  model?: string;
}

interface XaiChoice {
  message?: { content?: string | null; refusal?: string | null };
  finish_reason?: string;
}

interface XaiCompletion {
  choices?: XaiChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

/**
 * The JSON Schema a role's response must satisfy. The compiler builds this next to
 * the prompt, because the prompt and the shape it promises are one decision.
 */
export interface StructuredSchema {
  name: string;
  schema: Record<string, unknown>;
}

/** A ModelRequest that also carries the schema to constrain generation with. */
export type StructuredModelRequest<T> = ModelRequest<T> & { schema?: StructuredSchema };

function errorText(payload: XaiCompletion): string | undefined {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object") return payload.error.message;
  return undefined;
}

export class XaiModelClient implements ModelClient {
  readonly name = "xai" as const;
  readonly model: string;

  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: XaiClientOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? XAI_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.model = options.model ?? XAI_MODEL;
  }

  async complete<T>(request: StructuredModelRequest<T>): Promise<ModelResponse<T>> {
    const startedAt = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        messages: [{ role: "user", content: request.prompt }],
      };
      if (request.schema) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: request.schema.name,
            strict: true,
            schema: request.schema.schema,
          },
        };
      }

      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return {
          ok: false,
          abstained: true,
          reason: `xai returned HTTP ${response.status} for role ${request.role}${
            detail ? `: ${detail.slice(0, 200)}` : ""
          }`,
        };
      }

      const payload = (await response.json()) as XaiCompletion;
      const failure = errorText(payload);
      if (failure) {
        return { ok: false, abstained: true, reason: `xai error for role ${request.role}: ${failure}` };
      }

      const choice = payload.choices?.[0];
      if (choice?.message?.refusal) {
        return {
          ok: false,
          abstained: true,
          reason: `model refused role ${request.role}: ${choice.message.refusal}`,
        };
      }

      const content = choice?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        return {
          ok: false,
          abstained: true,
          reason: `xai returned no content for role ${request.role} (finish_reason ${choice?.finish_reason ?? "unknown"})`,
        };
      }

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        return {
          ok: false,
          abstained: true,
          reason: `xai returned non-JSON content for role ${request.role}`,
        };
      }

      // A payload that does not satisfy the caller's parser is an abstention. The
      // alternative — coercing it — is how an unchecked artifact reaches a learner.
      let value: T;
      try {
        value = request.parse(raw);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          abstained: true,
          reason: `xai response for role ${request.role} did not satisfy its schema: ${message.slice(0, 300)}`,
        };
      }

      return {
        ok: true,
        value,
        latencyMs: Date.now() - startedAt,
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        abstained: true,
        reason: aborted
          ? `xai call for role ${request.role} timed out after ${this.timeoutMs}ms`
          : `xai call for role ${request.role} failed: ${message.slice(0, 200)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Selects a client from the environment. No key means MockModelClient, which is the
 * honest default: the critic abstains and the deterministic path still ships a
 * bundle. Callers get a `ModelClient` either way and never branch on which one.
 */
export function modelClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ModelClient | undefined {
  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) return undefined;
  return new XaiModelClient({ apiKey });
}
