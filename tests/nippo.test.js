// 大工日報（genba_nippo/）の動作確認。実行: npm run test:nippo
// Code.gs を表計算の模型（メモリ上）で動かし、index.html を jsdom で開いて google.script.run をつなぐ。
const fs = require('fs'), path = require('path'), vm = require('vm');
const {JSDOM, VirtualConsole} = require('jsdom');
const dir = path.join(__dirname, '..', 'genba_nippo');
const code = fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const errors = [];
const run = async (label, fn) => { try { await fn(); console.log('✅', label); } catch (e) { console.log('❌', label, '→', e.message); errors.push(label + ': ' + e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

/* ── Apps Script の模型 ── */
function jstParts(d) {
  const p = {}; new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'})
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return p;
}
let fakeNow = null;   // テストで「今」をずらす
function makeGas() {
  const sheets = {};
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0 && fakeNow) super(fakeNow); else super(...a); } }
  // 表計算と同じく、日付らしい文字列は Date になる
  const conv = v => {
    if (typeof v === 'string') {
      let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return new FakeDate(v + 'T00:00:00+09:00');
      m = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})$/); if (m) return new FakeDate(`${m[1]}-${m[2]}-${m[3]}T${m[4]}+09:00`);
    }
    return v;
  };
  const makeSheet = name => {
    const s = {name, data: []};
    s.getDataRange = () => ({getValues: () => s.data.length ? s.data.map(r => r.slice()) : [['']]});
    s.getLastRow = () => s.data.length;
    s.getRange = (r, c, nr, nc) => ({
      setValues: vals => { vals.forEach((row, i) => { const t = s.data[r - 1 + i] || (s.data[r - 1 + i] = []); row.forEach((v, j) => { t[c - 1 + j] = conv(v); }); }); },
      setFontWeight: () => {}
    });
    s.appendRow = row => { s.data.push(row.map(conv)); };
    s.deleteRow = i => { s.data.splice(i - 1, 1); };
    s.clearContents = () => { s.data = []; };
    s.setFrozenRows = () => {};
    return s;
  };
  const ss = {getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n))};
  const ctx = {
    Date: FakeDate,
    SpreadsheetApp: {getActiveSpreadsheet: () => ss},
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
    Utilities: {formatDate: (d, tz, fmt) => {
      const p = jstParts(d);
      return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
    }},
    console
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, {filename: 'Code.gs'});
  return {ctx, sheets};
}
const ymd = d => { const p = jstParts(d); return `${p.year}-${p.month}-${p.day}`; };
const TODAY = ymd(new Date());
const YESTERDAY = ymd(new Date(Date.now() - 864e5));
const TOMORROW = ymd(new Date(Date.now() + 864e5));
const hasDate = v => v instanceof Date || (v && typeof v === 'object' && Object.values(v).some(hasDate)) || (Array.isArray(v) && v.some(hasDate));
const obj = (sheet) => { const [h, ...rows] = sheet.data; return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };

/* ── 画面を開く（google.script.run を模型につなぐ） ── */
function openPage(gas, storage) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail && e.detail.message || e.message)));
  const dom = new JSDOM(html, {runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/', virtualConsole: vc, beforeParse(win) {
    win.scrollTo = () => {};
    win.confirm = () => true;
    if (storage) Object.entries(storage).forEach(([k, v]) => win.localStorage.setItem(k, v));
    const runner = (ok, ng) => new Proxy({}, {get: (_, fn) => {
      if (fn === 'withSuccessHandler') return h => runner(h, ng);
      if (fn === 'withFailureHandler') return h => runner(ok, h);
      return (...args) => setTimeout(() => {
        try {
          const res = gas.ctx[fn](...JSON.parse(JSON.stringify(args)));
          if (hasDate(res)) throw new Error(fn + ' の戻り値に Date が入っている（google.script.run では送れない）');
          ok && ok(res === undefined ? undefined : JSON.parse(JSON.stringify(res)));
        } catch (e) { ng && ng({message: e.message}); }
      }, 0);
    }});
    win.google = {script: {run: runner(null, null)}};
  }});
  return dom.window;
}
const tick = () => new Promise(r => setTimeout(r, 5));
const setVal = (w, el, v, ev = 'change') => { el.value = v; el.dispatchEvent(new w.Event(ev, {bubbles: true})); };

(async () => {
  const gas = makeGas();
  const {ctx, sheets} = gas;

  await run('初期設定：シートと作業内容（新築26・リノベ30）を作る', () => {
    ctx.setup();
    ['現場', '作業員', '作業内容', '仕様項目', '材料', '日報', '日報_作業', '日報_材料', '歩掛'].forEach(n => assert(sheets[n], n + ' が無い'));
    const works = obj(sheets['作業内容']);
    assert(works.filter(w => w['種別（新築／リノベ）'] === '新築').length === 26, '新築 ' + works.length);
    assert(works.filter(w => w['種別（新築／リノベ）'] === 'リノベ').length === 30, 'リノベ');
    ctx.setup();
    assert(obj(sheets['作業内容']).length === 56, '2回目で増えた');
  });
  await run('仕様の読み取り（括弧の中の「／」、括弧なしの「既製／造作」、選択肢なし）', () => {
    const p = ctx.parseSpecDef_('無垢／複合・材種（オーク／パイン／スギ など）・厚み');
    assert(JSON.stringify(p) === JSON.stringify([{name: '無垢／複合', choices: ['無垢', '複合']}, {name: '材種', choices: ['オーク', 'パイン', 'スギ']}, {name: '厚み', choices: []}]), JSON.stringify(p));
    const floor = obj(sheets['仕様項目']).filter(s => s['作業ID'] === 'N12');
    assert(floor.length === 6, '床張りの項目 ' + floor.length);
  });

  // 管理者が登録する
  sheets['作業員'].data.push(['W01', '山田 太郎', 'TRUE', '', 2500], ['W02', '佐藤 次郎', 'TRUE', '1234', 2800], ['W03', '退職 者', 'FALSE', '', 2000]);
  sheets['現場'].data.push(['S01', '甲様邸', '新築', '進行中', ''], ['S02', '乙様邸', 'リノベ', '進行中', ''], ['S03', '丙様邸', '新築', '完工', '']);

  await run('入力画面の一覧：進行中の現場だけ・有効な人だけ・時給と暗証番号は出さない', () => {
    const m = ctx.getMaster();
    assert(m.sites.map(s => s.id).join() === 'S01,S02', 'sites ' + m.sites.map(s => s.id));
    assert(m.workers.map(w => w.id).join() === 'W01,W02', 'workers');
    const json = JSON.stringify(m);
    assert(!json.includes('2500') && !json.includes('2800') && !json.includes('1234'), '時給か暗証番号が入っている');
    assert(m.workers[1].hasPin === true && m.workers[0].hasPin === false, 'hasPin');
    assert(m.works.length === 56, 'works');
  });

  // ── 画面 ──
  let w = openPage(gas), d = w.document;
  await tick(); await tick();
  await run('起動すると名前を選ぶ画面', () => { assert(!d.getElementById('pickView').classList.contains('hidden'), '出ない'); });
  await run('暗証番号のある人は、違う番号だと進めない', async () => {
    setVal(w, d.getElementById('pickWorker'), 'W02');
    assert(!d.getElementById('pinBox').classList.contains('hidden'), '暗証番号の欄が出ない');
    d.getElementById('pickPin').value = '9999';
    d.getElementById('pickOk').click(); await tick(); await tick();
    assert(d.getElementById('msg').textContent.includes('暗証番号が違います'), d.getElementById('msg').textContent);
    assert(d.getElementById('formView').classList.contains('hidden'), '進んでしまった');
  });
  await run('名前を選ぶと入力画面（日付は今日）', async () => {
    setVal(w, d.getElementById('pickWorker'), 'W01');
    d.getElementById('pickOk').click(); await tick(); await tick();
    assert(!d.getElementById('formView').classList.contains('hidden'), '入力画面が出ない');
    assert(d.getElementById('date').value === TODAY, d.getElementById('date').value);
    assert(d.getElementById('whoName').textContent === '山田 太郎', 'name');
  });
  await run('現場を選ぶと、その種別の作業だけが出る', () => {
    const card = () => d.querySelector('[data-i="0"]');
    setVal(w, card().querySelector('[data-f="siteId"]'), 'S02');
    const opts = [...card().querySelector('[data-f="workId"]').options].map(o => o.textContent);
    assert(opts.includes('柱タチ調整') && !opts.includes('建方（上棟）'), 'リノベの一覧でない');
    setVal(w, card().querySelector('[data-f="siteId"]'), 'S01');
    const opts2 = [...card().querySelector('[data-f="workId"]').options].map(o => o.textContent);
    assert(opts2.includes('建方（上棟）') && !opts2.includes('柱タチ調整'), '新築の一覧でない');
  });
  await run('作業内容を選ぶと仕様・時間・数量（単位つき）が出る', () => {
    const card = d.querySelector('[data-i="0"]');
    setVal(w, card.querySelector('[data-f="workId"]'), 'N12');
    const c = d.querySelector('[data-i="0"]');
    assert(c.querySelectorAll('[data-spec]').length === 6, '仕様の欄 ' + c.querySelectorAll('[data-spec]').length);
    assert(c.querySelector('.unit').textContent === '㎡', '単位');
    assert(c.querySelector('[data-f="hours"]').options.length === 13, '時間の選択肢（1〜12）');
  });
  await run('入力が足りないと送らない', () => {
    d.getElementById('send').click();
    assert(d.getElementById('msg').textContent.includes('無垢／複合'), d.getElementById('msg').textContent);
  });
  await run('「その他（入力）」を選ぶと自由に書ける', () => {
    const c = () => d.querySelector('[data-i="0"]');
    setVal(w, c().querySelector('[data-spec="材種"]'), 'その他（入力）');
    const other = c().querySelector('[data-spec-other="材種"]');
    assert(other, '入力欄が出ない');
    setVal(w, other, 'ウォールナット', 'input');
  });
  await run('1件目を埋めて、2件目（別の現場・数量なしの作業）を足す', () => {
    const c = () => d.querySelector('[data-i="0"]');
    const pick = {'無垢／複合': '無垢', '厚み': '15mm', '幅': '90mm', '張り方': '捨て張り', '床暖房': 'なし'};
    Object.entries(pick).forEach(([k, v]) => setVal(w, c().querySelector(`select[data-spec="${k}"]`), v));
    setVal(w, c().querySelector('[data-f="hours"]'), '4');
    setVal(w, c().querySelector('[data-f="qty"]'), '18', 'input');
    d.getElementById('addLine').click();
    const c2 = () => d.querySelector('[data-i="1"]');
    assert(c2().querySelector('[data-f="siteId"]').value === 'S01', '前の現場が入らない');
    const prep = [...c2().querySelector('[data-f="workId"]').options].find(o => o.textContent === '準備').value;
    setVal(w, c2().querySelector('[data-f="workId"]'), prep);
    assert(!c2().querySelector('[data-f="qty"]'), '数量なしの作業に数量欄が出た');
    setVal(w, c2().querySelector('[data-f="hours"]'), '2');
    assert(d.getElementById('totalHours').textContent === '6', '合計 ' + d.getElementById('totalHours').textContent);
  });
  let storageSnapshot;
  await run('送る前の入力は端末に残る（開き直すと戻る）', async () => {
    storageSnapshot = {...w.localStorage};
    const w2 = openPage(gas, storageSnapshot); await tick(); await tick();
    const c = w2.document.querySelector('[data-i="0"]');
    assert(c && c.querySelector('[data-f="workId"]').value === 'N12', '戻らない');
    assert(w2.document.getElementById('dateNote').textContent.includes('戻しました'), 'お知らせ');
    assert(w2.document.getElementById('totalHours').textContent === '6', '合計');
  });
  await run('送信すると控えが出て、表に2行・歩掛ができる', async () => {
    d.getElementById('send').click(); await tick(); await tick();
    assert(!d.getElementById('doneView').classList.contains('hidden'), '控えが出ない: ' + d.getElementById('msg').textContent);
    assert(d.getElementById('receipt').textContent.includes('床張り（フローリング）'), '控え');
    const lines = obj(sheets['日報_作業']);
    assert(lines.length === 2, '行数 ' + lines.length);
    assert(lines[0]['仕様'] === '無垢／複合：無垢、材種：ウォールナット、厚み：15mm、幅：90mm、張り方：捨て張り、床暖房：なし', lines[0]['仕様']);
    assert(lines[1]['数量'] === '', '数量なしの行');
    const sum = obj(sheets['歩掛']);
    const all = sum.find(r => r['作業内容'] === '床張り（フローリング）' && r['仕様'] === '（仕様をまとめた全体）');
    assert(all && all['合計時間'] === 4 && all['合計数量'] === 18 && Math.abs(all['時間／数量'] - 0.222) < 1e-9, JSON.stringify(all));
    assert(sum.some(r => r['仕様'] === lines[0]['仕様']), '仕様ごとの行が無い');
    assert(!w.localStorage.getItem('daiku_nippo_draft_W01_' + TODAY), '下書きが消えない');
  });
  await run('同じ日のうちは開き直すと送信済みの内容が出て、直して送り直せる', async () => {
    d.getElementById('again').click(); await tick(); await tick();
    assert(d.getElementById('dateNote').textContent.includes('直して送り直せます'), d.getElementById('dateNote').textContent);
    assert(d.querySelectorAll('[data-i]').length === 2, '2件出ない');
    setVal(w, d.querySelector('[data-i="0"] [data-f="hours"]'), '5');
    d.querySelector('[data-i="1"] [data-act="del"]').click();
    d.getElementById('send').click(); await tick(); await tick();
    assert(d.getElementById('doneHead').textContent.includes('直して送り直し'), d.getElementById('doneHead').textContent + ' / ' + d.getElementById('msg').textContent);
    assert(obj(sheets['日報']).length === 1, '日報が増えた');
    assert(obj(sheets['日報_作業']).length === 1, '古い行が残った');
    assert(obj(sheets['日報'])[0]['合計時間'] === 5, '合計');
  });
  await run('別の日に送った日報は直せない（画面も送信できない）', async () => {
    const rep = sheets['日報'].data[1];
    rep[4] = new ctx.Date(YESTERDAY + 'T09:00:00+09:00');
    const r = ctx.loadReport('W01', '', TODAY);
    assert(r.exists && r.editable === false, JSON.stringify(r));
    const w3 = openPage(gas, {daiku_nippo_who: JSON.stringify({workerId: 'W01', pin: ''})}); await tick(); await tick(); await tick();
    assert(w3.document.getElementById('send').disabled, '送信ボタンが押せる');
    assert(w3.document.getElementById('dateNote').textContent.includes('送信済み'), 'お知らせ');
    let msg = ''; try { ctx.submitReport({workerId: 'W01', pin: '', date: TODAY, lines: [{siteId: 'S01', workId: 'N24', spec: {}, hours: 1, qty: ''}]}); } catch (e) { msg = e.message; }
    assert(msg.includes('送信済み'), '上書きできてしまう: ' + msg);
  });
  await run('前日の分もあとから送れる', () => {
    const r = ctx.submitReport({workerId: 'W02', pin: '1234', date: YESTERDAY, lines: [{siteId: 'S01', workId: 'N03', spec: {'断面': '27×105'}, hours: 8, qty: 40}]});
    assert(r.ok && r.date === YESTERDAY, JSON.stringify(r));
  });
  await run('サーバー側でも入力を確かめる', () => {
    const bad = (p, want) => { let m = ''; try { ctx.submitReport(p); } catch (e) { m = e.message; } assert(m.includes(want), `「${want}」でなく「${m}」`); };
    const base = {workerId: 'W02', pin: '1234', date: TODAY};
    bad({...base, pin: '0000', lines: []}, '暗証番号が違います');
    bad({...base, workerId: 'W03', lines: []}, '名前を選んでください');
    bad({...base, date: TOMORROW, lines: [{siteId: 'S01', workId: 'N24', hours: 1}]}, '先の日付');
    bad({...base, lines: [{siteId: 'S02', workId: 'N24', hours: 1}]}, 'リノベの作業ではありません');
    bad({...base, lines: [{siteId: 'S03', workId: 'N24', hours: 1}]}, '現場を選んでください');
    bad({...base, lines: [{siteId: 'S01', workId: 'N24', hours: 1.5}]}, '1時間刻み');
    bad({...base, lines: [{siteId: 'S01', workId: 'N03', spec: {'断面': '27×105'}, hours: 2, qty: ''}]}, '数量（本）');
    bad({...base, lines: [{siteId: 'S01', workId: 'N03', spec: {}, hours: 2, qty: 3}]}, '「断面」を選んでください');
    bad({...base, lines: [{siteId: 'S01', workId: 'N24', hours: 13}, {siteId: 'S01', workId: 'N25', hours: 12}]}, '24時間を超えて');
  });
  await run('材料が登録されると材料の欄が出て、日報_材料にたまる', async () => {
    sheets['材料'].data.push(['M01', 'フロア釘', '38mm', '箱', 1200, '2026-11-01', 'TRUE']);
    assert(!JSON.stringify(ctx.getMaster()).includes('1200'), '単価が入力画面に渡る');
    const w4 = openPage(gas, {daiku_nippo_who: JSON.stringify({workerId: 'W02', pin: '1234'})}); await tick(); await tick();
    const d4 = w4.document;
    assert(!d4.getElementById('matSection').classList.contains('hidden'), '材料の欄が出ない');
    const c = () => d4.querySelector('[data-i="0"]');
    setVal(w4, c().querySelector('[data-f="siteId"]'), 'S01');
    setVal(w4, c().querySelector('[data-f="workId"]'), 'N24');
    setVal(w4, c().querySelector('[data-f="hours"]'), '1');
    d4.getElementById('addMat').click();
    const m = () => d4.querySelector('[data-m="0"]');
    setVal(w4, m().querySelector('[data-mf="materialId"]'), 'M01');
    setVal(w4, m().querySelector('[data-mf="qty"]'), '2');
    d4.getElementById('send').click(); await tick(); await tick();
    assert(!d4.getElementById('doneView').classList.contains('hidden'), d4.getElementById('msg').textContent);
    const mats = obj(sheets['日報_材料']);
    assert(mats.length === 1 && mats[0]['材料名'] === 'フロア釘' && mats[0]['数量'] === 2, JSON.stringify(mats));
  });

  console.log(errors.length ? '\n' + errors.join('\n') + `\n❌ ${errors.length}件の失敗` : '\nすべて成功');
  process.exitCode = errors.length ? 1 : 0;
})();
