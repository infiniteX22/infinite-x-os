import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const AVM = "C:\\Progress\\OpenEdge\\bin\\_progres.exe";
const TABLES = [
  "clients","projects","users","tasks","task_updates","milestones","tenders","tender_requirements",
  "quotations","invoices","payments","expenses","funding","funding_documents","compliance_items","documents",
  "meetings","meeting_actions","notification_jobs","outbox","wayne_messages","wayne_meetings","wayne_transcript_events","wayne_session_summaries","wayne_privacy_settings","provider_deletion_jobs","avatar_sessions","audit_log","connector_status","company_settings"
];
const MODE_TABLES = new Set(TABLES.filter(name => name !== "users"));
const DELETE_ORDER = [
  "outbox","notification_jobs","meeting_actions","wayne_transcript_events","wayne_session_summaries","provider_deletion_jobs","avatar_sessions","wayne_meetings","wayne_messages","task_updates","tasks","milestones",
  "tender_requirements","funding_documents","payments","quotations","expenses","compliance_items","documents",
  "meetings","funding","invoices","tenders","projects","clients","connector_status","wayne_privacy_settings","company_settings","audit_log"
];
const INSERT_ORDER = [
  "users","clients","projects","milestones","tasks","task_updates","tenders","tender_requirements","quotations",
  "invoices","payments","expenses","funding","funding_documents","compliance_items","documents","meetings",
  "meeting_actions","notification_jobs","outbox","wayne_messages","wayne_meetings","avatar_sessions","wayne_transcript_events","wayne_session_summaries","wayne_privacy_settings","provider_deletion_jobs","connector_status","company_settings","audit_log"
];
const RELATIONS = {
  projects:["owner_id"], tasks:["project_id","assignee_id"], task_updates:["task_id","author_id"], milestones:["project_id","owner_id"],
  tender_requirements:["tender_id"], quotations:["client_id","project_id"], invoices:["project_id"], payments:["invoice_id"],
  expenses:["project_id"], funding:["project_id","invoice_id"], funding_documents:["funding_id"], compliance_items:["related_id","owner_id"],
  documents:["related_id","uploaded_by"], meetings:["created_by"], meeting_actions:["meeting_id","owner_id"],
  notification_jobs:["meeting_id"], outbox:["job_id"], wayne_messages:["user_id"], wayne_meetings:["owner_id","follow_up_of"], wayne_transcript_events:["meeting_id","avatar_session_id"], wayne_session_summaries:["meeting_id","avatar_session_id"], provider_deletion_jobs:["user_id","provider_session_id"], avatar_sessions:["user_id","meeting_id"], audit_log:["record_id","user_id"]
};

const quoteIdentifier = value => `"${String(value).replaceAll('"','""')}"`;
const revision = () => `${Date.now()}-${randomBytes(5).toString("hex")}`;

function runAvm(root, program, parameter, timeout = 120000) {
  const result = spawnSync(AVM,["-b","-db",join(root,"data","openedge","ixosoe"),"-p",program,"-param",parameter,"-nosplash"],{
    cwd:join(root,"openedge"),encoding:"utf8",timeout,env:{...process.env,DLC:"C:\\Progress\\OpenEdge",PATH:`C:\\Progress\\OpenEdge\\bin;${process.env.PATH||""}`}
  });
  const output = String(result.stdout||result.stderr||"").trim();
  if(result.status!==0 || /_ERROR=|\*\*\s|failed to load|Cannot reference class/i.test(output)) throw new Error(output||`OpenEdge ${program} failed with exit code ${result.status}.`);
  return output;
}

function ensureDocumentFiles(db,root,mode) {
  const folder=join(root,"data","documents",mode.toLowerCase());
  mkdirSync(folder,{recursive:true});
  for(const row of db.prepare("SELECT id,revision,content_base64,storage_path FROM documents WHERE mode=?").all(mode)){
    if(row.storage_path && existsSync(join(root,row.storage_path))) continue;
    const relative=join("data","documents",mode.toLowerCase(),`${row.id}-r${row.revision}.bin`);
    writeFileSync(join(root,relative),Buffer.from(row.content_base64||"","base64"));
    db.prepare("UPDATE documents SET storage_path=? WHERE id=? AND mode=?").run(relative,row.id,mode);
  }
}

function recordsForMode(db,root,mode) {
  ensureDocumentFiles(db,root,mode);
  const records=[];
  for(const entity of TABLES){
    const rows=entity==="users" ? db.prepare("SELECT * FROM users").all() : db.prepare(`SELECT * FROM ${quoteIdentifier(entity)} WHERE mode=?`).all(mode);
    for(const source of rows){
      const row={...source};
      if(entity==="documents") delete row.content_base64;
      const id=String(row.id ?? row.mode ?? "");
      const [first,second]=RELATIONS[entity]||[];
      records.push({entity,id,relationOne:String(first?row[first]||"":""),relationTwo:String(second?row[second]||"":""),payload:Buffer.from(JSON.stringify(row),"utf8").toString("base64")});
    }
  }
  return records;
}

function rowFromRecord(record){
  return JSON.parse(Buffer.from(record.payload,"base64").toString("utf8"));
}

export function createOpenEdgeRepository({db,root,dataDir}){
  const tokenFile=join(dataDir,"openedge","service-token.txt");
  mkdirSync(join(dataDir,"openedge"),{recursive:true});
  if(!existsSync(tokenFile)) writeFileSync(tokenFile,randomBytes(32).toString("hex"),{encoding:"utf8",mode:0o600});
  const serviceToken=readFileSync(tokenFile,"utf8").trim();
  runAvm(root,"set-service-token.r",serviceToken);
  const workDir=join(dataDir,"openedge","exchange");
  mkdirSync(workDir,{recursive:true});
  let lastEvidence="";

  function syncMode(mode,{actor="system",role="System",operation="bootstrap"}={}){
    const file=join(workDir,`sync-${mode.toLowerCase()}-${process.pid}-${Date.now()}.json`);
    const payload={mode,actor,role,operation,revision:revision(),records:recordsForMode(db,root,mode)};
    writeFileSync(file,JSON.stringify(payload),"utf8");
    try{lastEvidence=runAvm(root,"sync-repository.r",file);return {mode,revision:payload.revision,count:payload.records.length,evidence:lastEvidence};}
    finally{try{unlinkSync(file)}catch{}}
  }

  function exportMode(mode){
    const file=join(workDir,`export-${mode.toLowerCase()}-${process.pid}-${Date.now()}.json`);
    try{lastEvidence=runAvm(root,"export-repository.r",`${mode}|${file}|${serviceToken}`);return JSON.parse(readFileSync(file,"utf8"));}
    finally{try{unlinkSync(file)}catch{}}
  }

  function hydrateMode(mode){
    const snapshot=exportMode(mode);
    if(!snapshot.records?.length)return {mode,count:0,revision:snapshot.revision||""};
    const grouped=new Map(TABLES.map(name=>[name,[]]));
    for(const record of snapshot.records||[]) if(grouped.has(record.entity)) grouped.get(record.entity).push(rowFromRecord(record));
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    try{
      for(const table of DELETE_ORDER) db.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE mode=?`).run(mode);
      for(const table of INSERT_ORDER){
        for(const row of grouped.get(table)||[]){
          if(table==="documents"){
            const absolute=row.storage_path?join(root,row.storage_path):"";
            row.content_base64=absolute&&existsSync(absolute)?readFileSync(absolute).toString("base64"):"";
          }
          const columns=Object.keys(row);
          const sql=`INSERT OR REPLACE INTO ${quoteIdentifier(table)}(${columns.map(quoteIdentifier).join(",")}) VALUES (${columns.map(()=>"?").join(",")})`;
          db.prepare(sql).run(...columns.map(column=>row[column]));
        }
      }
      db.exec("COMMIT; PRAGMA foreign_keys=ON");
    }catch(error){db.exec("ROLLBACK; PRAGMA foreign_keys=ON");throw error;}
    return {mode,count:snapshot.records.length,revision:snapshot.revision||""};
  }

  function initialize(){
    const pending=db.prepare("SELECT mode,user_id,provider_session_id FROM avatar_sessions WHERE last_error LIKE 'OPENEDGE_TRANSCRIPT_PENDING:%'").all(),pendingModes=[...new Set(pending.map(row=>row.mode))];
    for(const row of pending)db.prepare("INSERT OR IGNORE INTO provider_deletion_jobs(id,mode,user_id,provider_session_id,status,attempts,max_attempts,next_attempt_at,last_error,created_at,updated_at,deleted_at) VALUES (?,?,?,?, 'Pending',0,3,?,NULL,?,?,NULL)").run(`provider-delete-recovery-${randomBytes(8).toString("hex")}`,row.mode,row.user_id,row.provider_session_id,new Date().toISOString(),new Date().toISOString(),new Date().toISOString());
    for(const mode of pendingModes){syncMode(mode,{actor:"recovery",role:"System",operation:"wayne_transcript_events"});db.prepare("UPDATE avatar_sessions SET last_error='Recovered to OpenEdge before provider deletion retry' WHERE mode=? AND last_error LIKE 'OPENEDGE_TRANSCRIPT_PENDING:%'").run(mode);}
    const demo=exportMode("DEMO"),real=exportMode("REAL");
    if(!(demo.records?.length||real.records?.length)){
      return {migrated:true,demo:syncMode("DEMO"),real:syncMode("REAL")};
    }
    return {migrated:false,demo:hydrateMode("DEMO"),real:hydrateMode("REAL")};
  }

  return {initialize,syncMode,hydrateMode,exportMode,status:()=>({active:true,kind:"OpenEdge authoritative repository with SQLite compatibility cache",evidence:lastEvidence,database:join(root,"data","openedge","ixosoe.db")})};
}
