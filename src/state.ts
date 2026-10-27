export const PHASES = [
  "welcome", "vignette", "pre_ai", "ai", "post_ai", "challenge", "final", "manipulation", "complete",
] as const;
export type Phase = typeof PHASES[number];

export type Condition = "HG2-C0_STANDARD_RAG" | "HG2-C1_COMPETITIVE" | "HG2-C2_COMPETITIVE_AUDIT";
export type Response = "accept" | "reject" | "undetermined";

export type Evidence = { alias: string; chunk_id: string; doc_id: string; text: string };
export type Artifact = {
  condition: Condition;
  answer?: string;
  presentation_note?: string;
  claims?: Array<{ claim_id: string; claim_text: string; claim_type: string; support_status: string; citations: Array<{ quote_id: string; quote: string }> }>;
  route_evidence?: Record<string, Array<{ chunk_id: string; doc_id: string; role?: string; note?: string }>>;
  conflicts?: Array<{ conflict_id: string; description: string; resolution_status: string }>;
  gaps?: Array<{ gap_id: string; description: string; route: string }>;
  uncertainty?: { level?: string; reasons?: string[] };
  audit_panel?: { descriptive_only: boolean; not_correctness_or_fairness_evidence: boolean; signals: Array<Record<string, unknown>> };
};

export type Vignette = {
  case_id: string;
  display_name: string;
  facts: string;
  issues: Array<{ issue_id: string; issue_text: string }>;
  response_options: Response[];
  hypotheses: Array<{ hypothesis_id: string; text: string }>;
};

export type Challenge = { challenge_id: string; challenge_text: string; evidence: Evidence[] };

export type HG2State = {
  phase: Phase;
  consent: boolean;
  preResponses: Record<string, Response>;
  postResponses: Record<string, Response>;
  finalResponses: Record<string, Response>;
  condition: Condition | null;
  artifact: Artifact | null;
  challenge: Challenge | null;
  challengeOpened: boolean;
};

export const initialState: HG2State = {
  phase: "welcome", consent: false, preResponses: {}, postResponses: {}, finalResponses: {},
  condition: null, artifact: null, challenge: null, challengeOpened: false,
};

export function conditionVisible(state: HG2State): boolean {
  return state.phase !== "welcome" && state.phase !== "vignette" && state.phase !== "pre_ai" && state.condition !== null;
}

export function canUnlock(state: HG2State): boolean {
  return state.phase === "pre_ai" && Object.keys(state.preResponses).length > 0 && state.condition === null;
}

export function nextPhase(state: HG2State): Phase {
  const index = PHASES.indexOf(state.phase);
  return PHASES[Math.min(index + 1, PHASES.length - 1)];
}
