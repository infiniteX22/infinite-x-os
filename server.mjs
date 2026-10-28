import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { tenderReadiness, fundingGap, invoiceBalance, taskStatusUpdate, requireMode, notificationKey, parseSchedulePhrase, isMeetingMinutesEmailRequest, can } from "./business-core.mjs";
import { createOpenEdgeRepository } from "./openedge-repository.mjs";
import { createLiveAvatarProvider } from "./liveavatar-provider.mjs";
import { createEmailDelivery } from "./email-delivery.mjs";
import { speechRand } from "./speech-format.mjs";
import { sessionPolicy, validateSessionCredit } from "./wayne-session-policy.mjs";
import { canOpenPresentationRoute, presentationRoutes } from "./wayne-presentation.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
for (const line of (await readFile(join(root, ".env"), "utf8").catch(() => "")).split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] == null) process.env[match[1]] = match[2];
}
const avatarProvider=createLiveAvatarProvider(process.env);
const avatarCapability=await avatarProvider.capabilities();
const emailDelivery=createEmailDelivery(process.env);
const dataDir = process.env.IX_DATA_DIR ? resolve(root, process.env.IX_DATA_DIR) : join(root, "data");
await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "infinite-x-clone.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,preferred_name TEXT,pronunciation TEXT,role TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,mode TEXT NOT NULL,name TEXT NOT NULL,client TEXT NOT NULL,owner_id TEXT NOT NULL,progress INTEGER NOT NULL,status TEXT NOT NULL,due_date TEXT NOT NULL,budget_cents INTEGER NOT NULL DEFAULT 0,cost_cents INTEGER NOT NULL DEFAULT 0,blocker TEXT,updated_at TEXT NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,mode TEXT NOT NULL,project_id TEXT NOT NULL,title TEXT NOT NULL,assignee_id TEXT NOT NULL,status TEXT NOT NULL,due_date TEXT NOT NULL,dependency_id TEXT,blocker TEXT,evidence TEXT,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,FOREIGN KEY(project_id) REFERENCES projects(id),FOREIGN KEY(assignee_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS task_updates(id TEXT PRIMARY KEY,mode TEXT NOT NULL,task_id TEXT NOT NULL,author_id TEXT NOT NULL,status TEXT NOT NULL,progress INTEGER NOT NULL,blocker TEXT,evidence TEXT,created_at TEXT NOT NULL,FOREIGN KEY(task_id) REFERENCES tasks(id));
CREATE TABLE IF NOT EXISTS tenders(id TEXT PRIMARY KEY,mode TEXT NOT NULL,reference TEXT NOT NULL,title TEXT NOT NULL,organisation TEXT NOT NULL,category TEXT NOT NULL,close_date TEXT NOT NULL,briefing_date TEXT,source_url TEXT NOT NULL,status TEXT NOT NULL,last_refreshed TEXT NOT NULL,UNIQUE(mode,reference));
CREATE TABLE IF NOT EXISTS tender_requirements(id TEXT PRIMARY KEY,mode TEXT NOT NULL,tender_id TEXT NOT NULL,label TEXT NOT NULL,mandatory INTEGER NOT NULL,status TEXT NOT NULL,document_ref TEXT,FOREIGN KEY(tender_id) REFERENCES tenders(id));
CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY,mode TEXT NOT NULL,number TEXT NOT NULL,project_id TEXT,client TEXT NOT NULL,total_cents INTEGER NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL,UNIQUE(mode,number));
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,mode TEXT NOT NULL,invoice_id TEXT NOT NULL,reference TEXT NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL,recorded_at TEXT NOT NULL,UNIQUE(mode,reference));
CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,mode TEXT NOT NULL,project_id TEXT,description TEXT NOT NULL,amount_cents INTEGER NOT NULL,incurred_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS funding(id TEXT PRIMARY KEY,mode TEXT NOT NULL,type TEXT NOT NULL,purpose TEXT NOT NULL,project_id TEXT,invoice_id TEXT,po_reference TEXT,provider TEXT,required_cents INTEGER NOT NULL,available_cents INTEGER NOT NULL,status TEXT NOT NULL,terms TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS funding_documents(id TEXT PRIMARY KEY,mode TEXT NOT NULL,funding_id TEXT NOT NULL,label TEXT NOT NULL,status TEXT NOT NULL,FOREIGN KEY(funding_id) REFERENCES funding(id));
CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY,mode TEXT NOT NULL,topic TEXT NOT NULL,starts_at TEXT NOT NULL,timezone TEXT NOT NULL,agenda TEXT NOT NULL,status TEXT NOT NULL,agenda_send_at TEXT,reminder_minutes INTEGER NOT NULL,summary TEXT,decisions TEXT,created_by TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meeting_actions(id TEXT PRIMARY KEY,mode TEXT NOT NULL,meeting_id TEXT NOT NULL,title TEXT NOT NULL,owner_id TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,FOREIGN KEY(meeting_id) REFERENCES meetings(id));
CREATE TABLE IF NOT EXISTS notification_jobs(id TEXT PRIMARY KEY,mode TEXT NOT NULL,meeting_id TEXT NOT NULL,kind TEXT NOT NULL,scheduled_for TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,dedupe_key TEXT NOT NULL UNIQUE,last_error TEXT,delivered_at TEXT);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,mode TEXT NOT NULL,job_id TEXT NOT NULL UNIQUE,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wayne_messages(id TEXT PRIMARY KEY,mode TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,sources TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS avatar_sessions(id TEXT PRIMARY KEY,mode TEXT NOT NULL,user_id TEXT NOT NULL,provider_session_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL,business_context INTEGER NOT NULL DEFAULT 0,briefing TEXT NOT NULL,transcript TEXT NOT NULL DEFAULT '',started_at TEXT NOT NULL,expires_at TEXT NOT NULL,ended_at TEXT,last_error TEXT);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,mode TEXT,user_id TEXT NOT NULL,action TEXT NOT NULL,record_type TEXT,record_id TEXT,detail TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS connector_status(id TEXT PRIMARY KEY,mode TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,last_refresh TEXT,error TEXT,source_url TEXT NOT NULL);`);
db.exec(`
CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,mode TEXT NOT NULL,name TEXT NOT NULL,contact_name TEXT,email TEXT,phone TEXT,status TEXT NOT NULL DEFAULT 'Active',notes TEXT,updated_at TEXT NOT NULL,UNIQUE(mode,name));
CREATE TABLE IF NOT EXISTS milestones(id TEXT PRIMARY KEY,mode TEXT NOT NULL,project_id TEXT NOT NULL,title TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL,owner_id TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(project_id) REFERENCES projects(id),FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS quotations(id TEXT PRIMARY KEY,mode TEXT NOT NULL,number TEXT NOT NULL,client_id TEXT,project_id TEXT,description TEXT NOT NULL,subtotal_cents INTEGER NOT NULL,vat_cents INTEGER NOT NULL,total_cents INTEGER NOT NULL,status TEXT NOT NULL,valid_until TEXT NOT NULL,invoice_id TEXT,updated_at TEXT NOT NULL,UNIQUE(mode,number));
CREATE TABLE IF NOT EXISTS compliance_items(id TEXT PRIMARY KEY,mode TEXT NOT NULL,title TEXT NOT NULL,standard_ref TEXT,owner_id TEXT NOT NULL,expiry_date TEXT,status TEXT NOT NULL,evidence TEXT,related_type TEXT,related_id TEXT,updated_at TEXT NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,mode TEXT NOT NULL,title TEXT NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,content_base64 TEXT NOT NULL,related_type TEXT NOT NULL,related_id TEXT,revision INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'Current',uploaded_by TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(uploaded_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS company_settings(mode TEXT PRIMARY KEY,company_name TEXT NOT NULL,email TEXT,phone TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wayne_privacy_settings(mode TEXT PRIMARY KEY,retention_days INTEGER NOT NULL DEFAULT 30,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_deletion_jobs(id TEXT PRIMARY KEY,mode TEXT NOT NULL,user_id TEXT NOT NULL,provider_session_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 3,next_attempt_at TEXT NOT NULL,last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
CREATE TABLE IF NOT EXISTS wayne_session_summaries(id TEXT PRIMARY KEY,mode TEXT NOT NULL,user_id TEXT NOT NULL,avatar_session_id TEXT NOT NULL UNIQUE,last_topic TEXT NOT NULL,relevant_facts TEXT NOT NULL,unresolved_questions TEXT NOT NULL,confirmed_decisions_actions TEXT NOT NULL,summary TEXT NOT NULL,outbound_summary TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wayne_meetings(id TEXT PRIMARY KEY,mode TEXT NOT NULL,company_id TEXT NOT NULL,owner_id TEXT NOT NULL,title TEXT NOT NULL,title_manual INTEGER NOT NULL DEFAULT 0,agenda TEXT NOT NULL,meeting_kind TEXT NOT NULL,follow_up_of TEXT,recall_meeting_id TEXT,status TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,timezone TEXT NOT NULL,transcript_completeness TEXT NOT NULL DEFAULT 'No transcript captured',transcript_revision INTEGER NOT NULL DEFAULT 0,recap_revision INTEGER NOT NULL DEFAULT 0,recap TEXT NOT NULL DEFAULT '',unresolved_topics TEXT NOT NULL DEFAULT '',confirmed_decisions TEXT NOT NULL DEFAULT '',approved_actions TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id),FOREIGN KEY(follow_up_of) REFERENCES wayne_meetings(id));
CREATE TABLE IF NOT EXISTS wayne_transcript_events(id TEXT PRIMARY KEY,mode TEXT NOT NULL,meeting_id TEXT NOT NULL,avatar_session_id TEXT NOT NULL,speaker TEXT NOT NULL,content TEXT NOT NULL,occurred_at TEXT NOT NULL,provider_event_id TEXT,event_fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(mode,meeting_id,event_fingerprint),FOREIGN KEY(meeting_id) REFERENCES wayne_meetings(id));
`);
try{db.exec("ALTER TABLE documents ADD COLUMN storage_path TEXT");}catch(error){if(!String(error.message).includes("duplicate column"))throw error;}
for(const sql of [
  "ALTER TABLE notification_jobs ADD COLUMN next_attempt_at TEXT",
  "ALTER TABLE notification_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3",
  "ALTER TABLE notification_jobs ADD COLUMN cancelled_at TEXT",
  "ALTER TABLE notification_jobs ADD COLUMN updated_at TEXT",
  "ALTER TABLE outbox ADD COLUMN provider TEXT",
  "ALTER TABLE outbox ADD COLUMN provider_message_id TEXT",
  "ALTER TABLE outbox ADD COLUMN last_error TEXT",
  "ALTER TABLE avatar_sessions ADD COLUMN meeting_id TEXT",
  "ALTER TABLE wayne_session_summaries ADD COLUMN meeting_id TEXT",
  "ALTER TABLE wayne_session_summaries ADD COLUMN transcript_revision INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE wayne_meetings ADD COLUMN title_manual INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tenders ADD COLUMN description TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tenders ADD COLUMN published_date TEXT",
  "ALTER TABLE tenders ADD COLUMN source_name TEXT NOT NULL DEFAULT 'Manual import'",
  "ALTER TABLE tenders ADD COLUMN relevance_score INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tenders ADD COLUMN relevance_label TEXT NOT NULL DEFAULT 'Review'",
  "ALTER TABLE tenders ADD COLUMN relevance_reason TEXT NOT NULL DEFAULT 'Manual review required'",
  "ALTER TABLE tenders ADD COLUMN public_source INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE quotations ADD COLUMN issue_date TEXT",
  "ALTER TABLE quotations ADD COLUMN service_title TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE quotations ADD COLUMN tax_rate REAL NOT NULL DEFAULT 15",
  "ALTER TABLE quotations ADD COLUMN deposit_cents INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE quotations ADD COLUMN payment_terms TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE quotations ADD COLUMN payment_milestones TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE quotations ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE quotations ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE quotations ADD COLUMN revision INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE compliance_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'",
  "ALTER TABLE compliance_items ADD COLUMN authority TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE compliance_items ADD COLUMN frequency TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE compliance_items ADD COLUMN applicability TEXT NOT NULL DEFAULT 'Confirm applicability'",
  "ALTER TABLE compliance_items ADD COLUMN mandatory INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE compliance_items ADD COLUMN notes TEXT NOT NULL DEFAULT ''"
])try{db.exec(sql)}catch(error){if(!String(error.message).includes("duplicate column"))throw error;}
db.exec("UPDATE wayne_meetings SET transcript_completeness=CASE transcript_completeness WHEN 'Complete' THEN 'Complete transcript' WHEN 'Partial' THEN 'Partial transcript' WHEN 'Unavailable' THEN 'No transcript captured' ELSE transcript_completeness END");
db.exec(`INSERT OR IGNORE INTO wayne_privacy_settings(mode,retention_days,updated_at) VALUES ('DEMO',30,datetime('now')),('REAL',30,datetime('now'));`);

const now = () => new Date().toISOString();
const johannesburgDate = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone:"Africa/Johannesburg", year:"numeric", month:"2-digit", day:"2-digit" }).format(value);
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const sha = value => createHash("sha256").update(String(value)).digest("hex");
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const insert = (table, columns, rows) => {
  const statement = db.prepare(`INSERT OR IGNORE INTO ${table}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
  for (const row of rows) statement.run(...row);
};

insert("users", ["id", "name", "preferred_name", "pronunciation", "role", "password_hash"], [
  ["director", "Alex Mokoena", "Alex", "AH-leks", "Director", sha("Demo!2026")],
  ["tm", "Thandi Maseko", "Thandi", "", "Project Manager", sha("Demo!2026")],
  ["sc", "Sipho Cele", "Sipho", "SEE-poh", "Electrician", sha("Demo!2026")],
  ["lr", "Lerato Radebe", "Lerato", "", "Electrician", sha("Demo!2026")],
  ["mr", "Mpho Radebe", "Mpho", "", "Finance", sha("Demo!2026")],
  ["kd", "Kagiso Dube", "Kagiso", "", "Estimator", sha("Demo!2026")]
]);

if (!db.prepare("SELECT 1 FROM projects WHERE mode='DEMO'").get()) {
  const stamp = "2026-10-23T09:30:00.000Z";
  insert("projects", ["id","mode","name","client","owner_id","progress","status","due_date","budget_cents","cost_cents","blocker","updated_at"], [
    ["p-clinic","DEMO","Clinic electrical upgrade","Riverside Clinic","tm",68,"At risk","2026-11-30",42000000,28700000,"Drawing approval outstanding",stamp],
    ["p-school","DEMO","School lighting retrofit","Greenwood High","lr",82,"On track","2026-12-15",31000000,21400000,"",stamp],
    ["p-warehouse","DEMO","Warehouse LV installation","LogiStore","sc",45,"On track","2026-11-20",56000000,25200000,"",stamp],
    ["p-solar","DEMO","Municipal solar backup","Kopano Municipality","tm",27,"At risk","2027-01-18",78000000,20100000,"Metering approval pending",stamp],
    ["p-office","DEMO","Office DB replacement","Meridian Offices","lr",91,"On track","2026-11-04",12000000,9900000,"",stamp],
    ["p-retail","DEMO","Retail fire-alarm integration","Nala Retail","sc",36,"On track","2026-12-20",18500000,7200000,"",stamp]
  ]);
  insert("tasks", ["id","mode","project_id","title","assignee_id","status","due_date","dependency_id","blocker","evidence","updated_at","updated_by"], [
    ["t-site","DEMO","p-clinic","Complete site preparation","sc","Reported complete","2026-10-22","","","2 files","2026-10-23T09:24:00.000Z","sc"],
    ["t-drawing","DEMO","p-clinic","Approve electrical drawings","tm","Blocked","2026-10-21","t-site","Client approval required","Client marked-up drawing","2026-10-23T07:17:00.000Z","tm"],
    ["t-switchgear","DEMO","p-clinic","Receive switchgear delivery","kd","Blocked","2026-10-20","t-drawing","Supplier delivery delayed","Supplier email","2026-10-22T14:03:00.000Z","kd"],
    ["t-lighting","DEMO","p-school","Submit lighting design","lr","Reported complete","2026-10-22","","","Design revision 3","2026-10-23T07:17:00.000Z","lr"],
    ["t-test","DEMO","p-warehouse","LV board factory test","sc","In progress","2026-10-19","","Test witness outstanding","","2026-10-22T11:00:00.000Z","sc"],
    ["t-meter","DEMO","p-solar","Confirm metering approval","tm","Blocked","2026-10-18","","Municipal response outstanding","Email trail","2026-10-21T09:00:00.000Z","tm"]
  ]);
  insert("task_updates", ["id","mode","task_id","author_id","status","progress","blocker","evidence","created_at"], [
    ["u1","DEMO","t-site","sc","Reported complete",100,"","2 files","2026-10-23T09:24:00.000Z"],
    ["u2","DEMO","t-lighting","lr","Reported complete",100,"","1 file","2026-10-23T07:17:00.000Z"],
    ["u3","DEMO","t-switchgear","kd","Blocked",35,"Supplier delivery delayed","Supplier email","2026-10-22T14:03:00.000Z"]
  ]);
  const tenders = [
    ["tdr17","TDR-2026-017","Riverside Clinic Electrical Works","Riverside Health","Electrical","2026-10-28","2026-10-25T08:00:00+02:00"],
    ["tdr21","TDR-2026-021","Municipal General Services","Kopano Municipality","General Services","2026-11-02",null],
    ["tdr24","TDR-2026-024","Substation Protection Upgrade","Eskom Distribution","Electrical","2026-11-09","2026-10-29T10:00:00+02:00"]
  ];
  for (let n = 4; n <= 18; n += 1) tenders.push([`tdr${30+n}`,`TDR-2026-${String(30+n).padStart(3,"0")}`,`Public opportunity ${n}`,`Public Entity ${n}`,n%3===0?"Construction":n%2===0?"Electrical":"All categories",`2026-11-${String(Math.min(28, n+2)).padStart(2,"0")}`,null]);
  insert("tenders", ["id","mode","reference","title","organisation","category","close_date","briefing_date","source_url","status","last_refreshed"], tenders.map(t => [t[0],"DEMO",...t.slice(1,7),"https://www.etenders.gov.za/","Tracking",stamp]));
  insert("tender_requirements", ["id","mode","tender_id","label","mandatory","status","document_ref"], [
    ["r1","DEMO","tdr17","Tax compliance PIN",1,"Verified","DOC-TAX-01"],
    ["r2","DEMO","tdr17","CIDB grading",1,"Verified","DOC-CIDB-04"],
    ["r3","DEMO","tdr17","Signed pricing schedule",1,"Verified","DOC-PRICE-17"],
    ["r4","DEMO","tdr17","Site briefing attendance",1,"Provided","ATTEND-17"],
    ["r5","DEMO","tdr17","Method statement",1,"Verified","DOC-METHOD-17"],
    ["r6","DEMO","tdr17","Safety file index",1,"Verified","DOC-SAFETY-17"],
    ["r7","DEMO","tdr21","Company registration",1,"Verified","DOC-CIPC"],
    ["r8","DEMO","tdr21","Three references",1,"Provided","DOC-REFS"],
    ["r9","DEMO","tdr21","Municipal rates clearance",1,"Missing",null],
    ["r10","DEMO","tdr21","Pricing schedule",1,"Verified","DOC-PRICE-21"],
    ["r11","DEMO","tdr21","B-BBEE affidavit",1,"Missing",null]
  ]);
  const amounts = [8500000,6000000,4000000,2000000,1500000,1000000,500000,500000,300000,200000,500000,500000];
  insert("invoices", ["id","mode","number","project_id","client","total_cents","due_date","status"], amounts.map((amount,i)=>[`inv${i+1}`,"DEMO",`INV-2026-${String(i+1).padStart(3,"0")}`,i<4?["p-clinic","p-school","p-warehouse","p-office"][i]:null,`Demo client ${i+1}`,amount,i<4?"2026-09-20":"2026-11-15","Issued"]));
  insert("payments", ["id","mode","invoice_id","reference","amount_cents","status","recorded_at"], [["pay1","DEMO","inv2","DEMO-RECEIPT-001",1000000,"Recorded","2026-10-10T08:00:00Z"]]);
  insert("expenses", ["id","mode","project_id","description","amount_cents","incurred_at"], [["ex1","DEMO","p-clinic","Cable and containment",12300000,"2026-10-08"],["ex2","DEMO","p-school","LED fittings",8400000,"2026-10-12"]]);
  insert("funding", ["id","mode","type","purpose","project_id","invoice_id","po_reference","provider","required_cents","available_cents","status","terms","updated_at"], [["fund1","DEMO","PO funding","Clinic electrical upgrade working capital","p-clinic",null,"PO-RC-2026-44","Not selected",26000000,8000000,"Application in progress","No offer or approval recorded.",stamp]]);
  insert("funding_documents", ["id","mode","funding_id","label","status"], [["fd1","DEMO","fund1","Signed purchase order","Verified"],["fd2","DEMO","fund1","Supplier quotations","Missing"],["fd3","DEMO","fund1","Latest management accounts","Missing"],["fd4","DEMO","fund1","Project cash-flow forecast","Verified"]]);
  insert("meetings", ["id","mode","topic","starts_at","timezone","agenda","status","agenda_send_at","reminder_minutes","summary","decisions","created_by","updated_at"], [["meet1","DEMO","Business review","2026-10-26T09:00:00+02:00","Africa/Johannesburg","1. Project blockers\n2. Tender readiness\n3. Funding documents","Scheduled","2026-10-25T16:00:00+02:00",15,"","","director",stamp]]);
  insert("meeting_actions", ["id","mode","meeting_id","title","owner_id","due_date","status","approved","created_at"], Array.from({length:7},(_,i)=>[`ma${i+1}`,"DEMO","meet1",["Obtain clinic drawing approval","Verify tender briefing attendance","Upload supplier quotations","Complete cash-flow forecast","Confirm switchgear date","Review overdue invoices","Prepare safety evidence"][i],["tm","kd","mr","mr","kd","mr","sc"][i],["2026-10-27","2026-10-28","2026-10-29","2026-10-30","2026-10-31","2026-11-02","2026-11-03"][i],i===0?"In progress":"Open",1,stamp]));
  insert("connector_status", ["id","mode","name","status","last_refresh","error","source_url"], [["ocds","DEMO","National Treasury OCDS","Demo snapshot",stamp,null,"https://data.etenders.gov.za/"],["ocds-real","REAL","National Treasury OCDS","Not refreshed",null,null,"https://data.etenders.gov.za/"]]);
  insert("clients",["id","mode","name","contact_name","email","phone","status","notes","updated_at"],[
    ["c-riverside","DEMO","Riverside Clinic","Nomsa Khumalo","projects@riverside.example","+27 11 555 0140","Active","Clinical facilities programme",stamp],
    ["c-greenwood","DEMO","Greenwood High","David Nkosi","facilities@greenwood.example","+27 11 555 0151","Active","Lighting efficiency programme",stamp],
    ["c-logistore","DEMO","LogiStore","Ayesha Patel","operations@logistore.example","+27 11 555 0162","Active","Warehouse LV installation",stamp],
    ["c-kopano","DEMO","Kopano Municipality","Thabo Moagi","infrastructure@kopano.example","+27 11 555 0173","Active","Municipal infrastructure",stamp]
  ]);
  insert("milestones",["id","mode","project_id","title","due_date","status","owner_id","updated_at"],[
    ["ms1","DEMO","p-clinic","Approved construction drawings","2026-10-28","At risk","tm",stamp],
    ["ms2","DEMO","p-clinic","First-fix electrical installation","2026-11-14","In progress","sc",stamp],
    ["ms3","DEMO","p-school","Lighting commissioning","2026-12-05","In progress","lr",stamp]
  ]);
  insert("quotations",["id","mode","number","client_id","project_id","description","subtotal_cents","vat_cents","total_cents","status","valid_until","invoice_id","updated_at"],[
    ["q1","DEMO","QUO-2026-014","c-riverside","p-clinic","Variation: emergency lighting and containment",1250000,187500,1437500,"Accepted","2026-11-15",null,stamp],
    ["q2","DEMO","QUO-2026-015","c-logistore","p-warehouse","Additional LV distribution board works",980000,147000,1127000,"Sent","2026-11-20",null,stamp]
  ]);
  insert("compliance_items",["id","mode","title","standard_ref","owner_id","expiry_date","status","evidence","related_type","related_id","updated_at"],[
    ["co1","DEMO","CIDB contractor grading","CIDB 4EB","director","2027-03-31","Compliant","CIDB certificate DOC-CIDB-04","company",null,stamp],
    ["co2","DEMO","Electrical contractor registration","ECB registration","tm","2026-11-08","Expiring soon","Registration certificate revision 2","company",null,stamp],
    ["co3","DEMO","Clinic project safety file","OHS Act","sc","2026-11-30","Evidence required","","project","p-clinic",stamp]
  ]);
  insert("documents",["id","mode","title","file_name","mime_type","content_base64","related_type","related_id","revision","status","uploaded_by","created_at"],[
    ["doc1","DEMO","Clinic marked-up electrical drawing","clinic-drawing-rev3.txt","text/plain",Buffer.from("Demo evidence: client marked-up drawing revision 3. Approval remains outstanding.").toString("base64"),"project","p-clinic",3,"Current","tm",stamp],
    ["doc2","DEMO","CIDB certificate","cidb-certificate-demo.txt","text/plain",Buffer.from("Fictional Demo Mode certificate record. Not valid for real-world use.").toString("base64"),"compliance","co1",1,"Current","director",stamp]
  ]);
}
/* Independent demo seeds keep newly added modules coherent when upgrading an existing clone database. */
const moduleStamp="2026-10-23T09:30:00.000Z";
insert("clients",["id","mode","name","contact_name","email","phone","status","notes","updated_at"],[["c-riverside","DEMO","Riverside Clinic","Nomsa Khumalo","projects@riverside.example","+27 11 555 0140","Active","Clinical facilities programme",moduleStamp],["c-greenwood","DEMO","Greenwood High","David Nkosi","facilities@greenwood.example","+27 11 555 0151","Active","Lighting efficiency programme",moduleStamp],["c-logistore","DEMO","LogiStore","Ayesha Patel","operations@logistore.example","+27 11 555 0162","Active","Warehouse LV installation",moduleStamp],["c-kopano","DEMO","Kopano Municipality","Thabo Moagi","infrastructure@kopano.example","+27 11 555 0173","Active","Municipal infrastructure",moduleStamp]]);
insert("milestones",["id","mode","project_id","title","due_date","status","owner_id","updated_at"],[["ms1","DEMO","p-clinic","Approved construction drawings","2026-10-28","At risk","tm",moduleStamp],["ms2","DEMO","p-clinic","First-fix electrical installation","2026-11-14","In progress","sc",moduleStamp],["ms3","DEMO","p-school","Lighting commissioning","2026-12-05","In progress","lr",moduleStamp]]);
insert("quotations",["id","mode","number","client_id","project_id","description","subtotal_cents","vat_cents","total_cents","status","valid_until","invoice_id","updated_at"],[["q1","DEMO","QUO-2026-014","c-riverside","p-clinic","Variation: emergency lighting and containment",1250000,187500,1437500,"Accepted","2026-11-15",null,moduleStamp],["q2","DEMO","QUO-2026-015","c-logistore","p-warehouse","Additional LV distribution board works",980000,147000,1127000,"Sent","2026-11-20",null,moduleStamp]]);
insert("compliance_items",["id","mode","title","standard_ref","owner_id","expiry_date","status","evidence","related_type","related_id","updated_at"],[["co1","DEMO","CIDB contractor grading","CIDB 4EB","director","2027-03-31","Compliant","CIDB certificate DOC-CIDB-04","company",null,moduleStamp],["co2","DEMO","Electrical contractor registration","ECB registration","tm","2026-11-08","Expiring soon","Registration certificate revision 2","company",null,moduleStamp],["co3","DEMO","Clinic project safety file","OHS Act","sc","2026-11-30","Evidence required","","project","p-clinic",moduleStamp]]);
insert("documents",["id","mode","title","file_name","mime_type","content_base64","related_type","related_id","revision","status","uploaded_by","created_at"],[["doc1","DEMO","Clinic marked-up electrical drawing","clinic-drawing-rev3.txt","text/plain",Buffer.from("Demo evidence: client marked-up drawing revision 3. Approval remains outstanding.").toString("base64"),"project","p-clinic",3,"Current","tm",moduleStamp],["doc2","DEMO","CIDB certificate","cidb-certificate-demo.txt","text/plain",Buffer.from("Fictional Demo Mode certificate record. Not valid for real-world use.").toString("base64"),"compliance","co1",1,"Current","director",moduleStamp]]);
insert("company_settings",["mode","company_name","email","phone","updated_at"],[["DEMO","Infinite-X Electrical Demonstration Company","operations@example.invalid","+27 11 555 0100",now()],["REAL","Infinite-X Group","","",now()]]);

const sessions = new Map();
const openEdgeExecutable="C:\\Progress\\OpenEdge\\bin\\_progres.exe";
let openEdgeProbe={verified:false,activeRepository:false,evidence:"OpenEdge executable or database was not found."};
let openEdgeRepository=null;
let openEdgeInitialization={active:false,evidence:"OpenEdge repository has not initialised."};
if(existsSync(openEdgeExecutable)&&existsSync(join(root,"data","openedge","ixosoe.db"))){
  const probe=spawnSync(openEdgeExecutable,["-b","-db","..\\data\\openedge\\ixosoe","-p","verify-runtime.p","-nosplash"],{cwd:join(root,"openedge"),encoding:"utf8",timeout:20000,env:{...process.env,DLC:"C:\\Progress\\OpenEdge",PATH:`C:\\Progress\\OpenEdge\\bin;${process.env.PATH||""}`}});
  openEdgeProbe={verified:probe.status===0&&String(probe.stdout).includes("OPENEDGE_PROJECT=oe-clinic"),activeRepository:false,evidence:String(probe.stdout||probe.stderr||"").trim(),exitCode:probe.status};
  if(!process.env.IX_DATA_DIR){
    try{
      openEdgeRepository=createOpenEdgeRepository({db,root,dataDir});
      openEdgeInitialization={active:true,...openEdgeRepository.initialize()};
      const repairedDemoDates=db.prepare("UPDATE meeting_actions SET due_date=CASE id WHEN 'ma6' THEN '2026-11-02' WHEN 'ma7' THEN '2026-11-03' END WHERE mode='DEMO' AND ((id='ma6' AND due_date='2026-10-32') OR (id='ma7' AND due_date='2026-10-33'))").run();
      if(repairedDemoDates.changes) openEdgeInitialization.demo=openEdgeRepository.syncMode("DEMO",{actor:"system",role:"System",operation:"meeting_actions"});
      openEdgeProbe={...openEdgeProbe,activeRepository:true,evidence:`${openEdgeProbe.evidence}\n${openEdgeRepository.status().evidence}`.trim()};
    }catch(error){
      openEdgeRepository=null;
      openEdgeInitialization={active:false,evidence:error.message};
      openEdgeProbe={...openEdgeProbe,activeRepository:false,evidence:`${openEdgeProbe.evidence}\nRepository initialisation failed: ${error.message}`.trim()};
    }
  }else openEdgeInitialization={active:false,evidence:"Operational OpenEdge repository is deliberately disabled for isolated SQLite fixtures."};
}
db.prepare("UPDATE wayne_meetings SET title_manual=0 WHERE meeting_kind!='New' AND title_manual=1 AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.record_type='wayne_meeting' AND a.record_id=wayne_meetings.id AND a.action='Wayne meeting subject renamed')").run();
db.prepare("UPDATE wayne_meetings SET title_manual=1 WHERE title_manual=0 AND meeting_kind='New' AND title!='Untitled meeting' AND title NOT LIKE 'Wayne conversation — %'").run();
function refreshWayneFromOpenEdge(s){
  if(!openEdgeRepository)return{source:"isolated fixture cache"};
  try{return{source:"OpenEdge",...openEdgeRepository.hydrateMode(s.mode)}}
  catch(error){throw Object.assign(new Error(`Recorded meeting history could not be retrieved from OpenEdge. Retry the request. ${error.message}`),{status:503});}
}
function persistWayneToOpenEdge(s,operation="wayne_transcript_events"){
  if(!openEdgeRepository)return{saved:true,source:"isolated fixture cache"};
  try{return{saved:true,source:"OpenEdge",...openEdgeRepository.syncMode(s.mode,{actor:s.user.id,role:s.user.role,operation})}}
  catch(error){return{saved:false,source:"OpenEdge",error:error.message}}
}
const json = (res, status, body) => {
  if(openEdgeRepository&&res.ixSync&&((status>=200&&status<300)||res.ixSync.force)){
    try{
      const saved=openEdgeRepository.syncMode(res.ixSync.mode,res.ixSync);
      if(body&&typeof body==="object")body={...body,repository:{saved:true,revision:saved.revision}};
    }catch(error){
      try{openEdgeRepository.hydrateMode(res.ixSync.mode);}catch(restoreError){console.error("OpenEdge cache restore failed",restoreError);}
      if(status>=200&&status<300){status=503;body={error:`OpenEdge repository rejected the change: ${error.message}`,repository:{saved:false}};}
      else if(body&&typeof body==="object")body={...body,repository:{saved:false,error:error.message}};
    }
  }
  res.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...securityHeaders }); res.end(JSON.stringify(body));
};
const securityHeaders = { "X-Content-Type-Options":"nosniff", "X-Frame-Options":"SAMEORIGIN", "Referrer-Policy":"no-referrer", "Content-Security-Policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' https://api.openai.com https://api.liveavatar.com https://*.livekit.cloud wss://*.livekit.cloud; frame-ancestors 'self'; form-action 'self'" };
const body = req => new Promise((resolve, reject) => { let raw=""; req.on("data", c => { raw += c; if (raw.length > 2_000_000) reject(new Error("Request too large")); }); req.on("end",()=>{ try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); } }); req.on("error",reject); });
const session = req => sessions.get(String(req.headers.authorization||"").replace(/^Bearer\s+/i,""));
const audit = (s, action, type="", id="", detail="") => db.prepare("INSERT INTO audit_log(mode,user_id,action,record_type,record_id,detail,created_at) VALUES (?,?,?,?,?,?,?)").run(s?.mode||null,s?.user?.id||"system",action,type,id,detail,now());
const requireSession = (req,res) => { const s=session(req); if(!s) json(res,401,{error:"Sign in required."}); return s; };
const scoped = (s, requested) => { const mode=requireMode(requested||s.mode); if(mode!==s.mode) throw new Error("Mode mismatch. Change mode explicitly before accessing records."); return mode; };
const clean=(value,max=500)=>String(value??"").trim().slice(0,max);
const positiveMoney=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error("Enter a valid non-negative amount.");return Math.round(n*100)};
const required=(input,fields)=>{for(const field of fields)if(!clean(input[field]))throw new Error(`${field.replace(/([A-Z])/g," $1")} is required.`)};
const requireWrite=(s,res,area="director")=>{const ok=s.user.role==="Director"||(area==="finance"&&s.user.role==="Finance")||(area==="projects"&&s.user.role==="Project Manager");if(!ok)json(res,403,{error:"Your role does not have permission for this change."});return ok};

const tenderRelevance=(record)=>{
  const text=`${record.title||""} ${record.description||""} ${record.category||""}`.toLowerCase();
  const signals=[
    [35,/\belectrical|electricity|electrification\b/,"electrical work"],
    [24,/\bwiring|lighting|switchgear|transformer|substation|metering\b/,"electrical systems"],
    [20,/\binstallation|maintenance|repair|upgrade|retrofit\b/,"installation or maintenance"],
    [18,/\bconstruction|building|infrastructure|contractor\b/,"construction delivery"],
    [18,/\bsolar|photovoltaic|generator|backup power|ups\b/,"energy systems"],
    [12,/\bfire alarm|access control|cctv|data cabling\b/,"building technology"]
  ];
  const matched=signals.filter(([,pattern])=>pattern.test(text)),score=Math.min(100,matched.reduce((sum,[weight])=>sum+weight,0));
  return{score,label:score>=55?"High":score>=25?"Medium":"Low",reason:matched.length?`Matched ${matched.map(x=>x[2]).join(", ")}. Automated relevance; review before bidding.`:"No electrical-construction keyword match. Automated relevance; review manually."};
};
const quotationCalculation=(input)=>{
  const items=(Array.isArray(input.items)?input.items:[]).slice(0,60).map((item,index)=>{
    const description=clean(item.description||item.name,300),quantity=Number(item.quantity),unitPrice=Number(item.unitPrice),discount=Number(item.discount||0);
    if(!description)throw new Error(`Line ${index+1}: description is required.`);
    if(!Number.isFinite(quantity)||quantity<=0)throw new Error(`Line ${index+1}: quantity must be greater than zero.`);
    if(!Number.isFinite(unitPrice)||unitPrice<0)throw new Error(`Line ${index+1}: enter a valid unit price.`);
    if(!Number.isFinite(discount)||discount<0||discount>100)throw new Error(`Line ${index+1}: discount must be between 0 and 100.`);
    const unitPriceCents=Math.round(unitPrice*100),lineTotalCents=Math.round(quantity*unitPriceCents*(1-discount/100));
    return{description,quantity,unitPriceCents,discount,lineTotalCents};
  });
  if(!items.length)throw new Error("Add at least one quotation line item.");
  const taxRate=Number(input.taxRate??15);if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)throw new Error("Tax rate must be between 0 and 100.");
  const subtotalCents=items.reduce((sum,item)=>sum+item.lineTotalCents,0),vatCents=Math.round(subtotalCents*taxRate/100),totalCents=subtotalCents+vatCents,depositCents=positiveMoney(input.deposit||0);
  if(depositCents>totalCents)throw new Error("Deposit cannot exceed the quotation total.");
  return{items,taxRate,subtotalCents,vatCents,totalCents,depositCents};
};

const complianceBaseline=[
  ["Company","CIPC annual return and beneficial ownership","Companies Act / CIPC","CIPC","Annual","All registered companies",1],
  ["Tax","Income tax and Tax Compliance Status","SARS TCS","SARS","Ongoing","All tax-registered businesses",1],
  ["Tax","VAT registration and returns","Value-Added Tax Act","SARS","Per filing period","If VAT registered or registration threshold applies",0],
  ["Employment","PAYE, UIF and SDL registration/submissions","Fourth Schedule / UI Act / SDL Act","SARS / UIF","Monthly and annual","If employees or thresholds apply",0],
  ["Employment","Compensation Fund registration, ROE and Letter of Good Standing","COIDA","Compensation Fund","Annual","If employees",1],
  ["Tendering","Central Supplier Database registration","National Treasury CSD","National Treasury","Maintain current","For public-sector procurement",1],
  ["Tendering","B-BBEE certificate or affidavit","B-BBEE Act and codes","Accredited agency / affidavit","Annual","Tender and client dependent",0],
  ["Construction","CIDB contractor registration and grading","CIDB Act","CIDB","Renewal cycle","For construction works at applicable values/classes",0],
  ["Electrical","Electrical contractor registration","Electrical Installation Regulations","Department of Employment and Labour","Renewal cycle","For electrical installation work",1],
  ["Electrical","Registered-person credentials for certificates of compliance","Electrical Installation Regulations","Department of Employment and Labour","Renewal cycle","For personnel issuing electrical CoCs",1],
  ["Health & safety","OHS policy, risk assessments and appointments","Occupational Health and Safety Act","Department of Employment and Labour","Review annually","If employer / workplace",1],
  ["Health & safety","Construction work permit/notification and site safety file","Construction Regulations","Department of Employment and Labour","Per project","Project-specific; thresholds and work type apply",0],
  ["Health & safety","Medical fitness and working-at-height evidence","Construction Regulations / OHS controls","Appointed occupational health provider","Per role / expiry","Where work or client rules require",0],
  ["Insurance","Public liability, contract works and vehicle cover","Contract requirements","Insurer / client","Policy renewal","Contract and asset dependent",0],
  ["Information governance","POPIA information officer, privacy and security controls","POPIA","Information Regulator","Ongoing","Where personal information is processed",1],
  ["Information governance","PAIA manual and required submissions","PAIA","Information Regulator","Review on change","Applicability and exemptions must be confirmed",0],
  ["Employment","Employment contracts, BCEA records and workplace policies","BCEA / EEA","Department of Employment and Labour","Ongoing","If employees",1],
  ["Employment","Employment Equity reporting","Employment Equity Act","Department of Employment and Labour","Annual","If designated-employer rules apply",0],
  ["Skills","Workplace Skills Plan and Annual Training Report","Skills Development Act","Relevant SETA","Annual","If levy/SETA rules apply",0],
  ["Operations","Tools, test instruments and safety equipment inspections","OHS controls / manufacturer requirements","Internal / accredited service","Scheduled","Equipment dependent",1],
  ["Records","Financial, tax, payroll and project record retention","Applicable tax, labour and contract rules","CIPC / SARS / Department of Employment and Labour","Ongoing","Retention period depends on record type",1]
];
let complianceSeeded=false;
for(const mode of ["DEMO","REAL"]){
  for(const [index,row] of complianceBaseline.entries()){
    const id=`baseline-${mode.toLowerCase()}-${String(index+1).padStart(2,"0")}`;
    const result=db.prepare("INSERT OR IGNORE INTO compliance_items(id,mode,title,standard_ref,owner_id,expiry_date,status,evidence,related_type,related_id,updated_at,category,authority,frequency,applicability,mandatory,notes) VALUES (?,?,?,?,?,NULL,'Review applicability','', 'company',NULL,?,?,?,?,?,?,?)").run(id,mode,row[1],row[2],"director",now(),row[0],row[3],row[4],row[5],row[6],"Baseline checklist only; confirm applicability and due dates with the responsible adviser or authority.");
    complianceSeeded=complianceSeeded||Boolean(result.changes);
  }
}
const legacyQuotes=db.prepare("SELECT * FROM quotations WHERE items_json='[]' OR items_json='' OR items_json IS NULL").all();
for(const quote of legacyQuotes){
  const item={description:quote.description,quantity:1,unitPriceCents:quote.subtotal_cents,discount:0,lineTotalCents:quote.subtotal_cents};
  db.prepare("UPDATE quotations SET issue_date=COALESCE(issue_date,substr(updated_at,1,10)),service_title=CASE WHEN service_title='' THEN description ELSE service_title END,items_json=? WHERE id=?").run(JSON.stringify([item]),quote.id);
}
if(openEdgeRepository&&(complianceSeeded||legacyQuotes.length))for(const mode of ["DEMO","REAL"])openEdgeRepository.syncMode(mode,{actor:"system",role:"System",operation:"compliance_items"});

function repositoryOperation(pathname) {
  if(pathname==="/api/avatar/preflight"||pathname==="/api/avatar/retention")return null;
  const routes = [
    [/^\/api\/clients(?:\/|$)/,"clients"],
    [/^\/api\/projects(?:\/|$)/,"projects"],
    [/^\/api\/milestones(?:\/|$)/,"milestones"],
    [/^\/api\/tasks(?:\/|$)/,"tasks"],
    [/^\/api\/users(?:\/|$)/,"users"],
    [/^\/api\/profile$/,"users"],
    [/^\/api\/payments(?:\/|$)/,"payments"],
    [/^\/api\/quotations(?:\/|$)/,"quotations"],
    [/^\/api\/expenses(?:\/|$)/,"expenses"],
    [/^\/api\/tenders(?:\/|$)/,"tenders"],
    [/^\/api\/tender-requirements(?:\/|$)/,"tender_requirements"],
    [/^\/api\/funding-documents(?:\/|$)/,"funding_documents"],
    [/^\/api\/funding(?:\/|$)/,"funding"],
    [/^\/api\/wayne\/chat$/,"wayne_messages"],
    [/^\/api\/avatar\/session\/event$/,"wayne_transcript_events"],
    [/^\/api\/avatar\/meetings(?:\/|$)/,"wayne_meetings"],
    [/^\/api\/avatar(?:\/|$)/,"avatar_sessions"],
    [/^\/api\/meetings(?:\/|$)/,"meetings"],
    [/^\/api\/meeting-actions(?:\/|$)/,"meeting_actions"],
    [/^\/api\/compliance(?:\/|$)/,"compliance_items"],
    [/^\/api\/documents(?:\/|$)/,"documents"],
    [/^\/api\/company-settings$/,"company_settings"],
    [/^\/api\/email\/test$/,"outbox"]
  ];
  return routes.find(([pattern])=>pattern.test(pathname))?.[1]||null;
}

function queueMeetingJobs(meeting) {
  db.prepare("UPDATE notification_jobs SET status='Cancelled',cancelled_at=?,updated_at=? WHERE meeting_id=? AND status IN ('Pending','Retry','Awaiting configuration')").run(now(),now(),meeting.id);
  const start = new Date(meeting.starts_at);
  const reminder = new Date(start.getTime() - Number(meeting.reminder_minutes)*60000).toISOString();
  const jobs = [["agenda",meeting.agenda_send_at||reminder],["reminder",reminder]].filter(([,date])=>date);
  for (const [kind,date] of jobs) db.prepare("INSERT INTO notification_jobs(id,mode,meeting_id,kind,scheduled_for,status,dedupe_key,next_attempt_at,max_attempts,updated_at) VALUES (?,?,?,?,?,'Pending',?,?,3,?) ON CONFLICT(dedupe_key) DO UPDATE SET status='Pending',attempts=0,last_error=NULL,delivered_at=NULL,cancelled_at=NULL,next_attempt_at=excluded.next_attempt_at,updated_at=excluded.updated_at").run(uid("job"),meeting.mode,meeting.id,kind,new Date(date).toISOString(),notificationKey(meeting.id,kind,date),new Date(date).toISOString(),now());
}
if (!db.prepare("SELECT 1 FROM notification_jobs WHERE meeting_id='meet1'").get()) queueMeetingJobs(db.prepare("SELECT * FROM meetings WHERE id='meet1'").get());

const WAYNE_COMPANY_SCOPE="infinite-x-group";
const WAYNE_MINUTES_RECIPIENT="infinitexsolutions@outlook.com";

function parseJsonArray(value){try{const parsed=JSON.parse(value||"[]");return Array.isArray(parsed)?parsed:[]}catch{return[]}}
function parseTranscriptEntries(value){
  try{
    const parsed=typeof value==="string"?JSON.parse(value||"[]"):value;
    const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed?.transcript_data)?parsed.transcript_data:[];
    return rows.map((entry,index)=>{
      const rawRole=String(entry.role||"").toLowerCase();
      const role=["assistant","avatar","agent","wayne"].includes(rawRole)?"assistant":"user";
      const content=entry.content??entry.transcript??entry.text??"";
      const rawTime=entry.at??entry.occurred_at??entry.absolute_timestamp;
      const at=typeof rawTime==="number"?new Date(rawTime*(rawTime<10_000_000_000?1000:1)).toISOString():rawTime;
      return{role,content,at,provider_event_id:entry.provider_event_id||entry.event_id||`legacy-${index}-${rawTime||"event"}`};
    }).filter(entry=>clean(entry.content,4000));
  }catch{return[]}
}
function meetingTitleFromEvents(events,fallback="Untitled meeting"){
  const stop=new Set("a an anchor and any anything are about before can carried conversation could continue did do does draft each email follow-up for forward from have hello hi how i into is it last let's let me meeting my notes of okay on one our please prepare previous quick recall recorded remember said saved saying session should tell thank thanks that the then this to top um uh want wayne we were what when where which who why with would you your discuss discussion".split(" ")),domain=new Set("action approval blocker budget cash client compliance cost deadline decision drawing expense finance funding invoice payment project receipt revenue task tender".split(" "));
  const candidates=events.filter(event=>(event.speaker||event.role)==="user").map(event=>{const words=(clean(event.content,500).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g)||[]).filter(word=>word.length>2&&!stop.has(word)),unique=[];for(const word of words)if(!unique.includes(word))unique.push(word);return{unique,score:unique.length+unique.filter(word=>domain.has(word)).length*6}}).sort((a,b)=>b.score-a.score),unique=candidates[0]?.unique||[];
  if(unique.length<2)return fallback;
  const selected=unique.slice(0,5),subject=selected.length>3?`${selected.slice(0,3).join(" ")} and ${selected.slice(3).join(" ")}`:selected.join(" ");return clean(subject[0].toUpperCase()+subject.slice(1),100);
}
function transcriptStatus(value,eventCount=0){
  if(value==="Transcript retrieval failed")return value;
  if(value==="Complete"||value==="Complete transcript")return"Complete transcript";
  if(value==="Partial"||value==="Partial transcript"||eventCount)return"Partial transcript";
  return"No transcript captured";
}
function meetingEvents(meetingId){return db.prepare("SELECT id,speaker,content,occurred_at,provider_event_id,avatar_session_id FROM wayne_transcript_events WHERE meeting_id=? ORDER BY occurred_at,id").all(meetingId)}
function rebuildWayneMeetingRecap(meetingId,{completeness}={}){
  const meeting=db.prepare("SELECT * FROM wayne_meetings WHERE id=?").get(meetingId);if(!meeting)return null;
  const events=meetingEvents(meetingId),users=events.filter(x=>x.speaker==="user"),assistants=events.filter(x=>x.speaker==="assistant"),topics=[];
  for(const event of users){const text=clean(event.content,220);if(text&&!topics.some(value=>value.toLowerCase()===text.toLowerCase()))topics.push(text)}
  const lastUser=users.at(-1),lastAssistant=assistants.at(-1),unresolved=lastUser&&(!lastAssistant||String(lastUser.occurred_at)>=String(lastAssistant.occurred_at))?clean(lastUser.content,240):"";
  const decisions=clean(meeting.confirmed_decisions,800),approved=parseJsonArray(meeting.approved_actions).filter(x=>x&&x.approved===true),status=transcriptStatus(completeness||meeting.transcript_completeness,events.length);
  const recap=!events.length?(status==="Transcript retrieval failed"?"Transcript retrieval failed; no discussion recap was created.":"No transcript was captured; no discussion recap was created."):`Recorded discussion: ${topics.slice(-4).join(" | ")||"No user topic was captured"}. ${unresolved?`Unresolved recorded question: ${unresolved}.`:"No unresolved recorded question."} ${decisions?`Confirmed decisions: ${decisions}.`:"No confirmed decision was recorded."} ${approved.length?`Approved actions: ${approved.slice(0,4).map(x=>clean(x.title,120)).join("; ")}.`:"No approved action was recorded."}${status==="Partial transcript"?" Transcript capture was partial; some discussion may be omitted.":""}`;
  const generatedTitle=meetingTitleFromEvents(events,"Untitled meeting");
  db.prepare("UPDATE wayne_meetings SET title=CASE WHEN title_manual=0 THEN ? ELSE title END,transcript_completeness=?,recap=?,unresolved_topics=?,transcript_revision=?,recap_revision=?,updated_at=? WHERE id=?").run(generatedTitle,status,recap.slice(0,1800),unresolved,events.length,events.length,now(),meetingId);
  return db.prepare("SELECT * FROM wayne_meetings WHERE id=?").get(meetingId);
}
function meetingMinutesEmailDraft(s,meetingId){
  const owned=db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=? AND status!='Deleted'").get(meetingId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id);
  if(!owned)return null;
  const meeting=rebuildWayneMeetingRecap(owned.id,{completeness:owned.transcript_completeness}),events=meetingEvents(owned.id),discussion=events.filter(event=>event.speaker==="user"&&!isMeetingMinutesEmailRequest(event.content));
  if(!discussion.length)return{kind:"meeting-minutes",meetingId:owned.id,recipient:WAYNE_MINUTES_RECIPIENT,ready:false,reason:"No recorded discussion is available yet, so meeting minutes were not invented.",deliveryConfigured:emailDelivery.configured};
  const actions=parseJsonArray(meeting.approved_actions).filter(action=>action?.approved===true),started=new Date(meeting.started_at).toLocaleString("en-ZA",{timeZone:"Africa/Johannesburg",dateStyle:"medium",timeStyle:"short"}),title=meeting.title&&meeting.title!=="Untitled meeting"?meeting.title:"Wayne operations discussion",subject=`INFINITE-X OS meeting minutes — ${title}`;
  const body=["INFINITE-X OS — Meeting minutes",`Meeting: ${title}`,`Date: ${started} SAST`,`Transcript status: ${meeting.transcript_completeness}`,"","Recorded discussion summary:",meeting.recap||"No recap is available.","","Confirmed decisions:",meeting.confirmed_decisions||"No confirmed decision was recorded.","","Approved actions:",actions.length?actions.map(action=>`- ${clean(action.title,180)}${action.owner?` — ${clean(action.owner,100)}`:""}`).join("\n"):"No approved action was recorded.","",meeting.transcript_completeness==="Partial transcript"?"Note: Transcript capture was partial; some discussion may be omitted.":"Prepared from the recorded INFINITE-X OS meeting history."].join("\n");
  return{kind:"meeting-minutes",meetingId:meeting.id,recipient:WAYNE_MINUTES_RECIPIENT,subject,body,ready:true,deliveryConfigured:emailDelivery.configured,deliveryStatus:emailDelivery.configured?"Ready for explicit confirmation":"SMTP delivery is awaiting server-side configuration.",transcriptCompleteness:meeting.transcript_completeness,recapRevision:meeting.recap_revision};
}
function saveWayneTranscriptEvent({mode,meetingId,avatarSessionId,speaker,content,occurredAt,providerEventId,completeness="Partial transcript"}){
  const role=speaker==="assistant"?"assistant":"user",text=clean(content,4000);if(!text)return{saved:false};
  const eventId=uid("wayne-event"),stamp=occurredAt&&Number.isFinite(Date.parse(occurredAt))?new Date(occurredAt).toISOString():now(),unidentified=!providerEventId||String(providerEventId).startsWith("legacy-"),nearDuplicate=db.prepare(`SELECT id FROM wayne_transcript_events WHERE mode=? AND meeting_id=? AND avatar_session_id=? AND speaker=? AND content=? AND (${unidentified?"1=1":"ABS(strftime('%s',occurred_at)-strftime('%s',?))<=5"}) LIMIT 1`).get(...(unidentified?[mode,meetingId,avatarSessionId,role,text]:[mode,meetingId,avatarSessionId,role,text,stamp]));if(nearDuplicate)return{saved:false,fingerprint:"near-duplicate"};
  const fingerprint=providerEventId?`provider:${avatarSessionId}:${clean(providerEventId,180)}`:`content:${sha(`${avatarSessionId}|${role}|${text.toLowerCase()}`)}`;
  const result=db.prepare("INSERT OR IGNORE INTO wayne_transcript_events(id,mode,meeting_id,avatar_session_id,speaker,content,occurred_at,provider_event_id,event_fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(eventId,mode,meetingId,avatarSessionId,role,text,stamp,providerEventId?clean(providerEventId,240):null,fingerprint,now());
  if(result.changes){db.prepare("INSERT INTO wayne_messages VALUES (?,?,?,?,?,?,?)").run(uid("msg"),mode,db.prepare("SELECT owner_id FROM wayne_meetings WHERE id=?").get(meetingId).owner_id,role,text,JSON.stringify({meetingId,providerEventId:providerEventId||null}),stamp);rebuildWayneMeetingRecap(meetingId,{completeness})}
  return{saved:Boolean(result.changes),fingerprint};
}
function migrateLegacyWayneHistory(){
  let changed=0;
  for(const session of db.prepare("SELECT * FROM avatar_sessions ORDER BY started_at").all()){
    let meetingId=session.meeting_id;
    const entries=parseTranscriptEntries(session.transcript);
    if(!meetingId){meetingId=`wayne-meeting-${session.id}`;db.prepare("INSERT OR IGNORE INTO wayne_meetings(id,mode,company_id,owner_id,title,agenda,meeting_kind,follow_up_of,recall_meeting_id,status,started_at,ended_at,timezone,transcript_completeness,transcript_revision,recap_revision,recap,unresolved_topics,confirmed_decisions,approved_actions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'No transcript captured',0,0,'','','','[]',?,?)").run(meetingId,session.mode,WAYNE_COMPANY_SCOPE,session.user_id,meetingTitleFromEvents(entries,"Untitled meeting"),"Imported from a recorded provider session.","Imported",null,null,session.status==="Active"?"In progress":"Completed",session.started_at,session.ended_at,"Africa/Johannesburg",session.started_at,now());db.prepare("UPDATE avatar_sessions SET meeting_id=? WHERE id=?").run(meetingId,session.id);changed++}
    for(const entry of entries){const saved=saveWayneTranscriptEvent({mode:session.mode,meetingId,avatarSessionId:session.id,speaker:entry.role,content:entry.content,occurredAt:entry.at,providerEventId:entry.provider_event_id,completeness:entries.length?"Partial transcript":"No transcript captured"});if(saved.saved)changed++}
    const before=db.prepare("SELECT title,transcript_completeness,recap_revision FROM wayne_meetings WHERE id=?").get(meetingId),recap=rebuildWayneMeetingRecap(meetingId,{completeness:entries.length?"Partial transcript":"No transcript captured"});if(before&&(before.title!==recap?.title||before.transcript_completeness!==recap?.transcript_completeness||before.recap_revision!==recap?.recap_revision))changed++;
    db.prepare("UPDATE wayne_session_summaries SET meeting_id=?,transcript_revision=?,last_topic=?,relevant_facts='',unresolved_questions=?,confirmed_decisions_actions=?,summary=?,outbound_summary=? WHERE avatar_session_id=?").run(meetingId,recap?.recap_revision||0,recap?.title||"No recorded topic",recap?.unresolved_topics||"",recap?.confirmed_decisions||"",recap?.recap||"Transcript events were unavailable; no discussion recap was created.",recap?.recap||"Transcript events were unavailable; no previous-session summary was invented.",session.id);
  }
  const seen=new Set(),affected=new Set();for(const event of db.prepare("SELECT id,meeting_id,avatar_session_id,speaker,content FROM wayne_transcript_events ORDER BY occurred_at,id").all()){const key=`${event.meeting_id}|${event.avatar_session_id}|${event.speaker}|${event.content}`;if(seen.has(key)){db.prepare("DELETE FROM wayne_transcript_events WHERE id=?").run(event.id);affected.add(event.meeting_id);changed++}else seen.add(key)}for(const meetingId of affected)rebuildWayneMeetingRecap(meetingId);
  return changed;
}
const migratedWayneHistory=migrateLegacyWayneHistory();
if(migratedWayneHistory&&openEdgeRepository)for(const mode of ["DEMO","REAL"])openEdgeRepository.syncMode(mode,{actor:"system",role:"System",operation:"wayne_meetings"});

function parseSources(value){try{return JSON.parse(value||"[]")}catch{return[]}}
function conversationMessages(s){
  const marker=db.prepare("SELECT rowid,created_at FROM wayne_messages WHERE mode=? AND user_id=? AND role='system' ORDER BY rowid DESC LIMIT 1").get(s.mode,s.user.id);
  const rows=db.prepare("SELECT rowid,role,content,sources,created_at FROM wayne_messages WHERE mode=? AND user_id=? AND rowid>? AND role IN ('user','assistant') ORDER BY rowid ASC LIMIT 100").all(s.mode,s.user.id,marker?.rowid||0);
  return{companyId:WAYNE_COMPANY_SCOPE,startedAt:marker?.created_at||rows[0]?.created_at||null,entries:rows.map(({role,content,created_at})=>({role,content,at:created_at})),transcriptAvailable:rows.length>0};
}

function conversationContinuity(s){
  const conversation=conversationMessages(s),latest=latestRecordedDiscussion(s);
  if(!latest)return{...conversation,recap:"No saved prior discussion was found. No recap was invented.",continued:false,meetingId:null};
  return{...conversation,recap:clean(latest.recap,760),continued:true,meetingId:latest.id,title:latest.title,transcriptCompleteness:latest.transcript_completeness};
}

function stateFor(s) {
  const mode=s.mode, projects=db.prepare("SELECT p.*,u.name owner FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.mode=? ORDER BY p.updated_at DESC").all(mode);
  const tasks=db.prepare("SELECT t.*,u.name assignee,p.name project FROM tasks t JOIN users u ON u.id=t.assignee_id JOIN projects p ON p.id=t.project_id WHERE t.mode=? ORDER BY t.updated_at DESC").all(mode);
  const updates=db.prepare("SELECT x.*,u.name author,t.title,p.name project FROM task_updates x JOIN users u ON u.id=x.author_id JOIN tasks t ON t.id=x.task_id JOIN projects p ON p.id=t.project_id WHERE x.mode=? ORDER BY x.created_at DESC LIMIT 12").all(mode);
  const tenders=db.prepare("SELECT * FROM tenders WHERE mode=? ORDER BY close_date").all(mode).map(t=>{const requirements=db.prepare("SELECT * FROM tender_requirements WHERE tender_id=? AND mode=?").all(t.id,mode);return{...t,requirements,readiness:tenderReadiness(requirements)}});
  const payments=db.prepare("SELECT * FROM payments WHERE mode=?").all(mode);
  const invoices=db.prepare("SELECT i.*,p.name project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id AND p.mode=i.mode WHERE i.mode=?").all(mode).map(i=>({...i,...invoiceBalance(i,payments)}));
  const expenses=db.prepare("SELECT * FROM expenses WHERE mode=?").all(mode);
  const funding=db.prepare("SELECT f.*,p.name project_name,i.number invoice_number FROM funding f LEFT JOIN projects p ON p.id=f.project_id AND p.mode=f.mode LEFT JOIN invoices i ON i.id=f.invoice_id AND i.mode=f.mode WHERE f.mode=?").all(mode).map(f=>({...f,...fundingGap(f),documents:db.prepare("SELECT * FROM funding_documents WHERE funding_id=? AND mode=?").all(f.id,mode)}));
  const meetings=db.prepare("SELECT * FROM meetings WHERE mode=? AND status!='Cancelled' ORDER BY starts_at").all(mode);
  const actions=db.prepare("SELECT a.*,u.name owner,m.topic meeting FROM meeting_actions a JOIN users u ON u.id=a.owner_id JOIN meetings m ON m.id=a.meeting_id WHERE a.mode=? ORDER BY a.due_date").all(mode);
  const today=johannesburgDate(),thirtyDaysAgo=johannesburgDate(new Date(Date.now()-30*86400000));
  const overdueInvoices=invoices.filter(i=>i.balanceCents>0&&i.due_date<today),overdueThirtyDays=overdueInvoices.filter(i=>i.due_date<thirtyDaysAgo);
  const outstanding=invoices.reduce((sum,i)=>sum+i.balanceCents,0), receipts=payments.filter(p=>p.status==="Recorded").reduce((sum,p)=>sum+p.amount_cents,0), expenseTotal=expenses.reduce((sum,e)=>sum+e.amount_cents,0);
  const clients=db.prepare("SELECT * FROM clients WHERE mode=? ORDER BY name").all(mode);
  const milestones=db.prepare("SELECT m.*,p.name project,u.name owner FROM milestones m JOIN projects p ON p.id=m.project_id JOIN users u ON u.id=m.owner_id WHERE m.mode=? ORDER BY m.due_date").all(mode);
  const quotations=db.prepare("SELECT q.*,c.name client,c.contact_name client_contact,c.email client_email,c.phone client_phone,p.name project_name,i.number invoice_number FROM quotations q LEFT JOIN clients c ON c.id=q.client_id LEFT JOIN projects p ON p.id=q.project_id AND p.mode=q.mode LEFT JOIN invoices i ON i.id=q.invoice_id AND i.mode=q.mode WHERE q.mode=? ORDER BY q.updated_at DESC").all(mode).map(q=>{try{return{...q,items:JSON.parse(q.items_json||"[]")}}catch{return{...q,items:[]}}});
  const compliance=db.prepare("SELECT c.*,u.name owner FROM compliance_items c JOIN users u ON u.id=c.owner_id WHERE c.mode=? ORDER BY c.expiry_date").all(mode);
  const documents=db.prepare("SELECT d.id,d.mode,d.title,d.file_name,d.mime_type,d.related_type,d.related_id,d.revision,d.status,d.uploaded_by,d.created_at,u.name uploader FROM documents d JOIN users u ON u.id=d.uploaded_by WHERE d.mode=? ORDER BY d.created_at DESC").all(mode);
  const names=new Map([["Company",new Map([["company","INFINITE-X Group"]])],["Project",new Map(projects.map(x=>[x.id,x.name]))],["Task",new Map(tasks.map(x=>[x.id,x.title]))],["Tender",new Map(tenders.map(x=>[x.id,`${x.reference} — ${x.title}`]))],["Funding",new Map(funding.map(x=>[x.id,x.purpose]))],["Invoice",new Map(invoices.map(x=>[x.id,x.number]))],["Client",new Map(clients.map(x=>[x.id,x.name]))],["Compliance",new Map(compliance.map(x=>[x.id,x.title]))]]);
  for(const item of compliance)item.related_name=names.get(item.related_type)?.get(item.related_id)||null;
  for(const item of documents)item.related_name=names.get(item.related_type)?.get(item.related_id)||null;
  const users=db.prepare("SELECT id,name,preferred_name,pronunciation,role,active FROM users ORDER BY name").all().map(u=>({...u,editable:s.user.role==="Director"}));
  const settings=db.prepare("SELECT * FROM company_settings WHERE mode=?").get(mode);
  const auditLog=db.prepare("SELECT a.*,u.name author FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.mode=? ORDER BY a.id DESC LIMIT 40").all(mode);
  const wayneConversation=conversationContinuity(s);
  const wayneMeetings=db.prepare("SELECT m.*,EXISTS(SELECT 1 FROM avatar_sessions a WHERE a.meeting_id=m.id AND a.status='Active') active_provider_session FROM wayne_meetings m WHERE m.mode=? AND m.company_id=? AND m.owner_id=? ORDER BY m.started_at DESC LIMIT 50").all(mode,WAYNE_COMPANY_SCOPE,s.user.id).map(meeting=>{const transcript=meetingEvents(meeting.id);return{...meeting,transcript,approvedActions:parseJsonArray(meeting.approved_actions),emailDrafts:transcript.filter(x=>x.speaker==="assistant").map(x=>extractEmailDraft(x.content)).filter(Boolean)}});
  const waynePrivacy=db.prepare("SELECT retention_days,updated_at FROM wayne_privacy_settings WHERE mode=?").get(mode),providerDeletions=s.user.role==="Director"?db.prepare("SELECT user_id,status,attempts,max_attempts,last_error,created_at,updated_at,deleted_at FROM provider_deletion_jobs WHERE mode=? ORDER BY created_at DESC LIMIT 20").all(mode):db.prepare("SELECT user_id,status,attempts,max_attempts,last_error,created_at,updated_at,deleted_at FROM provider_deletion_jobs WHERE mode=? AND user_id=? ORDER BY created_at DESC LIMIT 10").all(mode,s.user.id),wayneSessionSummaries=db.prepare("SELECT last_topic,relevant_facts,unresolved_questions,confirmed_decisions_actions,summary,created_at FROM wayne_session_summaries WHERE mode=? AND user_id=? ORDER BY created_at DESC LIMIT 10").all(mode,s.user.id);
  return { mode, asOfDate:today, runtime:{database:openEdgeProbe.activeRepository?"OpenEdge authoritative repository; SQLite compatibility cache":"OpenEdge repository unavailable — writes fail closed outside isolated tests",openedgeVerified:openEdgeProbe.verified,openedgeActive:openEdgeProbe.activeRepository,openedgeEvidence:openEdgeProbe.evidence,openedgeInitialization:openEdgeInitialization,aiConfigured:Boolean(process.env.OPENAI_API_KEY),avatarConfigured:avatarCapability.configured,avatarBusinessContext:avatarCapability.businessContext,avatarCapabilityReason:avatarCapability.reason,avatarLimitSeconds:avatarCapability.limitSeconds||60,emailMode:emailDelivery.mode,emailConfigured:emailDelivery.configured,emailStatus:emailDelivery.status,timezone:"Africa/Johannesburg"}, user:{id:s.user.id,name:s.user.name,preferredName:s.user.preferred_name||s.user.name.split(" ")[0],pronunciation:s.user.pronunciation,role:s.user.role}, permissions:{director:s.user.role==="Director",finance:can(s.user,"finance:write"),taskVerify:can(s.user,"task:verify",{owner_id:s.user.id})}, metrics:{activeTenders:tenders.filter(t=>t.status!=="Archived").length,highRelevanceTenders:tenders.filter(t=>t.status!=="Archived"&&t.relevance_label==="High").length,activeProjects:projects.length,overdueTasks:tasks.filter(t=>!["Verified complete","Reported complete"].includes(t.status)&&t.due_date<today).length,outstandingInvoices:outstanding,overdueInvoiceBalance:overdueInvoices.reduce((sum,i)=>sum+i.balanceCents,0),overdueInvoiceCount:overdueInvoices.length,overdueThirtyDayBalance:overdueThirtyDays.reduce((sum,i)=>sum+i.balanceCents,0),overdueThirtyDayCount:overdueThirtyDays.length,fundingNeeded:funding.reduce((sum,f)=>sum+f.gapCents,0),openMeetingActions:actions.filter(a=>a.status!=="Completed").length,receipts,expenses:expenseTotal,revenue:invoices.reduce((sum,i)=>sum+i.total_cents,0)},projects,tasks,updates,tenders,invoices,payments,expenses,funding,meetings,actions,clients,milestones,quotations,compliance,documents,users,settings,auditLog,wayneConversation,wayneMeetings,wayneSessionSummaries,waynePrivacy,providerDeletions,connectors:db.prepare("SELECT * FROM connector_status WHERE mode=? ORDER BY name").all(mode),notifications:db.prepare("SELECT * FROM notification_jobs WHERE mode=? ORDER BY scheduled_for").all(mode),outbox:db.prepare("SELECT * FROM outbox WHERE mode=? ORDER BY created_at DESC").all(mode)};
}

function safeOutboundText(value,max=180){return String(value||"").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[contact excluded]").replace(/\+?\d[\d ()-]{7,}\d/g,"[number excluded]").replace(/\b(account|iban|swift|password|secret|api[-_ ]?key|token)\b\s*[:=#-]?\s*\S+/gi,"$1 [excluded]").replace(/\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|ln)\b/gi,"[address excluded]").trim().slice(0,max)}
function extractEmailDraft(value){const text=String(value||"").trim(),match=text.match(/(?:EMAIL DRAFT\s*)?Subject:\s*([^\n]+)\s*\n+(?:Body:\s*)?([\s\S]+)/i);if(!match)return null;const subject=clean(match[1],180),body=clean(match[2],4000);return subject&&body?{subject,body}:null}

function latestRecordedDiscussion(s,excludeMeetingId=null){
  return db.prepare("SELECT m.* FROM wayne_meetings m WHERE m.mode=? AND m.company_id=? AND m.owner_id=? AND m.transcript_revision>0 AND m.recap_revision=m.transcript_revision AND m.status!='Deleted' AND (? IS NULL OR m.id!=?) AND NOT EXISTS (SELECT 1 FROM avatar_sessions a WHERE a.meeting_id=m.id AND a.status='Active') ORDER BY m.started_at DESC LIMIT 1").get(s.mode,WAYNE_COMPANY_SCOPE,s.user.id,excludeMeetingId,excludeMeetingId);
}

function presentationContext(s,input={}){
  const route=clean(input?.route,30),permissions={director:s.user.role==="Director",finance:can(s.user,"finance:write")};
  if(!presentationRoutes.includes(route))throw Object.assign(new Error("Unknown presentation destination."),{status:400});
  if(!canOpenPresentationRoute(route,permissions,s.user.role))throw Object.assign(new Error("That section is not authorised for this account."),{status:403});
  const snapshot=stateFor(s),limit=text=>safeOutboundText(text,960)||"Not available",labels={dashboard:"Dashboard",crm:"CRM",projects:"Projects",team:"Team & Tasks",quotations:"Quotations & Invoices",tenders:"Tender Radar",funding:"Funding",finance:"Finance",compliance:"Compliance",documents:"Documents",meetings:"AI Meetings",reports:"Reports",settings:"Settings"};
  if(route==="reports"){
    const period=["all","30","90","year"].includes(input.reportPeriod)?input.reportPeriod:"all",periodLabel={all:"All recorded data","30":"Last 30 days","90":"Last 90 days",year:"Current calendar year"}[period],inPeriod=value=>{if(period==="all")return true;if(!value)return false;const date=new Date(value),now=new Date();if(Number.isNaN(date.getTime()))return false;if(period==="year")return date.getFullYear()===now.getFullYear();return date>=new Date(now.getTime()-Number(period)*86400000)},projects=snapshot.projects.filter(x=>inPeriod(x.updated_at)),tenders=snapshot.tenders.filter(x=>inPeriod(x.published_date||x.last_refreshed)),groups=[...tenders.reduce((map,item)=>map.set(item.status||"Unspecified",(map.get(item.status||"Unspecified")||0)+1),new Map())],financeAllowed=permissions.finance,invoices=snapshot.invoices.filter(x=>inPeriod(x.due_date)),payments=snapshot.payments.filter(x=>x.status==="Recorded"&&inPeriod(x.recorded_at)),expenses=snapshot.expenses.filter(x=>inPeriod(x.incurred_at)),money=cents=>speechRand(cents);
    const summary=limit([`Visible Reports filter: ${periodLabel}.`,`Project completion: ${projects.map(x=>`${safeOutboundText(x.name,100)} ${x.progress}%`).join("; ")||"no project updates in this period"}.`,`Tracked tenders by status: ${groups.map(([name,count])=>`${name} ${count}`).join("; ")||"none in this period"}.`,financeAllowed?`Financial activity for the same period: total invoiced ${money(invoices.reduce((n,x)=>n+Number(x.total_cents||0),0))}; recorded receipts ${money(payments.reduce((n,x)=>n+Number(x.amount_cents||0),0))}; recorded expenses ${money(expenses.reduce((n,x)=>n+Number(x.amount_cents||0),0))}. These are not cash balance or profit.`:"Financial activity is restricted for this role."].join(" "));
    return{route,label:labels[route],summary,scope:`${periodLabel} · ${snapshot.mode} Mode`,filters:{period}};
  }
  if(route==="tenders"){
    const filters=input.tenderFilters||{},query=clean(filters.search,120).toLowerCase(),category=clean(filters.category,120),relevance=clean(filters.relevance,30),rows=snapshot.tenders.filter(x=>(!query||`${x.reference} ${x.title} ${x.organisation} ${x.description||""} ${x.relevance_reason||""}`.toLowerCase().includes(query))&&(!category||x.category===category)&&(!relevance||x.relevance_label===relevance));
    const summary=limit(`Visible Tender Radar filters: search ${query||"none"}; category ${category||"all"}; relevance ${relevance||"all"}. ${rows.length} matching authorised tenders. ${rows.slice(0,6).map(x=>`${safeOutboundText(x.reference,70)} ${safeOutboundText(x.title,120)} — ${x.relevance_label||"Review"} relevance, ${x.readiness.score}% ready, closes ${x.close_date}`).join("; ")||"No tenders match the visible filters."}${rows.length>6?` Coverage limited to 6 of ${rows.length} matches.`:""}`);
    return{route,label:labels[route],summary,scope:`Visible Tender Radar · ${snapshot.mode} Mode`,filters:{search:query,category,relevance}};
  }
  const filters=input.filters||{},query=clean(filters.search,120).toLowerCase(),statusFilter=clean(filters.status,80),matches=(record,fields)=>!query||fields.map(field=>String(record[field]||"")).join(" ").toLowerCase().includes(query),matchesStatus=record=>!statusFilter||record.status===statusFilter;
  if(route==="projects"){
    const rows=snapshot.projects.filter(x=>matches(x,["name","client","owner","status","blocker"])&&matchesStatus(x));
    const summary=limit(`Visible Projects filters: search ${query||"none"}; status ${statusFilter||"all"}. ${rows.length} matching projects. ${rows.slice(0,8).map(x=>`${safeOutboundText(x.name,120)} — ${Number(x.progress||0)}% progress, ${x.status||"status not recorded"}, owner ${safeOutboundText(x.owner||x.owner_name,80)||"not recorded"}${x.blocker?`, blocker: ${safeOutboundText(x.blocker,140)}`:""}`).join("; ")||"No projects match the visible filters."}${rows.length>8?` Coverage limited to 8 of ${rows.length} matches.`:""}`);
    return{route,label:labels[route],summary,scope:`Visible Projects · ${snapshot.mode} Mode`,filters:{search:query,status:statusFilter}};
  }
  if(route==="team"){
    const rows=snapshot.tasks.filter(x=>matches(x,["title","project","project_name","assignee","owner","status","blocker","dependency"])&&matchesStatus(x));
    const summary=limit(`Visible Team & Tasks filters: search ${query||"none"}; status ${statusFilter||"all"}. ${rows.length} matching tasks. ${rows.slice(0,8).map(x=>`${safeOutboundText(x.title,120)} — owner ${safeOutboundText(x.assignee||x.owner||x.assignee_name,80)||"not recorded"}, status ${x.status||"not recorded"}${x.progress!=null?`, reported progress ${Number(x.progress)}%`:""}${x.blocker?`, blocker: ${safeOutboundText(x.blocker,130)}`:""}${x.dependency?`, dependency: ${safeOutboundText(x.dependency,110)}`:""}`).join("; ")||"No tasks match the visible filters."} Reported completion is not verified completion unless the recorded status says verified.${rows.length>8?` Coverage limited to 8 of ${rows.length} matches.`:""}`);
    return{route,label:labels[route],summary,scope:`Visible Team & Tasks · ${snapshot.mode} Mode`,filters:{search:query,status:statusFilter}};
  }
  if(route==="finance"){
    if(!permissions.finance)throw Object.assign(new Error("That section is not authorised for this account."),{status:403});
    const invoices=snapshot.invoices.filter(x=>matches(x,["number","client","status"])&&matchesStatus(x)),invoiceIds=new Set(invoices.map(x=>x.id)),payments=snapshot.payments.filter(x=>!query||invoiceIds.has(x.invoice_id)),expenses=snapshot.expenses.filter(x=>matches(x,["description","category","project","status"]));
    const invoiced=invoices.reduce((sum,x)=>sum+Number(x.total_cents||0),0),receipts=payments.filter(x=>x.status==="Recorded").reduce((sum,x)=>sum+Number(x.amount_cents||0),0),expenseTotal=expenses.reduce((sum,x)=>sum+Number(x.amount_cents||0),0),outstanding=invoices.reduce((sum,x)=>sum+Number(x.balance_cents??x.balanceCents??0),0);
    const summary=limit(`Visible Finance filters: search ${query||"none"}; status ${statusFilter||"all"}. Total invoiced ${speechRand(invoiced)}; recorded receipts ${speechRand(receipts)}; recorded expenses ${speechRand(expenseTotal)}; outstanding receivables ${speechRand(outstanding)}. These categories cover the visible authorised records and are not cash balance, recognised revenue, or profit. Bank balance is not recorded.`);
    return{route,label:labels[route],summary,scope:`Visible Finance records · ${snapshot.mode} Mode`,filters:{search:query,status:statusFilter}};
  }
  return{route,label:labels[route],summary:limit(`${labels[route]} is the visible authorised INFINITE-X OS section in ${snapshot.mode} Mode. Detailed live page-context grounding is currently implemented for Reports and Tender Radar.`),scope:`${snapshot.mode} Mode`,filters:{}};
}

function avatarBriefing(s,meetingId,selectedHistoryId=null,presentation=null){
  const snapshot=stateFor(s),manager=["Director","Project Manager"].includes(s.user.role),financeAccess=["Director","Finance"].includes(s.user.role),assigned=snapshot.tasks.filter(x=>x.assignee_id===s.user.id),projectIds=new Set(manager?snapshot.projects.map(x=>x.id):assigned.map(x=>x.project_id));
  const projects=snapshot.projects.filter(x=>projectIds.has(x.id)),tasks=snapshot.tasks.filter(x=>manager||x.assignee_id===s.user.id),taskIds=new Set(tasks.map(x=>x.id)),updates=snapshot.updates.filter(x=>manager||x.author_id===s.user.id||taskIds.has(x.task_id)),tenders=manager?snapshot.tenders:[],actions=snapshot.actions.filter(x=>manager||x.owner_id===s.user.id),compliance=snapshot.compliance.filter(x=>manager||x.owner_id===s.user.id),quotations=financeAccess?snapshot.quotations:[],invoices=financeAccess?snapshot.invoices:[],funding=financeAccess?snapshot.funding:[];
  const logicalMeeting=meetingId?db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=?").get(meetingId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id):null,currentEvents=logicalMeeting?meetingEvents(logicalMeeting.id):[],historyId=currentEvents.length?logicalMeeting.id:(selectedHistoryId||logicalMeeting?.follow_up_of||logicalMeeting?.recall_meeting_id||null),historical=historyId?db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=?").get(historyId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id):null;
  const summary=(items,empty="Not available")=>{const text=(Array.isArray(items)?items.filter(Boolean).join("; "):String(items||"")).trim()||empty;if(text.length<=1000)return text;const prefix=text.slice(0,945),boundary=Math.max(prefix.lastIndexOf(". "),prefix.lastIndexOf("; "));return `${prefix.slice(0,boundary>650?boundary+1:945).trim()} Coverage limited to authorised highlights.`.slice(0,1000)},rand=cents=>speechRand(cents);
  const blocked=tasks.filter(x=>x.status==="Blocked").slice(0,3),notReady=tenders.filter(x=>!x.readiness.submissionReady).slice(0,3);
  const missingTranscript=historical&&historical.transcript_revision===0,failedTranscript=historical?.transcript_completeness==="Transcript retrieval failed";
  const historicalContext=!historyId?"No recorded discussion was selected. This is a fresh conversation. Say that no previous discussion details were supplied; do not describe scheduled meetings, current records, or outstanding actions as remembered conversation.":!historical?"The selected historical meeting is unavailable or not authorised. Do not invent a recap.":missingTranscript?`A meeting record exists (${safeOutboundText(historical.title,120)}), but no transcript was captured. Do not infer what was discussed.`:`${historyId===logicalMeeting?.id?"Continue the current logical meeting":"Selected recorded meeting"} from ${new Date(historical.started_at).toLocaleString("en-ZA",{timeZone:"Africa/Johannesburg",dateStyle:"medium",timeStyle:"short"})}: ${safeOutboundText(historical.title,120)}. Transcript status: ${historical.transcript_completeness}. Actual transcript-only recap: ${safeOutboundText(historical.recap,680)}.${failedTranscript?" Provider transcript retrieval failed; only locally captured events may be present.":""} Newer business records supplied separately take precedence.`;
  const totalInvoiced=snapshot.metrics.revenue,recordedExpenses=snapshot.metrics.expenses,invoiceExpenseDifference=totalInvoiced-recordedExpenses;
  const selectedPage=presentation?.route?presentationContext(s,presentation):null;
  const dynamicVariables={
    user_name:summary(s.user.preferred_name||s.user.name.split(" ")[0]),name_pronunciation:summary(s.user.pronunciation),snapshot_time:new Date().toISOString(),workspace_mode:summary(`${snapshot.mode} Mode — fictional demonstration records`),
    business_summary:summary([`Identity rule: signed-in user ${safeOutboundText(s.user.name,120)} is the ${safeOutboundText(s.user.role,80)}; never call the user an operations assistant. Wayne is the operations assistant.`,`INFINITE-X OS handles explicit supported Open [section] commands locally from final user transcripts. Defer to the visible application action status: do not claim navigation succeeded or say all navigation is impossible. Opening a section does not refresh your data; refreshed page briefings require the user's explicit context review and restart.`,selectedPage?`User-approved visible-page context for this new session — ${selectedPage.label}: ${selectedPage.summary}`:"",`${projects.length} authorised projects; ${tenders.length} authorised tenders; ${tasks.filter(x=>x.status!=="Verified complete").length} open authorised tasks.`,`Recorded company target: Not available. Do not invent a target or success probability.`]),
    tenders_summary:summary([`Tracked authorised tender total: ${tenders.length}. The records below are highlights, not the total.`,...tenders.slice(0,6).map(x=>`${safeOutboundText(x.reference,80)} ${safeOutboundText(x.title,150)}: ${x.readiness.score}% ready, closes ${x.close_date}; ${x.readiness.submissionReady?"recorded submission-ready":"mandatory items missing or unverified"}`),tenders.length>6?`Coverage incomplete: showing 6 of ${tenders.length} authorised tenders.`:""]),
    projects_summary:summary([...projects.slice(0,6).map(x=>`${safeOutboundText(x.name,150)} — owner ${safeOutboundText(x.owner,100)}, progress ${x.progress}%, status ${x.status}, due ${x.due_date}${x.blocker?`, recorded blocker: ${safeOutboundText(x.blocker)}`:""}`),projects.length>6?`Coverage incomplete: showing 6 of ${projects.length} authorised projects.`:""]),
    tasks_summary:summary([...updates.slice(0,4).map(x=>`Latest recorded employee update: ${safeOutboundText(x.author,100)} updated ${safeOutboundText(x.title,140)} on ${safeOutboundText(x.project,140)} to ${safeOutboundText(x.status,60)} at ${new Date(x.created_at).toLocaleString("en-ZA",{timeZone:"Africa/Johannesburg",dateStyle:"medium",timeStyle:"short"})}${x.blocker?`; recorded blocker: ${safeOutboundText(x.blocker)}`:""}${x.evidence?`; evidence reference: ${safeOutboundText(x.evidence)}`:""}.`),...tasks.slice(0,6).map(x=>`${safeOutboundText(x.title,140)} — project ${safeOutboundText(x.project,140)}, assigned to ${safeOutboundText(x.assignee,100)}, ${x.status}, due ${x.due_date}${x.blocker?`, blocker: ${safeOutboundText(x.blocker)}`:""}${x.dependency?`, dependency: ${safeOutboundText(x.dependency)}`:""}`),`Employee updates are recorded reports; overdue work, blockers and dependencies alone are not proof of individual underperformance.`,updates.length>4||tasks.length>6?`Coverage incomplete: showing ${Math.min(4,updates.length)} of ${updates.length} recent updates and ${Math.min(6,tasks.length)} of ${tasks.length} authorised tasks.`:""]),
    finance_summary:financeAccess?summary(`Total invoiced amount (not recognised revenue): ${rand(totalInvoiced)}. Recorded receipts: ${rand(snapshot.metrics.receipts)}. Recorded expenses: ${rand(recordedExpenses)}. Outstanding receivables: ${rand(snapshot.metrics.outstandingInvoices)}. Cash or bank balance: Not available because no balance is recorded. Recorded expenses are ${invoiceExpenseDifference>=0?"less":"more"} than total invoiced by ${rand(Math.abs(invoiceExpenseDifference))}; this comparison is not profit.`):"Not available",
    quotations_summary:financeAccess?summary([`Invoices: ${invoices.slice(0,6).map(x=>`${safeOutboundText(x.number,80)} for ${safeOutboundText(x.project_name||x.client,120)} — total ${rand(x.total_cents)}, outstanding ${rand(x.balanceCents)}, ${x.status}`).join("; ")||"none recorded"}.`,`Quotations: ${quotations.slice(0,5).map(x=>`${safeOutboundText(x.number,80)} for ${safeOutboundText(x.project_name||x.client,120)} — ${rand(x.total_cents)}, ${x.status}`).join("; ")||"none recorded"}.`,invoices.length>6||quotations.length>5?"Coverage is limited to authorised highlights; ask the user to open Quotations & Invoices for other records.":""]):"Not available",
    funding_summary:financeAccess?summary(funding.slice(0,8).map(x=>`${safeOutboundText(x.purpose,140)}: recorded funding gap ${rand(x.gapCents)}, ${x.status}. Provider and confidential terms excluded.`)):"Not available",
    compliance_summary:summary(compliance.slice(0,8).map(x=>`${safeOutboundText(x.title,150)}: ${x.status}${x.expiry_date?`, expires ${x.expiry_date}`:""}. Evidence bodies excluded.`)),
    crm_summary:summary(`${snapshot.clients.length} client records exist. Names, contact details and addresses are excluded.`),
    meetings_summary:summary(historicalContext)
  };
  const facts=[`${projects.length} authorised projects; ${blocked.length} listed blockers.`,`${tenders.length} authorised tenders; ${notReady.length} listed bids are not ready.`,`${actions.filter(x=>x.status!=="Completed").length} authorised open actions.`],details=[...blocked.map(x=>`${safeOutboundText(x.title)}: ${safeOutboundText(x.blocker||x.status)}`),...notReady.map(x=>`${safeOutboundText(x.reference)}: readiness ${x.readiness.score}%`)],sources=[...blocked.map(x=>({type:"task",id:x.id,label:x.title,route:"team"})),...notReady.map(x=>({type:"tender",id:x.id,label:x.reference,route:`tenders?record=${x.id}`})),...actions.slice(0,3).map(x=>({type:"meeting_action",id:x.id,label:x.title,route:"meetings"}))];
  return{summary:dynamicVariables.business_summary,facts,details,sources,dynamicVariables,continuity:{continued:Boolean(historyId&&historical&&historical.transcript_revision>0),transcriptAvailable:Boolean(historical&&historical.transcript_revision>0),recap:historicalContext,meetingId:logicalMeeting?.id||null},categories:["preferred name","workspace mode","project status","task status","tender readiness",...(financeAccess?["financial totals","quotation totals","funding gaps"]:[]),"compliance status","meeting continuity",...(selectedPage?["selected visible-page context"]:[])]};
}

function preparedAgenda(s){
  const snapshot=stateFor(s),lines=["Current operational review"];
  for(const task of snapshot.tasks.filter(item=>item.status==="Blocked").slice(0,3))lines.push(`- Blocker: ${task.title} (${task.project}) — ${task.blocker}`);
  for(const tender of snapshot.tenders.filter(item=>!item.readiness.submissionReady).slice(0,3))lines.push(`- Tender: ${tender.reference} — ${tender.readiness.score}% ready; mandatory items remain missing or unverified.`);
  for(const action of snapshot.actions.filter(item=>item.status!=="Completed").slice(0,4))lines.push(`- Follow-up: ${action.title} — ${action.owner}, due ${action.due_date}.`);
  lines.push("- Finance and funding balances from current records.","- Confirm decisions and assign approved actions.");
  return lines.join("\n");
}

async function wayneReply(s, message) {
  const snapshot=stateFor(s), sources=[];
  const facts={metrics:snapshot.metrics,projects:snapshot.projects.map(p=>({id:p.id,name:p.name,status:p.status,progress:p.progress,blocker:p.blocker,updatedAt:p.updated_at})),tenders:snapshot.tenders.slice(0,8).map(t=>({id:t.id,reference:t.reference,title:t.title,readiness:t.readiness})),funding:snapshot.funding.map(f=>({id:f.id,purpose:f.purpose,gapCents:f.gapCents,status:f.status})),actions:snapshot.actions.filter(a=>a.status!=="Completed")};
  for(const p of facts.projects.filter(p=>p.blocker))sources.push({type:"project",id:p.id,label:p.name,route:`projects?record=${p.id}`});
  for(const t of facts.tenders.filter(t=>!t.readiness.submissionReady))sources.push({type:"tender",id:t.id,label:t.reference,route:`tenders?record=${t.id}`});
  if(!process.env.OPENAI_API_KEY) return {available:false,error:"Live AI is not configured. Set OPENAI_API_KEY to enable Wayne. The grounded operational snapshot below is record retrieval, not a scripted AI answer.",facts,sources};
  const prompt=`You are Wayne, the INFINITE-X OS operations assistant. Address ${s.user.preferred_name||s.user.name}. Use only the supplied authorised ${s.mode} records. Distinguish recorded facts, employee reports, and inference. Never invent causes, meetings, progress, financial figures, offers, or approvals. Cite record IDs inline. If asked to change data, propose the change and require approval; do not claim execution.\nRECORDS:${JSON.stringify(facts)}\nUSER:${message}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",input:prompt})});
  if(!response.ok)throw new Error(`OpenAI returned ${response.status}`);
  const result=await response.json();
  const answer=result.output_text||result.output?.flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text||"No text response was returned.";
  return {available:true,answer,sources,facts};
}

function normaliseProviderTranscript(payload){
  const candidates=Array.isArray(payload)?payload:(payload?.transcript_data||payload?.transcript||payload?.messages||[]);
  if(!Array.isArray(candidates))return[];
  return candidates.map(item=>{const speaker=String(item.role||item.speaker||item.participant_type||item.type||"").toLowerCase(),content=clean(item.text||item.content||item.transcript,4000);return{role:/assistant|agent|avatar|wayne/.test(speaker)?"assistant":"user",content,at:item.timestamp||item.created_at||now(),provider_event_id:item.event_id||item.id||item.source_event_id||null,source:"LiveAvatar provider transcript"}}).filter(x=>x.content);
}

function mergeAvatarTranscript(s,record,providerTranscript){
  let local=[];try{const parsed=JSON.parse(record.transcript||"[]");if(Array.isArray(parsed))local=parsed}catch{}
  const existing=new Set(local.map(x=>`${x.role}:${x.content}`)),added=[];
  for(const entry of normaliseProviderTranscript(providerTranscript))if(!existing.has(`${entry.role}:${entry.content}`)){existing.add(`${entry.role}:${entry.content}`);local.push(entry);added.push(entry)}
  if(record.meeting_id)for(const entry of normaliseProviderTranscript(providerTranscript))saveWayneTranscriptEvent({mode:s.mode,meetingId:record.meeting_id,avatarSessionId:record.id,speaker:entry.role,content:entry.content,occurredAt:entry.at,providerEventId:entry.provider_event_id,completeness:"Complete transcript"});
  return local.slice(-100);
}

function saveWayneSessionSummary(s,record,entries){
  const meeting=record.meeting_id?rebuildWayneMeetingRecap(record.meeting_id):null,messages=Array.isArray(entries)?entries:[],lastUser=[...messages].reverse().find(x=>x.role==="user"),lastTopic=meeting?.title||clean(lastUser?.content||"No recorded topic",180),unresolved=meeting?.unresolved_topics||"",confirmed=[clean(meeting?.confirmed_decisions,500),...parseJsonArray(meeting?.approved_actions).filter(x=>x.approved===true).map(x=>clean(x.title,120))].filter(Boolean).join("; "),summary=meeting?.recap||"No transcript was captured; no session summary was invented.",outbound=safeOutboundText(summary,760);
  db.prepare("INSERT INTO wayne_session_summaries(id,mode,user_id,avatar_session_id,last_topic,relevant_facts,unresolved_questions,confirmed_decisions_actions,summary,outbound_summary,created_at,meeting_id,transcript_revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(avatar_session_id) DO UPDATE SET last_topic=excluded.last_topic,relevant_facts=excluded.relevant_facts,unresolved_questions=excluded.unresolved_questions,confirmed_decisions_actions=excluded.confirmed_decisions_actions,summary=excluded.summary,outbound_summary=excluded.outbound_summary,created_at=excluded.created_at,meeting_id=excluded.meeting_id,transcript_revision=excluded.transcript_revision").run(uid("wayne-summary"),s.mode,s.user.id,record.id,lastTopic,"",unresolved,confirmed,summary.slice(0,2000),outbound,now(),record.meeting_id||null,meeting?.recap_revision||0);
  return db.prepare("SELECT * FROM wayne_session_summaries WHERE avatar_session_id=?").get(record.id);
}

function enqueueProviderDeletion(s,record){
  db.prepare("INSERT OR IGNORE INTO provider_deletion_jobs(id,mode,user_id,provider_session_id,status,attempts,max_attempts,next_attempt_at,last_error,created_at,updated_at,deleted_at) VALUES (?,?,?,?, 'Pending',0,3,?,NULL,?,?,NULL)").run(uid("provider-delete"),s.mode,s.user.id,record.provider_session_id,now(),now(),now());
  return db.prepare("SELECT * FROM provider_deletion_jobs WHERE provider_session_id=?").get(record.provider_session_id);
}

async function attemptProviderDeletion(job){
  if(!job||job.status==="Deleted"||job.attempts>=job.max_attempts)return job;
  try{await avatarProvider.deleteSessionEvents(job.provider_session_id);const stamp=now();db.prepare("UPDATE provider_deletion_jobs SET status='Deleted',attempts=attempts+1,last_error=NULL,updated_at=?,deleted_at=? WHERE id=?").run(stamp,stamp,job.id);db.prepare("INSERT INTO audit_log(mode,user_id,action,record_type,record_id,detail,created_at) VALUES (?,?,?,?,?,?,?)").run(job.mode,job.user_id,"Provider session-event deletion acknowledged","provider_deletion",job.id,"Provider acknowledged deletion; this is not proof that backups or all downstream copies were erased.",stamp)}
  catch(error){const attempts=Number(job.attempts)+1,failed=attempts>=Number(job.max_attempts),next=new Date(Date.now()+[60_000,300_000,900_000][Math.min(attempts-1,2)]).toISOString(),stamp=now();db.prepare("UPDATE provider_deletion_jobs SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?").run(failed?"Failed":"Retry",attempts,next,safeOutboundText(error.message,300),stamp,job.id)}
  return db.prepare("SELECT * FROM provider_deletion_jobs WHERE id=?").get(job.id);
}

function applyWayneRetention(){
  for(const setting of db.prepare("SELECT * FROM wayne_privacy_settings").all()){const cutoff=new Date(Date.now()-Math.max(1,Number(setting.retention_days))*86400000).toISOString(),expired=db.prepare("SELECT id FROM wayne_meetings WHERE mode=? AND COALESCE(ended_at,started_at)<? AND status!='In progress'").all(setting.mode,cutoff);for(const meeting of expired){db.prepare("DELETE FROM wayne_transcript_events WHERE meeting_id=?").run(meeting.id);db.prepare("UPDATE wayne_meetings SET transcript_completeness='No transcript captured',transcript_revision=0,recap_revision=0,recap='Transcript removed under the local retention policy.',unresolved_topics='',updated_at=? WHERE id=?").run(now(),meeting.id)}db.prepare("DELETE FROM wayne_messages WHERE mode=? AND created_at<?").run(setting.mode,cutoff);db.prepare("DELETE FROM wayne_session_summaries WHERE mode=? AND created_at<?").run(setting.mode,cutoff);db.prepare("UPDATE avatar_sessions SET transcript='[]',briefing='{}' WHERE mode=? AND COALESCE(ended_at,started_at)<? AND status!='Active'").run(setting.mode,cutoff)}
}

async function closeAvatarSessions(s,reason="USER_CLOSED"){
  const rows=db.prepare("SELECT * FROM avatar_sessions WHERE mode=? AND user_id=? AND status='Active'").all(s.mode,s.user.id);
  let persistencePending=false;
  for(const row of rows){
    let error="",transcript=[],retrievalFailed=false;
    try{await avatarProvider.stop(row.provider_session_id);}catch(e){error=e.message;}
    try{transcript=await avatarProvider.transcript(row.provider_session_id);}catch(e){retrievalFailed=true;error=[error,`Transcript retrieval failed: ${e.message}`].filter(Boolean).join("; ")}
    const merged=mergeAvatarTranscript(s,row,transcript),ended=now(),providerEntries=normaliseProviderTranscript(transcript).length,eventCount=row.meeting_id?meetingEvents(row.meeting_id).length:0,completeness=retrievalFailed?"Transcript retrieval failed":providerEntries?"Complete transcript":eventCount?"Partial transcript":"No transcript captured";db.prepare("UPDATE avatar_sessions SET status=?,transcript=?,ended_at=?,last_error=? WHERE id=?").run(reason,JSON.stringify(merged),ended,error||null,row.id);if(row.meeting_id){rebuildWayneMeetingRecap(row.meeting_id,{completeness});if(!String(reason).startsWith("Replaced"))db.prepare("UPDATE wayne_meetings SET status='Completed',ended_at=?,updated_at=? WHERE id=?").run(ended,ended,row.meeting_id)}saveWayneSessionSummary(s,row,merged);
    const persistence=persistWayneToOpenEdge(s);if(!persistence.saved){persistencePending=true;db.prepare("UPDATE avatar_sessions SET last_error=? WHERE id=?").run(`OPENEDGE_TRANSCRIPT_PENDING: ${safeOutboundText(persistence.error,300)}`,row.id);audit(s,"Wayne transcript persistence pending","avatar_session",row.id,"Provider deletion withheld; content not logged");continue}await attemptProviderDeletion(enqueueProviderDeletion(s,row));
  }
  return{closed:rows.length,persistencePending};
}

async function api(req,res,url){
  if(req.method==="POST"&&url.pathname==="/api/auth/login"){
    const input=await body(req), user=db.prepare("SELECT * FROM users WHERE id=? AND active=1").get(String(input.userId||""));
    if(!user||!safeEqual(user.password_hash,sha(input.password||"")))return json(res,401,{error:"Invalid credentials."});
    const token=randomBytes(32).toString("hex"),s={user,mode:"DEMO",createdAt:Date.now()};sessions.set(token,s);audit(s,"Signed in");return json(res,200,{token,user:{id:user.id,name:user.name,role:user.role},mode:s.mode});
  }
  const s=requireSession(req,res);if(!s)return;
  const operation=["POST","PATCH"].includes(req.method)?repositoryOperation(url.pathname):null;
  if(operation)res.ixSync={mode:s.mode,actor:s.user.id,role:s.user.role,operation,force:url.pathname==="/api/wayne/chat"||url.pathname==="/api/avatar/session/stop"};
  if(req.method==="POST"&&url.pathname==="/api/auth/logout"){await closeAvatarSessions(s,"Signed out");sessions.delete(String(req.headers.authorization||"").replace(/^Bearer\s+/i,""));return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/mode"){const input=await body(req);await closeAvatarSessions(s,"Mode switched");s.mode=requireMode(input.mode);audit(s,"Mode changed","mode",s.mode);return json(res,200,{mode:s.mode});}
  if(req.method==="GET"&&url.pathname==="/api/state"){scoped(s,url.searchParams.get("mode"));return json(res,200,stateFor(s));}
  if(req.method==="POST"&&url.pathname==="/api/clients"){
    if(!requireWrite(s,res))return;const input=await body(req);try{required(input,["name"]);}catch(e){return json(res,400,{error:e.message})}const id=uid("client");try{db.prepare("INSERT INTO clients VALUES (?,?,?,?,?,?,?,?,?)").run(id,s.mode,clean(input.name,160),clean(input.contactName,160),clean(input.email,200),clean(input.phone,60),"Active",clean(input.notes,1500),now())}catch(e){if(String(e).includes("UNIQUE"))return json(res,409,{error:"A client with this name already exists in the active mode."});throw e}audit(s,"Client created","client",id,input.name);return json(res,201,{id});
  }
  const clientMatch=url.pathname.match(/^\/api\/clients\/([^/]+)\/(edit|archive)$/);
  if(req.method==="POST"&&clientMatch){if(!requireWrite(s,res))return;const [,id,action]=clientMatch,input=await body(req),record=db.prepare("SELECT * FROM clients WHERE id=? AND mode=?").get(id,s.mode);if(!record)return json(res,404,{error:"Client not found in active mode."});if(action==="archive")db.prepare("UPDATE clients SET status='Archived',updated_at=? WHERE id=?").run(now(),id);else{try{required(input,["name"])}catch(e){return json(res,400,{error:e.message})}db.prepare("UPDATE clients SET name=?,contact_name=?,email=?,phone=?,notes=?,updated_at=? WHERE id=?").run(clean(input.name,160),clean(input.contactName,160),clean(input.email,200),clean(input.phone,60),clean(input.notes,1500),now(),id)}audit(s,`Client ${action}d`,"client",id);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/projects"){
    if(!requireWrite(s,res,"projects"))return;const input=await body(req);try{required(input,["name","client","ownerId","dueDate"])}catch(e){return json(res,400,{error:e.message})}if(!db.prepare("SELECT 1 FROM users WHERE id=? AND active=1").get(input.ownerId))return json(res,400,{error:"Select an active owner."});const id=uid("project");db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id,s.mode,clean(input.name,180),clean(input.client,180),input.ownerId,0,"Planned",input.dueDate,positiveMoney(input.budget||0),0,"",now());audit(s,"Project created","project",id,input.name);return json(res,201,{id});
  }
  const projectMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/edit$/);
  if(req.method==="POST"&&projectMatch){if(!requireWrite(s,res,"projects"))return;const input=await body(req),id=projectMatch[1],record=db.prepare("SELECT * FROM projects WHERE id=? AND mode=?").get(id,s.mode);if(!record)return json(res,404,{error:"Project not found."});db.prepare("UPDATE projects SET name=?,client=?,owner_id=?,progress=?,status=?,due_date=?,budget_cents=?,cost_cents=?,blocker=?,updated_at=? WHERE id=?").run(clean(input.name||record.name,180),clean(input.client||record.client,180),input.ownerId||record.owner_id,Math.max(0,Math.min(100,Number(input.progress??record.progress))),clean(input.status||record.status,50),input.dueDate||record.due_date,positiveMoney(input.budget??record.budget_cents/100),positiveMoney(input.cost??record.cost_cents/100),clean(input.blocker,1000),now(),id);audit(s,"Project updated","project",id);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/milestones"){if(!requireWrite(s,res,"projects"))return;const input=await body(req);try{required(input,["projectId","title","dueDate","ownerId"])}catch(e){return json(res,400,{error:e.message})}if(!db.prepare("SELECT 1 FROM projects WHERE id=? AND mode=?").get(input.projectId,s.mode))return json(res,404,{error:"Project not found."});const id=uid("milestone");db.prepare("INSERT INTO milestones VALUES (?,?,?,?,?,?,?,?)").run(id,s.mode,input.projectId,clean(input.title,180),input.dueDate,"Not started",input.ownerId,now());audit(s,"Milestone created","milestone",id);return json(res,201,{id});}
  if(req.method==="POST"&&url.pathname==="/api/tasks"){if(!requireWrite(s,res,"projects"))return;const input=await body(req);try{required(input,["projectId","title","assigneeId","dueDate"])}catch(e){return json(res,400,{error:e.message})}if(!db.prepare("SELECT 1 FROM projects WHERE id=? AND mode=?").get(input.projectId,s.mode))return json(res,404,{error:"Project not found."});if(input.dependencyId&&!db.prepare("SELECT 1 FROM tasks WHERE id=? AND mode=?").get(input.dependencyId,s.mode))return json(res,400,{error:"Dependency must be an active-mode task."});const id=uid("task");db.prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id,s.mode,input.projectId,clean(input.title,180),input.assigneeId,"Not started",input.dueDate,input.dependencyId||null,"","",now(),s.user.id);audit(s,"Task assigned","task",id);return json(res,201,{id});}
  if(req.method==="POST"&&url.pathname==="/api/users"){if(!requireWrite(s,res))return;const input=await body(req);try{required(input,["name","role"])}catch(e){return json(res,400,{error:e.message})}const id=uid("user");db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,1)").run(id,clean(input.name,160),clean(input.preferredName||input.name.split(" ")[0],80),clean(input.pronunciation,160),clean(input.role,80),sha(clean(input.password)||"ChangeMe!2026"));audit(s,"Employee account created","user",id,input.role);return json(res,201,{id});}
  const userMatch=url.pathname.match(/^\/api\/users\/([^/]+)\/toggle$/);if(req.method==="POST"&&userMatch){if(!requireWrite(s,res))return;const id=userMatch[1];if(id===s.user.id)return json(res,409,{error:"You cannot deactivate your signed-in account."});db.prepare("UPDATE users SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?").run(id);audit(s,"Employee active state changed","user",id);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname.match(/^\/api\/tasks\/[^/]+\/update$/)){
    const id=decodeURIComponent(url.pathname.split("/")[3]),input=await body(req),task=db.prepare("SELECT * FROM tasks WHERE id=? AND mode=?").get(id,s.mode);if(!task)return json(res,404,{error:"Task not found in active mode."});
    let status;try{status=taskStatusUpdate(task.status,input.status,s.user,task);}catch(e){return json(res,e.message==="Permission denied."?403:400,{error:e.message});}
    const evidence=String(input.evidence||"").trim(),blocker=String(input.blocker||"").trim();if(status==="Blocked"&&!blocker)return json(res,400,{error:"A blocker description is required."});
    const stamp=now();db.exec("BEGIN IMMEDIATE");try{db.prepare("UPDATE tasks SET status=?,blocker=?,evidence=?,updated_at=?,updated_by=? WHERE id=?").run(status,blocker,evidence,stamp,s.user.id,id);db.prepare("INSERT INTO task_updates VALUES (?,?,?,?,?,?,?,?,?)").run(uid("update"),s.mode,id,s.user.id,status,Math.max(0,Math.min(100,Number(input.progress||0))),blocker,evidence,stamp);db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}audit(s,"Task updated","task",id,`${task.status} -> ${status}`);return json(res,200,{ok:true});
  }
  if(req.method==="POST"&&url.pathname==="/api/payments"){
    const input=await body(req);if(!can(s.user,"finance:write"))return json(res,403,{error:"Finance or Director permission required."});const invoice=db.prepare("SELECT * FROM invoices WHERE id=? AND mode=?").get(input.invoiceId,s.mode);if(!invoice)return json(res,404,{error:"Invoice not found."});
    try{db.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?)").run(uid("pay"),s.mode,invoice.id,String(input.reference||"").trim(),Math.round(Number(input.amount)*100),"Recorded",now());}catch(e){if(String(e).includes("UNIQUE"))return json(res,409,{error:"Payment reference already exists in this mode."});throw e;}audit(s,"Payment recorded","invoice",invoice.id,input.reference);return json(res,201,{ok:true});
  }
  if(req.method==="POST"&&url.pathname==="/api/quotations"){
    if(!requireWrite(s,res,"finance"))return;const input=await body(req);try{required(input,["clientId","validUntil","serviceTitle"])}catch(e){return json(res,400,{error:e.message})}
    const client=db.prepare("SELECT * FROM clients WHERE id=? AND mode=? AND status!='Archived'").get(input.clientId,s.mode);if(!client)return json(res,404,{error:"Active client not found."});
    if(input.projectId&&!db.prepare("SELECT 1 FROM projects WHERE id=? AND mode=?").get(input.projectId,s.mode))return json(res,400,{error:"Linked project was not found in the active mode."});
    let calc;try{calc=quotationCalculation(input)}catch(e){return json(res,400,{error:e.message})}
    const count=db.prepare("SELECT COUNT(*) n FROM quotations WHERE mode=?").get(s.mode).n+1,id=uid("quote"),number=`QUO-${new Date().getFullYear()}-${String(count).padStart(3,"0")}`,stamp=now(),description=clean(input.description||calc.items.map(x=>x.description).join("; "),1000);
    db.prepare("INSERT INTO quotations(id,mode,number,client_id,project_id,description,subtotal_cents,vat_cents,total_cents,status,valid_until,invoice_id,updated_at,issue_date,service_title,tax_rate,deposit_cents,payment_terms,payment_milestones,notes,items_json,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)").run(id,s.mode,number,client.id,input.projectId||null,description,calc.subtotalCents,calc.vatCents,calc.totalCents,"Draft",input.validUntil,null,stamp,input.issueDate||stamp.slice(0,10),clean(input.serviceTitle,220),calc.taxRate,calc.depositCents,clean(input.paymentTerms,1200),clean(input.paymentMilestones,1200),clean(input.notes,1600),JSON.stringify(calc.items));
    audit(s,"Quotation created","quotation",id,number);return json(res,201,{id,number,totals:{subtotalCents:calc.subtotalCents,vatCents:calc.vatCents,totalCents:calc.totalCents}});
  }
  const quoteEdit=url.pathname.match(/^\/api\/quotations\/([^/]+)\/edit$/);if(req.method==="POST"&&quoteEdit){
    if(!requireWrite(s,res,"finance"))return;const input=await body(req),record=db.prepare("SELECT * FROM quotations WHERE id=? AND mode=?").get(quoteEdit[1],s.mode);if(!record)return json(res,404,{error:"Quotation not found."});if(record.invoice_id)return json(res,409,{error:"Converted quotations cannot be edited."});
    try{required(input,["clientId","validUntil","serviceTitle"])}catch(e){return json(res,400,{error:e.message})}const client=db.prepare("SELECT 1 FROM clients WHERE id=? AND mode=? AND status!='Archived'").get(input.clientId,s.mode);if(!client)return json(res,404,{error:"Active client not found."});if(input.projectId&&!db.prepare("SELECT 1 FROM projects WHERE id=? AND mode=?").get(input.projectId,s.mode))return json(res,400,{error:"Linked project was not found in the active mode."});
    let calc;try{calc=quotationCalculation(input)}catch(e){return json(res,400,{error:e.message})}const description=clean(input.description||calc.items.map(x=>x.description).join("; "),1000);
    db.prepare("UPDATE quotations SET client_id=?,project_id=?,description=?,subtotal_cents=?,vat_cents=?,total_cents=?,valid_until=?,updated_at=?,issue_date=?,service_title=?,tax_rate=?,deposit_cents=?,payment_terms=?,payment_milestones=?,notes=?,items_json=?,revision=revision+1 WHERE id=?").run(input.clientId,input.projectId||null,description,calc.subtotalCents,calc.vatCents,calc.totalCents,input.validUntil,now(),input.issueDate||record.issue_date,clean(input.serviceTitle,220),calc.taxRate,calc.depositCents,clean(input.paymentTerms,1200),clean(input.paymentMilestones,1200),clean(input.notes,1600),JSON.stringify(calc.items),record.id);
    audit(s,"Quotation revised","quotation",record.id,`revision ${record.revision+1}`);return json(res,200,{ok:true,revision:record.revision+1});
  }
  const quoteConvert=url.pathname.match(/^\/api\/quotations\/([^/]+)\/convert$/);if(req.method==="POST"&&quoteConvert){if(!requireWrite(s,res,"finance"))return;const q=db.prepare("SELECT q.*,c.name client FROM quotations q JOIN clients c ON c.id=q.client_id WHERE q.id=? AND q.mode=?").get(quoteConvert[1],s.mode);if(!q)return json(res,404,{error:"Quotation not found."});if(q.invoice_id)return json(res,409,{error:"This quotation was already converted."});const count=db.prepare("SELECT COUNT(*) n FROM invoices WHERE mode=?").get(s.mode).n+1,id=uid("invoice"),number=`INV-${new Date().getFullYear()}-${String(count).padStart(3,"0")}`;db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?)").run(id,s.mode,number,q.project_id,q.client,q.total_cents,new Date(Date.now()+30*86400000).toISOString().slice(0,10),"Issued");db.prepare("UPDATE quotations SET status='Converted',invoice_id=?,updated_at=? WHERE id=?").run(id,now(),q.id);db.exec("COMMIT")}catch(e){db.exec("ROLLBACK");throw e}audit(s,"Quotation converted","quotation",q.id,number);return json(res,201,{id,number});}
  if(req.method==="POST"&&url.pathname==="/api/expenses"){if(!requireWrite(s,res,"finance"))return;const input=await body(req);try{required(input,["description","incurredAt"])}catch(e){return json(res,400,{error:e.message})}const id=uid("expense");db.prepare("INSERT INTO expenses VALUES (?,?,?,?,?,?)").run(id,s.mode,input.projectId||null,clean(input.description,500),positiveMoney(input.amount),input.incurredAt);audit(s,"Expense recorded","expense",id);return json(res,201,{id});}
  if(req.method==="POST"&&url.pathname==="/api/tenders"){if(!requireWrite(s,res,"projects"))return;const input=await body(req);try{required(input,["reference","title","organisation","category","closeDate","sourceUrl"])}catch(e){return json(res,400,{error:e.message})}let parsed;try{parsed=new URL(input.sourceUrl);if(!["http:","https:"].includes(parsed.protocol))throw 0}catch{return json(res,400,{error:"Source link must be an http or https URL."})}const id=uid("tender"),description=clean(input.description,3000),relevance=tenderRelevance({title:input.title,description,category:input.category});try{db.prepare("INSERT INTO tenders(id,mode,reference,title,organisation,category,close_date,briefing_date,source_url,status,last_refreshed,description,published_date,source_name,relevance_score,relevance_label,relevance_reason,public_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)").run(id,s.mode,clean(input.reference,100),clean(input.title,300),clean(input.organisation,200),clean(input.category,100),input.closeDate,input.briefingDate||null,parsed.href,"Tracking",now(),description,null,"Manual import",relevance.score,relevance.label,relevance.reason)}catch(e){if(String(e).includes("UNIQUE"))return json(res,409,{error:"Tender reference already exists in this mode."});throw e}audit(s,"Tender imported","tender",id);return json(res,201,{id});}
  if(req.method==="POST"&&url.pathname==="/api/tender-requirements"){if(!requireWrite(s,res,"projects"))return;const input=await body(req),t=db.prepare("SELECT 1 FROM tenders WHERE id=? AND mode=?").get(input.tenderId,s.mode);if(!t)return json(res,404,{error:"Tender not found."});try{required(input,["label","status"])}catch(e){return json(res,400,{error:e.message})}const id=uid("requirement");db.prepare("INSERT INTO tender_requirements VALUES (?,?,?,?,?,?,?)").run(id,s.mode,input.tenderId,clean(input.label,240),input.mandatory===false?0:1,clean(input.status,30),clean(input.documentRef,240)||null);audit(s,"Tender requirement added","tender",input.tenderId);return json(res,201,{id});}
  const reqMatch=url.pathname.match(/^\/api\/tender-requirements\/([^/]+)\/status$/);if(req.method==="POST"&&reqMatch){if(!requireWrite(s,res,"projects"))return;const input=await body(req),r=db.prepare("SELECT * FROM tender_requirements WHERE id=? AND mode=?").get(reqMatch[1],s.mode);if(!r)return json(res,404,{error:"Requirement not found."});if(!["Missing","Provided","Verified"].includes(input.status))return json(res,400,{error:"Invalid requirement status."});db.prepare("UPDATE tender_requirements SET status=?,document_ref=? WHERE id=?").run(input.status,clean(input.documentRef,240)||r.document_ref,r.id);audit(s,"Tender requirement updated","tender",r.tender_id,input.status);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/funding"){if(!requireWrite(s,res,"finance"))return;const input=await body(req);try{required(input,["type","purpose"])}catch(e){return json(res,400,{error:e.message})}const id=uid("funding");db.prepare("INSERT INTO funding VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,s.mode,clean(input.type,100),clean(input.purpose,500),input.projectId||null,input.invoiceId||null,clean(input.poReference,100),clean(input.provider,160),positiveMoney(input.required),positiveMoney(input.available),"Preparing",clean(input.terms,1000),now());audit(s,"Funding need created","funding",id);return json(res,201,{id});}
  if(req.method==="POST"&&url.pathname==="/api/funding-documents"){if(!requireWrite(s,res,"finance"))return;const input=await body(req),f=db.prepare("SELECT 1 FROM funding WHERE id=? AND mode=?").get(input.fundingId,s.mode);if(!f)return json(res,404,{error:"Funding record not found."});try{required(input,["label"])}catch(e){return json(res,400,{error:e.message})}const id=uid("funddoc");db.prepare("INSERT INTO funding_documents VALUES (?,?,?,?,?)").run(id,s.mode,input.fundingId,clean(input.label,240),"Missing");audit(s,"Funding document requirement added","funding",input.fundingId);return json(res,201,{id});}
  const fundDocMatch=url.pathname.match(/^\/api\/funding-documents\/([^/]+)\/toggle$/);if(req.method==="POST"&&fundDocMatch){if(!requireWrite(s,res,"finance"))return;const record=db.prepare("SELECT * FROM funding_documents WHERE id=? AND mode=?").get(fundDocMatch[1],s.mode);if(!record)return json(res,404,{error:"Funding document not found."});db.prepare("UPDATE funding_documents SET status=? WHERE id=?").run(record.status==="Verified"?"Missing":"Verified",record.id);audit(s,"Funding document status changed","funding",record.funding_id);return json(res,200,{ok:true});}
  if(req.method==="GET"&&url.pathname==="/api/avatar/status")return json(res,200,avatarCapability);
  if(req.method==="POST"&&url.pathname==="/api/avatar/meetings"){
    const input=await body(req),kind=input.kind==="followup"?"Follow-up":"New";let source=null,recall=null;
    if(kind==="Follow-up"){source=input.meetingId?db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=? AND status!='Deleted'").get(input.meetingId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id):latestRecordedDiscussion(s);if(!source)return json(res,404,{error:"No authorised previous meeting with saved discussion is available for follow-up."});}
    if(kind==="New"&&input.recallMeetingId){recall=db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=? AND status!='Deleted'").get(input.recallMeetingId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id);if(!recall)return json(res,404,{error:"The selected historical meeting is unavailable or not authorised."});}
    const id=uid("wayne-meeting"),manualTitle=Boolean(clean(input.title)),title=clean(input.title||"Untitled meeting",100),agenda=clean(input.agenda||(source?.unresolved_topics?`Follow up unresolved topic: ${source.unresolved_topics}`:"Fresh operational discussion"),1600),stamp=now();
    db.prepare("INSERT INTO wayne_meetings(id,mode,company_id,owner_id,title,title_manual,agenda,meeting_kind,follow_up_of,recall_meeting_id,status,started_at,ended_at,timezone,transcript_completeness,transcript_revision,recap_revision,recap,unresolved_topics,confirmed_decisions,approved_actions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'Prepared',?,NULL,'Africa/Johannesburg','No transcript captured',0,0,'','','','[]',?,?)").run(id,s.mode,WAYNE_COMPANY_SCOPE,s.user.id,title,manualTitle?1:0,agenda,kind,source?.id||null,recall?.id||null,stamp,stamp,stamp);audit(s,"Wayne logical meeting prepared","wayne_meeting",id,kind);return json(res,201,{meeting:db.prepare("SELECT * FROM wayne_meetings WHERE id=?").get(id)});
  }
  const wayneMeetingEnd=url.pathname.match(/^\/api\/avatar\/meetings\/([^/]+)\/end$/);if(req.method==="POST"&&wayneMeetingEnd){const meeting=db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=?").get(wayneMeetingEnd[1],s.mode,WAYNE_COMPANY_SCOPE,s.user.id);if(!meeting)return json(res,404,{error:"Wayne meeting not found."});const ended=meeting.ended_at||now();rebuildWayneMeetingRecap(meeting.id);db.prepare("UPDATE wayne_meetings SET status='Completed',ended_at=?,updated_at=? WHERE id=?").run(ended,now(),meeting.id);audit(s,"Wayne logical meeting completed","wayne_meeting",meeting.id);return json(res,200,{meeting:db.prepare("SELECT * FROM wayne_meetings WHERE id=?").get(meeting.id)});}
  const wayneMeetingTitle=url.pathname.match(/^\/api\/avatar\/meetings\/([^/]+)\/title$/);if(req.method==="PATCH"&&wayneMeetingTitle){const meeting=db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=?").get(wayneMeetingTitle[1],s.mode,WAYNE_COMPANY_SCOPE,s.user.id);if(!meeting)return json(res,404,{error:"Wayne meeting not found."});const input=await body(req),title=clean(input.title,100);if(!title)return json(res,400,{error:"Meeting subject is required."});db.prepare("UPDATE wayne_meetings SET title=?,title_manual=1,updated_at=? WHERE id=?").run(title,now(),meeting.id);audit(s,"Wayne meeting subject renamed","wayne_meeting",meeting.id);return json(res,200,{meeting:db.prepare("SELECT * FROM wayne_meetings WHERE id=?").get(meeting.id)});}
  const wayneMinutesEmail=url.pathname.match(/^\/api\/avatar\/meetings\/([^/]+)\/minutes-email$/);if(wayneMinutesEmail){
    const draft=meetingMinutesEmailDraft(s,wayneMinutesEmail[1]);if(!draft)return json(res,404,{error:"Wayne meeting not found in the active user and workspace mode."});
    if(req.method==="GET")return json(res,200,{draft});
    if(req.method==="POST"){
      if(!requireWrite(s,res))return;const input=await body(req);if(!draft.ready)return json(res,409,{error:draft.reason});if(!input.confirmed)return json(res,409,{error:"Review and explicitly confirm the meeting-minutes email before sending."});if(clean(input.recipient,240).toLowerCase()!==WAYNE_MINUTES_RECIPIENT)return json(res,400,{error:`Meeting minutes may be sent only to ${WAYNE_MINUTES_RECIPIENT} through this Wayne action.`});
      const jobId=`wayne-minutes:${draft.meetingId}:${draft.recapRevision}`,existing=db.prepare("SELECT * FROM outbox WHERE mode=? AND job_id=?").get(s.mode,jobId);if(existing?.status==="Sent")return json(res,409,{error:"These meeting minutes were already sent for the current transcript revision.",sent:true});
      if(!emailDelivery.configured){db.prepare("INSERT INTO outbox(id,mode,job_id,recipient,subject,body,status,created_at,provider,provider_message_id,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET subject=excluded.subject,body=excluded.body,status=excluded.status,last_error=excluded.last_error").run(existing?.id||uid("mail"),s.mode,jobId,draft.recipient,draft.subject,draft.body,"Awaiting configuration",now(),"smtp",null,`Missing ${emailDelivery.status.missing.join(", ")}`);audit(s,"Wayne minutes email awaiting configuration","wayne_meeting",draft.meetingId,"recipient allowlist matched; content not logged");return json(res,503,{error:"Meeting minutes are prepared, but SMTP delivery is awaiting server-side configuration.",missing:emailDelivery.status.missing,draft});}
      try{const delivered=await emailDelivery.send({to:draft.recipient,subject:draft.subject,text:draft.body});db.prepare("INSERT INTO outbox(id,mode,job_id,recipient,subject,body,status,created_at,provider,provider_message_id,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status='Sent',provider=excluded.provider,provider_message_id=excluded.provider_message_id,last_error=NULL,created_at=excluded.created_at").run(existing?.id||uid("mail"),s.mode,jobId,draft.recipient,draft.subject,draft.body,"Sent",now(),delivered.provider,delivered.response,null);audit(s,"Wayne meeting minutes sent","wayne_meeting",draft.meetingId,"recipient allowlist matched; content not logged");return json(res,200,{sent:true,recipient:draft.recipient,provider:delivered.provider});}catch(error){db.prepare("INSERT INTO outbox(id,mode,job_id,recipient,subject,body,status,created_at,provider,provider_message_id,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status='Failed',last_error=excluded.last_error,created_at=excluded.created_at").run(existing?.id||uid("mail"),s.mode,jobId,draft.recipient,draft.subject,draft.body,"Failed",now(),"smtp",null,clean(error.message,500));return json(res,502,{error:`Meeting-minutes delivery failed: ${error.message}`});}
    }
  }
  if(req.method==="GET"&&url.pathname==="/api/avatar/history"){
    try{refreshWayneFromOpenEdge(s)}catch(error){return json(res,error.status||503,{error:error.message,retryable:true})}
    const date=clean(url.searchParams.get("date"),10),query=clean(url.searchParams.get("q"),120).toLowerCase(),dateKey=value=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
    let rows=db.prepare("SELECT m.* FROM wayne_meetings m WHERE m.mode=? AND m.company_id=? AND m.owner_id=? AND m.status!='Deleted' AND NOT EXISTS (SELECT 1 FROM avatar_sessions a WHERE a.meeting_id=m.id AND a.status='Active') ORDER BY m.started_at DESC LIMIT 100").all(s.mode,WAYNE_COMPANY_SCOPE,s.user.id);if(date)rows=rows.filter(row=>dateKey(row.started_at)===date);if(query)rows=rows.filter(row=>`${row.title} ${row.recap} ${row.unresolved_topics}`.toLowerCase().includes(query));
    if(!rows.length)return json(res,200,{matches:[],message:date?"I couldn’t find a recorded meeting on that date.":"I couldn’t find an authorised recorded meeting matching that search."});
    return json(res,200,{matches:rows.map(row=>({...row,transcript:meetingEvents(row.id),approvedActions:parseJsonArray(row.approved_actions)})),message:rows.length>1?"Multiple meetings match. Select the meeting you want Wayne to recall.":rows[0].transcript_revision===0?"A meeting record exists, but no transcript was captured.":rows[0].transcript_completeness==="Transcript retrieval failed"?"A meeting record exists, but provider transcript retrieval failed; locally captured events may be partial.":"Recorded meeting found."});
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/presentation-context"){
    if(s.mode!=="DEMO")return json(res,409,{error:"Wayne presentation context is limited to fictional Demo Mode records."});
    try{return json(res,200,presentationContext(s,await body(req)))}catch(error){return json(res,error.status||400,{error:error.message})}
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/preflight"){
    if(s.mode!=="DEMO")return json(res,409,{error:"Wayne practice and presentation sessions use fictional Demo Mode records only. Switch to Demo Mode before continuing."});
    try{refreshWayneFromOpenEdge(s)}catch(error){return json(res,error.status||503,{error:error.message,retryable:true})}
    const input=await body(req),logicalMeeting=input.meetingId?db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=? AND status IN ('Prepared','In progress')").get(input.meetingId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id):null;if(input.meetingId&&!logicalMeeting)return json(res,409,{error:"The current Wayne meeting is unavailable or no longer active."});
    const requestedHistoryId=clean(input.followUpMeetingId,100)||null,selectedHistory=requestedHistoryId==="__last__"?latestRecordedDiscussion(s,logicalMeeting?.id||null):requestedHistoryId?db.prepare("SELECT m.* FROM wayne_meetings m WHERE m.id=? AND m.mode=? AND m.company_id=? AND m.owner_id=? AND m.status!='Deleted' AND NOT EXISTS (SELECT 1 FROM avatar_sessions a WHERE a.meeting_id=m.id AND a.status='Active')").get(requestedHistoryId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id):null,selectedHistoryId=selectedHistory?.id||null;if(requestedHistoryId&&requestedHistoryId!=="__last__"&&!selectedHistory)return json(res,404,{error:"The selected follow-up meeting is unavailable or not authorised."});
    let recapRebuilt=false;if(logicalMeeting?.transcript_revision){rebuildWayneMeetingRecap(logicalMeeting.id,{completeness:logicalMeeting.transcript_completeness});recapRebuilt=true}if(selectedHistory?.transcript_revision&&selectedHistory.id!==logicalMeeting?.id){rebuildWayneMeetingRecap(selectedHistory.id,{completeness:selectedHistory.transcript_completeness});recapRebuilt=true}if(recapRebuilt){const saved=persistWayneToOpenEdge(s,"wayne_meetings");if(!saved.saved)return json(res,503,{error:"The transcript recap could not be saved to OpenEdge. Retry the request.",retryable:true})}
    let presentation=null;if(input.presentation?.route){try{presentation=presentationContext(s,input.presentation);presentation={...input.presentation,route:presentation.route}}catch(error){return json(res,error.status||400,{error:error.message})}}
    const policy=sessionPolicy(input.sessionType||"sandbox"),balance=await avatarProvider.credits().catch(error=>{throw Object.assign(error,{status:error.status||502})}),briefing=avatarBriefing(s,logicalMeeting?.id||null,selectedHistory?.id||null,presentation),token=randomBytes(24).toString("hex"),created=Date.now(),activeSession=Boolean(db.prepare("SELECT 1 FROM avatar_sessions WHERE mode=? AND user_id=? AND status='Active'").get(s.mode,s.user.id));
    s.waynePreflights=s.waynePreflights||new Map();s.waynePreflights.set(token,{token,type:policy.type,balance,expectedCredits:policy.expectedCredits,briefing,meetingId:logicalMeeting?.id||null,selectedHistoryId:selectedHistory?.id||null,presentation,created,mode:s.mode,userId:s.user.id,replaceExisting:activeSession});for(const [key,value] of s.waynePreflights)if(created-value.created>120000)s.waynePreflights.delete(key);
    const creditWarning=policy.type==="sandbox"&&balance<4?"Starting this practice session does not reserve credits. The current balance is below the 4 credits expected for a full presentation session.":"Credits are not reserved at provider level; the balance can change before connection.",activeWarning=activeSession?" An earlier Wayne session is still marked active. Confirming will close that same-user Demo Mode session before connecting the new one.":"";
    const historyNotice=requestedHistoryId==="__last__"&&!selectedHistory?"No previous recorded discussion was found for this user and workspace mode. A fresh conversation can still be started.":"";
    return json(res,200,{preflightToken:token,sessionType:policy.type,label:policy.label,balance,expectedCredits:policy.expectedCredits,maxSessionDuration:policy.maxDuration,activeSession,historyNotice,warning:`${creditWarning}${activeWarning}${historyNotice?` ${historyNotice}`:""}`,outboundContext:briefing.dynamicVariables,categories:briefing.categories,microphoneNotice:"Microphone speech is processed externally by LiveAvatar and cannot be protected by context redaction.",retentionNotice:"INFINITE-X OS saves authorised continuity to OpenEdge before requesting provider session-event deletion. Provider acknowledgement is not proof that backups or every downstream copy have been erased."});
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/conversation/new"){
    const active=db.prepare("SELECT id FROM avatar_sessions WHERE mode=? AND user_id=? AND status='Active'").get(s.mode,s.user.id);if(active)return json(res,409,{error:"End the active Wayne session before starting a new conversation."});
    const id=uid("conversation");db.prepare("INSERT INTO wayne_messages VALUES (?,?,?,?,?,?,?)").run(id,s.mode,s.user.id,"system","Conversation started",JSON.stringify({companyId:WAYNE_COMPANY_SCOPE}),now());audit(s,"Wayne conversation started","wayne_conversation",id);return json(res,201,{started:true,id});
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/conversation/delete"){
    const active=db.prepare("SELECT id FROM avatar_sessions WHERE mode=? AND user_id=? AND status='Active'").get(s.mode,s.user.id);if(active)return json(res,409,{error:"End the active Wayne session before deleting the conversation."});
    const owned=db.prepare("SELECT id FROM wayne_meetings WHERE mode=? AND company_id=? AND owner_id=?").all(s.mode,WAYNE_COMPANY_SCOPE,s.user.id),events=owned.reduce((sum,meeting)=>sum+db.prepare("DELETE FROM wayne_transcript_events WHERE meeting_id=?").run(meeting.id).changes,0),messages=db.prepare("DELETE FROM wayne_messages WHERE mode=? AND user_id=?").run(s.mode,s.user.id).changes,sessions=db.prepare("UPDATE avatar_sessions SET transcript='[]',briefing='{}' WHERE mode=? AND user_id=? AND status!='Active'").run(s.mode,s.user.id).changes,summaries=db.prepare("DELETE FROM wayne_session_summaries WHERE mode=? AND user_id=?").run(s.mode,s.user.id).changes;db.prepare("UPDATE wayne_meetings SET transcript_completeness='No transcript captured',transcript_revision=0,recap_revision=0,recap='Conversation deleted by the authorised user.',unresolved_topics='',updated_at=? WHERE mode=? AND company_id=? AND owner_id=?").run(now(),s.mode,WAYNE_COMPANY_SCOPE,s.user.id);audit(s,"Wayne conversation deleted","wayne_conversation","",`messages=${messages}; events=${events}; sessions=${sessions}; summaries=${summaries}; content not logged`);return json(res,200,{deleted:true,messages,events,sessions,summaries});
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/retention"){
    if(s.user.role!=="Director")return json(res,403,{error:"Director permission is required to change Wayne retention."});const input=await body(req),days=Math.trunc(Number(input.retentionDays));if(!Number.isInteger(days)||days<1||days>365)return json(res,400,{error:"Retention must be between 1 and 365 days."});db.prepare("INSERT INTO wayne_privacy_settings(mode,retention_days,updated_at) VALUES (?,?,?) ON CONFLICT(mode) DO UPDATE SET retention_days=excluded.retention_days,updated_at=excluded.updated_at").run(s.mode,days,now());applyWayneRetention();audit(s,"Wayne retention updated","wayne_privacy",s.mode,`retentionDays=${days}`);return json(res,200,{saved:true,retentionDays:days});
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/session"){
    if(s.mode!=="DEMO")return json(res,409,{error:"Wayne sessions are limited to fictional Demo Mode records."});
    const input=await body(req),preflight=s.waynePreflights?.get(String(input.preflightToken||""));if(!preflight||preflight.mode!==s.mode||preflight.userId!==s.user.id||Date.now()-preflight.created>120000)return json(res,409,{error:"The Wayne context review expired. Review the current outbound context again."});
    let creditCheck;try{const freshBalance=await avatarProvider.credits();creditCheck=validateSessionCredit({type:preflight.type,balance:freshBalance,confirmed:input.confirmed===true})}catch(error){return json(res,error.status||502,{error:error.message})}s.waynePreflights.delete(preflight.token);
    const existing=db.prepare("SELECT id FROM avatar_sessions WHERE mode=? AND user_id=? AND status='Active'").get(s.mode,s.user.id);if(existing&&preflight.replaceExisting){const handoff=await closeAvatarSessions(s,"Replaced after confirmed handoff");if(handoff.persistencePending)return json(res,503,{error:"The previous transcript is awaiting OpenEdge persistence. Wayne was not restarted and provider-event deletion was withheld. Retry after repository recovery.",retryable:true})}else if(existing)return json(res,409,{error:"An active Wayne session exists. Review the context again and confirm its replacement."});
    try{refreshWayneFromOpenEdge(s)}catch(error){return json(res,error.status||503,{error:error.message,retryable:true})}
    let meetingId=preflight.meetingId,createdMeeting=false,provider=null;const stamp=now();
    if(!meetingId){const source=preflight.selectedHistoryId?db.prepare("SELECT * FROM wayne_meetings WHERE id=? AND mode=? AND company_id=? AND owner_id=? AND status!='Deleted'").get(preflight.selectedHistoryId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id):null;meetingId=uid("wayne-meeting");db.prepare("INSERT INTO wayne_meetings(id,mode,company_id,owner_id,title,agenda,meeting_kind,follow_up_of,recall_meeting_id,status,started_at,ended_at,timezone,transcript_completeness,transcript_revision,recap_revision,recap,unresolved_topics,confirmed_decisions,approved_actions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'Prepared',?,NULL,'Africa/Johannesburg','No transcript captured',0,0,'','','','[]',?,?)").run(meetingId,s.mode,WAYNE_COMPANY_SCOPE,s.user.id,"Untitled meeting",source?.unresolved_topics?`Continue recorded unresolved topic: ${clean(source.unresolved_topics,1400)}`:"Quick-launch operational conversation",source?"Follow-up":"Quick launch",source?.id||null,null,stamp,stamp,stamp);createdMeeting=true}
    const briefing=avatarBriefing(s,meetingId,preflight.selectedHistoryId,preflight.presentation);
    try{
      provider=await avatarProvider.start({dynamicVariables:briefing.dynamicVariables,sessionType:preflight.type});const id=uid("avatar"),started=now(),expires=provider.providerExpiresAt||new Date(Date.now()+provider.maxSessionDuration*1000).toISOString();
      db.prepare("INSERT INTO avatar_sessions(id,mode,user_id,provider_session_id,status,business_context,briefing,transcript,started_at,expires_at,ended_at,last_error,meeting_id) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)").run(id,s.mode,s.user.id,provider.sessionId,"Active",provider.businessContext?1:0,JSON.stringify({sessionType:preflight.type,business_summary:briefing.dynamicVariables.business_summary,meetings_summary:briefing.dynamicVariables.meetings_summary,categories:briefing.categories}),"",started,expires,meetingId);db.prepare("UPDATE wayne_meetings SET status='In progress',updated_at=? WHERE id=?").run(now(),meetingId);
      audit(s,"Wayne avatar session started","avatar_session",id,`type=${preflight.type}; categories=${briefing.categories.join(",")}; content not logged`);
      return json(res,201,{...provider,id,meetingId,expiresAt:expires,timerBasis:provider.providerExpiresAt?"Provider session expiry":`Local ${provider.maxSessionDuration}-second estimate`,creditCheck:{balance:creditCheck.balance,expectedCredits:creditCheck.expectedCredits,notice:creditCheck.warning},briefing:{facts:briefing.facts,sources:briefing.sources},continuity:{continued:briefing.continuity.continued,transcriptAvailable:briefing.continuity.transcriptAvailable,recap:briefing.dynamicVariables.meetings_summary},greeting:briefing.continuity.continued?`${s.user.preferred_name||s.user.name.split(" ")[0]}, I’m ready to continue.`:`Hello, ${s.user.preferred_name||s.user.name.split(" ")[0]}. I’m Wayne.`,contextNotice:provider.capabilityReason});
    }catch(error){if(provider?.sessionId)await avatarProvider.stop(provider.sessionId).catch(()=>{});if(createdMeeting)db.prepare("DELETE FROM wayne_meetings WHERE id=? AND NOT EXISTS (SELECT 1 FROM avatar_sessions WHERE meeting_id=?)").run(meetingId,meetingId);return json(res,error.status||502,{error:error.message,detail:error.detail||"",capability:avatarCapability});}
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/session/event"){
    const input=await body(req),lateCutoff=new Date(Date.now()-120000).toISOString(),record=db.prepare("SELECT * FROM avatar_sessions WHERE id=? AND mode=? AND user_id=? AND (status='Active' OR ended_at>=?)").get(input.id,s.mode,s.user.id,lateCutoff);if(!record)return json(res,404,{error:"Avatar session not found or its final-event window has closed."});
    const role=input.role==="assistant"?"assistant":"user",content=clean(input.content,4000);if(!content)return json(res,400,{error:"Transcript content is required."});
    const at=input.occurredAt&&Number.isFinite(Date.parse(input.occurredAt))?new Date(input.occurredAt).toISOString():now(),entries=parseJsonArray(record.transcript),saved=saveWayneTranscriptEvent({mode:s.mode,meetingId:record.meeting_id,avatarSessionId:record.id,speaker:role,content,occurredAt:at,providerEventId:input.providerEventId,completeness:"Partial transcript"});
    if(saved.saved)entries.push({role,content,at,provider_event_id:input.providerEventId||null,source:"LiveAvatar event"});
    db.prepare("UPDATE avatar_sessions SET transcript=? WHERE id=?").run(JSON.stringify(entries.slice(-100)),record.id);
    const persistence=persistWayneToOpenEdge(s,"wayne_transcript_event");
    if(!persistence.saved){db.prepare("UPDATE avatar_sessions SET last_error=? WHERE id=?").run(`OPENEDGE_TRANSCRIPT_PENDING: ${safeOutboundText(persistence.error,300)}`,record.id);audit(s,"Wayne transcript persistence pending","avatar_session",record.id,"Provider deletion withheld; content not logged");return json(res,503,{error:"The final transcript event is recoverable locally but could not yet be saved to OpenEdge. Provider-event deletion will be withheld.",retryable:true,repository:{saved:false,source:persistence.source}})}
    const minutesRequested=role==="user"&&isMeetingMinutesEmailRequest(content),minutesEmailDraft=minutesRequested?meetingMinutesEmailDraft(s,record.meeting_id):null;
    return json(res,200,{saved:saved.saved,deduplicated:!saved.saved,lateFinal:record.status!=="Active",repository:{saved:true,source:persistence.source,revision:persistence.revision||null},emailDraft:role==="assistant"?extractEmailDraft(content):null,minutesEmailDraft});
  }
  if(req.method==="POST"&&url.pathname==="/api/avatar/session/stop"){
    res.ixSync=null;const input=await body(req),record=db.prepare("SELECT * FROM avatar_sessions WHERE id=? AND mode=? AND user_id=?").get(input.id,s.mode,s.user.id);if(!record)return json(res,404,{error:"Avatar session not found in the active mode."});
    let providerTranscript=[],error="",retrievalFailed=false;if(record.status==="Active"){try{await avatarProvider.stop(record.provider_session_id);}catch(e){error=e.message;}try{providerTranscript=await avatarProvider.transcript(record.provider_session_id);}catch(e){retrievalFailed=true;error=[error,`Transcript retrieval failed: ${e.message}`].filter(Boolean).join("; ")}}
    const savedTranscript=mergeAvatarTranscript(s,record,providerTranscript),providerEntries=normaliseProviderTranscript(providerTranscript).length;
    const ended=record.ended_at||now(),eventCount=record.meeting_id?meetingEvents(record.meeting_id).length:0,completeness=retrievalFailed?"Transcript retrieval failed":providerEntries?"Complete transcript":eventCount?"Partial transcript":"No transcript captured";db.prepare("UPDATE avatar_sessions SET status='Closed',transcript=?,ended_at=?,last_error=? WHERE id=?").run(JSON.stringify(savedTranscript),ended,error||null,record.id);if(record.meeting_id){rebuildWayneMeetingRecap(record.meeting_id,{completeness});if(input.keepMeetingOpen!==true)db.prepare("UPDATE wayne_meetings SET status='Completed',ended_at=?,updated_at=? WHERE id=?").run(ended,ended,record.meeting_id)}const sessionSummary=saveWayneSessionSummary(s,record,savedTranscript),persistence=persistWayneToOpenEdge(s);if(!persistence.saved){db.prepare("UPDATE avatar_sessions SET last_error=? WHERE id=?").run(`OPENEDGE_TRANSCRIPT_PENDING: ${safeOutboundText(persistence.error,300)}`,record.id);audit(s,"Wayne transcript persistence pending","avatar_session",record.id,"Provider deletion withheld; content not logged");return json(res,503,{error:"The transcript is saved in the recoverable local cache but OpenEdge persistence is pending. Provider-event deletion was not requested.",retryable:true,transcriptAvailable:eventCount>0,transcriptCompleteness:completeness,providerDeletion:{status:"Withheld pending OpenEdge persistence"}})}const deletion=await attemptProviderDeletion(enqueueProviderDeletion(s,record));audit(s,"Wayne avatar session closed","avatar_session",record.id,error||"provider stop requested");return json(res,error?502:200,{stopped:!error,error:error||undefined,transcriptAvailable:eventCount>0,transcriptCompleteness:completeness,repository:{saved:true,source:persistence.source,revision:persistence.revision||null},sessionSummary:{saved:true,summary:sessionSummary.summary,meetingId:record.meeting_id},providerDeletion:{status:deletion.status,attempts:deletion.attempts,notice:"Provider acknowledgement is not proof that backups or all downstream copies were erased."}});
  }
  if(req.method==="POST"&&url.pathname==="/api/wayne/schedule-preview"){const input=await body(req),parsed=parseSchedulePhrase(input.message,new Date(input.now||Date.now()));return json(res,200,{...parsed,message:parsed.needsConfirmation?"I need a date and time before I can prepare the booking.":"Please confirm these booking details before saving."});}
  if(req.method==="POST"&&url.pathname==="/api/wayne/chat"){
    const input=await body(req),message=String(input.message||"").trim();if(!message)return json(res,400,{error:"Message is required."});
    const userMessage=uid("msg");db.prepare("INSERT INTO wayne_messages VALUES (?,?,?,?,?,?,?)").run(userMessage,s.mode,s.user.id,"user",message,"[]",now());
    try{const reply=await wayneReply(s,message);if(reply.available)db.prepare("INSERT INTO wayne_messages VALUES (?,?,?,?,?,?,?)").run(uid("msg"),s.mode,s.user.id,"assistant",reply.answer,JSON.stringify(reply.sources),now());return json(res,reply.available?200:503,reply);}catch(e){return json(res,502,{error:`Live AI request failed: ${e.message}`,available:false});}
  }
  if(req.method==="POST"&&url.pathname==="/api/meetings"){
    const input=await body(req);if(!input.confirmed)return json(res,409,{error:"Booking details must be confirmed before saving."});if(!input.topic||!input.startsAt)return json(res,400,{error:"Topic and start time are required."});
    const meeting={id:uid("meeting"),mode:s.mode,topic:String(input.topic),starts_at:new Date(input.startsAt).toISOString(),timezone:"Africa/Johannesburg",agenda:String(input.agenda||preparedAgenda(s)),status:"Scheduled",agenda_send_at:input.agendaSendAt?new Date(input.agendaSendAt).toISOString():null,reminder_minutes:Math.max(0,Number(input.reminderMinutes??15)),summary:"",decisions:"",created_by:s.user.id,updated_at:now()};
    db.prepare("INSERT INTO meetings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...Object.values(meeting));queueMeetingJobs(meeting);audit(s,"Meeting scheduled","meeting",meeting.id,meeting.topic);return json(res,201,{meeting});
  }
  const meetingMatch=url.pathname.match(/^\/api\/meetings\/([^/]+)\/(reschedule|cancel|minutes)$/);
  if(req.method==="POST"&&meetingMatch){const [,id,action]=meetingMatch,input=await body(req),meeting=db.prepare("SELECT * FROM meetings WHERE id=? AND mode=?").get(id,s.mode);if(!meeting)return json(res,404,{error:"Meeting not found."});
    if(action==="cancel"){db.prepare("UPDATE meetings SET status='Cancelled',updated_at=? WHERE id=?").run(now(),id);db.prepare("UPDATE notification_jobs SET status='Cancelled',cancelled_at=?,updated_at=? WHERE meeting_id=? AND status IN ('Pending','Retry','Awaiting configuration')").run(now(),now(),id);}
    if(action==="reschedule"){if(!input.startsAt)return json(res,400,{error:"New start time is required."});db.prepare("UPDATE meetings SET starts_at=?,agenda_send_at=?,updated_at=? WHERE id=?").run(new Date(input.startsAt).toISOString(),input.agendaSendAt?new Date(input.agendaSendAt).toISOString():null,now(),id);queueMeetingJobs(db.prepare("SELECT * FROM meetings WHERE id=?").get(id));}
    if(action==="minutes"){if(!input.confirmed)return json(res,409,{error:"Minutes must be user-confirmed."});db.prepare("UPDATE meetings SET summary=?,decisions=?,status='Completed',updated_at=? WHERE id=?").run(String(input.summary||""),String(input.decisions||""),now(),id);if(input.action?.title){const actionId=uid("action"),owner=input.action.ownerId||s.user.id,due=input.action.dueDate||new Date().toISOString().slice(0,10);db.prepare("INSERT INTO meeting_actions VALUES (?,?,?,?,?,?,?,?,?)").run(actionId,s.mode,id,clean(input.action.title,240),owner,due,"Open",1,now());if(input.action.projectId&&db.prepare("SELECT 1 FROM projects WHERE id=? AND mode=?").get(input.action.projectId,s.mode))db.prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(uid("task"),s.mode,input.action.projectId,clean(input.action.title,240),owner,"Not started",due,null,"",`Meeting action ${actionId}`,now(),s.user.id);}}
    audit(s,`Meeting ${action}`,"meeting",id);return json(res,200,{ok:true});
  }
  const actionMatch=url.pathname.match(/^\/api\/meeting-actions\/([^/]+)\/complete$/);if(req.method==="POST"&&actionMatch){const record=db.prepare("SELECT * FROM meeting_actions WHERE id=? AND mode=?").get(actionMatch[1],s.mode);if(!record)return json(res,404,{error:"Meeting action not found."});if(record.owner_id!==s.user.id&&s.user.role!=="Director"&&s.user.role!=="Project Manager")return json(res,403,{error:"Only the owner or a manager can complete this action."});db.prepare("UPDATE meeting_actions SET status='Completed' WHERE id=?").run(record.id);audit(s,"Meeting action completed","meeting_action",record.id);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/profile"){const input=await body(req);db.prepare("UPDATE users SET preferred_name=?,pronunciation=? WHERE id=?").run(String(input.preferredName||s.user.name.split(" ")[0]).trim(),String(input.pronunciation||"").trim(),s.user.id);s.user=db.prepare("SELECT * FROM users WHERE id=?").get(s.user.id);audit(s,"Profile updated","user",s.user.id);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/compliance"){if(!requireWrite(s,res,"projects"))return;const input=await body(req);try{required(input,["title","ownerId","status","category","applicability"])}catch(e){return json(res,400,{error:e.message})}const id=uid("compliance");db.prepare("INSERT INTO compliance_items(id,mode,title,standard_ref,owner_id,expiry_date,status,evidence,related_type,related_id,updated_at,category,authority,frequency,applicability,mandatory,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,s.mode,clean(input.title,220),clean(input.standardRef,160),input.ownerId,input.expiryDate||null,clean(input.status,50),clean(input.evidence,500),clean(input.relatedType,50),clean(input.relatedId,100)||null,now(),clean(input.category,80),clean(input.authority,160),clean(input.frequency,120),clean(input.applicability,260),input.mandatory===true||input.mandatory==="on"?1:0,clean(input.notes,1200));audit(s,"Compliance item created","compliance",id);return json(res,201,{id});}
  const complianceMatch=url.pathname.match(/^\/api\/compliance\/([^/]+)\/edit$/);if(req.method==="POST"&&complianceMatch){if(!requireWrite(s,res,"projects"))return;const input=await body(req),record=db.prepare("SELECT * FROM compliance_items WHERE id=? AND mode=?").get(complianceMatch[1],s.mode);if(!record)return json(res,404,{error:"Compliance item not found."});db.prepare("UPDATE compliance_items SET title=?,standard_ref=?,owner_id=?,expiry_date=?,status=?,evidence=?,related_type=?,related_id=?,updated_at=?,category=?,authority=?,frequency=?,applicability=?,mandatory=?,notes=? WHERE id=?").run(clean(input.title||record.title,220),clean(input.standardRef||record.standard_ref,160),input.ownerId||record.owner_id,input.expiryDate||null,clean(input.status||record.status,50),clean(input.evidence,500),clean(input.relatedType,50),clean(input.relatedId,100)||null,now(),clean(input.category||record.category,80),clean(input.authority,160),clean(input.frequency,120),clean(input.applicability||record.applicability,260),input.mandatory===true||input.mandatory==="on"?1:0,clean(input.notes,1200),record.id);audit(s,"Compliance item updated","compliance",record.id);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/documents"){const input=await body(req);try{required(input,["title","fileName","mimeType","contentBase64","relatedType"])}catch(e){return json(res,400,{error:e.message})}if(String(input.contentBase64).length>1_500_000)return json(res,413,{error:"File exceeds the 1 MB demonstration upload limit."});if(!/^[A-Za-z0-9+/=\r\n]+$/.test(input.contentBase64))return json(res,400,{error:"Invalid file content."});const latest=db.prepare("SELECT MAX(revision) n FROM documents WHERE mode=? AND title=?").get(s.mode,clean(input.title,220)).n||0,id=uid("document");db.prepare("UPDATE documents SET status='Superseded' WHERE mode=? AND title=? AND status='Current'").run(s.mode,clean(input.title,220));db.prepare("INSERT INTO documents(id,mode,title,file_name,mime_type,content_base64,related_type,related_id,revision,status,uploaded_by,created_at,storage_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)").run(id,s.mode,clean(input.title,220),clean(input.fileName,240),clean(input.mimeType,120),String(input.contentBase64),clean(input.relatedType,50),clean(input.relatedId,100)||null,latest+1,"Current",s.user.id,now());audit(s,"Document uploaded","document",id,`revision ${latest+1}`);return json(res,201,{id,revision:latest+1});}
  const docDownload=url.pathname.match(/^\/api\/documents\/([^/]+)\/download$/);if(req.method==="GET"&&docDownload){const record=db.prepare("SELECT * FROM documents WHERE id=? AND mode=?").get(docDownload[1],s.mode);if(!record)return json(res,404,{error:"Document not found in active mode."});const bytes=Buffer.from(record.content_base64,"base64");res.writeHead(200,{"Content-Type":record.mime_type,"Content-Disposition":`${url.searchParams.get("preview")==="1"?"inline":"attachment"}; filename=\"${record.file_name.replace(/[\"\r\n]/g,"")}\"`,"Cache-Control":"no-store",...securityHeaders});return res.end(bytes);}
  const docArchive=url.pathname.match(/^\/api\/documents\/([^/]+)\/archive$/);if(req.method==="POST"&&docArchive){const record=db.prepare("SELECT * FROM documents WHERE id=? AND mode=?").get(docArchive[1],s.mode);if(!record)return json(res,404,{error:"Document not found."});db.prepare("UPDATE documents SET status='Archived' WHERE id=?").run(record.id);audit(s,"Document archived","document",record.id);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/company-settings"){if(!requireWrite(s,res))return;const input=await body(req);try{required(input,["companyName"])}catch(e){return json(res,400,{error:e.message})}db.prepare("UPDATE company_settings SET company_name=?,email=?,phone=?,updated_at=? WHERE mode=?").run(clean(input.companyName,200),clean(input.email,200),clean(input.phone,80),now(),s.mode);audit(s,"Company settings updated","settings",s.mode);return json(res,200,{ok:true});}
  if(req.method==="POST"&&url.pathname==="/api/email/test"){
    if(!requireWrite(s,res))return;const input=await body(req),recipient=clean(input.recipient,240);if(!input.confirmed)return json(res,409,{error:"Confirm the deliberately selected test recipient before sending."});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return json(res,400,{error:"Enter a valid test recipient address."});if(!emailDelivery.configured)return json(res,503,{error:"SMTP delivery is awaiting server-side configuration.",missing:emailDelivery.status.missing});
    try{const delivered=await emailDelivery.send({to:recipient,subject:`INFINITE-X OS ${s.mode} meeting notification test`,text:`This is an explicitly requested ${s.mode} Mode test from INFINITE-X OS. Timezone: Africa/Johannesburg.`});db.prepare("INSERT INTO outbox(id,mode,job_id,recipient,subject,body,status,created_at,provider,provider_message_id,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(uid("mail"),s.mode,uid("test-job"),recipient,`INFINITE-X OS ${s.mode} meeting notification test`,`Explicit test send to ${recipient}.`,"Sent",now(),delivered.provider,delivered.response,null);audit(s,"Explicit email test sent","notification","",recipient);return json(res,200,{sent:true,provider:delivered.provider});}catch(error){return json(res,502,{error:`SMTP test failed: ${error.message}`});}
  }
  const reportMatch=url.pathname.match(/^\/api\/reports\/(operations|finance|tenders)\.csv$/);
  if(req.method==="GET"&&reportMatch){
    if(reportMatch[1]==="finance"&&!can(s.user,"finance:write"))return json(res,403,{error:"Your role does not permit access to the finance report."});
    const snapshot=stateFor(s),quote=value=>`\"${String(value??"").replaceAll('"','""')}\"`,period=["30","90","year"].includes(url.searchParams.get("period"))?url.searchParams.get("period"):"all",today=new Date();
    const inPeriod=value=>{if(period==="all")return true;if(!value)return false;const date=new Date(value);if(Number.isNaN(date.getTime()))return false;if(period==="year")return date.getFullYear()===today.getFullYear();return date>=new Date(today.getTime()-Number(period)*86400000)};
    let rows;
    if(reportMatch[1]==="finance")rows=[["Invoice","Client","Total","Paid","Balance","Status"],...snapshot.invoices.filter(item=>inPeriod(item.due_date)).map(i=>[i.number,i.client,(i.total_cents/100).toFixed(2),(i.paidCents/100).toFixed(2),(i.balanceCents/100).toFixed(2),i.status])];
    else if(reportMatch[1]==="tenders")rows=[["Reference","Tender","Category","Close date","Readiness %","Submission ready"],...snapshot.tenders.filter(item=>inPeriod(item.published_date||item.last_refreshed)).map(t=>[t.reference,t.title,t.category,t.close_date,t.readiness.score,t.readiness.submissionReady?"Yes":"No"])];
    else rows=[["Project","Client","Owner","Progress %","Status","Due date","Blocker"],...snapshot.projects.filter(item=>inPeriod(item.updated_at)).map(p=>[p.name,p.client,p.owner,p.progress,p.status,p.due_date,p.blocker])];
    const csv=rows.map(row=>row.map(quote).join(",")).join("\r\n");res.writeHead(200,{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename=\"infinite-x-${reportMatch[1]}-${s.mode.toLowerCase()}-${period}.csv\"`,"Cache-Control":"no-store",...securityHeaders});return res.end(csv);
  }
  if(req.method==="POST"&&url.pathname==="/api/tenders/refresh"){
    if(!requireWrite(s,res,"projects"))return;
    const endpoint="https://ocds-api.etenders.gov.za/api/OCDSReleases",today=new Date(),dateTo=today.toISOString().slice(0,10),dateFrom=new Date(today.getTime()-60*86400000).toISOString().slice(0,10),sourceUrl=new URL(endpoint);sourceUrl.searchParams.set("dateFrom",dateFrom);sourceUrl.searchParams.set("dateTo",dateTo);sourceUrl.searchParams.set("PageNumber","1");sourceUrl.searchParams.set("PageSize","100");const connectorId=s.mode==="DEMO"?"ocds":"ocds-real";
    try{
      const response=await fetch(sourceUrl,{headers:{Accept:"application/json","User-Agent":"INFINITE-X-OS/1.0"},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json(),releases=Array.isArray(payload)?payload:(payload.releases||payload.data||[]);let imported=0,updated=0,skipped=0;
      const upsert=db.prepare(`INSERT INTO tenders(id,mode,reference,title,organisation,category,close_date,briefing_date,source_url,status,last_refreshed,description,published_date,source_name,relevance_score,relevance_label,relevance_reason,public_source)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
        ON CONFLICT(mode,reference) DO UPDATE SET title=excluded.title,organisation=excluded.organisation,category=excluded.category,close_date=excluded.close_date,source_url=excluded.source_url,last_refreshed=excluded.last_refreshed,description=excluded.description,published_date=excluded.published_date,source_name=excluded.source_name,relevance_score=excluded.relevance_score,relevance_label=excluded.relevance_label,relevance_reason=excluded.relevance_reason,public_source=1`);
      for(const release of releases){
        const t=release?.tender||{},reference=clean(t.id||release.ocid,100),closeDate=String(t.tenderPeriod?.endDate||"").slice(0,10);if(!reference||!closeDate||closeDate<dateTo){skipped++;continue}
        const title=clean(t.title||"Untitled public tender",300),description=clean(t.description,3000),organisation=clean(t.procuringEntity?.name||release.buyer?.name||"Procuring entity not supplied",200),rawCategory=clean(t.mainProcurementCategory||t.additionalProcurementCategories?.[0]||"All categories",100),category=rawCategory.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,x=>x.toUpperCase()),relevance=tenderRelevance({title,description,category}),officialDocument=(t.documents||[]).find(document=>/^https?:\/\//i.test(document?.url||""))?.url||"https://data.etenders.gov.za/",existing=db.prepare("SELECT id FROM tenders WHERE mode=? AND reference=?").get(s.mode,reference);
        upsert.run(existing?.id||uid("tender"),s.mode,reference,title,organisation,category,closeDate,null,officialDocument,"Discovered",now(),description,String(release.date||"").slice(0,10)||null,"National Treasury eTenders OCDS",relevance.score,relevance.label,relevance.reason);existing?updated++:imported++;
      }
      if(s.mode==="DEMO"&&(imported||updated)){
        const fixtureIds=["tdr17","tdr21","tdr24",...Array.from({length:15},(_,index)=>`tdr${index+34}`)],placeholders=fixtureIds.map(()=>"?").join(",");
        db.prepare(`DELETE FROM tender_requirements WHERE mode='DEMO' AND tender_id IN (${placeholders})`).run(...fixtureIds);
        db.prepare(`DELETE FROM tenders WHERE mode='DEMO' AND id IN (${placeholders})`).run(...fixtureIds);
      }
      db.prepare("UPDATE connector_status SET status=?,last_refresh=?,error=NULL WHERE id=?").run(`Live: ${imported} new, ${updated} updated`,now(),connectorId);audit(s,"Tender connector refreshed","connector",connectorId,`${imported} new; ${updated} updated; ${skipped} closed or invalid`);return json(res,200,{imported,updated,skipped,lastRefresh:now(),sourceWindow:{dateFrom,dateTo}});
    }catch(e){db.prepare("UPDATE connector_status SET status='Error',last_refresh=?,error=? WHERE id=?").run(now(),clean(e.message,300),connectorId);return json(res,502,{error:`Official National Treasury connector failed: ${e.message}`});}
  }
  return json(res,404,{error:"Not found."});
}

async function processNotifications(){
  const stamp=now(),due=db.prepare("SELECT j.*,m.topic,m.agenda,m.starts_at,m.timezone,cs.email recipient FROM notification_jobs j JOIN meetings m ON m.id=j.meeting_id LEFT JOIN company_settings cs ON cs.mode=j.mode WHERE j.status IN ('Pending','Retry') AND COALESCE(j.next_attempt_at,j.scheduled_for)<=? AND j.attempts<j.max_attempts AND m.status='Scheduled'").all(stamp),changed=new Set();
  for(const job of due){
    const subject=job.kind==="agenda"?`Agenda: ${job.topic}`:`Reminder: ${job.topic}`,message=job.kind==="agenda"?`${job.agenda}\n\nScheduled: ${job.starts_at} (${job.timezone})`:`${job.topic} starts at ${job.starts_at} (${job.timezone}).`;
    if(job.mode==="DEMO"||emailDelivery.mode==="preview"){
      db.prepare("INSERT OR IGNORE INTO outbox(id,mode,job_id,recipient,subject,body,status,created_at,provider,provider_message_id,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(uid("mail"),job.mode,job.id,"preview@local",subject,message,"Preview",stamp,"preview",null,null);db.prepare("UPDATE notification_jobs SET status='Previewed',attempts=attempts+1,delivered_at=?,updated_at=?,last_error=NULL WHERE id=?").run(stamp,stamp,job.id);changed.add(job.mode);continue;
    }
    if(!emailDelivery.configured||!job.recipient){db.prepare("INSERT OR IGNORE INTO outbox(id,mode,job_id,recipient,subject,body,status,created_at,provider,provider_message_id,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(uid("mail"),job.mode,job.id,job.recipient||"not configured",subject,message,"Awaiting configuration",stamp,"smtp",null,"SMTP or recipient is not configured.");db.prepare("UPDATE notification_jobs SET status='Awaiting configuration',last_error=?,updated_at=? WHERE id=?").run("SMTP or recipient is not configured.",stamp,job.id);changed.add(job.mode);continue;}
    try{const delivered=await emailDelivery.send({to:job.recipient,subject,text:message});db.prepare("INSERT OR REPLACE INTO outbox(id,mode,job_id,recipient,subject,body,status,created_at,provider,provider_message_id,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(uid("mail"),job.mode,job.id,job.recipient,subject,message,"Sent",stamp,delivered.provider,delivered.response,null);db.prepare("UPDATE notification_jobs SET status='Sent',attempts=attempts+1,delivered_at=?,updated_at=?,last_error=NULL WHERE id=?").run(stamp,stamp,job.id);}
    catch(error){const attempts=Number(job.attempts)+1,failed=attempts>=Number(job.max_attempts||3),next=new Date(Date.now()+[60_000,300_000,900_000][Math.min(attempts-1,2)]).toISOString();db.prepare("UPDATE notification_jobs SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?").run(failed?"Failed":"Retry",attempts,next,error.message,stamp,job.id);}
    changed.add(job.mode);
  }
  if(openEdgeRepository)for(const mode of changed)try{openEdgeRepository.syncMode(mode,{actor:"notification-worker",role:"System",operation:"notification_jobs"})}catch(error){console.error("OpenEdge notification sync failed",error.message)}
}
setInterval(processNotifications,30_000).unref();processNotifications();
async function processProviderDeletions(){const due=db.prepare("SELECT * FROM provider_deletion_jobs WHERE status IN ('Pending','Retry') AND next_attempt_at<=? AND attempts<max_attempts ORDER BY created_at LIMIT 10").all(now());for(const job of due)await attemptProviderDeletion(job)}
setInterval(processProviderDeletions,60_000).unref();setInterval(applyWayneRetention,3_600_000).unref();applyWayneRetention();

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".png":"image/png",".svg":"image/svg+xml",".ico":"image/x-icon"};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://local");if(url.pathname.startsWith("/api/"))return await api(req,res,url);const requestPath=url.pathname==="/"?"index.html":url.pathname.replace(/^\//,"");const full=join(root,normalize(requestPath));if(!full.startsWith(root))return json(res,403,{error:"Forbidden"});let bytes;try{bytes=await readFile(full);}catch{bytes=await readFile(join(root,"index.html"));}res.writeHead(200,{"Content-Type":mime[extname(full)]||"text/html; charset=utf-8","Cache-Control":"no-store",...securityHeaders});res.end(bytes);}catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:e.message});else res.end();}});
const port=Number(process.env.PORT||4319),host=process.env.HOST||"127.0.0.1";server.listen(port,host,()=>console.log(`INFINITE-X OS: http://${host}:${port}`));
