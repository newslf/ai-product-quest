const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const baseUrl = (process.env.QUEST_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

(async () => {
  const output = path.join(__dirname,'qa-artifacts');
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
  const context = await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(baseUrl+'/',{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  assert.equal(await page.locator('.station').count(),6);
  assert.equal(await page.evaluate(()=>window.QUEST_DATA.chapters.flatMap(c=>c.lessons).length),18);
  await page.screenshot({path:path.join(output,'desktop-map.png'),fullPage:true});
  // Reading and validation are different records. A wrong answer must add a review item.
  await page.locator('[data-action="lesson"][data-id="methods"]').click();
  await page.locator('[data-action="mark-read"]').click();
  let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('ai-product-quest-v1')));
  assert(state.read.includes('methods'));
  assert(!state.passed.includes('methods'));
  await page.locator('[data-action="lesson-answer"][data-value="0"]').click();
  await page.locator('[data-action="lesson-answer"][data-value="1"]').click();
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('ai-product-quest-v1')));
  assert(state.passed.includes('methods'));
  assert.equal(state.reviews['lesson:methods'].resolved,false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(),0);
  // Each mission gates completion on evidence, both correct decisions, and a reflection.
  const quests=await page.evaluate(()=>window.QUEST_DATA.quests.map(q=>({id:q.id,diagnosis:q.question.answer,transfer:q.transfer.answer})));
  for(const quest of quests){
    await page.goto(baseUrl+'/#quest/'+quest.id);
    await page.locator('[data-action="quest-next"]').click();
    assert.equal(await page.locator('#evidence-next').isDisabled(),true);
    for(let i=0;i<3;i++)await page.locator('details[data-evidence="'+i+'"] summary').click();
    await page.waitForFunction(()=>!document.getElementById('evidence-next').disabled);
    await page.locator('#evidence-next').click();
    const wrong=(quest.diagnosis+1)%4;
    await page.locator('[data-action="quest-answer"][data-value="'+wrong+'"]').click();
    assert.equal(await page.locator('[data-action="quest-next"]').count(),0);
    await page.locator('[data-action="quest-answer"][data-value="'+quest.diagnosis+'"]').click();
    await page.locator('[data-action="quest-next"]').click();
    await page.locator('[data-action="quest-next"]').click();
    await page.locator('[data-action="quest-answer"][data-value="'+quest.transfer+'"]').click();
    await page.locator('[data-action="quest-next"]').click();
    assert.equal(await page.locator('#complete-quest').isDisabled(),true);
    await page.locator('#quest-reflection').fill('我会先核实证据与适用范围，让程序执行确定性计算，并由业务确认最终动作。');
    await page.locator('#complete-quest').click();
    assert(await page.getByText('这次判断，有迹可循。').isVisible());
    await page.reload();
    assert(await page.getByText('这次判断，有迹可循。').isVisible());
  }
  // Expected boundary values for the fixed confusion-matrix sample.
  await page.goto(baseUrl+'/#labs');
  await page.locator('#threshold').fill('0.95');
  assert((await page.locator('#matrix-output').innerText()).includes('17%'));
  await page.locator('#threshold').fill('0.05');
  assert((await page.locator('#matrix-output').innerText()).includes('100%'));
  await page.locator('#lab-note').fill('降低阈值提高召回，但合规工单被拦截更多，需要计算人工复核工作量。');
  await page.locator('[data-action="save-lab"]').click();
  await page.locator('[data-action="lab-tab"][data-id="retrieval"]').click();
  assert((await page.locator('.sim-answer').innerText()).includes('旧版'));
  await page.locator('#current-version').check();
  assert(!(await page.locator('#retrieval-output').innerText()).includes('已失效'));
  assert((await page.locator('.sim-answer').innerText()).includes('先补材料'));
  await page.locator('#retrieval-question').selectOption('refund');
  assert((await page.locator('.sim-answer').innerText()).includes('证据不足'));
  await page.screenshot({path:path.join(output,'desktop-lab.png'),fullPage:true});
  // Free text is rendered as text, not HTML; answers and self checks persist.
  await page.goto(baseUrl+'/#interview');
  await page.locator('#interview-answer').fill('我负责用户任务定义与效果验证，先做规则基线。<img src=x onerror="window.injected=1">');
  await page.locator('[data-action="interview-next"]').click();
  await page.locator('[data-action="interview-next"]').click();
  await page.locator('[data-action="interview-next"]').click();
  assert.equal(await page.locator('.followup').count(),3);
  await page.locator('[data-rubric="0"]').check();
  await page.locator('[data-action="interview-save"]').click();
  await page.goto(baseUrl+'/#journal');
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert((await page.locator('main').innerText()).includes('<img src=x'));
  // Wrong-answer review is an independent step; export is usable JSON.
  const review=page.locator('[data-action="review-answer"][data-id="lesson:methods"][data-value="1"]');
  await review.click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ai-product-quest-v1')).reviews['lesson:methods'].resolved),true);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download=await downloadPromise;
  const backupPath=path.join(output,'progress.json');
  await download.saveAs(backupPath);
  const exported=JSON.parse(await fs.readFile(backupPath,'utf8'));
  assert.equal(Object.keys(exported.quests).length,3);
  // Import into a clean context and verify progress and self-written text.
  const restored=await browser.newContext();
  const restoredPage=await restored.newPage();
  await restoredPage.goto(baseUrl+'/#journal');
  await restoredPage.locator('#import-file').setInputFiles(backupPath);
  await restoredPage.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('ai-product-quest-v1')).quests).length===3);
  assert((await restoredPage.locator('main').innerText()).includes('降低阈值提高召回'));
  await restored.close();
  // All routes remain within the phone viewport and the first mission is usable there.
  const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile=await phone.newPage();
  mobile.on('pageerror',error=>errors.push(error.message));
  for(const route of ['map','quests','labs','interview','journal','quest/supply']){
    await mobile.goto(baseUrl+'/#'+route);
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'overflow on '+route);
    if(route==='map')await mobile.screenshot({path:path.join(output,'mobile-map.png'),fullPage:true});
  }
  await phone.close();
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({status:'passed',checks:['18 knowledge nodes','reading vs passing','wrong-answer review','3 missions with gating and reload','threshold boundaries','retrieval version and no-answer','3 interview followups and persistence','text injection escaped','JSON export and fresh-browser import','6 mobile routes without overflow','no browser script errors']},null,2));
  console.log('PASS: learning flows, three missions, two experiments, persistence, export/import, and mobile routes.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
