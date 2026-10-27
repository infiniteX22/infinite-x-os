import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const require=createRequire(import.meta.url),{chromium}=require("playwright");
const base=process.env.WAYNE_VERIFY_URL||"http://127.0.0.1:4331/";
const output=resolve("data","verification");
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--autoplay-policy=no-user-gesture-required","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]});
const context=await browser.newContext({viewport:{width:1440,height:900},permissions:["camera","microphone"]});
const page=await context.newPage();
const result={};
try{
  await page.goto(`${base}#meetings`,{waitUntil:"networkidle"});
  await page.locator("#password").fill("Demo!2026");
  await page.locator("#login-form").locator("button[type=submit]").click();
  await page.locator("[data-wayne]").first().click();
  await page.locator("#wayne-room").waitFor({state:"visible"});
  result.desktop=await page.locator("#wayne-room").evaluate((node)=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,viewport:[innerWidth,innerHeight],bodyOverflow:document.body.scrollWidth>innerWidth,controls:[...node.querySelectorAll(".wayne-controls button")].map(x=>x.textContent.trim())}));
  await page.screenshot({path:resolve(output,"wayne-room-desktop.png"),fullPage:false});

  await page.locator("#wayne-camera").click();
  await page.waitForFunction(()=>document.querySelector("#wayne-self-video")?.srcObject?.getVideoTracks?.().some(track=>track.readyState==="live"));
  result.cameraEnabled=await page.locator("#wayne-self-video").evaluate(video=>({localStream:Boolean(video.srcObject),liveTracks:video.srcObject?.getVideoTracks().filter(x=>x.readyState==="live").length||0,muted:video.muted}));

  await page.locator("#wayne-notes").fill("Restart preservation check");
  await page.locator("#wayne-avatar-start").click();
  await page.locator("#wayne-disclosure-review").waitFor({state:"visible"});
  await page.locator("#wayne-disclosure-confirm").check();
  await page.locator("#wayne-disclosure-start").click();
  result.connectingShown=await page.locator("#wayne-avatar-state").textContent();
  await page.waitForFunction(()=>["Session active","Wayne is speaking","Ready to listen","Listening…"].includes(document.querySelector("#wayne-avatar-state")?.textContent||""),null,{timeout:30000});
  await page.waitForFunction(()=>document.querySelector("#wayne-video")?.srcObject?.getVideoTracks?.().some(track=>track.readyState==="live"),null,{timeout:30000});
  result.connected=await page.evaluate(()=>({state:document.querySelector("#wayne-avatar-state")?.textContent,countdown:document.querySelector("#wayne-countdown")?.textContent,timerBasis:document.querySelector("#wayne-timer-basis")?.textContent,wayneVideoTracks:document.querySelector("#wayne-video")?.srcObject?.getVideoTracks().filter(x=>x.readyState==="live").length||0,audioTracks:document.querySelector("#wayne-audio")?.srcObject?.getAudioTracks().filter(x=>x.readyState==="live").length||0}));

  await page.locator("#wayne-avatar-mic").click();
  await page.waitForTimeout(500);
  result.microphone=await page.locator("#wayne-avatar-mic").textContent();
  await page.locator("#wayne-fullscreen").click();
  result.fullscreenEntered=await page.evaluate(()=>Boolean(document.fullscreenElement));
  if(result.fullscreenEntered)await page.locator("#wayne-fullscreen").click();
  await page.locator("#wayne-panel-toggle").click();
  result.panelCollapsed=await page.locator(".wayne-room-body").evaluate(node=>node.classList.contains("panel-collapsed"));
  await page.locator("#wayne-panel-toggle").click();

  if(process.env.WAYNE_VERIFY_QUICK==="1"){
    result.microphoneState=await page.locator("#wayne-avatar-state").textContent();
    await page.locator("#wayne-avatar-end").click();
    await page.waitForFunction(()=>document.querySelector("#wayne-avatar-state")?.textContent==="Session ended");
    result.quickCleanup=await page.evaluate(()=>({state:document.querySelector("#wayne-avatar-state")?.textContent,selfStream:Boolean(document.querySelector("#wayne-self-video")?.srcObject),wayneTracks:document.querySelector("#wayne-video")?.srcObject?.getTracks?.().filter(x=>x.readyState==="live").length||0}));
    console.log(JSON.stringify(result,null,2));
    await browser.close();
    process.exit(0);
  }

  process.stdout.write("Waiting for the real sandbox expiry...\n");
  await page.waitForFunction(()=>document.querySelector("#wayne-avatar-state")?.textContent==="Session ended",null,{timeout:75000});
  result.expiry=await page.evaluate(()=>({state:document.querySelector("#wayne-avatar-state")?.textContent,countdown:document.querySelector("#wayne-countdown")?.textContent,selfStream:Boolean(document.querySelector("#wayne-self-video")?.srcObject),wayneLiveTracks:document.querySelector("#wayne-video")?.srcObject?.getTracks?.().filter(x=>x.readyState==="live").length||0}));

  if(process.env.WAYNE_VERIFY_EXPIRY_ONLY==="1"){
    console.log(JSON.stringify(result,null,2));
    await browser.close();
    process.exit(0);
  }

  await page.locator("#wayne-restart").click();
  result.restartDisabledWhileConnecting=await page.locator("#wayne-restart").isDisabled();
  await page.waitForFunction(()=>["Session active","Wayne is speaking","Ready to listen","Listening…"].includes(document.querySelector("#wayne-avatar-state")?.textContent||""),null,{timeout:30000});
  result.restart=await page.evaluate(()=>({state:document.querySelector("#wayne-avatar-state")?.textContent,countdown:document.querySelector("#wayne-countdown")?.textContent,notes:document.querySelector("#wayne-notes")?.value,cameraRestored:Boolean(document.querySelector("#wayne-self-video")?.srcObject)}));
  await page.screenshot({path:resolve(output,"wayne-room-connected.png"),fullPage:false});
  await page.locator("#wayne-avatar-end").click();
  await page.waitForFunction(()=>document.querySelector("#wayne-avatar-state")?.textContent==="Session ended");
  result.endMeeting=await page.evaluate(()=>({state:document.querySelector("#wayne-avatar-state")?.textContent,selfStream:Boolean(document.querySelector("#wayne-self-video")?.srcObject),endDisabled:document.querySelector("#wayne-avatar-end")?.disabled}));

  await page.setViewportSize({width:390,height:844});
  result.mobile=await page.locator("#wayne-room").evaluate(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,viewport:[innerWidth,innerHeight],overflow:document.body.scrollWidth>innerWidth,controlsVisible:[...node.querySelectorAll(".wayne-controls button")].every(x=>x.getBoundingClientRect().height>0)}));
  await page.screenshot({path:resolve(output,"wayne-room-mobile.png"),fullPage:false});
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
