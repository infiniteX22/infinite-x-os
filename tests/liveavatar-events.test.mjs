import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveAvatarEvent, transcriptEventKey } from "../liveavatar-events.mjs";

const context = { localSessionId: "local-1", providerSessionId: "provider-1" };

test("current LiveAvatar transcript chunks are provisional and finals are durable", () => {
  const chunk = parseLiveAvatarEvent({ event_id: "c1", event_type: "user.transcription.chunk", session_id: "provider-1", text: "Open Pro" }, context);
  const final = parseLiveAvatarEvent({ event_id: "f1", event_type: "user.transcription", session_id: "provider-1", text: "Open Projects and present." }, context);
  assert.deepEqual({ role: chunk.role, final: chunk.isFinal, text: chunk.text }, { role: "user", final: false, text: "Open Pro" });
  assert.deepEqual({ role: final.role, final: final.isFinal, text: final.text }, { role: "user", final: true, text: "Open Projects and present." });
  assert.equal(transcriptEventKey(final), "local-1:f1");
});

test("assistant transcript and session attribution follow the documented root-level event shape", () => {
  const event = parseLiveAvatarEvent({ event_id: "a1", event_type: "avatar.transcription", session_id: "provider-1", text: "Projects are open." }, context);
  assert.equal(event.role, "assistant");
  assert.equal(event.isFinal, true);
  assert.equal(parseLiveAvatarEvent({ event_type: "user.transcription", session_id: "old-provider", text: "Open Finance" }, context), null);
});
