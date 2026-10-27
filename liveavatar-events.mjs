const transcriptTypes = new Map([
  ["user.transcription.chunk", { role: "user", isFinal: false }],
  ["user.transcription", { role: "user", isFinal: true }],
  ["avatar.transcription.chunk", { role: "assistant", isFinal: false }],
  ["avatar.transcription", { role: "assistant", isFinal: true }]
]);

export function parseLiveAvatarEvent(message, { localSessionId, providerSessionId } = {}) {
  if (!message || typeof message !== "object") return null;
  const eventType = String(message.event_type || "");
  const definition = transcriptTypes.get(eventType);
  const suppliedSessionId = message.session_id ? String(message.session_id) : "";
  if (suppliedSessionId && providerSessionId && suppliedSessionId !== String(providerSessionId)) return null;
  const base = {
    eventType,
    localSessionId: String(localSessionId || ""),
    providerSessionId: suppliedSessionId || String(providerSessionId || ""),
    providerEventId: String(message.event_id || message.source_event_id || "") || null,
    sourceEventId: String(message.source_event_id || "") || null,
    occurredAt: message.timestamp && Number.isFinite(Date.parse(message.timestamp)) ? new Date(message.timestamp).toISOString() : new Date().toISOString()
  };
  if (!definition) return { ...base, kind: "lifecycle" };
  const text = String(message.text || "").trim();
  if (!text) return null;
  return { ...base, ...definition, kind: "transcript", text };
}

export function transcriptEventKey(event) {
  return `${event.localSessionId}:${event.providerEventId || `${event.eventType}:${event.text}`}`;
}
