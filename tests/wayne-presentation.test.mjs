import test from "node:test";
import assert from "node:assert/strict";
import { acceptPresentationEvent, canOpenPresentationRoute, parsePresentationCommand, resolvePresentationRoute } from "../wayne-presentation.mjs";
import { APP_ROUTES, routeHeading } from "../app-routes.mjs";
import { dispatchWayneCommand } from "../wayne-navigation.mjs";

test("explicit navigation commands resolve only allowlisted application routes", () => {
  assert.deepEqual(parsePresentationCommand("Wayne, open Reports and present."), { type: "open", route: "reports", present: true });
  assert.deepEqual(parsePresentationCommand("Open tender radar"), { type: "open", route: "tenders", present: false });
  assert.deepEqual(parsePresentationCommand("Open Finance"), { type: "open", route: "finance", present: false });
  assert.deepEqual(parsePresentationCommand("Open Team and Tasks"), { type: "open", route: "team", present: false });
  assert.deepEqual(parsePresentationCommand("Open Team and Tasks and present their progress"), { type: "open", route: "team", present: true });
  assert.deepEqual(parsePresentationCommand("Open Projects and present"), { type: "open", route: "projects", present: true });
  assert.deepEqual(parsePresentationCommand("Present this report"), { type: "present-current" });
  assert.deepEqual(parsePresentationCommand("Go fullscreen"), { type: "fullscreen" });
  assert.deepEqual(parsePresentationCommand("Stop sharing the screen"), { type: "stop-presenting" });
  assert.deepEqual(parsePresentationCommand("Bring Wayne back"), { type: "stop-presenting" });
  assert.equal(resolvePresentationRoute("https://example.com"), null);
  for (const [spoken, route] of [["Dashboard","dashboard"],["CRM","crm"],["Projects","projects"],["Team","team"],["Quotations","quotations"],["Invoices","quotations"],["Tenders","tenders"],["Funding","funding"],["Finance","finance"],["Compliance","compliance"],["Documents","documents"],["AI Meetings","meetings"],["Reports","reports"],["Settings","settings"]]) {
    assert.deepEqual(parsePresentationCommand(`Open ${spoken}`), { type: "open", route, present: false });
  }
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

test("production parser and dispatcher resolve every sidebar destination and its rendered heading", async () => {
  const commands=new Map([
    ["dashboard","Open Dashboard"],["crm","Open CRM"],["projects","Open Projects"],["team","Open Team and Tasks"],
    ["quotations","Open Quotations and Invoices"],["tenders","Open Tenders"],["funding","Open Funding"],["finance","Open Finance"],
    ["compliance","Open Compliance"],["documents","Open Documents"],["meetings","Open AI Meetings"],["reports","Open Reports"],["settings","Open Settings"]
  ]);
  let current="reports",presented=0;
  const navigate=async route=>{current=route;return{ok:true,heading:routeHeading(route)}};
  for(const definition of APP_ROUTES){
    const command=parsePresentationCommand(commands.get(definition.route));
    const result=await dispatchWayneCommand({command,heard:commands.get(definition.route),expectedSessionId:"s1",activeSessionId:"s1",permissions:{director:true,finance:true},role:"Director",navigate,presentCurrent:async()=>{presented++},fullscreen:async()=>{},stopPresenting:async()=>{}});
    assert.equal(result.route,definition.route);
    assert.equal(result.heading,definition.heading);
    assert.equal(current,definition.route);
  }
  current="reports";const statuses=[];
  let result=await dispatchWayneCommand({command:parsePresentationCommand("Open Tenders"),heard:"Open Tenders",expectedSessionId:"s1",activeSessionId:"s1",permissions:{director:true,finance:true},role:"Director",navigate,presentCurrent:async()=>{},fullscreen:async()=>{},stopPresenting:async()=>{},onStatus:value=>statuses.push(value)});
  assert.equal(result.route,"tenders");assert.equal(result.heading,"Tender Radar");
  assert.deepEqual(statuses[0],{heard:"Open Tenders",opening:"Tenders"});
  assert.equal(statuses.at(-1).success,"Tenders opened");
  result=await dispatchWayneCommand({command:parsePresentationCommand("Open Reports"),heard:"Open Reports",expectedSessionId:"s1",activeSessionId:"s1",permissions:{director:true,finance:true},role:"Director",navigate,presentCurrent:async()=>{},fullscreen:async()=>{},stopPresenting:async()=>{}});
  assert.equal(result.route,"reports");assert.equal(result.heading,"Reports");
  result=await dispatchWayneCommand({command:parsePresentationCommand("Open Team and Tasks and present their progress"),heard:"Open Team and Tasks and present their progress",expectedSessionId:"s1",activeSessionId:"s1",permissions:{director:true,finance:true},role:"Director",navigate,presentCurrent:async()=>{presented++},fullscreen:async()=>{},stopPresenting:async()=>{}});
  assert.equal(result.route,"team");assert.equal(result.heading,"Team & Tasks");assert.equal(result.presented,true);
});

test("dispatcher rejects unknown, unauthorised, stale and repeated events without navigation", async () => {
  let navigations=0;const navigate=async route=>{navigations++;return{ok:true,heading:routeHeading(route)}};
  const common={expectedSessionId:"s1",activeSessionId:"s1",permissions:{director:false,finance:false},role:"Electrician",navigate,presentCurrent:async()=>{},fullscreen:async()=>{},stopPresenting:async()=>{}};
  assert.equal((await dispatchWayneCommand({...common,heard:"Open Payroll",command:parsePresentationCommand("Open Payroll")})).error,"unknown-route");
  assert.equal((await dispatchWayneCommand({...common,heard:"Open Finance",command:parsePresentationCommand("Open Finance")})).error,"permission");
  assert.equal((await dispatchWayneCommand({...common,heard:"Open Tenders",command:parsePresentationCommand("Open Tenders"),expectedSessionId:"old"})).ignored,"stale-session");
  const seen=new Set(),event={sessionId:"s1",role:"user",isFinal:true,providerEventId:"repeat-1",text:"Open Tenders"};
  if(acceptPresentationEvent(event,"s1",seen))await dispatchWayneCommand({...common,heard:event.text,command:parsePresentationCommand(event.text)});
  if(acceptPresentationEvent(event,"s1",seen))await dispatchWayneCommand({...common,heard:event.text,command:parsePresentationCommand(event.text)});
  assert.equal(navigations,1);
});
