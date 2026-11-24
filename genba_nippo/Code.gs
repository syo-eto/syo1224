/**
 * 大工日報（現場作業日報アプリ）— Google Apps Script
 *
 * スプレッドシートに紐づけて使う（スプレッドシートの「拡張機能 → Apps Script」に貼る）。
 * 大工さんは Web アプリ（index.html）から日報を送り、この表にたまる。
 * 時給・単価はこの表の中だけにあり、Web アプリには送らない。
 */

var APP_VERSION = '0.1.0';
// 独立した Apps Script プロジェクトとして使うときに開くスプレッドシート（スプレッドシートの「拡張機能 → Apps Script」に貼ったときは使わない）
var SPREADSHEET_ID = '1qAYpwPwqDHQFj-2kVYcP9w1H-VHUEp5cpqGn2DvMQUU';
var TZ = 'Asia/Tokyo';
var MAX_HOURS_PER_DAY = 24;

// シート名と見出し
var SHEETS = {
  sites:     { name: '現場',       head: ['現場ID', '現場名', '種別（新築／リノベ）', '状態（着工前／進行中／完工）', 'メモ'] },
  workers:   { name: '作業員',     head: ['作業員ID', '氏名', '有効（TRUE／FALSE）', '暗証番号（4桁・任意）', '時給（円）'] },
  works:     { name: '作業内容',   head: ['作業ID', '種別（新築／リノベ）', '工種', '作業内容', '単位（数量なしは ―）', '並び順', 'ANDPAD の工程名'] },
  specs:     { name: '仕様項目',   head: ['作業ID', '項目', '選択肢（／区切り。空なら自由入力）', '並び順'] },
  materials: { name: '材料',       head: ['材料ID', '材料名', '規格', '単位', '単価（円）', 'いつからの単価か', '有効（TRUE／FALSE）'] },
  reports:   { name: '日報',       head: ['日報ID', '日付', '作業員ID', '氏名', '最初の送信', '最後の送信', '合計時間'] },
  lines:     { name: '日報_作業',  head: ['日報ID', '日付', '作業員ID', '氏名', '現場ID', '現場名', '種別', '作業ID', '工種', '作業内容', '仕様', '時間', '数量', '単位'] },
  mats:      { name: '日報_材料',  head: ['日報ID', '日付', '作業員ID', '氏名', '現場ID', '現場名', '材料ID', '材料名', '数量', '単位'] },
  summary:   { name: '歩掛',       head: ['種別', '工種', '作業内容', '仕様', '単位', '合計時間', '数量を入れた時間', '合計数量', '時間／数量', '行数', '現場数', '最後の日付'] }
};

var ALL_SPECS = '（仕様をまとめた全体）';
var SPEC_SEP = '、';   // 日報_作業「仕様」の項目の区切り（例：無垢／複合：無垢、材種：オーク）

// 作業項目の初期値（要件定義「作業項目の例」と「単位の設定」2026-11-24 の版。リノベは利用者の「フルリノベ大工作業」の一覧から、2つの作業が並ぶ項目は分けた）。
// [種別, 作業内容, 単位, 仕様（「項目（選択肢／…）」を「・」でつなぐ）, ANDPAD の工程名]
var SEED_WORKS = [
  ['新築', '土台敷き', '本', '樹種（ヒノキ／ヒバ／防腐注入材）・断面（105角／120角）', '土台・柱調整'],
  ['新築', '建方（上棟）', '坪', '構法（在来／金物工法）・階数（平屋／2階）・屋根形状（切妻／寄棟／片流れ）', ''],
  ['新築', '間柱取付', '本', '断面（27×105／30×105）', '間柱筋交い・金物取付'],
  ['新築', '筋かい取付', '本', '断面（30×90／45×90）・たすき掛け（あり／なし）', '間柱筋交い・金物取付'],
  ['新築', '金物取付', 'カ所', '種類（ホールダウン／筋かい金物／羽子板ボルト／柱頭柱脚金物）', '間柱筋交い・金物取付'],
  ['新築', '床合板', '枚', '合板厚（24mm／28mm）・根太（あり／なし）', '床合板'],
  ['新築', '耐力壁（面材）', '枚', '種類（構造用合板／無機系面材）', ''],
  ['新築', 'サッシ取付', 'カ所', '大きさ（小窓／腰窓／掃き出し）・開き方（引違い／すべり出し／FIX）', 'サッシ取付'],
  ['新築', '窓枠取付', 'カ所', '材（集成材／無垢／樹脂）・大きさ（小窓／腰窓／掃き出し）', '窓枠取付'],
  ['新築', '断熱材（床）', '枚', '断熱材（押出法ポリスチレン／フェノールフォーム）・厚み', ''],
  ['新築', '床張り（フローリング）', 'ケース', '無垢／複合・材種（オーク／パイン／スギ）・厚み（12／15／30mm）・幅（75／90／120／303mm）・張り方（直張り／捨て張り）・床暖房（対応／なし）', '床張り、床貼り②'],
  ['新築', '天井下地', '本', '下地（木／軽鉄）', '天井下地'],
  ['新築', '天井ボード張り', '枚', 'ボード厚（9.5／12.5mm）', '天井ﾎﾞｰﾄﾞ張り'],
  ['新築', '壁下地', '本', '下地（木／軽鉄）', '壁下地'],
  ['新築', '壁PB張り', '枚', 'ボード厚（9.5／12.5mm）・張り方（1枚／2枚）', 'ＰＢ張り'],
  ['新築', '羽目板張り', '枚', '部位（壁／天井）・材種・張り方向（縦／横）', ''],
  ['新築', '階段掛け', 'カ所', '形（直／かね折れ／回り）・既製／造作・材（集成材／無垢）', '階段掛け'],
  ['新築', '内部造作', 'カ所', '種類（棚／中段／枕棚／カウンター／収納）・大きさ（小／中／大）', '内部造作'],
  ['新築', '建具枠取付', 'カ所', '種類（開き戸／引戸／クローゼット）・既製／造作', ''],
  ['新築', '巾木取付', '本', '材（木／樹脂）', '巾木取付'],
  ['新築', '引上げ清掃', '回', '', '引上げ清掃'],
  ['新築', '準備', '―', '', ''],
  ['新築', '片付け', '―', '', ''],
  ['新築', '手直し', '―', '', ''],
  ['リノベ', '柱交換', '本', '樹種（ヒノキ／スギ／集成材）・断面（105角／120角）', '土台・柱調整'],
  ['リノベ', '梁補強', 'カ所', '方法（添え梁／金物／交換）', ''],
  ['リノベ', '柱タチ調整', 'カ所', '', '土台・柱調整'],
  ['リノベ', '筋交い', '本', '断面（30×90／45×90）・たすき掛け（あり／なし）・新設／補強', '間柱筋交い・金物取付'],
  ['リノベ', '金物', 'カ所', '種類（ホールダウン／筋かい金物／羽子板ボルト／柱頭柱脚金物）・新設／補強', '間柱筋交い・金物取付'],
  ['リノベ', '土台', '本', '内容（交換／補修／レベル調整）・樹種（ヒノキ／ヒバ／防腐注入材）', '土台・柱調整'],
  ['リノベ', '大引', '本', '内容（交換／新設／補修）', ''],
  ['リノベ', '根太', '本', '内容（新設／補強）・ピッチ（303／455）', ''],
  ['リノベ', '床断熱材', '枚', '断熱材（押出法ポリスチレン／フェノールフォーム）・厚み', ''],
  ['リノベ', '床合板', '枚', '合板厚（24mm／28mm）・既存の床（撤去後／重ね張り）', '床合板'],
  ['リノベ', '間柱', '本', '断面（27×105／30×105）・新設／補強', '間柱筋交い・金物取付'],
  ['リノベ', '壁調整', 'カ所', '', ''],
  ['リノベ', '外部壁下地', '枚', '下地（胴縁／面材）', ''],
  ['リノベ', '外部屋根下地', '枚', '下地材（合板12mm／15mm）・勾配（〜4寸／5寸以上）', ''],
  ['リノベ', 'サッシ取付け', 'カ所', '大きさ（小窓／腰窓／掃き出し）・開き方（引違い／すべり出し／FIX）・開口（既存開口／新規開口）', 'サッシ取付'],
  ['リノベ', '窓枠取付け', 'カ所', '材（集成材／無垢／樹脂）・大きさ（小窓／腰窓／掃き出し）', '窓枠取付'],
  ['リノベ', '外部軒天下地', '本', '', ''],
  ['リノベ', '外部軒天張り', '枚', '材（ケイカル板／杉板）', ''],
  ['リノベ', '外部壁杉板', '枚', '張り方向（縦／横）・張り方（目板／鎧張り）', ''],
  ['リノベ', '外部庇造作', 'カ所', '大きさ（小／中／大）', ''],
  ['リノベ', 'フロア張り', 'ケース', '無垢／複合・材種（オーク／パイン／スギ）・厚み（12／15／30mm）・幅（75／90／120／303mm）・張り方（直張り／捨て張り／既存床に重ね張り）・床暖房（対応／なし）', '床張り、床貼り②'],
  ['リノベ', '建具枠取付', 'カ所', '種類（開き戸／引戸／クローゼット）・既製／造作・新設／既存の調整', ''],
  ['リノベ', '天井下地', '本', '', '天井下地'],
  ['リノベ', '天井PB張り', '枚', 'ボード厚（9.5／12.5mm）', '天井ﾎﾞｰﾄﾞ張り'],
  ['リノベ', '壁下地', '本', '下地（新設／既存を生かす）', '壁下地'],
  ['リノベ', '壁PB張り', '枚', 'ボード厚（9.5／12.5mm）・張り方（1枚／2枚）', 'ＰＢ張り'],
  ['リノベ', '階段施工', 'カ所', '形（直／かね折れ／回り）・既製／造作・新設／既存の掛け替え', '階段掛け'],
  ['リノベ', '内部造作', 'カ所', '種類（棚／中段／枕棚／カウンター／収納）・大きさ（小／中／大）', '内部造作'],
  ['リノベ', '巾木', '本', '材（木／樹脂）', '巾木取付'],
  ['リノベ', '清掃', '回', '', '引上げ清掃']
];

/* ───────────── Web アプリ ───────────── */

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('大工日報')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function onOpen() {
  // スプレッドシートに組み込んだときだけメニューが出る（独立したプロジェクトでは呼ばれない）
  SpreadsheetApp.getUi().createMenu('大工日報')
    .addItem('初期設定（シートを作る）', 'setup')
    .addItem('歩掛を計算し直す', 'updateSummary')
    .addToUi();
}

/** 入力画面に渡す一覧。時給・単価・暗証番号そのものは渡さない。 */
function getMaster() {
  var sites = readObjects_(SHEETS.sites).filter(function (s) {
    return s['現場ID'] && String(s['状態（着工前／進行中／完工）']).trim() === '進行中';
  }).map(function (s) {
    return { id: String(s['現場ID']), name: String(s['現場名']), kind: kindOf_(s['種別（新築／リノベ）']) };
  });
  var workers = readObjects_(SHEETS.workers).filter(function (w) {
    return w['作業員ID'] && isOn_(w['有効（TRUE／FALSE）']);
  }).map(function (w) {
    return { id: String(w['作業員ID']), name: String(w['氏名']), hasPin: String(w['暗証番号（4桁・任意）']).trim() !== '' };
  });
  var specsByWork = {};
  readObjects_(SHEETS.specs).forEach(function (s) {
    var id = String(s['作業ID']);
    if (!id || !s['項目']) return;
    (specsByWork[id] = specsByWork[id] || []).push({
      name: String(s['項目']),
      choices: splitChoices_(s['選択肢（／区切り。空なら自由入力）']),
      order: Number(s['並び順']) || 0
    });
  });
  var works = readObjects_(SHEETS.works).filter(function (w) { return w['作業ID'] && w['作業内容']; })
    .map(function (w) {
      var id = String(w['作業ID']);
      var specs = (specsByWork[id] || []).sort(function (a, b) { return a.order - b.order; })
        .map(function (s) { return { name: s.name, choices: s.choices }; });
      return { id: id, kind: kindOf_(w['種別（新築／リノベ）']), kousyu: String(w['工種'] || '大工工事'),
               name: String(w['作業内容']), unit: String(w['単位（数量なしは ―）'] || ''), order: Number(w['並び順']) || 0, specs: specs };
    }).sort(function (a, b) { return a.order - b.order; });
  var materials = readObjects_(SHEETS.materials).filter(function (m) {
    return m['材料ID'] && m['材料名'] && String(m['有効（TRUE／FALSE）']).trim() !== 'FALSE';
  }).map(function (m) {
    return { id: String(m['材料ID']), name: String(m['材料名']), spec: String(m['規格'] || ''), unit: String(m['単位'] || '') };
  });
  return { version: APP_VERSION, today: today_(), sites: sites, workers: workers, works: works, materials: materials };
}

/** その日の自分の日報（あれば）。当日に送ったものだけ直せる。 */
function loadReport(workerId, pin, date) {
  var worker = checkWorker_(workerId, pin);
  date = normDate_(date);
  var rep = findReport_(worker.id, date);
  if (!rep) return { exists: false, editable: true };
  var editable = toYmd_(rep['最初の送信']) === today_();
  var lines = readObjects_(SHEETS.lines).filter(function (l) { return String(l['日報ID']) === rep.id; })
    .map(function (l) {
      return { siteId: String(l['現場ID']), workId: String(l['作業ID']), spec: parseSpecText_(l['仕様']),
               hours: Number(l['時間']) || 0, qty: l['数量'] === '' ? '' : Number(l['数量']) };
    });
  var mats = readObjects_(SHEETS.mats).filter(function (m) { return String(m['日報ID']) === rep.id; })
    .map(function (m) { return { siteId: String(m['現場ID']), materialId: String(m['材料ID']), qty: Number(m['数量']) || 0 }; });
  return { exists: true, editable: editable, lines: lines, materials: mats };
}

/**
 * 日報を受け取る。payload = {workerId, pin, date, lines:[{siteId, workId, spec:{項目:値}, hours, qty}], materials:[{siteId, materialId, qty}]}
 * 同じ人・同じ日付の日報は、最初に送った日のうちなら上書きできる。
 */
function submitReport(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var master = getMasterFull_();
    var worker = checkWorker_(payload.workerId, payload.pin);
    var clean = validateReport_(payload, master, today_());
    var existing = findReport_(worker.id, clean.date);
    var now = nowText_();
    var repId, firstSent = now;
    if (existing) {
      if (toYmd_(existing['最初の送信']) !== today_()) {
        throw new Error(clean.date + ' の日報は送信済みです。直すときは管理者に連絡してください。');
      }
      repId = existing.id;
      firstSent = existing['最初の送信'];
      deleteRowsWhere_(SHEETS.reports, function (r) { return String(r['日報ID']) === repId; });
      deleteRowsWhere_(SHEETS.lines, function (r) { return String(r['日報ID']) === repId; });
      deleteRowsWhere_(SHEETS.mats, function (r) { return String(r['日報ID']) === repId; });
    } else {
      repId = 'R' + clean.date.replace(/-/g, '') + '-' + worker.id;
    }
    var total = clean.lines.reduce(function (a, l) { return a + l.hours; }, 0);
    sheet_(SHEETS.reports).appendRow([repId, clean.date, worker.id, worker.name, firstSent, now, total]);
    var lineRows = clean.lines.map(function (l) {
      return [repId, clean.date, worker.id, worker.name, l.site.id, l.site.name, l.site.kind, l.work.id, l.work.kousyu,
              l.work.name, l.specText, l.hours, l.qty, l.work.unit];
    });
    appendRows_(SHEETS.lines, lineRows);
    appendRows_(SHEETS.mats, clean.materials.map(function (m) {
      return [repId, clean.date, worker.id, worker.name, m.site.id, m.site.name, m.material.id, m.material.name, m.qty, m.material.unit];
    }));
    updateSummary();
    return { ok: true, reportId: repId, updated: !!existing, date: clean.date, totalHours: total,
             lines: clean.lines.map(function (l) {
               return { site: l.site.name, work: l.work.name, spec: l.specText, hours: l.hours, qty: l.qty, unit: l.work.unit };
             }) };
  } finally {
    lock.releaseLock();
  }
}

/* ───────────── 入力の確認 ───────────── */

function validateReport_(p, master, today) {
  if (!p || typeof p !== 'object') throw new Error('送信内容が空です。');
  var date = normDate_(p.date);
  if (!date) throw new Error('日付を選んでください。');
  if (date > today) throw new Error('先の日付の日報は送れません。');
  var lines = Array.isArray(p.lines) ? p.lines : [];
  if (!lines.length) throw new Error('作業を1つ以上入れてください。');
  var total = 0;
  var cleanLines = lines.map(function (l, i) {
    var n = (i + 1) + '行目：';
    var site = master.sitesById[String(l.siteId)];
    if (!site) throw new Error(n + '現場を選んでください。');
    var work = master.worksById[String(l.workId)];
    if (!work) throw new Error(n + '作業内容を選んでください。');
    if (work.kind !== site.kind) throw new Error(n + '「' + work.name + '」は' + site.kind + 'の作業ではありません。');
    var hours = Number(l.hours);
    if (!(hours >= 1 && hours <= MAX_HOURS_PER_DAY && Math.floor(hours) === hours)) throw new Error(n + '時間を選んでください（1時間刻み）。');
    total += hours;
    var qty = '';
    if (work.unit && work.unit !== '―') {
      if (l.qty === '' || l.qty === null || l.qty === undefined) throw new Error(n + '数量（' + work.unit + '）を入れてください。');
      qty = Number(l.qty);
      if (!(qty >= 0) || !isFinite(qty)) throw new Error(n + '数量は0以上の数で入れてください。');
    }
    var spec = l.spec || {};
    var specParts = work.specs.map(function (s) {
      var v = spec[s.name] === undefined || spec[s.name] === null ? '' : String(spec[s.name]).trim();
      if (!v) throw new Error(n + '「' + s.name + '」を選んでください。');
      if (v.length > 50) throw new Error(n + '「' + s.name + '」が長すぎます。');
      return s.name + '：' + v.replace(/[、：]/g, ' ');
    });
    return { site: site, work: work, hours: hours, qty: qty, specText: specParts.join(SPEC_SEP) };
  });
  if (total > MAX_HOURS_PER_DAY) throw new Error('1日の合計が' + MAX_HOURS_PER_DAY + '時間を超えています。');
  var mats = (Array.isArray(p.materials) ? p.materials : []).filter(function (m) { return m && m.materialId; })
    .map(function (m, i) {
      var n = '材料' + (i + 1) + '行目：';
      var site = master.sitesById[String(m.siteId)];
      if (!site) throw new Error(n + '現場を選んでください。');
      var material = master.materialsById[String(m.materialId)];
      if (!material) throw new Error(n + '材料を選んでください。');
      var qty = Number(m.qty);
      if (!(qty > 0) || !isFinite(qty)) throw new Error(n + '数量を入れてください。');
      return { site: site, material: material, qty: qty };
    });
  return { date: date, lines: cleanLines, materials: mats };
}

function getMasterFull_() {
  var m = getMaster();
  var idx = function (arr) { var o = {}; arr.forEach(function (x) { o[x.id] = x; }); return o; };
  return { sitesById: idx(m.sites), worksById: idx(m.works), materialsById: idx(m.materials) };
}

function checkWorker_(workerId, pin) {
  var rows = readObjects_(SHEETS.workers);
  for (var i = 0; i < rows.length; i++) {
    var w = rows[i];
    if (String(w['作業員ID']) !== String(workerId) || !isOn_(w['有効（TRUE／FALSE）'])) continue;
    var want = String(w['暗証番号（4桁・任意）']).trim();
    if (want && String(pin || '').trim() !== want) throw new Error('暗証番号が違います。');
    return { id: String(w['作業員ID']), name: String(w['氏名']) };
  }
  throw new Error('名前を選んでください。');
}

function findReport_(workerId, date) {
  var rows = readObjects_(SHEETS.reports);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['作業員ID']) === workerId && toYmd_(rows[i]['日付']) === date) {
      rows[i].id = String(rows[i]['日報ID']);
      return rows[i];
    }
  }
  return null;
}

/* ───────────── 歩掛（集計） ───────────── */

/** 日報_作業 から、種別×作業内容×仕様ごとの「時間／数量」を作り直す。 */
function updateSummary() {
  var rows = summarizeLines_(readObjects_(SHEETS.lines));
  var sh = sheet_(SHEETS.summary);
  sh.clearContents();
  var out = [SHEETS.summary.head].concat(rows);
  sh.getRange(1, 1, out.length, SHEETS.summary.head.length).setValues(out);
  return rows.length;
}

function summarizeLines_(lines) {
  var groups = {};
  var add = function (key, base, l) {
    var g = groups[key] || (groups[key] = { base: base, hours: 0, qHours: 0, qty: 0, n: 0, sites: {}, last: '' });
    var h = Number(l['時間']) || 0, q = l['数量'] === '' ? 0 : Number(l['数量']) || 0;
    g.hours += h; g.n += 1; g.sites[String(l['現場ID'])] = 1;
    if (q > 0) { g.qHours += h; g.qty += q; }
    var d = toYmd_(l['日付']); if (d > g.last) g.last = d;
  };
  lines.forEach(function (l) {
    var kind = String(l['種別']), work = String(l['作業内容']), unit = String(l['単位'] || ''), kousyu = String(l['工種'] || '');
    var spec = String(l['仕様'] || '');
    add([kind, work, ALL_SPECS].join('\u0001'), [kind, kousyu, work, ALL_SPECS, unit], l);
    if (spec) add([kind, work, spec].join('\u0001'), [kind, kousyu, work, spec, unit], l);
  });
  return Object.keys(groups).sort().map(function (k) {
    var g = groups[k];
    var rate = g.qty > 0 ? Math.round(g.qHours / g.qty * 1000) / 1000 : '';
    return g.base.concat([g.hours, g.qHours, g.qty, rate, g.n, Object.keys(g.sites).length, g.last]);
  });
}

/* ───────────── 初期設定 ───────────── */

/** シートを作り、作業内容・仕様項目が空なら初期値を入れる。何度実行してもよい。 */
function setup() {
  Object.keys(SHEETS).forEach(function (k) { sheet_(SHEETS[k]); });
  if (readObjects_(SHEETS.works).length === 0) {
    var works = [], specs = [];
    SEED_WORKS.forEach(function (w, i) {
      var id = (w[0] === '新築' ? 'N' : 'R') + ('0' + (i + 1)).slice(-2);
      works.push([id, w[0], '大工工事', w[1], w[2], i + 1, w[4]]);
      parseSpecDef_(w[3]).forEach(function (s, j) { specs.push([id, s.name, s.choices.join('／'), j + 1]); });
    });
    appendRows_(SHEETS.works, works);
    appendRows_(SHEETS.specs, specs);
  }
  return 'ok';
}

/** 「樹種（ヒノキ／ヒバ）・既製／造作・厚み」→ [{name:'樹種',choices:[…]},{name:'既製／造作',choices:['既製','造作']},{name:'厚み',choices:[]}] */
function parseSpecDef_(text) {
  text = String(text || '').trim();
  if (!text) return [];
  var parts = [], depth = 0, cur = '';
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (c === '（' || c === '(') depth++;
    if (c === '）' || c === ')') depth--;
    if (c === '・' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts.map(function (p) { return p.trim(); }).filter(String).map(function (p) {
    var m = p.match(/^(.*?)[（(](.*)[）)]$/);
    if (m) return { name: m[1].trim(), choices: carryUnit_(splitChoices_(m[2])) };
    if (p.indexOf('／') >= 0) return { name: p, choices: splitChoices_(p) };
    return { name: p, choices: [] };
  });
}

/** 「12／15／30mm」のように最後だけ単位があるとき、数字だけの選択肢にも単位を付ける。 */
function carryUnit_(choices) {
  var m = String(choices[choices.length - 1] || '').match(/^[\d.]+([^\d.].*)$/);
  if (!m) return choices;
  return choices.map(function (c) { return /^[\d.]+$/.test(c) ? c + m[1] : c; });
}

/* ───────────── 共通 ───────────── */

function splitChoices_(v) {
  return String(v || '').split('／').map(function (s) { return s.replace(/\s*など$/, '').trim(); }).filter(String);
}

function parseSpecText_(text) {
  var o = {};
  String(text || '').split(SPEC_SEP).forEach(function (p) {
    var i = p.indexOf('：');
    if (i > 0) o[p.slice(0, i)] = p.slice(i + 1);
  });
  return o;
}

function kindOf_(v) { return String(v || '').indexOf('リノベ') >= 0 ? 'リノベ' : '新築'; }
function isOn_(v) { var s = String(v).trim().toUpperCase(); return s !== 'FALSE' && s !== '0' && s !== '無効'; }

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowText_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

function toYmd_(v) {
  if (v && typeof v === 'object' && typeof v.getTime === 'function') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v || '').trim().replace(/\//g, '-');
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

function normDate_(v) { return toYmd_(v); }

function sheet_(def) {
  var ss = book_();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function book_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
}

function readObjects_(def) {
  var values = sheet_(def).getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0];
  return values.slice(1).filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); })
    .map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i] === undefined ? '' : r[i]; }); return o; });
}

function appendRows_(def, rows) {
  if (!rows.length) return;
  var sh = sheet_(def);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function deleteRowsWhere_(def, pred) {
  var sh = sheet_(def);
  var values = sh.getDataRange().getValues();
  var head = values[0];
  for (var i = values.length - 1; i >= 1; i--) {
    var o = {}; head.forEach(function (h, j) { o[h] = values[i][j]; });
    if (pred(o)) sh.deleteRow(i + 1);
  }
}
