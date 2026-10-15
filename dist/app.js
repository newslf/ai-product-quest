(() => {
  'use strict';
  const D = window.QUEST_DATA;
  const KEY = 'ai-product-quest-v1';
  const main = document.getElementById('main');
  const dialog = document.getElementById('lesson-dialog');
  const chapters = D.chapters;
  const lessons = chapters.flatMap(c => c.lessons);
  const lessonById = id => lessons.find(l => l.id === id);
  const questById = id => D.quests.find(q => q.id === id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const defaultState = () => ({version:1,read:[],passed:[],quests:{},runs:{},reviews:{},notes:{},interviews:{},labs:{threshold:.5,chunk:'clause',topk:1,current:false,question:'photo'},labNotes:{},selectedChapter:'foundations'});
  let persistent = true;
  let state = defaultState();
  let currentLesson = null;
  let selectedLab = 'threshold';
  let interviewId = 'iv-product';
  let interviewStep = 0;
  let toastTimer;

  function clean(raw) {
    const out = defaultState();
    if (!raw || raw.version !== 1) throw new Error('请选择本应用导出的 v1 学习记录。');
    out.read = Array.isArray(raw.read) ? [...new Set(raw.read.filter(x => lessonById(x)))] : [];
    out.passed = Array.isArray(raw.passed) ? [...new Set(raw.passed.filter(x => lessonById(x)))] : [];
    if (chapters.some(c => c.id === raw.selectedChapter)) out.selectedChapter = raw.selectedChapter;
    for (const q of D.quests) {
      const completed = raw.quests?.[q.id];
      if (completed && typeof completed.reflection === 'string' && completed.reflection.trim().length >= 10) out.quests[q.id] = {reflection:completed.reflection.slice(0,2000),completedAt:typeof completed.completedAt === 'string' ? completed.completedAt.slice(0,40) : ''};
      const run = raw.runs?.[q.id];
      if (run && typeof run === 'object') {
        const answers = {};
        for (const key of ['diagnosis','transfer']) if (Number.isInteger(run.answers?.[key]) && run.answers[key] >= 0 && run.answers[key] < 4) answers[key] = run.answers[key];
        let step = Number.isInteger(run.step) ? Math.max(0,Math.min(out.quests[q.id] ? 6 : 5,run.step)) : 0;
        if (step > 2 && answers.diagnosis !== q.question.answer) step = 2;
        if (step > 4 && answers.transfer !== q.transfer.answer) step = 4;
        out.runs[q.id] = {step,answers,opened:Array.isArray(run.opened) ? [...new Set(run.opened.filter(x => Number.isInteger(x) && x >= 0 && x < q.evidence.length))] : [],reflection:typeof run.reflection === 'string' ? run.reflection.slice(0,2000) : ''};
      }
    }
    const validReviews = lessons.map(l => 'lesson:'+l.id).concat(D.quests.flatMap(q => ['quest:'+q.id+':diagnosis','quest:'+q.id+':transfer']));
    for (const key of validReviews) if (raw.reviews?.[key]) out.reviews[key] = {resolved:raw.reviews[key].resolved === true};
    for (const l of lessons) if (typeof raw.notes?.[l.id] === 'string') out.notes[l.id] = raw.notes[l.id].slice(0,2000);
    for (const iv of D.interview) {
      const entry = raw.interviews?.[iv.id];
      if (entry && typeof entry.answer === 'string') out.interviews[iv.id] = {answer:entry.answer.slice(0,5000),checks:Array.isArray(entry.checks) ? entry.checks.filter(x => Number.isInteger(x) && x >= 0 && x < iv.rubric.length) : [],saved:entry.saved === true};
    }
    if (typeof raw.labs?.threshold === 'number') out.labs.threshold = Math.max(.05,Math.min(.95,raw.labs.threshold));
    if (raw.labs?.chunk === 'whole') out.labs.chunk = 'whole';
    if (Number.isInteger(raw.labs?.topk)) out.labs.topk = Math.max(1,Math.min(3,raw.labs.topk));
    out.labs.current = raw.labs?.current === true;
    if (raw.labs?.question === 'refund') out.labs.question = 'refund';
    for (const id of ['threshold','retrieval']) if (typeof raw.labNotes?.[id] === 'string') out.labNotes[id] = raw.labNotes[id].slice(0,2000);
    return out;
  }
  try { const stored = localStorage.getItem(KEY); if (stored) state = clean(JSON.parse(stored)); } catch (error) { if (error.name === 'SecurityError') persistent = false; else console.warn('学习记录未能恢复，已使用空白记录。',error.message); }
  function save() { try { localStorage.setItem(KEY,JSON.stringify(state)); } catch { persistent = false; document.getElementById('storage-note').textContent = '当前浏览器不能保存，请导出备份'; } }
  function toast(message) { const el = document.getElementById('toast');el.textContent = message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer = setTimeout(() => el.classList.remove('visible'),2900); }
  function go(route) { if (location.hash.slice(1) === route) render(); else location.hash = route; }
  function sourceHTML(keys) { return '<div class="source-links"><strong>继续深挖 · 官方学习资料</strong>'+[...new Set(keys)].map(k => D.sources[k] ? `<a href="${D.sources[k].url}" target="_blank" rel="noopener noreferrer">${esc(D.sources[k].title)} ↗</a>` : '').join('')+'</div>'; }
  function intro(kicker,title,description) { return `<div class="page-intro"><div><div class="eyebrow">${esc(kicker)}</div><h1>${title}</h1><p>${esc(description)}</p></div></div>`; }
  function getRun(id) { if (!state.runs[id]) state.runs[id] = {step:0,opened:[],answers:{},reflection:''};return state.runs[id]; }
  function nextQuest() { return D.quests.find(q => !state.quests[q.id]) || D.quests[0]; }
  function progressText(chapter) { const passed = chapter.lessons.filter(l => state.passed.includes(l.id)).length;const read = chapter.lessons.filter(l => state.read.includes(l.id)).length;return passed ? `${passed}/3 项练习通过` : read ? `${read}/3 节已阅读` : '3 节知识 · 自由探索'; }
  function caseRow(q) { return `<div class="case-row"><span class="case-index">${q.number}</span><div class="case-row-copy"><h3>${esc(q.title)}</h3><p>${esc(q.role)} · ${state.quests[q.id] ? '已完成，随时再练' : esc(q.short)}</p></div><div class="case-meta"><span class="duration">${q.minutes} 分钟</span><span class="pill ${state.quests[q.id] ? '' : 'outline'}">${state.quests[q.id] ? '已完成' : '进入情境'}</span><a class="arrow-link" href="#quest/${q.id}" aria-label="开始${esc(q.title)}">↗</a></div></div>`; }
  function renderMap() {
    const next = nextQuest();
    main.innerHTML = `<div class="hero entry-motion"><div class="hero-copy"><div class="eyebrow">YOUR NEXT CHAPTER</div><h1>把经验，变成<br><span>AI 产品力。</span></h1><p>从熟悉的业务出发，在实验里理解原理，<br>在每一次追问里，让判断更扎实。</p><div class="button-row"><a class="button" href="#quest/${next.id}">${state.quests[next.id] ? '再探索一次' : getRun(next.id).step > 0 ? '继续这次挑战' : '开始今日挑战'} <span>→</span></a><a class="text-button" href="#labs">先去实验室 ↗</a></div><div class="hero-stats"><div class="hero-stat"><strong>${state.passed.length}<small> / 18</small></strong>练习通过</div><div class="hero-stat"><strong>${Object.keys(state.quests).length}<small> / 3</small></strong>业务关卡</div><div class="hero-stat"><strong>${Object.keys(state.labNotes).filter(k => state.labNotes[k].trim().length >= 10).length}<small> / 2</small></strong>实验记录</div></div></div><div class="daily-card"><div class="eyebrow">TODAY'S EXPEDITION</div><div class="daily-meta">任务 ${next.number} / 约 ${next.minutes} 分钟</div><h2>${esc(next.title)}</h2><p>${esc(next.task)}</p><a class="button" href="#quest/${next.id}">打开任务信封 <span>↗</span></a></div></div><div class="section-heading"><h2>你的成长地图</h2><span class="small-text">六个营地 · 18 个知识节点</span></div><section class="journey" aria-label="六章知识地图"><div class="journey-head"><span>THE LEARNING TRAIL</span><span>由浅入深，也可以自由探索</span></div><div class="trail"><svg class="trail-bg" viewBox="0 0 1000 310" preserveAspectRatio="none" aria-hidden="true"><path d="M95 205 C170 205 180 105 270 105 S370 205 440 205 S555 105 620 105 S700 205 780 205 S865 100 930 100" fill="none" stroke="#adbc97" stroke-width="1.5" stroke-dasharray="4 6"/><path d="M370 50l24-25 25 25m-39-10 14 9 15-9M670 270l22-27 24 27m-34-15 11 8 11-8" fill="none" stroke="#c9d2b9" stroke-width="1.3"/><path d="M73 95v25m-11-9 11-18 11 18m737 162v24m-10-10 10-19 10 19" stroke="#c4cfb1" fill="none" stroke-width="1.5"/><text x="475" y="280" fill="#829371" font-size="10" letter-spacing="4">EXPLORE · EXPERIMENT · EXPLAIN</text></svg>${chapters.map((c,i) => `<button type="button" class="station ${c.id === state.selectedChapter ? 'is-next' : c.lessons.every(l => state.passed.includes(l.id)) ? 'is-done' : ''}" data-action="chapter" data-id="${c.id}" aria-pressed="${c.id === state.selectedChapter}"><span class="station-marker">${c.icon}</span><span class="station-title">${esc(c.name)}</span><span class="station-note">${esc(progressText(c))}</span></button>`).join('')}</div><div class="journey-foot"><div class="legend"><span><i class="next"></i>当前营地</span><span><i class="done"></i>节点练习通过</span><span><i></i>等待探索</span></div><span>已阅读与练习通过分别记录</span></div></section><section id="chapter-panel"></section><div class="section-heading"><h2>把知识，带进真实情境</h2><a href="#quests" class="text-button">查看全部关卡 ↗</a></div><div class="case-list">${D.quests.map(caseRow).join('')}</div><div class="note-strip"><span aria-hidden="true">✳</span><p>你已有的 PRD、评审与知识沉淀 SKILL 是实践基础。这里继续练习方法选择、运行边界与效果验证。所有案例均为合成情境。</p></div>`;
    renderChapter();
  }
  function renderChapter() {
    const c = chapters.find(c => c.id === state.selectedChapter) || chapters[0];
    const target = document.getElementById('chapter-panel');
    if (target) target.innerHTML = `<div class="chapter-panel"><div class="eyebrow">CAMP ${c.icon}</div><h2>${esc(c.name)} <span class="small-text">／ ${esc(c.subtitle)}</span></h2><div class="lesson-list">${c.lessons.map((l,i) => `<button class="lesson-tile" data-action="lesson" data-id="${l.id}"><span class="lesson-no">${c.icon}.${i+1} <span style="float:right">↗</span></span><strong>${esc(l.title)}</strong><span>${state.passed.includes(l.id) ? '✓ 已通过节点练习' : state.read.includes(l.id) ? '已阅读 · 待验证' : '直觉 → 原理 → 练习'}</span></button>`).join('')}</div></div>`;
  }
  function showLesson(id) {
    const lesson = lessonById(id);if (!lesson) return;
    currentLesson = id;
    const chapter = chapters.find(c => c.lessons.some(l => l.id === id));
    document.getElementById('lesson-body').innerHTML = `<div class="dialog-inner"><div class="dialog-top"><span class="eyebrow">${esc(chapter.name)} / KNOWLEDGE NOTE</span><button class="close-button" data-action="close-dialog" aria-label="关闭知识卡">×</button></div><h2 id="lesson-title">${esc(lesson.title)}</h2><article class="lesson-article"><h3>先建立直觉</h3><p>${esc(lesson.intuition)}</p><h3>再看原理</h3><p>${esc(lesson.mechanism)}</p>${lesson.formula ? `<div class="formula">${esc(lesson.formula)}</div>` : ''}<h3>动手验证</h3><p>${esc(lesson.practice)}</p><div class="feedback warning"><strong>常见误区</strong><p>${esc(lesson.mistake)}</p></div></article><section class="dialog-quiz"><h3>验证一下：${esc(lesson.check.q)}</h3><div class="options">${lesson.check.options.map((o,i) => `<button class="option" data-action="lesson-answer" data-id="${id}" data-value="${i}"><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join('')}</div><div id="lesson-feedback" aria-live="polite"></div></section><label class="field-label" for="lesson-note">用自己的话记一句（自动保存）</label><textarea id="lesson-note" maxlength="2000" data-note="${id}" placeholder="这个概念在我的工作中，可以怎样验证？">${esc(state.notes[id] || '')}</textarea>${sourceHTML([chapter.source])}<div class="dialog-actions"><span class="small-text">单题通过记录一次练习，能力仍需迁移验证。</span><button class="button small secondary" data-action="mark-read" data-id="${id}">${state.read.includes(id) ? '已记录阅读 ✓' : '记录已阅读'}</button></div></div>`;
    if (!dialog.open) dialog.showModal();
  }
  function renderQuests() {
    main.innerHTML = intro('FIELD MISSIONS','不是背题，是接手一个任务。','从查证据、做判断到接受追问。每关约 12—15 分钟，过程会自动保存。')+`<div class="chapter-grid">${D.quests.map(q => `<article class="quest-card"><div class="quest-no">MISSION ${q.number} / ${q.minutes} MIN</div><h2>${esc(q.title)}</h2><p>${esc(q.intro)}</p><div class="tags">${q.tags.map(t => `<span class="pill outline">${esc(t)}</span>`).join('')}</div><a class="button ${q.number === '01' ? '' : 'secondary'}" href="#quest/${q.id}">${state.quests[q.id] ? '查看通关记录' : getRun(q.id).step > 0 ? '继续挑战' : '接下这个任务'} <span>↗</span></a></article>`).join('')}</div><div class="note-strip"><span>✳</span><p>关卡是教学练习，不代表真实公司面试题。通关需要完成判断题和个人复盘；开放式复盘保留为待人工评审。</p></div>`;
  }
  const steps = ['接手任务','查看证据','做出判断','理解原理','迁移验证','个人复盘'];
  function optionsHTML(question,questId,kind,selected) {
    return `<div class="options">${question.options.map((o,i) => `<button class="option ${selected === i ? i === question.answer ? 'correct selected' : 'wrong selected' : ''}" data-action="quest-answer" data-id="${questId}" data-kind="${kind}" data-value="${i}"><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join('')}</div>${selected !== undefined ? `<div class="feedback ${selected === question.answer ? '' : 'warning'}" role="status"><strong>${selected === question.answer ? '判断有依据，继续前进。' : '先停下来，检查这个假设。'}</strong><p>${esc(question.feedback[selected])}</p></div>` : ''}`;
  }
  function renderQuest(id) {
    const q = questById(id);if (!q) {go('quests');return;}
    const run = getRun(id);
    const done = state.quests[id];
    if (done && run.step === 6) { renderResult(q);return; }
    let body = '';
    if (run.step === 0) body = `<div class="eyebrow">MISSION ${q.number} · ${esc(q.role)}</div><h2>${esc(q.title)}</h2><p>${esc(q.intro)}</p><div class="feedback"><strong>你的任务</strong><p>${esc(q.task)}</p></div><p class="small-text">合成情境 · 无需专业运维或供应链知识。查证据、修改判断，就是学习过程。</p><button class="button" data-action="quest-next" data-id="${id}">打开案情资料 →</button>`;
    if (run.step === 1) body = `<div class="step-label">STEP 02 / EVIDENCE</div><h2>先打开线索，再形成判断。</h2><p>逐一查看三份资料。留意：哪些是事实，哪些只是表述或假设？</p><div class="evidence-list">${q.evidence.map((e,i) => `<details class="evidence" data-evidence="${i}" data-id="${id}" ${run.opened.includes(i) ? 'open' : ''}><summary>${esc(e.title)}</summary><div class="evidence-body">${esc(e.text)}${e.table ? `<div class="table-wrap"><table class="data-table"><thead><tr>${e.table[0].map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${e.table.slice(1).map(row => `<tr>${row.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}<small>${esc(e.source)}</small></div></details>`).join('')}</div><button class="button" id="evidence-next" data-action="quest-next" data-id="${id}" ${run.opened.length < q.evidence.length ? 'disabled' : ''}>${run.opened.length < q.evidence.length ? `已查看 ${run.opened.length}/3 份线索` : '证据看完了，做出判断 →'}</button>`;
    if (run.step === 2 || run.step === 4) {
      const kind = run.step === 2 ? 'diagnosis' : 'transfer';const question = kind === 'diagnosis' ? q.question : q.transfer;const answer = run.answers[kind];
      body = `<div class="step-label">${kind === 'diagnosis' ? 'STEP 03 / YOUR DECISION' : 'STEP 05 / TRANSFER'}</div><h2 class="question-title">${esc(question.q)}</h2>${optionsHTML(question,id,kind,answer)}<div class="button-row" style="margin-top:22px">${answer === question.answer ? `<button class="button" data-action="quest-next" data-id="${id}">${kind === 'diagnosis' ? '看看背后的原理' : '完成个人复盘'} →</button>` : '<span class="small-text">请选择一个方案；反馈会帮助你重新判断。</span>'}<button class="text-button" data-action="quest-evidence" data-id="${id}">回看证据</button></div>`;
    }
    if (run.step === 3) body = `<div class="step-label">STEP 04 / UNDER THE HOOD</div><h2>${esc(q.principle.title)}</h2><article class="lesson-article">${q.principle.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}</article><div class="button-row"><button class="button" data-action="quest-next" data-id="${id}">换个情境，再验证一次 →</button><button class="text-button" data-action="lesson" data-id="${q.principle.lesson}">打开相关知识卡 ↗</button></div>${sourceHTML(q.sources)}`;
    if (run.step === 5) body = `<div class="step-label">STEP 06 / FIELD NOTE</div><h2>把判断，变成你自己的话。</h2><p>${esc(q.reflection)}</p><label class="field-label" for="quest-reflection">我的判断与依据</label><textarea id="quest-reflection" data-reflection="${id}" maxlength="2000" placeholder="写下你的分工、证据或验证方法。至少 10 个字。">${esc(run.reflection)}</textarea><div class="reflection-count" id="reflection-count">${run.reflection.trim().length} / 至少 10 字</div><button class="button" id="complete-quest" data-action="quest-complete" data-id="${id}" ${run.reflection.trim().length < 10 ? 'disabled' : ''}>保存这次探险 →</button><p class="small-text" style="margin-top:16px">这里保存你的思考，不使用关键词匹配冒充 AI 评分。开放题可以在面试营地继续追问。</p>`;
    main.innerHTML = `<a class="text-button back" href="#quests">← 返回业务关卡</a><div class="quest-layout entry-motion"><section class="quest-main">${body}</section><aside class="quest-aside"><h3>这次探险</h3><ol class="step-list">${steps.map((s,i) => `<li class="${i === run.step ? 'current' : i < run.step ? 'done' : ''}"><i>${i < run.step ? '✓' : i+1}</i>${s}</li>`).join('')}</ol><div class="aside-tip">${esc(q.task)}<br><br>进度自动保存。答错会进入复习清单，也可以继续修改判断。</div></aside></div>`;
    main.querySelectorAll('details[data-evidence]').forEach(el => el.addEventListener('toggle',() => {
      if (!el.open) return;const idx = Number(el.dataset.evidence);if (!run.opened.includes(idx)) {run.opened.push(idx);save();}
      const next = document.getElementById('evidence-next');if (next) {next.disabled = run.opened.length < 3;next.textContent = next.disabled ? `已查看 ${run.opened.length}/3 份线索` : '证据看完了，做出判断 →';}
    }));
  }
  function renderResult(q) {
    main.innerHTML = `<a class="text-button back" href="#quests">← 返回业务关卡</a><div class="quest-layout entry-motion"><section class="quest-main"><div class="eyebrow">MISSION ${q.number} / EXPEDITION COMPLETE</div><div class="result-banner"><div class="result-stamp">✓</div><h2>这次判断，有迹可循。</h2><p>你完成了两道判断练习，并留下了自己的复盘。</p></div><h3>这次练习涉及的能力</h3><p>${esc(q.capability)}</p><h3>你的探险手记</h3><div class="saved-note">${esc(state.quests[q.id].reflection)}</div><p class="small-text">记录表示完成这次练习；开放式复盘尚未由人工或模型评审。</p><div class="button-row"><a class="button" href="#interview">接受面试追问 →</a><button class="button secondary" data-action="quest-restart" data-id="${q.id}">再练一次</button></div>${sourceHTML(q.sources)}</section><aside class="quest-aside"><h3>试着回答这些追问</h3>${q.followups.map(x => `<p class="aside-tip">${esc(x)}</p>`).join('')}<a href="#journal" class="text-button">去手记里回顾 ↗</a></aside></div>`;
  }
  const riskData = [{s:.95,y:1},{s:.90,y:1},{s:.82,y:0},{s:.78,y:1},{s:.72,y:0},{s:.68,y:1},{s:.61,y:0},{s:.58,y:1},{s:.53,y:0},{s:.49,y:0},{s:.45,y:1},{s:.40,y:0},{s:.36,y:0},{s:.30,y:0},{s:.27,y:0},{s:.22,y:0},{s:.18,y:0},{s:.13,y:0},{s:.08,y:0},{s:.03,y:0}];
  function confusion(t) { let tp=0,fp=0,tn=0,fn=0;for (const d of riskData) {if (d.s >= t) d.y ? tp++ : fp++;else d.y ? fn++ : tn++;}return {tp,fp,tn,fn,precision:tp+fp ? tp/(tp+fp) : null,recall:tp/(tp+fn)}; }
  function pct(x) {return x === null ? '—' : (x*100).toFixed(0)+'%';}
  function labNote(id,prompt) {return `<label class="field-label" for="lab-note">${esc(prompt)}</label><textarea id="lab-note" data-lab-note="${id}" maxlength="2000" placeholder="先预测，再调整参数。记录你实际观察到的变化与限制，至少 10 个字。">${esc(state.labNotes[id] || '')}</textarea><div class="button-row" style="margin-top:15px"><button class="button small" data-action="save-lab" data-id="${id}">保存实验记录</button><span class="small-text">参数与文字会自动保存</span></div>`;}
  function renderLabs() {
    main.innerHTML = intro('EXPERIMENT, THEN EXPLAIN','拨动一个参数，观察一个取舍。','使用固定合成样本做可重复实验。先想一想会发生什么，再调整参数验证。')+`<div class="lab-tabs" role="tablist" aria-label="选择实验"><button role="tab" aria-selected="${selectedLab === 'threshold'}" class="lab-tab ${selectedLab === 'threshold' ? 'active' : ''}" data-action="lab-tab" data-id="threshold">01 / 阈值与误判</button><button role="tab" aria-selected="${selectedLab === 'retrieval'}" class="lab-tab ${selectedLab === 'retrieval' ? 'active' : ''}" data-action="lab-tab" data-id="retrieval">02 / 检索与证据</button></div><section id="lab-content"></section>`;
    if (selectedLab === 'threshold') {
      document.getElementById('lab-content').innerHTML = `<div class="lab-layout"><div class="lab-controls"><span class="eyebrow">RISK THRESHOLD</span><h3>哪些工单交给人工复核？</h3><p>20 张合成工单，其中 6 张真实违规。“需拦截”定义为正类。</p><label class="field-label" for="threshold">复核阈值 <output class="range-value" id="threshold-value">${state.labs.threshold.toFixed(2)}</output></label><input type="range" id="threshold" min="0.05" max="0.95" step="0.05" value="${state.labs.threshold}" aria-describedby="threshold-description"><div class="range-caption"><span>更容易触发复核</span><span>更严格触发</span></div><p id="threshold-description" style="margin-top:21px">风险分数 ≥ 阈值则送人工复核。这些分数是演示数据，不代表经校准的违规概率。</p><button class="text-button" data-action="lesson" data-id="metrics">补一张知识卡 ↗</button></div><div class="lab-output" id="matrix-output" aria-live="polite"></div></div>${labNote('threshold','你的观察：漏审减少时，复核工作量怎样变化？')}${sourceHTML(['ml'])}`;
      updateMatrix();document.getElementById('threshold').addEventListener('input',e => {state.labs.threshold = Number(e.target.value);save();document.getElementById('threshold-value').textContent = state.labs.threshold.toFixed(2);updateMatrix();});
    } else {
      document.getElementById('lab-content').innerHTML = `<div class="lab-layout"><div class="lab-controls"><span class="eyebrow">RETRIEVAL SANDBOX</span><h3>有引用，也可能答错。</h3><p>使用固定文档与预设匹配顺序模拟检索，不调用模型或向量数据库。</p><label class="field-label" for="retrieval-question">用户问题</label><select class="select" id="retrieval-question"><option value="photo" ${state.labs.question === 'photo' ? 'selected' : ''}>质保内缺处理照片，能通过吗？</option><option value="refund" ${state.labs.question === 'refund' ? 'selected' : ''}>维修退款标准是什么？</option></select><label class="field-label" for="chunk">证据组织方式</label><select class="select" id="chunk"><option value="clause" ${state.labs.chunk === 'clause' ? 'selected' : ''}>按条款分块</option><option value="whole" ${state.labs.chunk === 'whole' ? 'selected' : ''}>整篇混合（主规则＋例外）</option></select><label class="check-row"><input type="checkbox" id="current-version" ${state.labs.current ? 'checked' : ''}>仅检索当前有效版本</label><label class="field-label" for="topk">返回候选数 <output class="range-value" id="topk-value">${state.labs.topk}</output></label><input type="range" id="topk" min="1" max="3" step="1" value="${state.labs.topk}"><p>试一试：先不筛版本，再开启过滤。提高候选数是否一定能消除冲突？</p></div><div class="lab-output" id="retrieval-output" aria-live="polite"></div></div>${labNote('retrieval','你的观察：正确证据怎样进入答案？还有什么不能由这个模拟证明？')}${sourceHTML(['rag'])}`;
      updateRetrieval();for (const id of ['retrieval-question','chunk','current-version','topk']) document.getElementById(id).addEventListener(id === 'topk' ? 'input' : 'change',e => {if (id === 'retrieval-question') state.labs.question=e.target.value;if (id === 'chunk') state.labs.chunk=e.target.value;if (id === 'current-version') state.labs.current=e.target.checked;if (id === 'topk') state.labs.topk=Number(e.target.value);save();document.getElementById('topk-value').textContent=state.labs.topk;updateRetrieval();});
    }
  }
  function updateMatrix() {
    const c=confusion(state.labs.threshold);const out=document.getElementById('matrix-output');if (!out) return;
    out.innerHTML = `<div class="eyebrow">CONFUSION MATRIX / 20 CASES</div><h3>模型判断与真实标签，对上了吗？</h3><div class="matrix" role="table" aria-label="混淆矩阵"><div></div><div>实际违规</div><div>实际合规</div><div class="matrix-label">送人工复核</div><div class="cell"><span>正确拦截 TP</span><strong>${c.tp}</strong><span>真正需要复核</span></div><div class="cell alert"><span>误拦 FP</span><strong>${c.fp}</strong><span>额外复核负担</span></div><div class="matrix-label">不触发复核</div><div class="cell alert"><span>漏审 FN</span><strong>${c.fn}</strong><span>违规被放过</span></div><div class="cell"><span>正确放过 TN</span><strong>${c.tn}</strong><span>无需人工复核</span></div></div><div class="metrics"><div class="metric">拦截精确率<strong>${pct(c.precision)}</strong>TP / (TP + FP)</div><div class="metric">违规召回率<strong>${pct(c.recall)}</strong>TP / (TP + FN)</div><div class="metric">复核工单数<strong>${c.tp+c.fp}</strong>共 20 张样例</div></div><p class="small-text" style="margin-top:22px;margin-bottom:0">当前会漏过 ${c.fn} 张违规工单，并把 ${c.fp} 张合规工单送去复核。阈值选择需要结合两类错误的代价，不能只追求单项指标。</p>`;
  }
  function updateRetrieval() {
    const el=document.getElementById('retrieval-output');if (!el) return;
    const f=state.labs;let docs=[];
    if (f.question === 'photo') {
      docs=[{title:'审核规范 v1 · 已失效',text:'旧版允许仅提交处理文字，不要求照片。',current:false},{title:'审核规范 v2 · 当前有效',text:f.chunk === 'clause' ? '质保内设备故障工单必须提交处理照片，缺失时补材料。' : '质保内设备故障工单要求照片；另有质保外特定情形可采用替代材料。两个适用范围在同一段。',current:true},{title:'通用说明 · 当前有效',text:'资料不全时应注明缺失信息，由审核员确认；预审不自动改变审核状态。',current:true}];
      if (f.current) docs=docs.filter(d=>d.current);docs=docs.slice(0,f.topk);
    }
    let answer='资料中没有维修退款标准。应说明证据不足，并请求适用规范或转给负责人。';
    if (docs.length) {
      if (!f.current && f.topk > 1) answer='候选中包含旧规则与新规则。这个预设回答器提示版本冲突，需要先确定当前有效规范；增加 Top K 本身没有解决适用性。';
      else if (!f.current) answer='按旧版片段，可能回答“可以通过” [1]。引用存在，却引用了已经失效的规定。';
      else if (f.chunk === 'whole') answer='当前片段同时包含质保内要求和质保外例外。应识别条款范围：本题为质保内，须补处理照片，不能套用质保外例外 [1]。';
      else answer='当前有效条款要求质保内设备故障工单提交处理照片；缺失时先补材料 [1]。';
    }
    el.innerHTML=`<div class="eyebrow">SYNTHETIC DOCUMENTS</div><h3>候选证据 <span class="pill outline">${docs.length} 段</span></h3>${docs.length ? docs.map((d,i)=>`<div class="retrieval-item"><strong>[${i+1}] ${esc(d.title)}</strong>${esc(d.text)}<small>${d.current ? '适用状态：当前有效' : '适用状态：已失效'} · 预设演示顺序</small></div>`).join('') : '<p class="small-text">当前教学资料不覆盖这个问题，没有可用证据。</p>'}<div class="sim-answer"><h3>规则模拟的回答</h3>${esc(answer)}</div><p class="small-text" style="margin-top:16px;margin-bottom:0">此实验说明链路与取舍，不证明真实检索效果。真实系统还需要评估召回、语义完整性和引用支持性。</p>`;
  }
  function renderInterview() {
    const iv=D.interview.find(x=>x.id===interviewId);const entry=state.interviews[iv.id]||{answer:'',checks:[],saved:false};
    main.innerHTML=intro('INTERVIEW CAMP','把“我知道”，练成“我能说明白”。','预设面试题与三轮追问。按公开标准自查，不将关键词匹配当成 AI 评分。')+`<div class="interview-layout"><section class="interview-card"><label class="field-label" for="interview-topic" style="margin-top:0">选择训练方向</label><select id="interview-topic" class="select">${D.interview.map(x=>`<option value="${x.id}" ${x.id===iv.id?'selected':''}>${esc(x.topic)}</option>`).join('')}</select><div class="eyebrow" style="margin-top:28px">QUESTION / ${esc(iv.topic)}</div><h2>${esc(iv.question)}</h2><label class="field-label" for="interview-answer">你的回答与补充思考</label><textarea id="interview-answer" maxlength="5000" placeholder="先写用户任务与本人决策，再给出证据、取舍和验证方法。">${esc(entry.answer)}</textarea>${iv.followups.slice(0,interviewStep).map(q=>`<div class="followup">${esc(q)}</div>`).join('')}<div class="button-row" style="margin-top:20px"><button class="button" data-action="interview-next" ${interviewStep>=iv.followups.length?'disabled':''}>${interviewStep>=iv.followups.length?'三轮追问已展开':'接受第 '+(interviewStep+1)+' 轮追问 →'}</button><button class="button secondary" data-action="interview-save">保存练习</button></div><p class="small-text" style="margin-top:17px;margin-bottom:0">输入自动保存。完成后勾选右侧标准，标注仍需补证据的部分。</p></section><aside><h3>用这些标准，检查自己</h3><ul class="rubric">${iv.rubric.map((r,i)=>`<li><label><input type="checkbox" data-rubric="${i}" ${entry.checks.includes(i)?'checked':''}><span>${esc(r)}</span></label></li>`).join('')}</ul><p class="small-text" id="rubric-status">自查覆盖 ${entry.checks.length}/4 项 · 尚未外部评分</p><div class="note-strip"><p>从“问题 → 本人职责 → 关键选择 → 验证 → 反思”讲清一个项目。规划、个人原型和真实上线分别说明。</p></div><div class="source-links"><strong>岗位能力参考</strong><p class="small-text">以下是 2026-10-14 查询过的公开职位列表。不是实时在招确认，也不是企业真题。</p><a href="https://www.zhipin.com/zhaopin/0866aaf8349d5365031_3N-5Fw~~/" target="_blank" rel="noopener noreferrer">深圳 AI 应用与平台方向 ↗</a><a href="https://www.zhipin.com/zhaopin/a9681ea31ce5f3b003Zz3tq0Ew~~/" target="_blank" rel="noopener noreferrer">深圳供应链产品方向 ↗</a></div></aside></div>`;
    document.getElementById('interview-topic').addEventListener('change',e=>{interviewId=e.target.value;interviewStep=0;renderInterview();});
  }
  function reviewData(key) {
    const [type,id,kind]=key.split(':');
    if (type==='lesson') {const l=lessonById(id);return l ? {title:l.title,q:l.check.q,options:l.check.options,answer:l.check.answer,why:l.check.why} : null;}
    const q=questById(id);if (!q) return null;const item=kind==='diagnosis'?q.question:q.transfer;return {title:q.title,q:item.q,options:item.options,answer:item.answer,why:item.feedback[item.answer]};
  }
  function renderJournal() {
    const reviews=Object.entries(state.reviews).filter(([,v])=>!v.resolved);const completed=D.quests.filter(q=>state.quests[q.id]);const notes=Object.entries(state.notes).filter(([,v])=>v.trim());const ivs=D.interview.filter(iv=>state.interviews[iv.id]?.answer.trim());const labEntries=Object.entries(state.labNotes).filter(([,v])=>v.trim());
    main.innerHTML=intro('YOUR FIELD NOTES','走过的路，留下判断的依据。','错题、自写笔记、实验观察与面试回答保存在当前浏览器。可以导出备份，或导入合并。')+`<div class="journal-stats"><div><strong>${state.read.length}</strong>已阅读节点</div><div><strong>${state.passed.length}</strong>节点练习通过</div><div><strong>${completed.length}</strong>业务关卡完成</div><div><strong>${reviews.length}</strong>待复习题目</div></div><div class="journal-tools"><button class="button small" data-action="export">导出学习记录 ↗</button><button class="button small secondary" data-action="import">导入并合并备份</button><input class="hidden" id="import-file" type="file" accept="application/json,.json"><span class="small-text">浏览器之间不会自动同步</span></div>${reviews.length ? `<div class="section-heading"><h2>再验证一次</h2><span class="small-text">独立作答后移出待复习</span></div>${reviews.map(([key])=>{const item=reviewData(key);return item?`<section class="review-item"><span class="eyebrow">${esc(item.title)}</span><h3>${esc(item.q)}</h3><div class="options">${item.options.map((o,i)=>`<button class="option" data-action="review-answer" data-id="${esc(key)}" data-value="${i}"><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join('')}</div><div class="review-feedback" aria-live="polite"></div></section>`:'';}).join('')}`:''}${!completed.length&&!notes.length&&!ivs.length&&!labEntries.length&&!reviews.length?`<div class="empty-state"><div class="eyebrow" style="justify-content:center">YOUR FIRST FIELD NOTE</div><h2>第一份手记，从一次判断开始。</h2><p>完成一关、写下实验发现，或记一句自己的解释。</p><a class="button" href="#quest/supply">接下第一个任务 →</a></div>`:''}${completed.length?'<div class="section-heading"><h2>业务关卡复盘</h2></div>'+completed.map(q=>`<article class="review-item"><h3>${esc(q.title)}</h3><span class="pill">两道判断题通过 · 个人复盘未评审</span><div class="saved-note">${esc(state.quests[q.id].reflection)}</div><a class="text-button" href="#quest/${q.id}">回到关卡 ↗</a></article>`).join(''):''}${labEntries.length?'<div class="section-heading"><h2>实验观察</h2></div>'+labEntries.map(([id,note])=>`<article class="review-item"><h3>${id==='threshold'?'阈值与误判':'检索与证据'}</h3><div class="saved-note">${esc(note)}</div></article>`).join(''):''}${notes.length?'<div class="section-heading"><h2>知识笔记</h2></div>'+notes.map(([id,note])=>`<article class="review-item"><h3>${esc(lessonById(id).title)}</h3><div class="saved-note">${esc(note)}</div><button class="text-button" data-action="lesson" data-id="${id}">重新打开知识卡 ↗</button></article>`).join(''):''}${ivs.length?'<div class="section-heading"><h2>面试练习</h2></div>'+ivs.map(iv=>`<article class="review-item"><h3>${esc(iv.question)}</h3><span class="small-text">自查覆盖 ${state.interviews[iv.id].checks.length}/4 项；不是外部评分</span><div class="saved-note">${esc(state.interviews[iv.id].answer)}</div></article>`).join(''):''}<div class="section-heading"><h2>继续深入</h2></div><div class="review-sources">${Object.values(D.sources).map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</div>`;
    document.getElementById('import-file').addEventListener('change',importProgress);
  }
  function exportProgress() {const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='ai-quest-progress-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('学习记录已导出，请妥善保存自己的笔记。');}
  async function importProgress(event) {
    const file=event.target.files?.[0];if (!file) return;
    if (file.size>1024*1024) {toast('备份文件超过 1 MB，未导入。');return;}
    try {const incoming=clean(JSON.parse(await file.text()));state.read=[...new Set([...state.read,...incoming.read])];state.passed=[...new Set([...state.passed,...incoming.passed])];
      for(const key of ['quests','runs','notes','interviews','labNotes']) for (const [id,value] of Object.entries(incoming[key])) if (state[key][id]===undefined) state[key][id]=value;
      for (const [id,value] of Object.entries(incoming.reviews)) if (!state.reviews[id]) state.reviews[id]=value;
      save();renderJournal();toast('备份已合并；同名笔记保留当前浏览器的内容。');
    } catch (error) {toast('未导入：'+(error.message.includes('v1')?error.message:'文件不是有效的学习备份。'));}
  }
  function render() {
    const route=location.hash.slice(1)||'map';const section=route.startsWith('quest/')?'quests':route;
    const titles={map:'成长地图',quests:'业务关卡',labs:'互动实验室',interview:'面试营地',journal:'探险手记'};
    if (!titles[section]) {go('map');return;}
    if (dialog.open) dialog.close();
    document.getElementById('breadcrumb').textContent=titles[section];
    document.querySelectorAll('#navigation a').forEach(a=>{a.classList.toggle('active',a.dataset.route===section);if(a.dataset.route===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(route==='map')renderMap();else if(route==='quests')renderQuests();else if(route.startsWith('quest/'))renderQuest(route.split('/')[1]);else if(route==='labs')renderLabs();else if(route==='interview')renderInterview();else renderJournal();
    document.title=titles[section]+' · AI QUEST';window.scrollTo({top:0,behavior:'instant'});
  }
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-action]');if(!target)return;
    const {action,id,value,kind}=target.dataset;
    if(action==='chapter'){state.selectedChapter=id;save();renderMap();return;}
    if(action==='lesson'){showLesson(id);return;}
    if(action==='close-dialog'){dialog.close();return;}
    if(action==='mark-read'){if(!state.read.includes(id))state.read.push(id);save();target.textContent='已记录阅读 ✓';toast('阅读已记录，掌握程度还可以用练习检验。');return;}
    if(action==='lesson-answer'){
      const l=lessonById(id);const correct=Number(value)===l.check.answer;
      if(!state.read.includes(id))state.read.push(id);
      if(correct&&!state.passed.includes(id))state.passed.push(id);
      if(!correct)state.reviews['lesson:'+id]={resolved:false};save();
      target.parentElement.querySelectorAll('.option').forEach(b=>b.classList.remove('selected','correct','wrong'));target.classList.add('selected',correct?'correct':'wrong');
      document.getElementById('lesson-feedback').innerHTML=`<div class="feedback ${correct?'':'warning'}" role="status"><strong>${correct?'节点练习通过 ✓':'换个角度，再想一想。'}</strong><p>${esc(l.check.why)}</p></div>`;return;
    }
    if(action==='quest-next'){const q=questById(id),run=getRun(id);if(run.step===1&&run.opened.length<q.evidence.length)return;if(run.step===2&&run.answers.diagnosis!==q.question.answer)return;if(run.step===4&&run.answers.transfer!==q.transfer.answer)return;run.step=Math.min(5,run.step+1);save();renderQuest(id);window.scrollTo(0,0);return;}
    if(action==='quest-evidence'){getRun(id).step=1;save();renderQuest(id);return;}
    if(action==='quest-answer'){const q=questById(id),run=getRun(id),question=kind==='diagnosis'?q.question:q.transfer;run.answers[kind]=Number(value);if(Number(value)!==question.answer)state.reviews['quest:'+id+':'+kind]={resolved:false};save();renderQuest(id);return;}
    if(action==='quest-complete'){const q=questById(id),run=getRun(id);if(run.reflection.trim().length<10||run.answers.diagnosis!==q.question.answer||run.answers.transfer!==q.transfer.answer)return;state.quests[id]={reflection:run.reflection.trim(),completedAt:new Date().toISOString()};run.step=6;save();renderResult(q);window.scrollTo(0,0);return;}
    if(action==='quest-restart'){state.runs[id]={step:0,opened:[],answers:{},reflection:''};save();renderQuest(id);return;}
    if(action==='lab-tab'){selectedLab=id;renderLabs();return;}
    if(action==='save-lab'){const note=state.labNotes[id]||'';if(note.trim().length<10){toast('请先写下至少 10 个字的实验观察。');return;}save();toast('实验记录已保存，可以在探险手记中回顾。');return;}
    if(action==='interview-next'){interviewStep=Math.min(3,interviewStep+1);renderInterview();return;}
    if(action==='interview-save'){const entry=state.interviews[interviewId];if(!entry||entry.answer.trim().length<10){toast('请先写下至少 10 个字的回答。');return;}entry.saved=true;save();toast('面试练习已保存；自查结果不等于外部评分。');return;}
    if(action==='review-answer'){const item=reviewData(id);const correct=Number(value)===item.answer;if(correct)state.reviews[id].resolved=true;save();target.closest('.review-item').querySelector('.review-feedback').innerHTML=`<div class="feedback ${correct?'':'warning'}"><strong>${correct?'这次答对了，已移出待复习。':'还可以再验证一次。'}</strong><p>${esc(item.why)}</p></div>`;return;}
    if(action==='export'){exportProgress();return;}
    if(action==='import'){document.getElementById('import-file').click();return;}
  });
  document.addEventListener('input',e=>{
    const el=e.target;
    if(el.dataset.note){state.notes[el.dataset.note]=el.value;save();}
    if(el.dataset.reflection){const run=getRun(el.dataset.reflection);run.reflection=el.value;save();const count=el.value.trim().length;document.getElementById('reflection-count').textContent=count+' / 至少 10 字';document.getElementById('complete-quest').disabled=count<10;}
    if(el.dataset.labNote){state.labNotes[el.dataset.labNote]=el.value;save();}
    if(el.id==='interview-answer'){if(!state.interviews[interviewId])state.interviews[interviewId]={answer:'',checks:[],saved:false};state.interviews[interviewId].answer=el.value;save();}
  });
  document.addEventListener('change',e=>{if(e.target.dataset.rubric!==undefined){if(!state.interviews[interviewId])state.interviews[interviewId]={answer:'',checks:[],saved:false};const checks=[...document.querySelectorAll('[data-rubric]:checked')].map(el=>Number(el.dataset.rubric));state.interviews[interviewId].checks=checks;save();document.getElementById('rubric-status').textContent='自查覆盖 '+checks.length+'/4 项 · 尚未外部评分';}});
  document.getElementById('export-top').addEventListener('click',exportProgress);
  dialog.addEventListener('close',()=>{if((location.hash.slice(1)||'map')==='map'){renderMap();}});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
  window.addEventListener('hashchange',render);
  if(!persistent)document.getElementById('storage-note').textContent='当前浏览器不能保存，请导出备份';
  render();
})();
