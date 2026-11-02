# 注文住宅ロードマップ管理アプリ

注文住宅の工程を物件ごとに管理する、HTML単一ファイルのWebアプリ。ビルド不要、外部ライブラリなし。
現行版は `housing_roadmap_v7.html`（約2,100行）。ログイン・アカウント機能は外してある（ログイン版は `archive/` に保存）。
利用者は日本語話者。やり取りも画面の文言も日本語で行う。

## 進め方

- 初回のみ `npm install`。
- 編集のたびに `npm run check`（構文）と `npm test`（jsdomで23項目の操作を実行）を通す。
- 構文が通っても画面が崩れることがある（過去に何度かあった）。画面に関わる変更は、`tests/smoke.test.js` にその操作を足してから直す。
- ファイルが大きい（`TASKS` の184ボックスが1行に入っている）。全体を読み込まず、`grep -n` と `sed -n` で必要な箇所だけ見る。
- 変更は小さく、1つずつ動作確認する。利用者は変更のたびにファイルを開いて確認する。

## コードの場所（行番号は目安。関数名・定数名で grep する）

| 領域 | 場所 |
| --- | --- |
| データ定数 | 644〜690行付近：`TASKS` `PROP_STATUSES` `TASK_GATE_MAP` `TASK_OFFSETS` `GROUPS` `PCOLS` `PREP_ROWS` `CATS_TANTO` `props` `pStates` `staffList` `tantoMap` `kanryoDates` `itemCheckDates` `taskLinks` |
| 物件一覧 | `renderPropList` `sortedProps` `renderStatusFilters` |
| ステータス判定 | `phasePct` `calcPropStatus` `getPropStatus` `overallPct` |
| ロードマップ | `openProp` `render` |
| チェック画面 | `openModal` `renderModalBody` `calcProg` `checkAutoComplete` `bulkFuyo` `renderTaskLinks` |
| ゲート・期日 | `GATES`（956行付近）`openGateDlg` `saveGate` `recalcAllDues` `getEffectiveDue` |
| 担当者 | `openTantoDlg` `saveTanto` `goToMyTasks` `renderMyTasks` |
| 管理者設定 | `goToAdmin` `switchAdminTab` `renderPropAdminList` `deleteProp` `renderTaskEditList` `saveTaskEdit` `openLinkAdd` |
| 保存 | `saveData` `loadData` `scheduleSave` `exportAllData` `importAllData` |

## データモデル

- `TASKS`：ボックスの配列。`{no, name, group, category, tanto, due, state, help, offset, items}`。
  `items` がボックス内のタスクで、各要素は `{t:文言, c:完了, f:不要, h:HELP, hm:HELPメモ, n:補足メモ, r:担当職種, j:未使用（空）}`。
- `pStates[pid]` = `{ts, done, fuyo, help, memo, overrideDue}`。`ts[no]` がボックスの状態（着手前・進行中・完了）、`done/fuyo/help[no]` がタスクごとの真偽の配列。
- `tantoMap[pid][職種]` = 担当者名。`gateDates[pid][ゲート名]` = `YYYY-MM-DD`。
- `kanryoDates['pid_no']`、`itemCheckDates['pid_no_idx']`、`taskLinks['no_idx']`（添付は全物件共通）。
- 進捗は2種類ある。ボックス単位（`phasePct`）は「状態が完了のボックス数 ÷ フェーズ内のボックス数」。タスク単位（`calcProg`）は「完了数 ÷ 不要でないタスク数」。

## 守るべき仕様

- 用語：工程の単位が「ボックス」、その中のチェックが「タスク」。旧名（タスク／チェック項目）に戻さない。
- 物件のステータスは入力しない。`calcPropStatus` が8段階で自動判定する：プラン前 → プラン中 → 着工準備中 → 着工前 → 着工後 → 上棟後 → 引渡前 → 引渡済。最初に未完了の段階が、その物件の状態になる。
  使うフェーズの番号（`PCOLS`）：0 プラン確定、1 完成宅地、2 構造、3 確認、4 図書、5 着工前工務業務、6 着工後、7 上棟後、8 引渡し＋引渡後。
- 「不要」にしたタスクは、進捗の分母にも分子にも数えない。全タスクが完了か不要になると、ボックスは自動で「完了」になる。
- ゲートは15個（`GATES`）。日付は直接入力し、保存すると `TASK_GATE_MAP` と `TASK_OFFSETS` から全ボックスの期日を再計算する。
- 担当者は「物件 × 職種（13種）」で設定する。「会議」「打合せ」は設定も表示も対象外。
- ボックス編集を既存の物件へ反映するときは、完了済みのボックスは変えない。それ以外は追加のみ反映し、削除はしない。
- 物件追加の入力は物件名・住所・主担当者のみ。続けて担当者設定、ゲート設定（どちらもスキップ可）。一覧は新しい順。

## 落とし穴

- `let` で宣言した変数（`props` `pStates` など）は `window` に載らない。テストでは `w.eval('props')` で読む。
- `toggleDone` `toggleFuyo` `saveHelp` `saveTanto` `saveGate` `addProperty` `cycleState` `bulkFuyo` は、末尾で関数を包んで `scheduleSave()` を呼んでいる。ほかに保存が必要な処理は、自分で `scheduleSave()` を呼ぶ。
- 起動の順序は `loadData()` → `renderPropList()`。保存先のキーは `localStorage` の `housing_roadmap_v7`。
- `TASKS`（ボックス管理での編集）は保存されない。再読み込みでテンプレートの内容に戻る（未対応）。
- ブラウザのアドレスバーでは `javascript:` が実行できない。保存データを消すときは、開発者ツールのConsoleで実行するか、起動時に一時的な `removeItem` を入れる（戻し忘れに注意）。
- 全角の括弧や空白が混ざると構文エラーになる。生成したコードは必ず `npm run check` にかける。
- 2つ目の `<script>` は PWA の manifest。http(s) で配信したときだけ働く。

## Excel テンプレートの取り込み

取り込みスクリプトは残っていない。必要なら下の規則で作り直す。

- 元ファイルは「注文住宅_タスク管理表」。`pandas.read_excel` で全シートを読む。
- シート「ボックス一覧」は `iloc[1:]` で先頭行を除き、列を番号で参照する。列0 = フェーズ、列1 = No、列3 = ボックス名（空なら列2）、列4 = カテゴリ、列11 = 着工からの相対日数。
- 各ボックスの中身は、ボックス名と同じ名前のシート。先頭10行の中で「チェック」を含む行がヘッダーで、列「チェック」「不要」「HELP！😢」「担当」「実施日」「すること」「備考」「HELP！😢メモ」を探す。
- チェック欄は ☑ ではなく、文字列の `True` / `False` / `0` で入っている。
- 名前が一致しないもの：No144「着工～監査①」はシート名が「着工~監査①」。No1「パートナー」は手動で対応。No148・149は名前に改行が入っている。
- シートが存在しないもの：No17「建築家前打合せ」、No25「ラフ会議後」。
- 実績データ（松下健志様邸）には、テンプレートにない「設計工務引継ぎ」「図面FB」のシートがあった。
- ゲートの基準日の一覧は、シート「表紙」にある。

## 未対応

- [ ] ボックス管理での編集（追加・編集・削除、タスクの文言）が再読み込みで戻る。`saveData` / `loadData` の対象に `TASKS` を含める。
- [ ] 一括不要のときに、ボックスの状態を新しく「不要」にするか、今の「完了」のままにするか（利用者に確認中）。
- [ ] 148「着工~監査①」・149「監査①~監査②」が、144・145と重複していないか確認する。重複なら着工後フェーズの進捗が低く出る。
- [ ] 「設計工務引継ぎ」「図面FB」に対応するボックスの要否を確認する。
- [ ] 複数人での共有と認証：Cloudflare Pages ＋ Supabase への移行（保留中）。即時反映が必要なため。HTML単体では、データが各自のブラウザに閉じる。
- [ ] 添付（URL・PDF・画像）は localStorage の約5MBの制限を受け、「ボックス番号＋タスクの位置」に紐づく。タスクの並びを変えるとずれる。

## 参照

開発記録（Claude Docs）：https://claude.ai/artifact/KPwv66LPD6nR4GtVMY6buj
経緯は「やりとりの記録」タブ、仕様は最初のタブにある。
