import type { Artifact, Challenge, Vignette } from "./state";

type VignetteManifest = { cases: Vignette[] };
type ConditionManifest = { conditions: Record<string, Record<string, Artifact>> };
type ChallengeManifest = { groups: Record<string, Challenge> };

export type ArtifactBundle = { cases: Vignette[]; conditions: ConditionManifest["conditions"]; challenges: ChallengeManifest["groups"] };

export async function loadArtifactBundle(base = "./artifacts/HG2-0001"): Promise<ArtifactBundle> {
  const [vignettes, condition, challenges] = await Promise.all([
    fetch(`${base}/EXPERIMENT_VIGNETTE_MANIFEST.json`).then(response => response.json() as Promise<VignetteManifest>),
    fetch(`${base}/CONDITION_ARTIFACTS.json`).then(response => response.json() as Promise<ConditionManifest>),
    fetch(`${base}/STANDARDIZED_CHALLENGE_MANIFEST.json`).then(response => response.json() as Promise<ChallengeManifest>),
  ]);
  return { cases: vignettes.cases, conditions: condition.conditions, challenges: challenges.groups };
}

export function firstGroupForCase(bundle: ArtifactBundle, caseId: string): string {
  const groups = Object.keys(bundle.challenges).filter(group => group.startsWith(`${caseId}-`));
  if (!groups[0]) throw new Error(`No frozen HG2 group for ${caseId}`);
  return groups[0].replace("--", "::");
}
