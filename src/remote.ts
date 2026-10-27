export type Trial = { trial_id: string; trial_order: number; case_id: string; status: "open" | "locked" | "incomplete" };
export type RemoteEvent = { event_id: string; session_id: string; trial_id: string; event_type: string; server_seq: number; server_timestamp: string; sequence_id: string; artifact_id?: string | null; challenge_id?: string | null; payload_json: Record<string, unknown> };
export type RemoteSession = { session_id: string; sequence_id: string; protocol_version: string; artifact_version: string; status: string; trials: Trial[]; events: RemoteEvent[] };

type AuthConfig = { supabaseUrl: string; anonKey: string; functionUrl: string };
const config: AuthConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  functionUrl: import.meta.env.VITE_HG2_FUNCTION_URL ?? "",
};

export function remoteConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.anonKey && config.functionUrl);
}

export function getRemoteConfig(): AuthConfig { return config; }

export async function signIn(email: string, password: string): Promise<{ access_token: string; user_id: string }> {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: config.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error_description ?? body.msg ?? "Supabase sign-in failed");
  return { access_token: body.access_token, user_id: body.user?.id ?? body.user_id };
}

async function call(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${config.functionUrl}${path}`, {
    ...init,
    headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `HG2 API ${response.status}`);
  return body;
}

export function createSession(token: string, participantCode: string) {
  return call("/v1/session", token, { method: "POST", body: JSON.stringify({ participant_code: participantCode }) }) as Promise<{ trials: Trial[]; condition_hidden: boolean }>;
}

export function readSession(token: string) {
  return call("/v1/session", token) as Promise<{ session: RemoteSession | null; condition_hidden: boolean }>;
}

export function appendEvent(token: string, trialId: string, eventType: string, payload: Record<string, unknown>) {
  return call(`/v1/trials/${encodeURIComponent(trialId)}/events`, token, { method: "POST", body: JSON.stringify({ event_type: eventType, payload }) }) as Promise<{ event: RemoteEvent; condition?: string | null }>;
}
export function unlockTrial(token: string, trialId: string) {
  return call(`/v1/trials/${encodeURIComponent(trialId)}/unlock`, token, { method: "POST", body: "{}" }) as Promise<{ event: RemoteEvent; condition: string }>;
}
