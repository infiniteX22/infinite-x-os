import test from "node:test";
import assert from "node:assert/strict";
import { acceptPresentationEvent, canOpenPresentationRoute, parsePresentationCommand, resolvePresentationRoute } from "../wayne-presentation.mjs";

test("explicit navigation commands resolve only allowlisted application routes", () => {
  assert.deepEqual(parsePresentationCommand("Wayne, open Reports and present."), { type: "open", route: "reports", present: true });
  assert.deepEqual(parsePresentationCommand("Open tender radar"), { type: "open", route: "tenders", present: false });
  assert.deepEqual(parsePresentationCommand("Present this report"), { type: "present-current" });
  assert.deepEqual(parsePresentationCommand("Go fullscreen"), { type: "fullscreen" });
  assert.deepEqual(parsePresentationCommand("Stop sharing the screen"), { type: "stop-presenting" });
  assert.deepEqual(parsePresentationCommand("Bring Wayne back"), { type: "stop-presenting" });
  assert.equal(resolvePresentationRoute("https://example.com"), null);
});

test("ordinary questions and quoted examples do not cause navigation", () => {
  assert.equal(parsePresentationCommand("How are our tenders doing?"), null);
  assert.equal(parsePresentationCommand("Can you explain the reports?"), null);
  assert.equal(parsePresentationCommand('Say "Open Reports" as an example'), null);
  assert.equal(parsePresentationCommand("I said open Tenders"), null);
});

test("route permissions reject finance and settings where the role lacks access", () => {
  assert.equal(canOpenPresentationRoute("tenders", { finance: false, director: false }, "Electrician"), true);
  assert.equal(canOpenPresentationRoute("finance", { finance: false, director: false }, "Electrician"), false);
  assert.equal(canOpenPresentationRoute("settings", { finance: true, director: false }, "Finance"), false);
  assert.equal(canOpenPresentationRoute("settings", { finance: true, director: true }, "Director"), true);
  assert.equal(canOpenPresentationRoute("not-a-route", { finance: true, director: true }, "Director"), false);
});

test("only final user events for the active session execute once", () => {
  const seen = new Set(), event = { sessionId: "s1", role: "user", isFinal: true, providerEventId: "evt-1", text: "Open Reports" };
  assert.equal(acceptPresentationEvent(event, "s1", seen), true);
  assert.equal(acceptPresentationEvent(event, "s1", seen), false);
  assert.equal(acceptPresentationEvent({ ...event, providerEventId: "evt-2", role: "assistant" }, "s1", seen), false);
  assert.equal(acceptPresentationEvent({ ...event, providerEventId: "evt-3", isFinal: false }, "s1", seen), false);
  assert.equal(acceptPresentationEvent({ ...event, providerEventId: "evt-4", sessionId: "old" }, "s1", seen), false);
});
