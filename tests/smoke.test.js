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
run('物件を開く(ロードマップ)', () => { w.openProp(w.eval('props[0].id')); if(active()!=='page-rm') throw new Error(active()); });
run('ゲート設定リンクが表示される', () => { if(d.getElementById('gateLinkBtn').style.display==='none') throw new Error('非表示'); });
run('ゲート設定ダイアログ', () => { w.openGateDlg(); });
run('担当者設定ダイアログ', () => { w.openTantoDlg(); });
run('ボックスのモーダルを開く', () => { w.openModal(2); });
run('一括不要トグル', () => { w.bulkFuyo(); w.bulkFuyo(); });
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
console.log('\nエラー数:', errors.length);
errors.forEach(e=>console.log(' -', e));

process.exitCode = errors.length ? 1 : 0;
