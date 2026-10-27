export const APP_ROUTES = Object.freeze([
  { route:"dashboard", icon:"home", label:"Dashboard", heading:"Business overview", aliases:["dashboard","home","business overview"] },
  { route:"crm", icon:"users", label:"CRM", heading:"CRM", aliases:["crm","clients","client register"] },
  { route:"projects", icon:"folder", label:"Projects", heading:"Projects", aliases:["projects","project register","jobs"] },
  { route:"team", icon:"tasks", label:"Team & Tasks", heading:"Team & Tasks", aliases:["team","team and tasks","tasks","employees"] },
  { route:"quotations", icon:"invoice", label:"Quotations & Invoices", heading:"Quotations & Invoices", aliases:["quotations","quotes","invoices","quotations and invoices"] },
  { route:"tenders", icon:"briefcase", label:"Tenders", heading:"Tender Radar", aliases:["tenders","tender radar","bids"] },
  { route:"funding", icon:"coins", label:"Funding", heading:"Funding", aliases:["funding","funding readiness"] },
  { route:"finance", icon:"chart", label:"Finance", heading:"Financial visibility", aliases:["finance","financials"] },
  { route:"compliance", icon:"shield", label:"Compliance", heading:"Compliance", aliases:["compliance","compliance register"] },
  { route:"documents", icon:"document", label:"Documents", heading:"Documents", aliases:["documents","document register"] },
  { route:"meetings", icon:"calendar", label:"AI Meetings", heading:"Meetings & follow-through", aliases:["meetings","ai meetings","meeting history"] },
  { route:"reports", icon:"report", label:"Reports", heading:"Reports", aliases:["reports","report","analytics"] },
  { route:"settings", icon:"settings", label:"Settings", heading:"Settings", aliases:["settings","configuration"] }
]);

export const routeDefinition = route => APP_ROUTES.find(item=>item.route===route)||null;
export const routeLabel = route => routeDefinition(route)?.label||route;
export const routeHeading = route => routeDefinition(route)?.heading||"";
