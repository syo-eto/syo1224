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
let currentEmail = '';   // 画面を開いた人の会社アカウント（Session.getActiveUser）
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
      setValues: vals => { if (c - 1 + vals[0].length > s.maxCols) throw new Error(name + ': 列が足りない（' + s.maxCols + '列）'); vals.forEach((row, i) => { const t = s.data[r - 1 + i] || (s.data[r - 1 + i] = []); row.forEach((v, j) => { t[c - 1 + j] = conv(v); }); }); },
      setFontWeight: () => {}
    });
    s.appendRow = row => { if (row.length > s.maxCols) throw new Error(name + ': 列が足りない'); s.data.push(row.map(conv)); };
    s.deleteRow = i => { s.data.splice(i - 1, 1); };
    s.clearContents = () => { s.data = []; };
    s.setFrozenRows = () => {};
    s.maxCols = 14;   // 表計算と同じく列の数に限りがある（足りなければ insertColumnsAfter で足す）
    s.getMaxColumns = () => s.maxCols;
    s.insertColumnsAfter = (after, n) => { s.maxCols += n; };
    return s;
  };
  const ss = {getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n))};
  const ctx = {
    Date: FakeDate,
    SpreadsheetApp: {getActiveSpreadsheet: () => ss},
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
    Session: {getActiveUser: () => ({getEmail: () => currentEmail})},
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

  await run('初期設定：シートと作業内容（新築24・リノベ30）を作る', () => {
    ctx.setup();
    ['現場', '作業員', '作業内容', '材料', '日報', '日報_作業', '歩掛'].forEach(n => assert(sheets[n], n + ' が無い'));
    const works = obj(sheets['作業内容']);
    assert(works.filter(w => w['種別（新築／リノベ）'] === '新築').length === 24, '新築 ' + works.length);
    assert(works.filter(w => w['種別（新築／リノベ）'] === 'リノベ').length === 30, 'リノベ');
    ctx.setup();
    assert(obj(sheets['作業内容']).length === 54, '2回目で増えた');
  });
  // 管理者が登録する
  sheets['作業員'].data.push(['W01', '山田 太郎', 'TRUE', '', 2500, 'yamada@kokorosya.co.jp'], ['W02', '佐藤 次郎', 'TRUE', '', 2800, 'sato@kokorosya.co.jp'], ['W03', '退職 者', 'FALSE', '', 2000, 'old@kokorosya.co.jp']);
  sheets['現場'].data.push(['S01', '甲様邸', '新築', '進行中', ''], ['S02', '乙様邸', 'リノベ', '進行中', ''], ['S03', '丙様邸', '新築', '完工', '']);
  sheets['材料'].data.push(['M01', '無垢オーク', '15mm', 'ケース', 9800, '2026-11-01', 'TRUE', '床張り（フローリング）、フロア張り'],
                          ['M02', 'フロア釘', '38mm', '箱', 1200, '2026-11-01', 'TRUE', ''],
                          ['M03', '使わない材料', '', '個', 10, '', 'FALSE', '']);

  await run('入力画面の一覧：進行中の現場だけ・有効な人だけ・時給と暗証番号は出さない', () => {
    const m = ctx.getMaster();
    assert(m.sites.map(s => s.id).join() === 'S01,S02', 'sites ' + m.sites.map(s => s.id));
    assert(!m.workers, '作業員の一覧を画面に渡している');
    assert(m.me === null, 'ログインしていないのに本人が決まった');
    currentEmail = 'Yamada@Kokorosya.co.jp';
    const m2 = ctx.getMaster();
    assert(m2.me && m2.me.id === 'W01' && m2.me.name === '山田 太郎', 'アドレスで本人が決まらない ' + JSON.stringify(m2.me));
    currentEmail = 'old@kokorosya.co.jp';
    assert(ctx.getMaster().me === null, '無効の人が本人になった');
    currentEmail = '';
    const json = JSON.stringify(m);
    assert(!json.includes('2500') && !json.includes('2800'), '時給が入っている');
    assert(!json.includes('9800') && !json.includes('1200'), '単価が入っている');
    assert(m.materials.map(x => x.name).join() === '無垢オーク 15mm,フロア釘 38mm', '材料 ' + m.materials.map(x => x.name));
    assert(m.works.length === 54, 'works');
  });

  await run('Apps Script を通さずに開くと、止まらずに案内が出る', () => {
    const dom = new JSDOM(html, {runScripts: 'dangerously', url: 'https://example.test/', beforeParse(win) { win.scrollTo = () => {}; }});
    const t = dom.window.document.getElementById('msg').textContent;
    assert(t.includes('単体では動きません'), t);
    assert(dom.window.document.getElementById('loading').classList.contains('hidden'), '読み込み中のまま');
  });

  // ── 画面 ──
  await run('ログインしていないと、会社のアカウントでログインするよう案内が出る', async () => {
    currentEmail = '';
    const wx = openPage(gas); await tick(); await tick();
    assert(wx.document.getElementById('msg').textContent.includes('ログインしてから'), wx.document.getElementById('msg').textContent);
    assert(wx.document.getElementById('formView').classList.contains('hidden'), '入力画面が出た');
  });
  await run('作業員に登録されていないアカウントでは入れない', async () => {
    currentEmail = 'someone@kokorosya.co.jp';
    const wx = openPage(gas); await tick(); await tick();
    assert(wx.document.getElementById('msg').textContent.includes('someone@kokorosya.co.jp は作業員に登録されていません'), wx.document.getElementById('msg').textContent);
    let m = ''; try { ctx.submitReport({date: TODAY, lines: [{siteId: 'S01', workId: 'N22', hours: 1}]}); } catch (e) { m = e.message; }
    assert(m.includes('登録されていません'), 'サーバーが受け付けた: ' + m);
  });
  currentEmail = 'yamada@kokorosya.co.jp';
  let w = openPage(gas), d = w.document;
  await tick(); await tick();
  await run('登録されたアカウントで開くと、名前を選ばずに入力画面（日付は今日、名前が出る）', () => {
    assert(!d.getElementById('formView').classList.contains('hidden'), '入力画面が出ない: ' + d.getElementById('msg').textContent);
    assert(!d.getElementById('pickView'), '名前を選ぶ画面が残っている');
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
  await run('作業内容を選ぶと時間・材料・数量（単位つき）が出る。材料はその作業で使うものだけ', () => {
    const card = d.querySelector('[data-i="0"]');
    setVal(w, card.querySelector('[data-f="workId"]'), 'N03');
    let opts = [...d.querySelector('[data-i="0"] [data-f="materialId"]').options].map(o => o.textContent);
    assert(opts.join() === '選んでください,フロア釘 38mm,その他（書く）,なし', '間柱の材料 ' + opts);
    setVal(w, d.querySelector('[data-i="0"] [data-f="workId"]'), 'N11');
    const c = d.querySelector('[data-i="0"]');
    opts = [...c.querySelector('[data-f="materialId"]').options].map(o => o.textContent);
    assert(opts.includes('無垢オーク 15mm') && opts.includes('フロア釘 38mm'), '床張りの材料 ' + opts);
    assert(!c.querySelector('[data-spec]'), '仕様の欄が残っている');
    assert(c.querySelector('.unit').textContent === 'ケース', '単位');
    assert(c.querySelector('[data-f="hours"]').options.length === 13, '時間の選択肢（1〜12）');
  });
  await run('入力が足りないと送らない', () => {
    d.getElementById('send').click();
    assert(d.getElementById('msg').textContent.includes('時間を選んでください'), d.getElementById('msg').textContent);
    setVal(w, d.querySelector('[data-i="0"] [data-f="hours"]'), '4');
    d.getElementById('send').click();
    assert(d.getElementById('msg').textContent.includes('材料を選んでください'), d.getElementById('msg').textContent);
  });
  await run('材料の「その他（書く）」を選ぶと自由に書ける', () => {
    const c = () => d.querySelector('[data-i="0"]');
    setVal(w, c().querySelector('[data-f="materialId"]'), '__other__');
    const other = c().querySelector('[data-f="materialText"]');
    assert(other, '入力欄が出ない');
    setVal(w, other, 'ウォールナット15mm', 'input');
  });
  await run('1件目を埋めて、2件目（数量なしの作業）を足す', () => {
    const c = () => d.querySelector('[data-i="0"]');
    setVal(w, c().querySelector('[data-f="qty"]'), '18', 'input');
    d.getElementById('addLine').click();
    const c2 = () => d.querySelector('[data-i="1"]');
    assert(c2().querySelector('[data-f="siteId"]').value === 'S01', '前の現場が入らない');
    const prep = [...c2().querySelector('[data-f="workId"]').options].find(o => o.textContent === '準備').value;
    setVal(w, c2().querySelector('[data-f="workId"]'), prep);
    assert(!c2().querySelector('[data-f="qty"]') && !c2().querySelector('[data-f="materialId"]'), '数量なしの作業に材料・数量欄が出た');
    setVal(w, c2().querySelector('[data-f="hours"]'), '2');
    assert(d.getElementById('totalHours').textContent === '6', '合計 ' + d.getElementById('totalHours').textContent);
  });
  let storageSnapshot;
  await run('送る前の入力は端末に残る（開き直すと戻る）', async () => {
    storageSnapshot = {...w.localStorage};
    const w2 = openPage(gas, storageSnapshot); await tick(); await tick();
    const c = w2.document.querySelector('[data-i="0"]');
    assert(c && c.querySelector('[data-f="workId"]').value === 'N11', '戻らない');
    assert(w2.document.getElementById('dateNote').textContent.includes('戻しました'), 'お知らせ');
    assert(w2.document.getElementById('totalHours').textContent === '6', '合計');
  });
  await run('送信すると控えが出て、表に2行・歩掛ができる', async () => {
    d.getElementById('send').click(); await tick(); await tick();
    assert(!d.getElementById('doneView').classList.contains('hidden'), '控えが出ない: ' + d.getElementById('msg').textContent);
    assert(d.getElementById('receipt').textContent.includes('床張り（フローリング）'), '控え');
    const lines = obj(sheets['日報_作業']);
    assert(lines.length === 2, '行数 ' + lines.length);
    assert(lines[0]['材料'] === 'ウォールナット15mm' && lines[0]['材料ID'] === '', lines[0]['材料'] + '/' + lines[0]['材料ID']);
    assert(lines[1]['数量'] === '', '数量なしの行');
    const sum = obj(sheets['歩掛']);
    const all = sum.find(r => r['作業内容'] === '床張り（フローリング）' && r['材料'] === '（材料をまとめた全体）');
    assert(all && all['合計時間'] === 4 && all['合計数量'] === 18 && Math.abs(all['時間／数量'] - 0.222) < 1e-9, JSON.stringify(all));
    assert(sum.some(r => r['材料'] === 'ウォールナット15mm'), '材料ごとの行が無い');
    assert(!w.localStorage.getItem('daiku_nippo_draft_W01_' + TODAY), '下書きが消えない');
  });
  await run('同じ日のうちは開き直すと送信済みの内容が出て、直して送り直せる', async () => {
    d.getElementById('again').click(); await tick(); await tick();
    assert(d.getElementById('dateNote').textContent.includes('直して送り直せます'), d.getElementById('dateNote').textContent);
    assert(d.querySelectorAll('[data-i]').length === 2, '2件出ない');
    assert(d.querySelector('[data-i="0"] [data-f="materialText"]').value === 'ウォールナット15mm', '書いた材料が戻らない');
    setVal(w, d.querySelector('[data-i="0"] [data-f="hours"]'), '5');
    setVal(w, d.querySelector('[data-i="0"] [data-f="materialId"]'), 'M01');
    d.querySelector('[data-i="1"] [data-act="del"]').click();
    d.getElementById('send').click(); await tick(); await tick();
    assert(d.getElementById('doneHead').textContent.includes('直して送り直し'), d.getElementById('doneHead').textContent + ' / ' + d.getElementById('msg').textContent);
    assert(obj(sheets['日報']).length === 1, '日報が増えた');
    assert(obj(sheets['日報_作業']).length === 1, '古い行が残った');
    assert(obj(sheets['日報'])[0]['合計時間'] === 5, '合計');
    const l0 = obj(sheets['日報_作業'])[0];
    assert(l0['材料'] === '無垢オーク 15mm' && l0['材料ID'] === 'M01', l0['材料'] + '/' + l0['材料ID']);
  });
  await run('別の日に送った日報は直せない（画面も送信できない）', async () => {
    const rep = sheets['日報'].data[1];
    rep[4] = new ctx.Date(YESTERDAY + 'T09:00:00+09:00');
    const r = ctx.loadReport(TODAY);
    assert(r.exists && r.editable === false, JSON.stringify(r));
    const w3 = openPage(gas); await tick(); await tick(); await tick();
    assert(w3.document.getElementById('send').disabled, '送信ボタンが押せる');
    assert(w3.document.getElementById('dateNote').textContent.includes('送信済み'), 'お知らせ');
    let msg = ''; try { ctx.submitReport({date: TODAY, lines: [{siteId: 'S01', workId: 'N22', hours: 1, qty: ''}]}); } catch (e) { msg = e.message; }
    assert(msg.includes('送信済み'), '上書きできてしまう: ' + msg);
  });
  await run('前日の分もあとから送れる', () => {
    currentEmail = 'sato@kokorosya.co.jp';
    const r = ctx.submitReport({date: YESTERDAY, lines: [{siteId: 'S01', workId: 'N03', materialId: 'M02', hours: 8, qty: 40}]});
    assert(r.ok && r.date === YESTERDAY, JSON.stringify(r));
    assert(obj(sheets['日報']).some(x => x['作業員ID'] === 'W02' && x['氏名'] === '佐藤 次郎'), 'ログイン中の人の名前で入らない');
  });
  await run('サーバー側でも入力を確かめる', () => {
    const bad = (p, want) => { let m = ''; try { ctx.submitReport(p); } catch (e) { m = e.message; } assert(m.includes(want), `「${want}」でなく「${m}」`); };
    const base = {workerId: 'W01', date: TODAY};   // 画面から別の人の ID を送っても、ログイン中の人として扱う
    currentEmail = '';
    bad({...base, lines: [{siteId: 'S01', workId: 'N22', hours: 1}]}, 'ログインしてから');
    currentEmail = 'sato@kokorosya.co.jp';
    bad({...base, date: TOMORROW, lines: [{siteId: 'S01', workId: 'N22', hours: 1}]}, '先の日付');
    bad({...base, lines: [{siteId: 'S02', workId: 'N22', hours: 1}]}, 'リノベの作業ではありません');
    bad({...base, lines: [{siteId: 'S03', workId: 'N22', hours: 1}]}, '現場を選んでください');
    bad({...base, lines: [{siteId: 'S01', workId: 'N22', hours: 1.5}]}, '1時間刻み');
    bad({...base, lines: [{siteId: 'S01', workId: 'N03', materialId: 'M02', hours: 2, qty: ''}]}, '数量（本）');
    bad({...base, lines: [{siteId: 'S01', workId: 'N03', hours: 2, qty: 3}]}, '材料を選んでください');
    bad({...base, lines: [{siteId: 'S01', workId: 'N03', materialId: '__other__', materialText: ' ', hours: 2, qty: 3}]}, '材料を書いてください');
    bad({...base, lines: [{siteId: 'S01', workId: 'N03', materialId: 'M03', hours: 2, qty: 3}]}, '材料を選び直して');
    const ok = ctx.submitReport({...base, date: YESTERDAY, lines: [{siteId: 'S01', workId: 'N03', materialId: '__none__', hours: 1, qty: 2}]});
    assert(ok.ok && ok.lines[0].material === 'なし', '材料なし');
    bad({...base, lines: [{siteId: 'S01', workId: 'N22', hours: 13}, {siteId: 'S01', workId: 'N23', hours: 12}]}, '24時間を超えて');
  });
  console.log(errors.length ? '\n' + errors.join('\n') + `\n❌ ${errors.length}件の失敗` : '\nすべて成功');
  process.exitCode = errors.length ? 1 : 0;
})();
