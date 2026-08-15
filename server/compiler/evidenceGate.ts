import type { GateCheck, GateReport, GateVerdict, PermissionTier } from "@contracts";

/**
 * The evidence gate. Pure arithmetic over gate checks. No model participates.
 *
 * Rules, in order. The earlier rule always wins:
 *  1. A failed blocking source or licence check is AMBER at best. Refuse.
 *  2. Any other failed blocking check is YELLOW: a draft with named review targets.
 *  3. All blocking checks pass and no expert review exists: BLUE at prototype tier.
 *  4. All blocking checks pass and expert review passes: GREEN at controlled pilot.
 *  5. An abstention never counts as a pass. A skipped check is listed as missing.
 *
 * The permission tier is the ceiling earned, never the ceiling requested. Nothing
 * in this file publishes anything; publication is a human act outside the code.
 */

const SOURCE_CHECK_IDS = new Set([
  "check:source.licence-known",
  "check:source.cite-only-no-redistribute",
  "check:source.unknown-blocks-redistribution",
  "check:blueprint.present",
  "check:request.schema-valid",
]);

export interface GateDecision {
  verdict: GateVerdict;
  permission: PermissionTier;
}

export function evaluateGate(checks: GateCheck[]): GateDecision {
  const failedBlocking = checks.filter((check) => check.blocking && check.status === "fail");
  const failedSource = failedBlocking.filter((check) => SOURCE_CHECK_IDS.has(check.checkId));

  if (failedSource.length > 0) {
    return { verdict: "AMBER", permission: "investigate" };
  }
  if (failedBlocking.length > 0) {
    return { verdict: "YELLOW", permission: "prototype" };
  }

  const expertReview = checks.find((check) => check.kind === "expert_review");
  const pilot = checks.find((check) => check.kind === "pilot_measurement");

  if (expertReview?.status === "pass" && pilot?.status === "pass") {
    return { verdict: "GREEN", permission: "controlled_pilot" };
  }
  if (expertReview?.status === "pass") {
    return { verdict: "BLUE", permission: "prototype" };
  }
  return { verdict: "BLUE", permission: "prototype" };
}

export function buildGateReport(input: {
  checks: GateCheck[];
  missingEvidence: string[];
  unmeasured: string[];
  needsHumanReview: string[];
  summary: string;
}): GateReport {
  const decision = evaluateGate(input.checks);
  const skipped = input.checks
    .filter((check) => check.status === "skipped" || check.status === "abstain")
    .map((check) => check.label);

  return {
    schemaVersion: "0.1.0",
    verdict: decision.verdict,
    permission: decision.permission,
    checks: input.checks,
    missingEvidence: [...new Set([...input.missingEvidence, ...skipped])],
    unmeasured: input.unmeasured,
    needsHumanReview: input.needsHumanReview,
    summary: input.summary,
  };
}
