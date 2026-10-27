import { APP_ROUTES } from "./app-routes.mjs";

const aliasToRoute = new Map(APP_ROUTES.flatMap(({route,aliases}) => aliases.map(alias => [alias, route])));

function normalise(text) {
  return String(text || "").trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
}

export function resolvePresentationRoute(label) {
  return aliasToRoute.get(normalise(label)) || null;
}

export function parsePresentationCommand(text) {
  const original = String(text || "").trim();
  if (!original || /["“”]/.test(original) || /^(?:say|repeat|quote|example|i said|he said|she said|do not|don't)\b/i.test(original)) return null;
  const value = normalise(original).replace(/^wayne\s*[,;:-]?\s*/, "");
  if (/^(?:stop presenting|stop sharing(?: the screen)?|bring wayne back)$/.test(value)) return { type: "stop-presenting" };
  if (/^(?:go|enter) fullscreen$/.test(value)) return { type: "fullscreen" };
  if (/^present (?:this )?(?:report|page|screen)$/.test(value)) return { type: "present-current" };
  const open = value.match(/^open (.+?)((?: and| to) present(?: (?:it|this|the page|this page|their progress|the progress))?)?$/);
  if (!open) return null;
  const route = resolvePresentationRoute(open[1]);
  return route ? { type: "open", route, present: Boolean(open[2]) } : { type: "unknown-route", label: open[1] };
}

export function canOpenPresentationRoute(route, permissions = {}, role = "") {
  if (!APP_ROUTES.some(item => item.route === route)) return false;
  if (["finance", "funding", "quotations"].includes(route)) return Boolean(permissions.finance);
  if (route === "settings") return Boolean(permissions.director) || role === "Director";
  return true;
}

export function acceptPresentationEvent(event, activeSessionId, seen) {
  if (!event || event.sessionId !== activeSessionId || event.role !== "user" || event.isFinal !== true) return false;
  const key = String(event.providerEventId || `${event.sessionId}:${normalise(event.text)}`);
  if (!key || seen.has(key)) return false;
  seen.add(key);
  return true;
}

export const presentationRoutes = APP_ROUTES.map(item => item.route);
