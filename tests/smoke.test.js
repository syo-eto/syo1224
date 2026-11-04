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
run('ウィザード: 担当者設定にスタッフ追加が出ない', () => { if(d.getElementById('tantoStaffSection').style.display!=='none') throw new Error('スタッフ追加が表示されている'); });
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
run('担当者設定ダイアログ', () => { w.openTantoDlg(); if(d.getElementById('tantoStaffSection').style.display==='none') throw new Error('通常の担当者設定でスタッフ一覧が消えた'); });
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
run('タスクを削除・文言変更しても、添付とチェックがずれない', () => {
  const w5 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  const d5 = w5.document; w5.confirm = () => true;
  w5.openAddDlg(); d5.getElementById('fName').value='添付邸'; w5.addProperty();
  const pid = w5.eval('props[0].id');
  w5.openProp(pid);
  const no = w5.eval('TASKS.find(t=>t.items.length>=3).no');
  const texts = w5.eval('TASKS.find(t=>t.no==='+no+').items.map(i=>i.t)');
  w5.openModal(no); w5.toggleDone(no, 2, true); w5.closeModal && w5.closeModal();
  const icd = w5.eval('itemCheckDates["'+pid+'_'+no+'_2"]');
  w5.eval('taskLinks["'+no+'_0"]=[{title:"消える",url:"https://a"}]; taskLinks["'+no+'_2"]=[{title:"三番目",url:"https://c"}];');
  // 1つ目を削除、2つ目（元の3つ目）の文言を直す
  w5.openEditTaskDlg(no);
  w5.deleteCheckItem(0);
  if(!d5.getElementById('teItemList').textContent.includes('三番目')) throw new Error('編集画面で添付が元のタスクに付いていない');
  w5.eval('tempItems[1].t="文言を直した"');
  w5.saveTaskEdit();
  const L = w5.eval('taskLinks');
  if(!L[no+'_1'] || L[no+'_1'][0].title!=='三番目') throw new Error('添付が新しい位置に移っていない '+JSON.stringify(L[no+'_1']));
  if(L[no+'_0'] || L[no+'_2']) throw new Error('古い位置に添付が残っている');
  if(w5.eval('pStates['+pid+'].done['+no+'][1]')!==true) throw new Error('チェックが新しい位置に移っていない');
  if(w5.eval('itemCheckDates["'+pid+'_'+no+'_1"]')!==icd) throw new Error('チェック日が移っていない');
  if(w5.eval('itemCheckDates["'+pid+'_'+no+'_2"]')) throw new Error('古い位置にチェック日が残っている');
  if(w5.eval('TASKS.find(t=>t.no==='+no+').items[1].t')!=='文言を直した') throw new Error('文言');
  if(w5.eval('TASKS.find(t=>t.no==='+no+').items.some(i=>"_oi" in i)')) throw new Error('作業用の _oi が保存データに残る');
  // ボックスを削除すると添付も消える
  w5.deleteTask(no);
  if(Object.keys(w5.eval('taskLinks')).some(k=>k.startsWith(no+'_'))) throw new Error('削除したボックスの添付が残る');
});
run('保存したボックス一覧のフェーズ「引渡し」も「引渡前」になる', () => {
  const tasks = w.eval('JSON.parse(JSON.stringify(TASKS))').map(t=>t.group==='引渡前'?Object.assign(t,{group:'引渡し'}):t);
  const data = {boxNoVer:2, props:[], nextPid:1, tasks};
  const w7 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', JSON.stringify(data)); }}).window;
  const T = w7.eval('TASKS');
  if(T.some(t=>t.group==='引渡し')) throw new Error('引渡しが残っている');
  if(!T.some(t=>t.group==='引渡前')) throw new Error('引渡前が無い');
  if(!w7.document.getElementById('propList') && !w7.document.body.innerHTML.includes('>引渡前</th>')) throw new Error('物件一覧の見出し');
});
run('物件の追加取り込み：今の物件を残し、同名は置き換える', () => {
  const w8 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  const d8 = w8.document;
  d8.getElementById('fName') ; w8.openAddDlg(); d8.getElementById('fName').value='あああああ'; w8.addProperty();
  const keepId = w8.eval('props[0].id');
  w8.openProp(keepId); w8.openModal(2); w8.toggleDone(2,0,true);
  const file = {version:'7', boxNoVer:2, props:[{id:7,name:'取込邸',addr:'大分市',tanto:'',date:'',ki:'',status:''}],
    pStates:{7:{ts:{'1':'完了','5':'進行中'}, done:{'5':[true,false]}, fuyo:{}, help:{}, memo:{}, overrideDue:{}}},
    tantoMap:{7:{'企画':'新しい人'}}, gateDates:{7:{'キックオフ':'2026-01-10'}}, kanryoDates:{'7_1':'2026-02-01'}, itemCheckDates:{'7_5_0':'2026-02-02'}, staffList:['新しい人']};
  let r = w8.mergeImportData(JSON.parse(JSON.stringify(file)));
  if(r.added.length!==1) throw new Error('追加されない');
  const P = w8.eval('props');
  if(P.length!==2 || !P.find(p=>p.name==='あああああ')) throw new Error('今の物件が消えた');
  if(w8.eval('pStates['+keepId+'].done[2][0]')!==true) throw new Error('今の物件のチェックが消えた');
  const nid = P.find(p=>p.name==='取込邸').id;
  if(nid===keepId) throw new Error('番号が重なった');
  if(w8.eval('pStates['+nid+'].ts[1]')!=='完了' || w8.eval('pStates['+nid+'].done[5][0]')!==true) throw new Error('進捗が入っていない');
  if(w8.eval('pStates['+nid+'].ts[100]')!=='着手前') throw new Error('ファイルに無いボックスが初期化されていない');
  if(w8.eval('kanryoDates["'+nid+'_1"]')!=='2026-02-01' || w8.eval('itemCheckDates["'+nid+'_5_0"]')!=='2026-02-02') throw new Error('日付が移っていない');
  if(w8.eval('tantoMap['+nid+']["企画"]')!=='新しい人' || !w8.eval('staffList').includes('新しい人')) throw new Error('担当者');
  if(w8.eval('gateDates['+nid+']["キックオフ"]')!=='2026-01-10') throw new Error('ゲート');
  if(!w8.eval('staffList').includes('外注')) throw new Error('スタッフに外注が無い');
  // removeStaff で外したスタッフは、一覧と他の物件の担当者からも消える
  w8.eval('tantoMap['+keepId+']={"IC":"新しい人"}');
  w8.mergeImportData({props:[], removeStaff:['新しい人']});
  if(w8.eval('staffList').includes('新しい人') || w8.eval('tantoMap['+keepId+'].IC')) throw new Error('removeStaff が効かない');
  file.staffList=[];
  // もう一度取り込むと、同名の物件を置き換える（増えない）
  file.pStates[7].ts['1']='着手前'; file.kanryoDates={};
  r = w8.mergeImportData(JSON.parse(JSON.stringify(file)));
  if(r.updated.length!==1 || w8.eval('props.length')!==2) throw new Error('同名が置き換わらない');
  if(w8.eval('pStates['+nid+'].ts[1]')!=='着手前' || w8.eval('kanryoDates["'+nid+'_1"]')) throw new Error('置き換え後の内容');
  // 物件一覧に出る
  w8.renderPropList();
  if(!d8.getElementById('propTbody').textContent.includes('取込邸')) throw new Error('一覧に出ない');
});
run('38 実行予算 → 原価管理：保存データを差し替える', () => {
  const tpl = w.eval('JSON.parse(JSON.stringify(TASKS))');
  const old38 = Object.assign({}, tpl.find(t=>t.no===116), {no:38, group:'完成宅地'});
  const tasks = tpl.map(t=>t.no===38?old38:t);
  const st = {ts:{'38':'進行中','39':'完了'}, done:{'38':Array(50).fill(true),'39':[true]}, fuyo:{'38':Array(50).fill(false)}, help:{}, memo:{}, overrideDue:{'38':'2026-12-01'}};
  const data = {boxNoVer:2, props:[{id:1,name:'旧邸'}], nextPid:2, tasks, pStates:{1:st},
    itemCheckDates:{'1_38_0':'2026-10-01','1_39_0':'2026-10-02'}, taskLinks:{'38_0':[{title:'x',url:'https://x'}],'39_0':[{title:'y',url:'https://y'}]}};
  const w9 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', JSON.stringify(data)); }}).window;
  const T = w9.eval('TASKS'), b38 = T.find(t=>t.no===38);
  if(b38.name!=='原価管理' || b38.items.length!==146) throw new Error('保存したボックス一覧の38が差し替わらない');
  if(w9.eval('pStates[1].done[38].length')!==146 || w9.eval('pStates[1].done[38].some(Boolean)')) throw new Error('38のチェックが作り直されていない');
  if(w9.eval('pStates[1].ts[38]')!=='進行中' || w9.eval('pStates[1].overrideDue[38]')!=='2026-12-01') throw new Error('38の状態・期日が消えた');
  if(w9.eval('pStates[1].done[39][0]')!==true) throw new Error('他のボックスのチェックが消えた');
  if(w9.eval('itemCheckDates["1_38_0"]') || !w9.eval('itemCheckDates["1_39_0"]')) throw new Error('チェック日');
  if(w9.eval('taskLinks["38_0"]') || !w9.eval('taskLinks["39_0"]')) throw new Error('添付');
  w9.openProp(1); w9.openModal(38);
  if(!w9.document.body.textContent.includes('原価管理表のスプレットシート')) throw new Error('38の中身が表示されない');
});
run('埋め込んだドライブのデータを起動時に一度だけ取り込む', () => {
  const seed = {exportedAt:'2026-11-04T00:00:00', boxNoVer:3, props:[{id:1,name:'埋込邸',addr:'',tanto:'',date:'',ki:'',status:''}],
    pStates:{1:{ts:{'1':'完了'},done:{},fuyo:{},help:{},memo:{},overrideDue:{}}}, tantoMap:{}, gateDates:{}, kanryoDates:{}, itemCheckDates:{}};
  const mk = saved => new JSDOM(html.replace('<script>', '<script>window.DRIVE_SEED='+JSON.stringify(seed)+';</script><script>'), {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; if(saved) Object.entries(saved).forEach(([k,v])=>win.localStorage.setItem(k,v)); }}).window;
  const w0 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  w0.openAddDlg(); w0.document.getElementById('fName').value='あああああ'; w0.addProperty(); w0.saveData();
  const keep = {housing_roadmap_v7: w0.localStorage.getItem('housing_roadmap_v7')};
  const a = mk(keep);
  const names = a.eval('props.map(p=>p.name)');
  if(!names.includes('あああああ') || !names.includes('埋込邸')) throw new Error('取り込まれない '+names);
  if(a.document.getElementById('seedNotice').style.display==='none') throw new Error('お知らせが出ない');
  if(!a.document.getElementById('propTbody').textContent.includes('埋込邸')) throw new Error('一覧に出ない');
  // 物件ごとの区切り：各物件の1行目に prop-first、1件おきに prop-alt
  const tb=a.document.getElementById('propTbody');
  if(tb.querySelectorAll('tr.prop-first').length!==2 || tb.querySelectorAll('tr.prop-alt').length!==4) throw new Error('物件の区切りの行の印');
  // 保存して開き直しても二重に取り込まない
  a.saveData();
  const saved = {housing_roadmap_v7:a.localStorage.getItem('housing_roadmap_v7'), housing_roadmap_v7_seed:a.localStorage.getItem('housing_roadmap_v7_seed')};
  const b = mk(saved);
  if(b.eval('props.length')!==2) throw new Error('二重に取り込んだ');
  if(b.document.getElementById('seedNotice').style.display!=='none') throw new Error('二回目もお知らせが出る');
});
run('不要のボックスは、フェーズの％に数えない', () => {
  const w10 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  w10.openAddDlg(); w10.document.getElementById('fName').value='不要邸'; w10.addProperty();
  const pid = w10.eval('props[0].id');
  w10.openProp(pid);
  const nos = w10.eval('TASKS.filter(t=>PCOLS[0].g.includes(t.group)&&t.items.length).map(t=>t.no)');
  const n = w10.eval('TASKS.filter(t=>PCOLS[0].g.includes(t.group)).length');
  // 1つを一括不要、1つを完了にする
  w10.openModal(nos[0]); w10.bulkFuyo();
  w10.openModal(nos[1]); w10.eval('TASKS.find(t=>t.no==='+nos[1]+').items').forEach((_,i)=>w10.toggleDone(nos[1],i,true));
  const r = w10.eval('phasePct('+pid+',0)');
  if(r.total!==n-1 || r.done!==1) throw new Error('分母 '+r.total+'（期待 '+(n-1)+'）・分子 '+r.done);
  if(r.pct!==Math.round(1/(n-1)*100)) throw new Error('％ '+r.pct);
  // 物件一覧のプラン確定の％にも反映
  w10.goToList(); w10.renderPropList();
  if(!w10.document.getElementById('propTbody').textContent.includes(r.pct+'%')) throw new Error('一覧の％');
  // 完了で、完了タスクが0件・不要が一部だけのボックスも不要とみなす。完了タスクが1件でもあれば数える
  w10.eval('pStates['+pid+'].fuyo['+nos[0]+']=TASKS.find(t=>t.no==='+nos[0]+').items.map((_,i)=>i===0)');
  if(!w10.eval('isBoxFuyo('+pid+','+nos[0]+')')) throw new Error('完了・不要のみ（一部）が不要にならない');
  w10.eval('pStates['+pid+'].done['+nos[0]+'][1]=true');
  if(w10.eval('isBoxFuyo('+pid+','+nos[0]+')')) throw new Error('完了タスクがあるのに不要になった');
  w10.eval('pStates['+pid+'].done['+nos[0]+'][1]=false');
  w10.eval('pStates['+pid+'].ts['+nos[0]+']="進行中"');
  if(w10.eval('isBoxFuyo('+pid+','+nos[0]+')')) throw new Error('進行中のボックスが不要になった');
  // 全ボックスが不要のフェーズは100%（済み）
  w10.eval('TASKS.filter(t=>PCOLS[0].g.includes(t.group)).forEach(t=>{pStates['+pid+'].fuyo[t.no]=t.items.length?t.items.map(()=>true):[]; pStates['+pid+'].ts[t.no]="完了";})');
  const r2 = w10.eval('phasePct('+pid+',0)');
  if(r2.pct!==100) throw new Error('全不要（タスクの無いボックスは完了）で100%にならない '+JSON.stringify(r2));
});
run('ボックス管理の更新履歴', () => {
  const w11 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  const d11 = w11.document; w11.confirm = () => true;
  w11.goToAdmin(); w11.switchAdminTab('task');
  const tplN = w11.eval('TEMPLATE_HISTORY.length');
  if(d11.querySelectorAll('#boxHistoryList .box-hist-row').length!==tplN) throw new Error('テンプレートの更新が出ない');
  // 編集：名前を変えてタスクを1つ消す
  w11.openEditTaskDlg(5);
  const before = w11.eval('TASKS.find(t=>t.no===5).name');
  d11.getElementById('teTaskName').value = '名前を変えた';
  w11.deleteCheckItem(0); w11.saveTaskEdit();
  // 追加と削除
  w11.openAddTaskDlg(); const newNo = Number(d11.getElementById('teTaskNo').value);
  d11.getElementById('teTaskName').value = '履歴の箱'; w11.saveTaskEdit();
  w11.deleteTask(newNo);
  const H = w11.eval('boxHistory');
  if(H.length!==3) throw new Error('履歴の件数 '+H.length);
  if(H[0].type!=='編集' || !H[0].detail.includes('名前「'+before+'」→「名前を変えた」') || !H[0].detail.includes('タスク削除 1件')) throw new Error('編集の内容 '+H[0].detail);
  if(H[1].type!=='追加' || H[2].type!=='削除' || H[2].no!==newNo) throw new Error('追加・削除');
  // 変更なしで保存しても履歴は増えない
  w11.openEditTaskDlg(6); w11.saveTaskEdit();
  if(w11.eval('boxHistory.length')!==3) throw new Error('変更なしで履歴が増えた');
  const rows = d11.querySelectorAll('#boxHistoryList .box-hist-row');
  if(rows.length!==tplN+3 || !rows[0].textContent.includes('削除')) throw new Error('一覧の表示（新しい順）');
  // 保存して開き直しても残る
  w11.saveData();
  const saved = w11.localStorage.getItem('housing_roadmap_v7');
  const w12 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', saved); }}).window;
  if(w12.eval('boxHistory.length')!==3) throw new Error('再読み込みで履歴が消えた');
});
run('タスク追加の追加理由（ボックス管理と💡だけに出る）', () => {
  const w13 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; }}).window;
  const d13 = w13.document; w13.confirm = () => true;
  w13.openAddDlg(); d13.getElementById('fName').value='理由邸'; w13.addProperty();
  w13.goToAdmin(); w13.switchAdminTab('task');
  w13.openEditTaskDlg(3);
  if(d13.querySelectorAll('#teItemList .te-why-input').length!==0) throw new Error('既存のタスクに追加理由の欄が出ている');
  w13.addCheckItem();
  const inputs = d13.querySelectorAll('#teItemList .te-why-input');
  if(inputs.length!==1) throw new Error('新しいタスクに追加理由の欄が無い');
  w13.eval('tempItems[tempItems.length-1].t="理由つきタスク"');
  inputs[0].value='監査で指摘されたため'; inputs[0].dispatchEvent(new w13.Event('input'));
  w13.saveTaskEdit();
  const it = w13.eval('TASKS.find(t=>t.no===3).items.slice(-1)[0]');
  if(it.why!=='監査で指摘されたため') throw new Error('追加理由が保存されない');
  if(!w13.eval('boxHistory.slice(-1)[0].detail').includes('理由：監査で指摘されたため')) throw new Error('履歴に理由が無い');
  // 開き直すと表示だけ
  w13.openEditTaskDlg(3);
  if(!d13.getElementById('teItemList').textContent.includes('追加理由：監査で指摘されたため')) throw new Error('編集画面に理由が出ない');
  w13.closeOv('taskEditDlgOv');
  // 物件のチェック画面には出ない
  w13.openProp(w13.eval('props[0].id')); w13.openModal(3);
  const body = d13.getElementById('mBody').textContent;
  if(!body.includes('理由つきタスク')) throw new Error('タスクが物件に出ない');
  if(body.includes('監査で指摘されたため')) throw new Error('追加理由が物件の画面に出ている');
  // HELPの右の💡にカーソルを合わせると理由が出る（data-tip）。理由の無いタスクには出ない
  const tips = d13.querySelectorAll('#mBody .why-tip');
  if(tips.length!==1 || tips[0].getAttribute('data-tip')!=='追加理由：監査で指摘されたため') throw new Error('💡の理由');
  if(!tips[0].closest('.cl-item').textContent.includes('理由つきタスク')) throw new Error('💡が別のタスクに付いている');
});
run('アプリの版（表示・package.json と一致）', () => {
  const v = w.eval('APP_VERSION');
  const pkg = JSON.parse(require('fs').readFileSync(__dirname+'/../package.json','utf8'));
  if(pkg.version!==v) throw new Error('package.json '+pkg.version+' ≠ '+v);
  if(!d.getElementById('appVersion').textContent.includes('v'+v)) throw new Error('見出しの版の表示');
});
run('外したスタッフ（佐藤理絵・大下翼）は保存データからも外れる', () => {
  if(w.eval('staffList').some(n=>n==='佐藤　理絵'||n==='大下　翼')) throw new Error('既定の一覧に残っている');
  const old = {props:[], nextPid:2, boxNoVer:3, staffList:['江藤　奨','佐藤　慎一郎','佐藤　理絵','大下　翼','外注','社長'], tantoMap:{1:{'企画':'佐藤　理絵','IC':'外注','建築家':'社長'}}, pStates:{}};
  const w14 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', JSON.stringify(old)); }}).window;
  const st = w14.eval('staffList');
  if(st.includes('佐藤　理絵') || st.includes('大下　翼') || !st.includes('外注')) throw new Error('保存データのスタッフ '+st);
  if(w14.eval('tantoMap[1]["企画"]') || w14.eval('tantoMap[1].IC')!=='外注') throw new Error('担当者設定');
  if(st.includes('社長') || w14.eval('tantoMap[1]["建築家"]')!=='佐藤　慎一郎') throw new Error('社長が佐藤慎一郎にならない');
  // 外したあとに同じ名前を足し直した場合は、次に開いても消さない
  w14.eval("staffList.push('佐藤　理絵')"); w14.saveData();
  const saved = w14.localStorage.getItem('housing_roadmap_v7');
  const w15 = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
    beforeParse(win){ win.URL.createObjectURL=()=>'blob:x'; win.URL.revokeObjectURL=()=>{}; win.localStorage.setItem('housing_roadmap_v7', saved); }}).window;
  if(!w15.eval('staffList').includes('佐藤　理絵')) throw new Error('足し直した人が消えた');
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
  if(box(38).name!=='原価管理' || box(38).items.length!==146 || box(116).name!=='実行予算') throw new Error('38 原価管理（実行予算の重複の修正）');
  if(T.some(t=>t.group==='引渡し') || box(176).group!=='引渡前') throw new Error('フェーズ「引渡し」が「引渡前」になっていない');
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
  if(JSON.parse(saved).boxNoVer!==3) throw new Error('boxNoVer が保存されていない');
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
