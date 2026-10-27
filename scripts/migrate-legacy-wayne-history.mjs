import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenEdgeRepository } from "../openedge-repository.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=resolve(process.argv[2]||"");
const target=resolve(root,"data","infinite-x-clone.sqlite");
if(!process.argv[2]||!existsSync(source))throw new Error("Usage: node scripts/migrate-legacy-wayne-history.mjs <legacy-sqlite-file>");
if(source===target)throw new Error("The legacy source must be a separate recovery copy.");

const legacy=new DatabaseSync(source,{readOnly:true});
const db=new DatabaseSync(target);
const sourceTable=legacy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='avatar_sessions'").get();
if(!sourceTable)throw new Error("The recovery copy has no avatar_sessions table.");
const rows=legacy.prepare("SELECT id,mode,user_id,provider_session_id,status,business_context,briefing,transcript,started_at,expires_at,ended_at,last_error FROM avatar_sessions ORDER BY started_at").all();

db.exec("BEGIN IMMEDIATE");
let imported=0;
try{
  const insert=db.prepare("INSERT OR IGNORE INTO avatar_sessions(id,mode,user_id,provider_session_id,status,business_context,briefing,transcript,started_at,expires_at,ended_at,last_error,meeting_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)");
  for(const row of rows){
    const status=row.status==="Active"?"Closed":row.status;
    const endedAt=row.ended_at||(row.status==="Active"?row.expires_at:null);
    imported+=Number(insert.run(row.id,row.mode,row.user_id,row.provider_session_id,status,row.business_context,row.briefing,row.transcript,row.started_at,row.expires_at,endedAt,row.last_error).changes||0);
  }
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error}
legacy.close();

const repository=createOpenEdgeRepository({db,root,dataDir:resolve(root,"data")});
const results=[];
for(const mode of ["DEMO","REAL"])results.push(repository.syncMode(mode,{actor:"system",role:"System",operation:"avatar_sessions"}));
db.close();
console.log(JSON.stringify({sourceRows:rows.length,imported,openEdge:results.map(({mode,count,revision})=>({mode,count,revision}))},null,2));
