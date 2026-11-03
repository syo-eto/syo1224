// 動作確認テスト（jsdomでHTMLを読み込み、主要な操作を実際に動かす）
// 実行: npm test      （別のファイルを試す: node tests/smoke.test.js path/to/file.html）
// 注意: アプリの let 変数（props, pStates など）は window に載らないため、w.eval('props') で読む
// ログイン機能を戻す場合は、「ログイン画面が無い」「ヘッダーのボタン」の2項目を直すこと
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname,'..','housing_roadmap_v7.html'),'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail && e.detail.message || e.message)));
vc.on('error', e => errors.push('console.error: ' + e));
const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc, beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }});
const w = dom.window, d = w.document;
const run = (label, fn) => { try { fn(); console.log('✅', label); } catch(e){ console.log('❌', label, '→', e.message); errors.push(label+': '+e.message); } };
const active = () => [...d.querySelectorAll('.page.active')].map(x=>x.id).join(',');

run('起動時: 物件一覧が表示される', () => { if(active()!=='page-list') throw new Error('active='+active()); });
run('ログイン画面の要素が無い', () => { if(d.getElementById('page-login')||d.getElementById('loginIdInput')) throw new Error('残存'); });
run('ヘッダーのボタン', () => {
  const t = d.querySelector('#page-list .list-hdr').textContent;
  ['管理者設定','担当ボックス','スタッフ管理','物件追加'].forEach(k=>{ if(!t.includes(k)) throw new Error(k+'が無い'); });
  ['ログアウト','個人設定'].forEach(k=>{ if(t.includes(k)) throw new Error(k+'が残っている'); });
});
run('物件追加→担当者設定ウィザード', () => {
  w.openAddDlg();
  d.getElementById('fName').value='テスト邸'; d.getElementById('fAddr').value='大分';
  w.addProperty();
  if(w.eval('props.length')!==1) throw new Error('props='+w.eval('props.length'));
});
run('ウィザード: 担当者→ゲートをスキップ', () => { w.skipTantoAndNext(); w.skipGateAndFinish(); });
run('物件一覧の描画(ステータス=プラン前)', () => {
  w.renderPropList();
  if(!d.getElementById('propTbody').textContent.includes('プラン前')) throw new Error('プラン前が無い: '+d.getElementById('propTbody').textContent.slice(0,80));
});
run('スマートフォン用の物件カード', () => {
  w.renderPropList();
  const cards = d.querySelectorAll('#propCards .pc-card');
  if(cards.length!==w.eval('props.length')) throw new Error('カード数 '+cards.length);
  const c = cards[0];
  if(!c.textContent.includes('テスト邸')) throw new Error('物件名が無い');
  if(c.querySelectorAll('.pc-ph').length!==w.eval('PCOLS.length')) throw new Error('フェーズの数が PCOLS と違う');
  if(!c.querySelector('.prop-status-badge')) throw new Error('ステータスが無い');
  if(c.querySelectorAll('.pc-ph.cur').length!==1) throw new Error('今のフェーズの印が1つでない');
});
run('物件を開く(ロードマップ)', () => { w.openProp(w.eval('props[0].id')); if(active()!=='page-rm') throw new Error(active()); });
run('ゲート設定リンクが表示される', () => { if(d.getElementById('gateLinkBtn').style.display==='none') throw new Error('非表示'); });
run('ゲート設定ダイアログ', () => { w.openGateDlg(); });
run('担当者設定ダイアログ', () => { w.openTantoDlg(); });
run('ボックスのモーダルを開く', () => { w.openModal(2); });
run('一括不要：状態は完了のまま、表には「不要」と出る', () => {
  w.bulkFuyo();
  const pid = w.eval('curPid');
  if(w.eval('pStates['+pid+'].ts[2]')!=='完了') throw new Error('状態が完了にならない');
  const row = [...d.querySelectorAll('#tbody tr, tbody tr')].find(r=>r.querySelector('.no-col')&&r.querySelector('.no-col').textContent==='2');
  if(!row || !row.querySelector('.sFuyo')) throw new Error('表に「不要」が出ない');
  w.bulkFuyo();
  if(w.eval('pStates['+pid+'].ts[2]')==='完了') throw new Error('解除しても完了のまま');
  if(row.isConnected && row.querySelector('.sFuyo')) throw new Error('解除後も不要の表示');
  const row2 = [...d.querySelectorAll('tbody tr')].find(r=>r.querySelector('.no-col')&&r.querySelector('.no-col').textContent==='2');
  if(row2.querySelector('.sFuyo')) throw new Error('解除後も不要の表示');
});
run('一覧へ戻る', () => { w.goBack(); });
run('担当ボックス画面', () => { w.goToMyTasks(); if(active()!=='page-mytasks') throw new Error(active()); });
run('担当ボックス: スタッフ切替', () => { const s=d.getElementById('myTaskStaffSel'); s.value=s.options[3].value; w.onMyTaskStaffChange(); });
run('管理者設定を開く', () => { w.goToList(); w.goToAdmin(); if(active()!=='page-admin') throw new Error(active()); });
run('管理者設定: 物件管理タブ', () => { w.switchAdminTab('prop'); if(!d.getElementById('propAdminList').textContent.includes('テスト邸')) throw new Error('物件が出ない'); });
run('管理者設定: ボックス管理タブ', () => { w.switchAdminTab('task'); if(d.getElementById('taskEditList').textContent.length<100) throw new Error('空'); });
run('管理者設定: テンプレートタブ', () => { w.switchAdminTab('tmpl'); });
run('ボックス編集ダイアログ', () => { w.openEditTaskDlg(2); w.closeOv('taskEditDlgOv'); });
run('スタッフ管理ダイアログ', () => { w.openStaffDlg(); });
run('保存(saveData)とlocalStorage', () => {
  w.saveData();
  const s = JSON.parse(w.localStorage.getItem('housing_roadmap_v7'));
  if(!s.props || s.props.length!==1) throw new Error('props保存なし');
  ['adminList','editorList','accounts'].forEach(k=>{ if(k in s) throw new Error(k+'が保存されている'); });
});
run('ボックス未編集なら TASKS は保存しない', () => {
  w.saveData();
  const s = JSON.parse(w.localStorage.getItem('housing_roadmap_v7'));
  if('tasks' in s) throw new Error('未編集なのに tasks が保存されている');
});
run('ボックス編集が再読み込み後も残る', () => {
  w.confirm = () => true;
  // 編集：No.2 の名前とタスクを変更
  w.openEditTaskDlg(2);
  d.getElementById('teTaskName').value = '編集後の名前';
  w.addCheckItem(); w.eval("tempItems[tempItems.length-1].t='追加したタスク'");
  w.saveTaskEdit();
  // 追加：新しいボックス
  w.openAddTaskDlg();
  const newNo = Number(d.getElementById('teTaskNo').value);
  d.getElementById('teTaskName').value = '新規ボックス';
  w.saveTaskEdit();
  // 削除：No.3
  w.deleteTask(3);
  const before = w.eval('TASKS.length');
  w.saveData();
  const saved = w.localStorage.getItem('housing_roadmap_v7');
  // 別ウィンドウで再読み込み
  const d2 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', saved); }}).window;
  const T = d2.eval('TASKS');
  if(T.length!==before) throw new Error('ボックス数 '+T.length+' ≠ '+before);
  const t2 = T.find(t=>t.no===2);
  if(!t2 || t2.name!=='編集後の名前') throw new Error('No.2 の名前が戻った');
  if(!t2.items.some(i=>i.t==='追加したタスク')) throw new Error('追加したタスクが無い');
  if(!T.find(t=>t.no===newNo && t.name==='新規ボックス')) throw new Error('追加したボックスが無い');
  if(T.find(t=>t.no===3)) throw new Error('削除したボックスが戻った');
  const pid = d2.eval('props[0].id');
  if(d2.eval('pStates['+pid+'].done[2].length')!==t2.items.length) throw new Error('物件のチェック数がボックスと合わない');
  // 再読み込み後に保存しても編集が残る
  d2.saveData();
  if(!('tasks' in JSON.parse(d2.localStorage.getItem('housing_roadmap_v7')))) throw new Error('再保存で tasks が消えた');
});
run('エクスポートのデータ構造', () => {
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function(){};
  let json = null;
  w.Blob = class { constructor(parts){ json = parts.join(''); } };
  w.exportAllData();
  if(!json || !('tasks' in JSON.parse(json))) throw new Error('ボックス編集後のエクスポートに tasks が無い');
});
run('テンプレート：Driveの「注文住宅 タスク管理表」と一致', () => {
  // 編集済みの保存データが無い状態で、HTML内のテンプレートを確かめる
  const w3 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  const T = w3.eval('TASKS'), box = no => T.find(t=>t.no===no);
  if(T.length!==182) throw new Error('ボックス数 '+T.length);
  if(!T.every((t,i)=>t.no===i+1)) throw new Error('番号が1〜182の連番でない');
  if(box(148).name!=='上棟案内') throw new Error('148が上棟案内でない（番号の詰め）');
  if(T.some(t=>t.name==='着工~監査①'||t.name==='監査①~監査②')) throw new Error('重複の旧148・149が残っている');
  if(box(145).items.length!==19 || box(147).items.length!==27) throw new Error('145・147のタスク数');
  if(box(176).name!=='引渡' || box(176).items.length!==1 || box(176).items[0].t!=='お花の受け取り') throw new Error('176 引渡の中身');
  const gates = Object.fromEntries(w3.eval('GATES').map(g=>[g.name,g.no]));
  ['上棟','木完','工務社検','引渡'].forEach(n=>{ if(box(gates[n]).name!==n) throw new Error('ゲート「'+n+'」の番号がずれた'); });
  if(box(116).group!=='着工前工務業務') throw new Error('116のフェーズ');
  // 着工後フェーズのボックスを開いて表示できる
  w3.openAddDlg(); w3.document.getElementById('fName').value='テンプレ邸'; w3.addProperty();
  w3.openProp(w3.eval('props[0].id')); w3.render();
  w3.openModal(145);
  if(!w3.document.body.textContent.includes('袖の寸法の確認')) throw new Error('145のタスクが表示されない');
});
run('ゲートを入れると全ボックスに期日が付く（上棟案内を含む）', () => {
  const w4 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  w4.openAddDlg(); w4.document.getElementById('fName').value='期日邸'; w4.addProperty();
  w4.openProp(w4.eval('props[0].id'));
  w4.openGateDlg(); w4.document.getElementById('gate-キックオフ').value='2026-01-01'; w4.saveGate();
  if(w4.getEffectiveDue(148)!=='2025-08-11') throw new Error('148 上棟案内の期日 '+w4.getEffectiveDue(148));
  const offs = w4.eval('TASK_OFFSETS'), map = w4.eval('TASK_GATE_MAP');
  if(Object.keys(map).sort().join()!==Object.keys(offs).sort().join()) throw new Error('TASK_GATE_MAP と TASK_OFFSETS の番号が揃っていない');
});
const OLD_DATA = { // 番号を詰める前（184ボックス）の保存データ
  props:[{id:1,name:'旧邸'}], nextPid:2,
  pStates:{1:{ts:{'147':'完了','148':'完了','150':'完了','184':'進行中'}, done:{'150':[true,false]}, fuyo:{}, help:{}, memo:{}, overrideDue:{'176':'2026-12-01'}}},
  kanryoDates:{'1_150':'2026-10-01','1_149':'2026-09-01'}, itemCheckDates:{'1_178_0':'2026-10-02'},
  taskLinks:{'150_0':[{title:'案内',url:'http://x'}],'148_0':[{title:'重複',url:'http://y'}]},
};
const checkMigrated = (win, label) => {
  const st = win.eval('pStates')[1];
  if(st.ts[148]!=='完了') throw new Error(label+'：旧150（上棟案内）の状態が148に移っていない');
  if(st.ts[182]!=='進行中') throw new Error(label+'：旧184の状態が182に移っていない');
  if(st.ts[147]!=='完了') throw new Error(label+'：147が変わった');
  if(!st.done[148] || st.done[148][0]!==true) throw new Error(label+'：タスクの完了が移っていない');
  if(st.overrideDue[174]!=='2026-12-01') throw new Error(label+'：期日が移っていない');
  const k = win.eval('kanryoDates'), ic = win.eval('itemCheckDates'), l = win.eval('taskLinks');
  if(k['1_148']!=='2026-10-01' || k['1_149']) throw new Error(label+'：完了日 '+JSON.stringify(k));
  if(ic['1_176_0']!=='2026-10-02') throw new Error(label+'：チェック日 '+JSON.stringify(ic));
  if(!l['148_0'] || l['148_0'][0].title!=='案内') throw new Error(label+'：添付 '+JSON.stringify(l));
};
run('旧番号の保存データを新番号へ移す', () => {
  const w4 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', JSON.stringify(OLD_DATA)); }}).window;
  checkMigrated(w4, '起動時');
  // 保存し直しても、もう一度ずらさない
  w4.saveData();
  const saved = w4.localStorage.getItem('housing_roadmap_v7');
  if(JSON.parse(saved).boxNoVer!==2) throw new Error('boxNoVer が保存されていない');
  const w5 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', saved); }}).window;
  checkMigrated(w5, '再読み込み');
});
run('ボックス編集済みの旧データも番号を詰める', () => {
  const tasks = w.eval('JSON.parse(JSON.stringify(TASKS))').slice(0,147)
    .concat([{no:148,name:'着工~監査①',items:[]},{no:149,name:'監査①~監査②',items:[]},{no:150,name:'上棟案内',items:[]},{no:185,name:'自分で足したボックス',items:[]}]);
  const data = Object.assign(JSON.parse(JSON.stringify(OLD_DATA)), {tasks});
  const w6 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', JSON.stringify(data)); }}).window;
  const T = w6.eval('TASKS');
  if(T.some(t=>t.name==='着工~監査①')) throw new Error('旧148が残っている');
  if(T.find(t=>t.no===148).name!=='上棟案内') throw new Error('148が上棟案内でない');
  if(T.find(t=>t.no===183).name!=='自分で足したボックス') throw new Error('追加ボックスが183になっていない');
  checkMigrated(w6, '編集済み');
});
console.log('\nエラー数:', errors.length);
errors.forEach(e=>console.log(' -', e));

process.exitCode = errors.length ? 1 : 0;
