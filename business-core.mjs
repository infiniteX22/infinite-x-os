export const MODES = new Set(["DEMO", "REAL"]);
export const TASK_STATES = new Set(["Not started", "In progress", "Blocked", "Reported complete", "Verified complete"]);

export function requireMode(value) {
  const mode = String(value || "").toUpperCase();
  if (!MODES.has(mode)) throw new Error("Mode must be DEMO or REAL.");
  return mode;
}

export function can(user, action, record = {}) {
  if (!user?.id || user.active === 0) return false;
  if (user.role === "Director") return true;
  const owner = record.owner_id || record.assignee_id || record.user_id;
  if (action === "read") return user.role === "Finance" ? true : !owner || owner === user.id;
  if (action === "task:update") return owner === user.id || user.role === "Project Manager";
  if (action === "task:verify") return user.role === "Project Manager";
  if (action === "finance:write") return user.role === "Finance";
  if (action === "meeting:write") return ["Project Manager", "Finance"].includes(user.role);
  return false;
}

export function tenderReadiness(requirements = []) {
  const mandatory = requirements.filter(r => Boolean(r.mandatory));
  const verified = mandatory.filter(r => r.status === "Verified");
  const missing = mandatory.filter(r => !["Provided", "Verified"].includes(r.status));
  const unverified = mandatory.filter(r => r.status === "Provided");
  const score = mandatory.length ? Math.round((verified.length / mandatory.length) * 100) : 0;
  return {
    score,
    mandatory: mandatory.length,
    verified: verified.length,
    missing: missing.length,
    unverified: unverified.length,
    submissionReady: mandatory.length > 0 && missing.length === 0 && unverified.length === 0,
    basis: "Verified mandatory requirements / all mandatory requirements. Provided but unverified items do not count as ready."
  };
}

export function invoiceBalance(invoice, payments = []) {
  const valid = payments.filter(p => p.status === "Recorded" && p.invoice_id === invoice.id);
  const paidCents = valid.reduce((sum, p) => sum + Number(p.amount_cents || 0), 0);
  return { paidCents, balanceCents: Math.max(0, Number(invoice.total_cents || 0) - paidCents) };
}

export function fundingGap(record) {
  const requiredCents = Math.max(0, Number(record.required_cents || 0));
  const availableCents = Math.max(0, Number(record.available_cents || 0));
  return {
    requiredCents,
    availableCents,
    gapCents: Math.max(0, requiredCents - availableCents),
    assumption: "Gap = explicit recorded costs required minus confirmed available funds; offers and approvals are never inferred."
  };
}

export function taskStatusUpdate(current, requested, actor, record) {
  if (!TASK_STATES.has(requested)) throw new Error("Unsupported task status.");
  if (!can(actor, requested === "Verified complete" ? "task:verify" : "task:update", record)) throw new Error("Permission denied.");
  if (requested === "Verified complete" && current !== "Reported complete") throw new Error("Only reported completion can be verified.");
  return requested;
}

export function notificationKey(meetingId, kind, scheduledFor) {
  return `${meetingId}:${kind}:${new Date(scheduledFor).toISOString()}`;
}

export function isMeetingMinutesEmailRequest(value) {
  const text = String(value || "");
  return /\b(send|email)\b[\s\S]{0,80}\b(minutes|meeting notes)\b|\b(minutes|meeting notes)\b[\s\S]{0,80}\b(send|email)\b/i.test(text);
}

export function parseSchedulePhrase(text, now = new Date()) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const topic = value.match(/schedule (?:a |an )?(.+?) for /i)?.[1]?.trim() || "Business review";
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  let date = null;
  for (let i = 0; i < dayNames.length; i += 1) if (lower.includes(dayNames[i])) {
    const d = new Date(now);
    let delta = (i - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() + delta);
    date = d.toISOString().slice(0, 10);
  }
  const timeWords = { nine: "09:00", ten: "10:00", eleven: "11:00", twelve: "12:00", one: "13:00", two: "14:00", three: "15:00", four: "16:00", five: "17:00" };
  const clock = lower.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  const word = Object.entries(timeWords).find(([key]) => new RegExp(`\\b${key}\\b`).test(lower));
  const time = clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : word?.[1] || null;
  const reminderMinutes = Number(lower.match(/(\d+)\s*minutes? beforehand/)?.[1] || 15);
  return { topic, date, time, reminderMinutes, timezone: "Africa/Johannesburg", needsConfirmation: !date || !time };
}
