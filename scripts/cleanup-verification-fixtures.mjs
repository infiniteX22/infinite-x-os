import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const db = new DatabaseSync(join(root, "data", "infinite-x-clone.sqlite"));
db.exec("PRAGMA foreign_keys=ON");
const apply = process.argv.includes("--apply");

const ids = (sql, ...params) => db.prepare(sql).all(...params).map(row => row.id);
const marks = values => values.map(() => "?").join(",") || "''";
const remove = (table, values) => {
  if (!values.length) return 0;
  return Number(db.prepare(`DELETE FROM ${table} WHERE mode='DEMO' AND id IN (${marks(values)})`).run(...values).changes);
};

const clients = ids("SELECT id FROM clients WHERE mode='DEMO' AND (name LIKE 'Verification Electrical Client %' OR name LIKE 'Archive workflow verification %')");
const projects = ids("SELECT id FROM projects WHERE mode='DEMO' AND name LIKE 'Long Electrical Construction Verification Project %'");
const tasks = ids(`SELECT id FROM tasks WHERE mode='DEMO' AND (title='Record connected workflow evidence' OR title LIKE 'Verification follow-up %' OR project_id IN (${marks(projects)}))`, ...projects);
const meetings = ids("SELECT id FROM meetings WHERE mode='DEMO' AND (topic LIKE '%verification%' OR topic LIKE 'Reschedule and cancel verification %')");
const tenders = ids("SELECT id FROM tenders WHERE mode='DEMO' AND (reference LIKE 'VERIFY-%' OR title='All-category verification tender')");
const funding = ids(`SELECT id FROM funding WHERE mode='DEMO' AND (purpose='Verification project mobilisation' OR project_id IN (${marks(projects)}))`, ...projects);
const quotations = ids(`SELECT id FROM quotations WHERE mode='DEMO' AND (description='Electrical installation verification scope' OR project_id IN (${marks(projects)}) OR client_id IN (${marks(clients)}))`, ...projects, ...clients);
const invoices = ids(`SELECT id FROM invoices WHERE mode='DEMO' AND (project_id IN (${marks(projects)}) OR id IN (SELECT invoice_id FROM quotations WHERE id IN (${marks(quotations)}) AND invoice_id IS NOT NULL))`, ...projects, ...quotations);
const documents = ids(`SELECT id FROM documents WHERE mode='DEMO' AND (title LIKE 'Verification evidence %' OR related_id IN (${marks([...projects, ...tasks, ...tenders, ...funding])}))`, ...projects, ...tasks, ...tenders, ...funding);
const compliance = ids(`SELECT id FROM compliance_items WHERE mode='DEMO' AND (title LIKE 'Verification safety requirement %' OR related_id IN (${marks(projects)}))`, ...projects);
const milestones = ids(`SELECT id FROM milestones WHERE mode='DEMO' AND (title='Verified design and procurement milestone' OR project_id IN (${marks(projects)}))`, ...projects);
const actions = ids(`SELECT id FROM meeting_actions WHERE mode='DEMO' AND (title LIKE 'Verification follow-up %' OR meeting_id IN (${marks(meetings)}))`, ...meetings);
const jobs = ids(`SELECT id FROM notification_jobs WHERE mode='DEMO' AND meeting_id IN (${marks(meetings)})`, ...meetings);
const summary = { clients, projects, tasks, meetings, tenders, funding, quotations, invoices, documents, compliance, milestones, actions, jobs };

if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", counts: Object.fromEntries(Object.entries(summary).map(([key,value]) => [key,value.length])), ids: summary }, null, 2));
  process.exit(0);
}

db.exec("BEGIN IMMEDIATE");
try {
  const deleted = {};
  deleted.outbox = jobs.length ? Number(db.prepare(`DELETE FROM outbox WHERE mode='DEMO' AND job_id IN (${marks(jobs)})`).run(...jobs).changes) : 0;
  deleted.notification_jobs = remove("notification_jobs", jobs);
  deleted.meeting_actions = remove("meeting_actions", actions);
  deleted.meetings = remove("meetings", meetings);
  deleted.task_updates = tasks.length ? Number(db.prepare(`DELETE FROM task_updates WHERE mode='DEMO' AND task_id IN (${marks(tasks)})`).run(...tasks).changes) : 0;
  deleted.tasks = remove("tasks", tasks);
  deleted.milestones = remove("milestones", milestones);
  deleted.payments = invoices.length ? Number(db.prepare(`DELETE FROM payments WHERE mode='DEMO' AND invoice_id IN (${marks(invoices)})`).run(...invoices).changes) : 0;
  deleted.funding_documents = funding.length ? Number(db.prepare(`DELETE FROM funding_documents WHERE mode='DEMO' AND funding_id IN (${marks(funding)})`).run(...funding).changes) : 0;
  deleted.documents = remove("documents", documents);
  deleted.compliance_items = remove("compliance_items", compliance);
  deleted.tender_requirements = tenders.length ? Number(db.prepare(`DELETE FROM tender_requirements WHERE mode='DEMO' AND tender_id IN (${marks(tenders)})`).run(...tenders).changes) : 0;
  deleted.funding = remove("funding", funding);
  deleted.expenses = projects.length ? Number(db.prepare(`DELETE FROM expenses WHERE mode='DEMO' AND (description='Verification materials' OR project_id IN (${marks(projects)}))`).run(...projects).changes) : 0;
  deleted.payments += Number(db.prepare("DELETE FROM payments WHERE mode='DEMO' AND reference LIKE 'VERIFY-%'").run().changes);
  deleted.invoices = remove("invoices", invoices);
  deleted.quotations = remove("quotations", quotations);
  deleted.tenders = remove("tenders", tenders);
  deleted.projects = remove("projects", projects);
  deleted.clients = remove("clients", clients);
  const recordIds = [...clients,...projects,...tasks,...meetings,...tenders,...funding,...quotations,...invoices,...documents,...compliance,...milestones,...actions,...jobs];
  deleted.audit_log = recordIds.length ? Number(db.prepare(`DELETE FROM audit_log WHERE mode='DEMO' AND record_id IN (${marks(recordIds)})`).run(...recordIds).changes) : 0;
  db.exec("COMMIT");
  console.log(JSON.stringify({ mode: "applied", deleted }, null, 2));
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
