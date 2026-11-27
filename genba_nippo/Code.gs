/**
 * 大工日報（現場作業日報アプリ）— Google Apps Script
 *
 * スプレッドシートに紐づけて使う（スプレッドシートの「拡張機能 → Apps Script」に貼る）。
 * 大工さんは Web アプリ（index.html）から日報を送り、この表にたまる。
 * 入力は 日付・現場・作業内容・時間・材料・数量 だけ（2026-11-24 決定）。
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
  workers:   { name: '作業員',     head: ['作業員ID', '氏名', '有効（TRUE／FALSE）', '暗証番号（4桁・任意）', '時給（円）', 'メールアドレス（会社）'] },
  works:     { name: '作業内容',   head: ['作業ID', '種別（新築／リノベ）', '工種', '作業内容', '単位（数量なしは ―）', '並び順', 'ANDPAD の工程名'] },
  materials: { name: '材料',       head: ['材料ID', '材料名', '規格', '単位', '単価（円）', 'いつからの単価か', '有効（TRUE／FALSE）', '使う作業（作業内容を「、」で区切る。空ならすべて）'] },
  reports:   { name: '日報',       head: ['日報ID', '日付', '作業員ID', '氏名', '最初の送信', '最後の送信', '合計時間'] },
  lines:     { name: '日報_作業',  head: ['日報ID', '日付', '作業員ID', '氏名', '現場ID', '現場名', '種別', '作業ID', '工種', '作業内容', '材料', '時間', '数量', '単位', '材料ID'] },
  summary:   { name: '歩掛',       head: ['種別', '工種', '作業内容', '材料', '単位', '合計時間', '数量を入れた時間', '合計数量', '時間／数量', '行数', '現場数', '最後の日付'] }
};

var ALL_MATERIALS = '（材料をまとめた全体）';
var MAT_OTHER = '__other__';   // 一覧に無い材料（大工さんが書く）
var MAT_NONE = '__none__';     // 材料なし

// 作業項目の初期値（要件定義「作業項目の例」と「単位の設定」2026-11-24 の版。リノベは利用者の「フルリノベ大工作業」の一覧から、2つの作業が並ぶ項目は分けた）。
// [種別, 作業内容, 数量の単位, ANDPAD の工程名]
var SEED_WORKS = [
  ['新築', '土台敷き', '本', '土台・柱調整'],
  ['新築', '建方（上棟）', '坪', ''],
  ['新築', '間柱取付', '本', '間柱筋交い・金物取付'],
  ['新築', '筋かい取付', '本', '間柱筋交い・金物取付'],
  ['新築', '金物取付', 'カ所', '間柱筋交い・金物取付'],
  ['新築', '床合板', '枚', '床合板'],
  ['新築', '耐力壁（面材）', '枚', ''],
  ['新築', 'サッシ取付', 'カ所', 'サッシ取付'],
  ['新築', '窓枠取付', 'カ所', '窓枠取付'],
  ['新築', '断熱材（床）', '枚', ''],
  ['新築', '床張り（フローリング）', 'ケース', '床張り、床貼り②'],
  ['新築', '天井下地', '本', '天井下地'],
  ['新築', '天井ボード張り', '枚', '天井ﾎﾞｰﾄﾞ張り'],
  ['新築', '壁下地', '本', '壁下地'],
  ['新築', '壁PB張り', '枚', 'ＰＢ張り'],
  ['新築', '羽目板張り', '枚', ''],
  ['新築', '階段掛け', 'カ所', '階段掛け'],
  ['新築', '内部造作', 'カ所', '内部造作'],
  ['新築', '建具枠取付', 'カ所', ''],
  ['新築', '巾木取付', '本', '巾木取付'],
  ['新築', '引上げ清掃', '回', '引上げ清掃'],
  ['新築', '準備', '―', ''],
  ['新築', '片付け', '―', ''],
  ['新築', '手直し', '―', ''],
  ['リノベ', '柱交換', '本', '土台・柱調整'],
  ['リノベ', '梁補強', 'カ所', ''],
  ['リノベ', '柱タチ調整', 'カ所', '土台・柱調整'],
  ['リノベ', '筋交い', '本', '間柱筋交い・金物取付'],
  ['リノベ', '金物', 'カ所', '間柱筋交い・金物取付'],
  ['リノベ', '土台', '本', '土台・柱調整'],
  ['リノベ', '大引', '本', ''],
  ['リノベ', '根太', '本', ''],
  ['リノベ', '床断熱材', '枚', ''],
  ['リノベ', '床合板', '枚', '床合板'],
  ['リノベ', '間柱', '本', '間柱筋交い・金物取付'],
  ['リノベ', '壁調整', 'カ所', ''],
  ['リノベ', '外部壁下地', '枚', ''],
  ['リノベ', '外部屋根下地', '枚', ''],
  ['リノベ', 'サッシ取付け', 'カ所', 'サッシ取付'],
  ['リノベ', '窓枠取付け', 'カ所', '窓枠取付'],
  ['リノベ', '外部軒天下地', '本', ''],
  ['リノベ', '外部軒天張り', '枚', ''],
  ['リノベ', '外部壁杉板', '枚', ''],
  ['リノベ', '外部庇造作', 'カ所', ''],
  ['リノベ', 'フロア張り', 'ケース', '床張り、床貼り②'],
  ['リノベ', '建具枠取付', 'カ所', ''],
  ['リノベ', '天井下地', '本', '天井下地'],
  ['リノベ', '天井PB張り', '枚', '天井ﾎﾞｰﾄﾞ張り'],
  ['リノベ', '壁下地', '本', '壁下地'],
  ['リノベ', '壁PB張り', '枚', 'ＰＢ張り'],
  ['リノベ', '階段施工', 'カ所', '階段掛け'],
  ['リノベ', '内部造作', 'カ所', '内部造作'],
  ['リノベ', '巾木', '本', '巾木取付'],
  ['リノベ', '清掃', '回', '引上げ清掃']
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
  var email = currentEmail_();
  var me = findWorkerByEmail_(email);
  var works = readObjects_(SHEETS.works).filter(function (w) { return w['作業ID'] && w['作業内容']; })
    .map(function (w) {
      return { id: String(w['作業ID']), kind: kindOf_(w['種別（新築／リノベ）']), kousyu: String(w['工種'] || '大工工事'),
               name: String(w['作業内容']), unit: String(w['単位（数量なしは ―）'] || ''), order: Number(w['並び順']) || 0 };
    }).sort(function (a, b) { return a.order - b.order; });
  var materials = readObjects_(SHEETS.materials).filter(function (m) {
    return m['材料ID'] && m['材料名'] && String(m['有効（TRUE／FALSE）']).trim() !== 'FALSE';
  }).map(function (m) {
    var forWorks = String(m['使う作業（作業内容を「、」で区切る。空ならすべて）'] || '').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(String);
    return { id: String(m['材料ID']), name: matLabel_(m['材料名'], m['規格']), unit: String(m['単位'] || ''), works: forWorks };
  });
  return { version: APP_VERSION, today: today_(), email: email, me: me, sites: sites, works: works, materials: materials };
}

/** その日の自分の日報（あれば）。当日に送ったものだけ直せる。 */
function loadReport(date) {
  var worker = currentWorker_();
  date = normDate_(date);
  var rep = findReport_(worker.id, date);
  if (!rep) return { exists: false, editable: true };
  var editable = toYmd_(rep['最初の送信']) === today_();
  var lines = readObjects_(SHEETS.lines).filter(function (l) { return String(l['日報ID']) === rep.id; })
    .map(function (l) {
      var mid = String(l['材料ID'] || ''), mname = String(l['材料'] || '');
      return { siteId: String(l['現場ID']), workId: String(l['作業ID']),
               materialId: mid || (mname && mname !== 'なし' ? MAT_OTHER : (mname === 'なし' ? MAT_NONE : '')),
               materialText: mid ? '' : (mname === 'なし' ? '' : mname),
               hours: Number(l['時間']) || 0, qty: l['数量'] === '' ? '' : Number(l['数量']) };
    });
  return { exists: true, editable: editable, lines: lines };
}

/**
 * 日報を受け取る。送った人はログイン中の会社アカウントで決まる。payload = {date, lines:[{siteId, workId, hours, materialId（材料ID／__other__／__none__）, materialText, qty}]}
 * 同じ人・同じ日付の日報は、最初に送った日のうちなら上書きできる。
 */
function submitReport(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var master = getMasterFull_();
    var worker = currentWorker_();
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
    } else {
      repId = 'R' + clean.date.replace(/-/g, '') + '-' + worker.id;
    }
    var total = clean.lines.reduce(function (a, l) { return a + l.hours; }, 0);
    sheet_(SHEETS.reports).appendRow([repId, clean.date, worker.id, worker.name, firstSent, now, total]);
    var lineRows = clean.lines.map(function (l) {
      return [repId, clean.date, worker.id, worker.name, l.site.id, l.site.name, l.site.kind, l.work.id, l.work.kousyu,
              l.work.name, l.materialName, l.hours, l.qty, l.work.unit, l.materialId];
    });
    appendRows_(SHEETS.lines, lineRows);
    updateSummary();
    return { ok: true, reportId: repId, updated: !!existing, date: clean.date, totalHours: total,
             lines: clean.lines.map(function (l) {
               return { site: l.site.name, work: l.work.name, material: l.materialName, hours: l.hours, qty: l.qty, unit: l.work.unit };
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
    var mid = String(l.materialId || ''), materialId = '', materialName = '';
    if (mid === MAT_NONE) materialName = 'なし';
    else if (mid === MAT_OTHER) {
      materialName = String(l.materialText || '').trim();
      if (!materialName) throw new Error(n + '材料を書いてください。');
      if (materialName.length > 50) throw new Error(n + '材料の名前が長すぎます。');
    } else if (mid) {
      var mat = master.materialsById[mid];
      if (!mat) throw new Error(n + '材料を選び直してください。');
      materialId = mat.id; materialName = mat.name;
    } else if (work.unit && work.unit !== '―') {
      throw new Error(n + '材料を選んでください（使っていなければ「なし」）。');
    }
    return { site: site, work: work, hours: hours, qty: qty, materialId: materialId, materialName: materialName };
  });
  if (total > MAX_HOURS_PER_DAY) throw new Error('1日の合計が' + MAX_HOURS_PER_DAY + '時間を超えています。');
  return { date: date, lines: cleanLines };
}

function getMasterFull_() {
  var m = getMaster();
  var idx = function (arr) { var o = {}; arr.forEach(function (x) { o[x.id] = x; }); return o; };
  return { sitesById: idx(m.sites), worksById: idx(m.works), materialsById: idx(m.materials) };
}

/** ログイン中の会社アカウントのアドレス（「kokorosya.co.jp 内の全員」で公開したときに取れる）。 */
function currentEmail_() {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) { e = ''; }
  return String(e || '').trim().toLowerCase();
}

/** 「作業員」シートの F列（メールアドレス）から本人を探す。有効でない人・見つからないときは null。 */
function findWorkerByEmail_(email) {
  if (!email) return null;
  var rows = readObjects_(SHEETS.workers);
  for (var i = 0; i < rows.length; i++) {
    var w = rows[i];
    if (String(w['メールアドレス（会社）'] || '').trim().toLowerCase() === email && w['作業員ID'] && isOn_(w['有効（TRUE／FALSE）'])) {
      return { id: String(w['作業員ID']), name: String(w['氏名']) };
    }
  }
  return null;
}

function currentWorker_() {
  var email = currentEmail_();
  if (!email) throw new Error('会社の Google アカウントでログインしてから開いてください。');
  var w = findWorkerByEmail_(email);
  if (!w) throw new Error(email + ' は作業員に登録されていません。管理者に連絡してください。');
  return w;
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

/** 日報_作業 から、種別×作業内容×材料ごとの「時間／数量」を作り直す。 */
function updateSummary() {
  var rows = summarizeLines_(readObjects_(SHEETS.lines));
  var sh = sheet_(SHEETS.summary);
  sh.clearContents();
  ensureColumns_(sh, SHEETS.summary.head.length);
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
    var mat = String(l['材料'] || '');
    add([kind, work, ALL_MATERIALS].join('\u0001'), [kind, kousyu, work, ALL_MATERIALS, unit], l);
    if (mat) add([kind, work, mat].join('\u0001'), [kind, kousyu, work, mat, unit], l);
  });
  return Object.keys(groups).sort().map(function (k) {
    var g = groups[k];
    var rate = g.qty > 0 ? Math.round(g.qHours / g.qty * 1000) / 1000 : '';
    return g.base.concat([g.hours, g.qHours, g.qty, rate, g.n, Object.keys(g.sites).length, g.last]);
  });
}

/* ───────────── 初期設定 ───────────── */

/** シートを作り、作業内容が空なら初期値を入れる。何度実行してもよい。 */
function setup() {
  Object.keys(SHEETS).forEach(function (k) { sheet_(SHEETS[k]); });
  if (readObjects_(SHEETS.works).length === 0) {
    appendRows_(SHEETS.works, SEED_WORKS.map(function (w, i) {
      var id = (w[0] === '新築' ? 'N' : 'R') + ('0' + (i + 1)).slice(-2);
      return [id, w[0], '大工工事', w[1], w[2], i + 1, w[3]];
    }));
  }
  return 'ok';
}

/* ───────────── 共通 ───────────── */

function matLabel_(name, spec) {
  name = String(name || '').trim(); spec = String(spec || '').trim();
  return spec ? name + ' ' + spec : name;
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
    ensureColumns_(sh, def.head.length);
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
  ensureColumns_(sh, rows[0].length);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/** 列が足りないシート（あとから列を増やしたときなど）は、書く前に列を足す。 */
function ensureColumns_(sh, n) {
  var have = sh.getMaxColumns();
  if (have < n) sh.insertColumnsAfter(have, n - have);
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
