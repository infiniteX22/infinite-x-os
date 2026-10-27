import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const require=createRequire(import.meta.url),{chromium}=require("playwright");
const output=resolve("data","verification");
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
try{
  await page.goto("http://127.0.0.1:4319/#dashboard",{waitUntil:"networkidle"});
  if(await page.locator("#login-form").count()){
    await page.locator("#password").fill("Demo!2026");
    await page.locator("#login-form button[type=submit]").click();
    await page.locator(".dashboard").waitFor();
  }
  const results=[];
  for(const [width,height] of [[1920,1080],[1440,900],[1024,850],[390,844]]){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(150);
    results.push(await page.evaluate(()=>{
      const size=selector=>getComputedStyle(document.querySelector(selector)).fontSize;
      const kpis=[...document.querySelectorAll(".kpi")];
      return{
        viewport:[innerWidth,innerHeight],
        overflow:document.documentElement.scrollWidth>innerWidth,
        heading:size(".heading h1"),
        body:size(".heading p"),
        kpiLabel:size(".kpi span"),
        kpiValue:size(".kpi strong"),
        kpiSupport:size(".kpi small"),
        tableText:size(".table .tr:not(.th) span"),
        kpiColumns:new Set(kpis.map(x=>Math.round(x.getBoundingClientRect().top))).size?Math.max(...[...new Set(kpis.map(x=>Math.round(x.getBoundingClientRect().top)))].map(top=>kpis.filter(x=>Math.round(x.getBoundingClientRect().top)===top).length)):0
      };
    }));
    if(width===1920)await page.screenshot({path:resolve(output,"dashboard-readable-1920.png"),fullPage:true});
  }
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
