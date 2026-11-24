// 現場工数アプリ（genba_kosu.html）の動作確認。実行: npm run test:kosu
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname,'..','genba_kosu.html');
const errors = [];
let downloads = [];
function open(html, storage){
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail && e.detail.message || e.message)));
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc, beforeParse(win){
    win.URL.createObjectURL = b => { downloads.push(b); return 'blob:x'; };
    win.URL.revokeObjectURL = () => {};
    win.confirm = () => true;
    win.scrollTo = () => {};
    win.HTMLDialogElement && (win.HTMLDialogElement.prototype.showModal = function(){ this.setAttribute('open',''); });
    win.HTMLDialogElement && (win.HTMLDialogElement.prototype.close = function(){ this.removeAttribute('open'); });
    if(storage) Object.entries(storage).forEach(([k,v]) => win.localStorage.setItem(k,v));
  }});
  return dom.window;
}
const run = async (label, fn) => { try { await fn(); console.log('✅', label); } catch(e){ console.log('❌', label, '→', e.message); errors.push(label+': '+e.message); } };
const blobText = b => b.text();

(async () => {
  const html = fs.readFileSync(file,'utf8');
  let w = open(html), d = w.document;
  await run('起動時に入力者の選択が出る', () => { if(!d.getElementById('whoDlg').hasAttribute('open')) throw new Error('出ない'); });
  await run('入力者を決める', () => { d.getElementById('whoFree').value='大工A'; w.setWho('大工A'); if(d.getElementById('whoName').textContent!=='大工A') throw new Error(d.getElementById('whoName').textContent); });
  await run('設定：工種・物件を保存', () => {
    w.showTab('set');
    d.getElementById('setKou').value = 'フローリング張り,㎡\n建方,坪';
    d.getElementById('setProps').value = '甲様邸\n乙様邸';
    d.getElementById('setWorkers').value = '大工A\n大工B';
    w.saveSettings();
    if(d.getElementById('inKou').options.length!==3) throw new Error('工種の選択肢 '+d.getElementById('inKou').options.length);
  });
  await run('入力が足りないと記録しない', () => { w.addRecord(); if(w.eval('data.records.length')!==0) throw new Error('記録された'); });
  await run('記録する（2人×8時間＝2人工）', () => {
    d.getElementById('inProp').value='甲様邸'; d.getElementById('inKou').value='フローリング張り';
    d.getElementById('inN').value='2'; d.getElementById('inH').value='8';
    w.addRecord();
    if(w.eval('data.records.length')!==1) throw new Error('件数');
    if(!d.getElementById('dayList').textContent.includes('2人工')) throw new Error(d.getElementById('dayList').textContent);
  });
  await run('再読み込みしても残る', () => {
    const st = {genba_kosu: w.localStorage.getItem('genba_kosu'), genba_kosu_who: w.localStorage.getItem('genba_kosu_who')};
    w = open(html, st); d = w.document;
    if(w.eval('data.records.length')!==1) throw new Error('消えた');
    if(d.getElementById('whoDlg').hasAttribute('open')) throw new Error('入力者の選択がまた出た');
  });
  let sentFile;
  await run('事務所へ送る（ファイルになり送信済になる）', async () => {
    downloads = [];
    w.showTab('list');
    await w.sendRecords(false);
    if(downloads.length!==1) throw new Error('ファイルができない');
    sentFile = await blobText(downloads[0]);
    if(JSON.parse(sentFile).records.length!==1) throw new Error('件数');
    if(w.eval('data.records[0].sent')!==true) throw new Error('送信済にならない');
    if(!d.getElementById('allList').textContent.includes('送信済')) throw new Error('表示');
  });
  // 事務所側（別の端末）
  const office = open(html, {genba_kosu_who:'事務所'}); const od = office.document;
  await run('事務所：取り込み（同じファイルを2回でも1件）', async () => {
    const f = new office.File([sentFile], 'a.json', {type:'application/json'});
    await office.importFiles([f]); await office.importFiles([f]);
    if(office.eval('data.records.length')!==1) throw new Error(office.eval('data.records.length'));
  });
  await run('事務所：集計と数量あたりの人工', () => {
    office.eval("data.kousyu=[{name:'フローリング張り',unit:'㎡'}]");
    office.showTab('sum');
    office.setQty('甲様邸','フローリング張り','40');
    const s = office.summarize()[0];
    if(Math.abs(s.total-2)>1e-9 || Math.abs(s.rate-0.05)>1e-9) throw new Error(JSON.stringify(s));
    if(!od.getElementById('sumTbl').textContent.includes('0.05人工／㎡')) throw new Error(od.getElementById('sumTbl').textContent);
  });
  await run('事務所：見積（100㎡→5人工）', () => {
    od.getElementById('estKou').value='フローリング張り'; od.getElementById('estQty').value='100'; office.calcEst();
    if(od.getElementById('estOut').textContent!=='5人工') throw new Error(od.getElementById('estOut').textContent);
  });
  await run('CSV書き出し', async () => {
    downloads = []; office.exportCsv();
    const t = await blobText(downloads[0]);
    if(!t.includes('甲様邸') || !t.includes('日付,物件,工種')) throw new Error(t.slice(0,80));
  });
  await run('配布用ファイル：設定が入り、開くと読み込まれる（記録は残る）', async () => {
    downloads = [];
    office.eval("data.props=['丙様邸']"); office.buildDistFile();
    const dist = await blobText(downloads[0]);
    if(!dist.includes('丙様邸')) throw new Error('設定が入っていない');
    const st = {genba_kosu: w.localStorage.getItem('genba_kosu'), genba_kosu_who:'大工A'};
    const w2 = open(dist, st);
    if(w2.eval('data.props.join()')!=='丙様邸') throw new Error(w2.eval('data.props.join()'));
    if(w2.eval('data.records.length')!==1) throw new Error('記録が消えた');
    // 配布用ファイルからもう一度作れる
    downloads = []; w2.eval("data.props=['丁様邸']"); w2.buildDistFile();
    if(!(await blobText(downloads[0])).includes('丁様邸')) throw new Error('作り直せない');
  });
  await run('記録の削除', () => { const id = w.eval('data.records[0].id'); w.delRecord(id); if(w.eval('data.records.length')!==0) throw new Error('残った'); });

  if(errors.length) console.log(errors.join('\n'));
  console.log(errors.length ? `\n❌ ${errors.length}件の失敗` : '\nすべて成功');
  process.exitCode = errors.length ? 1 : 0;
})();
