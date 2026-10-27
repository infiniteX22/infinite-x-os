import test from "node:test";
import assert from "node:assert/strict";
import { tenderReadiness, fundingGap, invoiceBalance, taskStatusUpdate, notificationKey, parseSchedulePhrase, isMeetingMinutesEmailRequest } from "../business-core.mjs";

test("tender readiness never treats missing or unverified mandatory items as ready", () => {
  const result = tenderReadiness([
    { mandatory: true, status: "Verified" },
    { mandatory: true, status: "Provided" },
    { mandatory: true, status: "Missing" },
    { mandatory: false, status: "Missing" }
  ]);
  assert.deepEqual({ score: result.score, ready: result.submissionReady, missing: result.missing, unverified: result.unverified }, { score: 33, ready: false, missing: 1, unverified: 1 });
});

test("funding gap uses explicit costs and funds", () => assert.equal(fundingGap({ required_cents: 26000000, available_cents: 8000000 }).gapCents, 18000000));

test("invoice balance excludes rejected and unrelated payments", () => {
  const result = invoiceBalance({ id: "i1", total_cents: 10000 }, [
    { invoice_id: "i1", amount_cents: 3000, status: "Recorded" },
    { invoice_id: "i1", amount_cents: 9000, status: "Rejected" },
    { invoice_id: "i2", amount_cents: 5000, status: "Recorded" }
  ]);
  assert.deepEqual(result, { paidCents: 3000, balanceCents: 7000 });
});

test("reported and verified completion stay distinct", () => {
  const employee = { id: "sc", role: "Electrician", active: 1 };
  const manager = { id: "tm", role: "Project Manager", active: 1 };
  assert.equal(taskStatusUpdate("In progress", "Reported complete", employee, { assignee_id: "sc" }), "Reported complete");
  assert.throws(() => taskStatusUpdate("In progress", "Verified complete", manager, { assignee_id: "sc" }));
  assert.equal(taskStatusUpdate("Reported complete", "Verified complete", manager, { assignee_id: "sc" }), "Verified complete");
});

test("notification keys are stable and schedule phrases resolve in Johannesburg", () => {
  assert.equal(notificationKey("m1", "reminder", "2026-10-26T06:45:00.000Z"), "m1:reminder:2026-10-26T06:45:00.000Z");
  const parsed = parseSchedulePhrase("Schedule a business review for Monday at nine. Remind me 15 minutes beforehand.", new Date("2026-10-23T08:00:00Z"));
  assert.equal(parsed.date, "2026-10-26");
  assert.equal(parsed.time, "09:00");
  assert.equal(parsed.needsConfirmation, false);
});

test("Wayne recognises explicit meeting-minutes email requests without treating ordinary discussion as a send", () => {
  assert.equal(isMeetingMinutesEmailRequest("Please email the meeting minutes to our office."), true);
  assert.equal(isMeetingMinutesEmailRequest("Send the meeting notes when we are done."), true);
  assert.equal(isMeetingMinutesEmailRequest("What did we discuss in the meeting?"), false);
});
