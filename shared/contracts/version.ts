/**
 * Contract version for every artifact Primer Compiler emits.
 *
 * The contracts in this directory are the shared seam between Engineer 1
 * (server/compiler) and Engineer 2 (client/src). They are frozen at 0.1.0 for
 * the hackathon. Changing them requires the process in docs/SCHEMA_CHANGELOG.md:
 * version bump, fixture update, contract test, changelog entry, and an explicit
 * acknowledgment from both engineers.
 */
export const SCHEMA_VERSION = "0.1.0" as const;

export type SchemaVersion = typeof SCHEMA_VERSION;
