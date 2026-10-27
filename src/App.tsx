import { useEffect, useMemo, useState } from "react";
import { firstGroupForCase, loadArtifactBundle, type ArtifactBundle } from "./artifacts";
import { appendEvent, createSession, getRemoteConfig, readSession, remoteConfigured, signIn, unlockTrial, type RemoteEvent, type RemoteSession, type Trial } from "./remote";
import type { Response } from "./state";
import "./styles.css";

const EVENT_ORDER = ["session_open", "consent_recorded", "vignette_shown", "pre_ai_judgment_submitted", "condition_unlocked", "ai_artifact_shown", "post_ai_judgment_submitted", "challenge_opened", "challenge_completed", "final_judgment_submitted", "manipulation_check_submitted", "session_locked"];
const responseOptions: Response[] = ["accept", "reject", "undetermined"];

function eventFor(events: RemoteEvent[], trialId: string) { return events.filter(event => event.trial_id === trialId).sort((a, b) => a.server_seq - b.server_seq); }
function payloadOf(event?: RemoteEvent) { return event?.payload_json ?? {}; }
function conditionOf(events: RemoteEvent[]): string | null { return (payloadOf(events.find(event => event.event_type === "condition_unlocked")).condition as string | undefined) ?? null; }

function ResponseRow({ id, text, value, onChange }: { id: string; text: string; value: Response | undefined; onChange: (value: Response) => void }) {
  return <fieldset className="response-row"><legend>{id}</legend><p>{text}</p><div className="choices">{responseOptions.map(option => <label key={option}><input type="radio" name={id} checked={value === option} onChange={() => onChange(option)} />{option}</label>)}</div></fieldset>;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("hg2_access_token") ?? "");
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [bundle, setBundle] = useState<ArtifactBundle | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [participantCode, setParticipantCode] = useState("TEST_ONLY-p1");
  const [response, setResponse] = useState<Response | undefined>();
  const [confidence, setConfidence] = useState(0.5);
  const [manipulation, setManipulation] = useState("undetermined");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async (activeToken = token) => {
    if (!activeToken) return;
    const result = await readSession(activeToken);
    setSession(result.session);
  };
  useEffect(() => { loadArtifactBundle().then(setBundle).catch(() => setError("冻结 HG2 artifacts 加载失败")); }, []);
  useEffect(() => { if (token) refresh().catch(reason => setError(String(reason))); }, [token]);

  const activeTrial: Trial | undefined = useMemo(() => session?.trials.find(trial => trial.status !== "locked"), [session]);
  const events = activeTrial && session ? eventFor(session.events, activeTrial.trial_id) : [];
  const nextEvent = activeTrial ? EVENT_ORDER[events.length] : null;
  const condition = conditionOf(events);
  const caseData = activeTrial && bundle ? bundle.cases.find(item => item.case_id === activeTrial.case_id) : undefined;
  const groupId = activeTrial && bundle ? firstGroupForCase(bundle, activeTrial.case_id) : null;
  const artifact = condition && groupId ? bundle?.conditions[condition]?.[groupId] : undefined;
  const challenge = groupId ? bundle?.challenges[groupId] : undefined;
  const hypothesis = caseData?.hypotheses[0];
  const trialLabel = activeTrial ? `Trial ${activeTrial.trial_order}/3 · ${activeTrial.case_id}` : "Session complete";

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  };
  const send = (eventType: string, payload: Record<string, unknown>) => activeTrial && run(() => appendEvent(token, activeTrial.trial_id, eventType, payload));
  const advance = () => {
    if (!activeTrial || !session || !caseData || !hypothesis) return;
    const base = { case_id: caseData.case_id, issue_id: caseData.issues[0]?.issue_id, hypothesis_id: hypothesis.hypothesis_id, trial_order: activeTrial.trial_order, sequence_id: session.sequence_id };
    if (nextEvent === "session_open") return send(nextEvent, base);
    if (nextEvent === "consent_recorded") return send(nextEvent, { ...base, consent: true });
    if (nextEvent === "vignette_shown") return send(nextEvent, { ...base, vignette_id: `${caseData.case_id}-v1` });
    if (nextEvent === "pre_ai_judgment_submitted") return send(nextEvent, { ...base, responses: { [hypothesis.hypothesis_id]: response }, confidence0: confidence });
    if (nextEvent === "condition_unlocked") return run(async () => { await unlockTrial(token, activeTrial.trial_id); await refresh(); });
    if (nextEvent === "ai_artifact_shown") return send(nextEvent, { ...base, condition, artifact_id: `HG2-0001|${condition}|${groupId}` });
    if (nextEvent === "post_ai_judgment_submitted") return send(nextEvent, { ...base, responses: { [hypothesis.hypothesis_id]: response }, confidence1: confidence });
    if (nextEvent === "challenge_opened") return send(nextEvent, { ...base, challenge_id: challenge?.challenge_id });
    if (nextEvent === "challenge_completed") return send(nextEvent, { ...base, challenge_id: challenge?.challenge_id, opened_source_ids: challenge?.evidence.map(item => item.chunk_id) ?? [] });
    if (nextEvent === "final_judgment_submitted") return send(nextEvent, { ...base, responses: { [hypothesis.hypothesis_id]: response }, confidence2: confidence });
    if (nextEvent === "manipulation_check_submitted") return send(nextEvent, { ...base, manipulation_check: manipulation });
    if (nextEvent === "session_locked") return send(nextEvent, { ...base, lock_reason: "participant_complete" });
  };

  const start = async () => {
    setBusy(true); setError("");
    try {
      const auth = await signIn(email, password);
      localStorage.setItem("hg2_access_token", auth.access_token);
      setToken(auth.access_token);
      await createSession(auth.access_token, participantCode);
      const result = await readSession(auth.access_token);
      setSession(result.session);
      setPassword("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  };
  const recover = () => run(() => refresh());

  if (!remoteConfigured()) return <main className="shell"><header><span className="eyebrow">HUMAN GATE V2 · RELEASE BLOCKED</span><h1>缺少 Supabase public 配置</h1><p>设置 VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY、VITE_HG2_FUNCTION_URL 后才能开始远程 TEST_ONLY E2E。</p></header><footer>不会启用 fixture 作为 release fallback。</footer></main>;
  if (!token || !session) return <main className="shell"><header><span className="eyebrow">HUMAN GATE V2 · TEST_ONLY</span><h1>三试次远程审查</h1><p className="subtle">Supabase remote session；条件由服务端分配，浏览器不选择条件。</p></header><section className="card"><h2>登录 TEST_ONLY participant</h2><label>邮箱<input value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" /></label><label>密码<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><label>参与者代码<input value={participantCode} onChange={event => setParticipantCode(event.target.value)} /></label><button disabled={busy || !email || !password} onClick={start}>{busy ? "连接中…" : "登录并创建 3-trial session"}</button>{error && <p className="error">{error}</p>}</section><footer>TEST_ONLY · 不收集真实参与者数据</footer></main>;

  return <main className="shell"><header><span className="eyebrow">HUMAN GATE V2 · TEST_ONLY · REMOTE</span><h1>证据辅助法律审查</h1><p className="subtle">{trialLabel} · sequence={session.sequence_id}</p></header><div className="progress">{EVENT_ORDER.map(event => <span key={event} className={event === nextEvent ? "active" : events.some(item => item.event_type === event) ? "done" : ""}>{event}</span>)}</div>{error && <section className="notice error">{error}</section>}
    {activeTrial && <section className="card"><h2>{trialLabel}</h2>{nextEvent === "session_open" && <><p>服务端已创建 trial；先写入 session_open。</p><button disabled={busy} onClick={advance}>开始 trial</button></>}{nextEvent === "consent_recorded" && <><h3>知情同意</h3><p>当前为 TEST_ONLY 远程恢复测试。</p><button disabled={busy} onClick={advance}>记录 consent</button></>}{nextEvent === "vignette_shown" && caseData && <><h2>{caseData.display_name}</h2><p>{caseData.facts}</p>{caseData.issues.map(issue => <div className="issue" key={issue.issue_id}><b>{issue.issue_id}</b><p>{issue.issue_text}</p></div>)}<button disabled={busy} onClick={advance}>记录 vignette</button></>}{nextEvent === "pre_ai_judgment_submitted" && hypothesis && <><h2>H0 · 独立前置判断</h2><p>条件和 AI artifact 尚未返回。</p><ResponseRow id={hypothesis.hypothesis_id} text={hypothesis.text} value={response} onChange={setResponse} /><label className="range">置信度：{confidence.toFixed(2)}<input type="range" min="0" max="1" step="0.01" value={confidence} onChange={event => setConfidence(Number(event.target.value))} /></label><button disabled={busy || !response} onClick={advance}>提交 H0</button></>}{nextEvent === "condition_unlocked" && <><h2>AI 解锁</h2><p>服务端将返回条件；浏览器未提交 condition。</p><button disabled={busy} onClick={advance}>解锁 AI artifact</button></>}{nextEvent === "ai_artifact_shown" && artifact && <><div className="condition-badge">服务端条件：{condition}</div><h2>AI artifact</h2><p>{artifact.presentation_note}</p><p className="answer">{artifact.answer}</p><button disabled={busy} onClick={advance}>记录 artifact_id 并继续 H1</button></>}{nextEvent === "post_ai_judgment_submitted" && hypothesis && <><h2>H1 · AI 后判断</h2><ResponseRow id={hypothesis.hypothesis_id} text={hypothesis.text} value={response} onChange={setResponse} /><button disabled={busy || !response} onClick={advance}>提交 H1</button></>}{nextEvent === "challenge_opened" && challenge && <><h2>Challenge</h2><p>{challenge.challenge_text}</p>{challenge.evidence.map(item => <article className="evidence" key={item.alias}><b>{item.alias}</b><p>{item.text}</p><small>{item.chunk_id}</small></article>)}<button disabled={busy} onClick={advance}>记录 challenge_opened</button></>}{nextEvent === "challenge_completed" && <><h2>Challenge 已打开</h2><p>点击完成 challenge review 后才能提交 H2。</p><button disabled={busy} onClick={advance}>完成 challenge</button></>}{nextEvent === "final_judgment_submitted" && hypothesis && <><h2>H2 · Challenge 后判断</h2><ResponseRow id={hypothesis.hypothesis_id} text={hypothesis.text} value={response} onChange={setResponse} /><button disabled={busy || !response} onClick={advance}>提交 H2</button></>}{nextEvent === "manipulation_check_submitted" && <><h2>Manipulation check</h2><select value={manipulation} onChange={event => setManipulation(event.target.value)}><option value="undetermined">请选择</option><option value="yes">是</option><option value="no">否</option></select><button disabled={busy || manipulation === "undetermined"} onClick={advance}>提交 manipulation check</button></>}{nextEvent === "session_locked" && <><h2>Trial ready to complete</h2><button disabled={busy} onClick={advance}>锁定 trial</button></>}{events.length === EVENT_ORDER.length && <p>Trial complete；refresh 后将恢复下一试次。</p>}</section>}
    {!activeTrial && <section className="card"><h2>3 trials complete</h2><p>session_id={session.session_id}</p><p>完整事件已从 Supabase 恢复。</p></section>}
    <section className="card"><h2>Event trace</h2><table><thead><tr><th>trial</th><th>seq</th><th>event</th><th>artifact_id</th><th>challenge_id</th></tr></thead><tbody>{session.events.map(event => <tr key={event.event_id}><td>{event.trial_id.slice(0, 8)}</td><td>{event.server_seq}</td><td>{event.event_type}</td><td>{event.artifact_id ?? "—"}</td><td>{event.challenge_id ?? "—"}</td></tr>)}</tbody></table><button className="secondary" disabled={busy} onClick={recover}>刷新恢复 session</button></section><footer>participant payload 不含 Gold/裁决/correctness；TEST_ONLY</footer></main>;
}
