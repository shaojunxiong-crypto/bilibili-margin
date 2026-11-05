// Delay optional profile data and fresh history to test perceived session loading.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { installMocks } from './mocks.mjs';

const ext=resolve(process.env.SMOKE_EXT||'dist'),out=resolve(process.env.SMOKE_OUT||'tests/artifacts/message-loading');mkdirSync(out,{recursive:true});
const baseline=process.env.LOADING_BASELINE==='1',results={};
const ctx=await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(),'margin-loading-')),{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chromium'}),headless:true,args:['--headless=new','--no-sandbox',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],viewport:{width:1440,height:1000},locale:'zh-CN'});
const page=ctx.pages()[0];let releaseProfiles,holdHistory=false,releaseHistory;
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const json=(route,body)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':route.request().headers().origin||'https://message.bilibili.com','access-control-allow-credentials':'true'},body:JSON.stringify(body)});
try{
  await installMocks(ctx);
  await ctx.route('**/account/v1/user/cards?*',async route=>{
    await new Promise(r=>{releaseProfiles=r;});
    const ids=new URL(route.request().url()).searchParams.get('uids').split(',');
    await json(route,{code:0,data:ids.map(id=>({mid:Number(id),name:`联系人${id}`,face:'https://i0.hdslb.com/test.png'}))}).catch(()=>{});
  });
  await ctx.route('**/fetch_session_msgs?*',async route=>{
    const slow=holdHistory;holdHistory=false;
    if(slow)await new Promise(r=>{releaseHistory=r;});
    const talker=Number(new URL(route.request().url()).searchParams.get('talker_id'));
    await json(route,{code:0,data:{messages:[{sender_uid:talker,msg_type:1,content:JSON.stringify({content:slow?'后台刷新的聊天记录':'已加载的聊天记录'}),timestamp:Math.floor(Date.now()/1000),msg_key:'1',msg_seqno:1}]}}).catch(()=>{});
  });
  const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');await sw.evaluate(()=>chrome.storage.local.set({'margin:settings':{intro:false,theme:'dark',glass:'soft'}}));
  await ctx.addInitScript(()=>sessionStorage.setItem('margin:intro-played','1'));
  const loaded=page.waitForResponse(r=>r.url().includes('/get_sessions'));
  await page.goto('https://message.bilibili.com/#/whisper',{waitUntil:'domcontentloaded'});await loaded;
  const rows=page.locator('#margin-root .wh-s'),input=page.locator('#margin-root .wh-input');
  const start=Date.now();const interactive=await rows.first().waitFor({timeout:1800}).then(()=>true,()=>false);
  results.rowsBeforeOptionalProfiles={interactive,elapsed:Date.now()-start};
  if(!baseline)assert(interactive,'session rows blocked by optional nickname/avatar request');
  if(!interactive){releaseProfiles();await rows.first().waitFor();}
  const first=rows.first();await first.click();await page.locator('#margin-root .wh-log').getByText('已加载的聊天记录',{exact:true}).waitFor();
  await input.fill('保留草稿和焦点');await input.focus();
  await first.evaluate(e=>{window.marginInitialSession=e;});
  if(interactive){releaseProfiles();await first.locator('.wh-sn b').filter({hasText:'联系人'}).waitFor();}
  results.profileHydration={draft:await input.inputValue(),focused:await input.evaluate(e=>e.getRootNode().activeElement===e),sameRow:await first.evaluate(e=>window.marginInitialSession===e)};
  assert.equal(results.profileHydration.draft,'保留草稿和焦点');assert(results.profileHydration.focused&&results.profileHydration.sameRow);
  await rows.nth(1).click();await page.locator('#margin-root .wh-log').getByText('已加载的聊天记录',{exact:true}).waitFor();
  holdHistory=true;await first.click();
  const cached=await page.locator('#margin-root .wh-log').getByText('已加载的聊天记录',{exact:true}).waitFor({timeout:1000}).then(()=>true,()=>false);
  results.cachedHistoryBeforeFreshResponse=cached;
  if(!baseline)assert(cached,'reopening a chat clears its cached history while waiting for refresh');
  releaseHistory();await page.locator('#margin-root .wh-log').getByText('后台刷新的聊天记录',{exact:true}).waitFor();
  results.freshHistoryApplied=true;
  await page.screenshot({path:join(out,'message-loaded.png')});
  await page.goto('https://www.bilibili.com/video/BV1mdxN68E7F/',{waitUntil:'domcontentloaded'});await page.locator('#margin-watch-top .top').waitFor();
  await page.evaluate(()=>{
    const css=document.createElement('style');css.textContent='#margin-bg,#app{display:none!important}html.margin-skin,html.margin-skin body{background:repeating-linear-gradient(90deg,#b0b0b0 0 16px,#d8d8d8 16px 32px)!important;min-height:100vh}';document.head.append(css);
    const probe=document.createElement('div');probe.style.cssText='position:fixed;inset:0;z-index:9999;pointer-events:none;background:repeating-linear-gradient(90deg,#b0b0b0 0 16px,#d8d8d8 16px 32px)';document.body.append(probe);
  });await page.waitForTimeout(500);
  results.header=await page.locator('#margin-watch-top .top').evaluate(e=>({backdrop:getComputedStyle(e).backdropFilter,background:getComputedStyle(e).backgroundImage}));
  await page.screenshot({path:join(out,'header-stripes.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(results));
}finally{
  releaseProfiles?.();releaseHistory?.();writeFileSync(join(out,'results.json'),JSON.stringify({...results,errors},null,2));await ctx.close();
}
