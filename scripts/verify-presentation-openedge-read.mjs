import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root=dirname(dirname(fileURLToPath(import.meta.url))),work=mkdtempSync(join(tmpdir(),"infinite-x-openedge-read-")),output=join(work,"demo-export.json"),token=readFileSync(join(root,"data","openedge","service-token.txt"),"utf8").trim();
try{
  const result=spawnSync("C:\\Progress\\OpenEdge\\bin\\_progres.exe",["-b","-db",join(root,"data","openedge","ixosoe"),"-p","export-repository.r","-param",`DEMO|${output}|${token}`,"-nosplash"],{cwd:join(root,"openedge"),encoding:"utf8",timeout:120000,env:{...process.env,DLC:"C:\\Progress\\OpenEdge",PATH:`C:\\Progress\\OpenEdge\\bin;${process.env.PATH||""}`}});
  const evidence=String(result.stdout||result.stderr||"").trim();
  if(result.status!==0||!evidence.includes("OPENEDGE_EXPORT_OK="))throw new Error(evidence||`OpenEdge export failed with ${result.status}.`);
  const snapshot=JSON.parse(readFileSync(output,"utf8")),rows=snapshot.records.map(record=>({entity:record.entity,id:record.id,row:JSON.parse(Buffer.from(record.payload,"base64").toString("utf8"))})),byEntity=entity=>rows.filter(item=>item.entity===entity).map(item=>item.row),updates=byEntity("task_updates").sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),tasks=new Map(byEntity("tasks").map(item=>[item.id,item])),projects=new Map(byEntity("projects").map(item=>[item.id,item])),users=new Map(byEntity("users").map(item=>[item.id,item]));
  const update=updates[0];if(!update)throw new Error("OpenEdge DEMO export contains no task update.");const task=tasks.get(update.task_id),project=projects.get(task?.project_id),author=users.get(update.author_id);
  console.log(JSON.stringify({independentRead:"OpenEdge ABL export-repository.r",evidence,revision:snapshot.revision,entity:"task_updates",recordId:update.id,task:task?.title||null,project:project?.name||null,author:author?.name||null,status:update.status,createdAt:update.created_at,evidenceReference:update.evidence||null,mode:update.mode,totalOpenEdgeRecords:snapshot.records.length},null,2));
}finally{rmSync(work,{recursive:true,force:true})}
