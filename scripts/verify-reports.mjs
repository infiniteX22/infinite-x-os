import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const require=createRequire(import.meta.url),{chromium}=require("playwright"),base=process.env.IX_BASE_URL||"http://127.0.0.1:4319";
const login=async(userId="director")=>{const response=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,password:"Demo!2026"})});if(!response.ok)throw new Error(`Login failed with ${response.status}`);return response.json()};
const director=await login(),stateResponse=await fetch(`${base}/api/state`,{headers:{Authorization:`Bearer ${director.token}`}}),data=await stateResponse.json();
const expected={projects:data.projects.map(item=>({name:item.name,progress:Number(item.progress)})),tenderStatuses:Object.fromEntries([...data.tenders.reduce((groups,item)=>groups.set(item.status||"Unspecified",(groups.get(item.status||"Unspecified")||0)+1),new Map())]),finance:{invoiced:data.invoices.reduce((sum,item)=>sum+Number(item.total_cents||0),0),receipts:data.payments.filter(item=>item.status==="Recorded").reduce((sum,item)=>sum+Number(item.amount_cents||0),0),expenses:data.expenses.reduce((sum,item)=>sum+Number(item.amount_cents||0),0)}};

const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true});
try{
  const evidenceDir=resolve("data","verification");await mkdir(evidenceDir,{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(`${base}/#reports`,{waitUntil:"networkidle"});
  await page.locator("#password").fill("Demo!2026");
  await page.locator("#login-form button[type=submit]").click();
  await page.waitForSelector(".report-charts");
  const renderedProjects=await page.locator(".project-bar").evaluateAll(elements=>elements.map(element=>({name:element.querySelector("span")?.textContent?.trim(),progress:Number(element.querySelector("b")?.textContent?.replace("%","").trim())})));
  const renderedTenderLabel=await page.locator(".donut").getAttribute("aria-label");
  const renderedFinance=await page.locator(".finance-bar").evaluateAll(elements=>elements.map(element=>({label:element.querySelector("b")?.textContent?.trim(),value:Number(element.dataset.cents)})));
  await page.screenshot({path:resolve(evidenceDir,"submission-reports-desktop.png"),fullPage:true});
  for(const project of expected.projects){const rendered=renderedProjects.find(item=>item.name===project.name);if(!rendered||rendered.progress!==project.progress)throw new Error(`Project chart mismatch for ${project.name}.`)}
  for(const [status,count] of Object.entries(expected.tenderStatuses))if(!renderedTenderLabel?.includes(`${status}: ${count}`))throw new Error(`Tender chart mismatch for ${status}.`);
  const financeDigits=Object.fromEntries(renderedFinance.map(item=>[item.label,item.value]));
  if(financeDigits["Total invoiced"]!==expected.finance.invoiced||financeDigits["Recorded receipts"]!==expected.finance.receipts||financeDigits["Recorded expenses"]!==expected.finance.expenses)throw new Error("Finance chart totals do not match the active-mode records.");
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(evidenceDir,"submission-reports-mobile.png"),fullPage:true});
  await page.screenshot({path:resolve(evidenceDir,"submission-reports-mobile-viewport.png"),fullPage:false});
  const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,charts:[...document.querySelectorAll(".report-chart")].every(element=>element.getBoundingClientRect().width<=document.documentElement.clientWidth),navigationOpen:document.body.classList.contains("nav-open"),sidebarTransform:getComputedStyle(document.querySelector(".sidebar")).transform}));
  if(mobile.overflow||!mobile.charts||mobile.navigationOpen)throw new Error("Reports mobile layout is obstructed or overflows the viewport.");
  const employee=await login("sc"),restricted=await fetch(`${base}/api/reports/finance.csv`,{headers:{Authorization:`Bearer ${employee.token}`}});
  if(restricted.status!==403)throw new Error("Finance CSV was not permission-restricted.");
  console.log(JSON.stringify({desktopViewport:"1440x900",mobileViewport:"390x844",projectBars:renderedProjects.length,tenderStatuses:expected.tenderStatuses,financeCents:expected.finance,mobile,employeeFinanceExportBlocked:restricted.status===403},null,2));
}finally{await browser.close()}
