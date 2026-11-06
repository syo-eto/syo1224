const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat, HeadingLevel,
  Footer, PageNumber,
} = require('docx');

const FONT = 'BIZ UDPゴシック';
const NAVY = '1F3A5F', ORANGE = 'B5651D', GRAY = '5A6676', LINE = 'C9D3DE', PALE = 'EEF2F7';
const W = 9638; // A4 本文幅（左右余白 1134）

const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
// "**太字**" を含む文字列を TextRun 配列に
const rich = (s, o = {}) => s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p =>
  p.startsWith('**') ? run(p.slice(2, -2), { ...o, bold: true }) : run(p, o));
const para = (s, o = {}, po = {}) => new Paragraph({ children: rich(s, o), spacing: { after: 80, line: 320 }, ...po });
const h1 = (num, title) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [run(num + '　', { color: ORANGE }), run(title)],
});
const h2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(t)] });
const lead = t => para(t, { size: 22, color: NAVY, bold: true }, { spacing: { after: 160 } });
const note = t => para(t, { size: 18, color: GRAY }, { spacing: { before: 80, after: 240 } });
const bullet = t => new Paragraph({ numbering: { reference: 'b', level: 0 }, children: rich(t), spacing: { after: 60, line: 320 } });

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
function table(widths, rows, { header = true, firstColBold = true } = {}) {
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: header && ri === 0,
      cantSplit: true,
      children: r.map((c, ci) => {
        const isHead = header && ri === 0;
        const shade = isHead ? NAVY : (ri % 2 === 0 && header ? PALE : undefined);
        return new TableCell({
          width: { size: widths[ci], type: WidthType.DXA },
          borders,
          margins: { top: 50, bottom: 50, left: 120, right: 120 },
          shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: shade } : undefined,
          children: [].concat(c).map(line => new Paragraph({
            spacing: { after: 20, line: 280 },
            children: rich(line, {
              size: 20,
              color: isHead ? 'FFFFFF' : (ci === 0 && firstColBold ? NAVY : '24303D'),
              bold: isHead || (ci === 0 && firstColBold) || undefined,
            }),
          })),
        });
      }),
    })),
  });
}
const callout = t => new Paragraph({
  children: rich('⚠ ' + t, { size: 20, color: '5C3410' }),
  shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FBEBDD' },
  border: { left: { style: BorderStyle.SINGLE, size: 24, color: 'C8742B', space: 8 } },
  spacing: { before: 240, after: 120, line: 320 },
  indent: { left: 160, right: 160 },
});
const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });

const children = [
  para('ご説明資料', { size: 20, bold: true, color: ORANGE }, { spacing: { after: 60 } }),
  new Paragraph({ heading: HeadingLevel.TITLE, children: [run('住宅から旅館への用途変更について')] }),
  para('必要な手続きと、建物に求められる主な基準', { size: 24, color: GRAY }, {
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 'C8742B', space: 6 } },
  }),
  table([2200, W - 2200], [
    ['対象建物', '2階建て ／ 非線引き区域 ／ 用途地域の指定なし'],
    ['変更内容', '住宅 → 旅館'],
  ], { header: false }),
  para('本資料では、住宅を旅館として使うために必要な手続きと、建物に求められる主な基準をご説明します。', {}, { spacing: { before: 200, after: 200, line: 320 } }),

  h1('01', '手続き'),
  lead('旅館部分の広さで、確認申請の要否が決まります。'),
  table([2400, 2600, W - 5000], [
    ['旅館部分の床面積', '手続き', '内容'],
    ['200㎡ 超', '確認申請が必要', '用途変更の建築確認申請を行います。申請・審査の期間を工程に見込む必要があります。'],
    ['200㎡ 以下', '申請は不要', 'ただし、建築基準法などの基準に**適合させる義務は残ります**。工事の内容は200㎡超と同じように検討します。'],
  ]),
  note('申請が不要な場合でも、守るべき基準は同じです。手続きが簡単になるだけ、とお考えください。'),

  h1('02', '避難'),
  lead('安全に外へ出られる通路と階段を確保します。'),
  h2('廊下・屋外通路の幅'),
  table([3400, 1600, W - 5000], [
    ['場所', '必要な幅', '補足'],
    ['片廊下（片側だけに客室）', '1.2m 以上', ''],
    ['中廊下（両側に客室）', '1.6m 以上', ''],
    ['1階出口から道路まで', '1.5m 以上', '条例で2.0〜3.0m以上の場合あり。室外機・給湯器のはみ出しは不可'],
  ]),
  gap(),
  h2('2階からの避難階段'),
  table([2200, W - 2200], [
    ['項目', '基準'],
    ['幅', '原則1.2m以上。2階の客室が50㎡以下なら75cm、100㎡以下なら90cm以上（手すり10cm以内は減算不要）'],
    ['1段の高さ', '21cm以下（蹴上）'],
    ['1段の奥行', '15cm以上（踏面）。回り階段は内側の壁から30cmの位置で測り、足りなければ改修'],
    ['階段までの距離', '2階客室の一番奥から、耐火・準耐火構造は50m以下、それ以外は30m以下'],
  ]),
  note('根拠：建築基準法施行令 第119条（廊下）・第128条および自治体条例（敷地内避難通路）'),

  h1('03', '火災への備え'),
  lead('火や煙が広がりにくい建物にします。'),
  table([2400, 3900, W - 6300], [
    ['部位', '基準', '補足'],
    ['廊下・階段の壁と天井', '下地も含めて、**準不燃材料または不燃材料**にします。', 'メーカーの大臣認定書の提出と、施工中の写真の保存が必要です。'],
    ['客室の壁と天井', '木造などで旅館部分が100㎡超、または窓のない部屋になる場合は、**難燃材料以上**の仕上げにします。', '耐火・準耐火建築物、100㎡以下で排煙窓がある場合は対象外です。'],
    ['客室と客室の間の壁（界壁）', '**準耐火構造**とし、天井裏・小屋裏まで壁を伸ばします。', '隣の客室へ火や煙が回るのを防ぎます。'],
    ['住宅・店舗と併設する場合（異種用途区画）', '旅館部分との境目を、**1時間耐火構造**の壁・床と防火設備で区切ります。', '建物の一部だけを旅館にする場合に必要です。'],
  ]),
  note('根拠：建築基準法施行令 第128条の4・第114条2項'),

  h1('04', '設備・構造と、ほかの法律'),
  lead('設備を整え、消防法・旅館業法も満たします。'),
  h2('設備・構造'),
  table([2200, W - 2200], [
    ['項目', '基準'],
    ['採光', '客室の床面積の10分の1以上の窓'],
    ['換気', '客室と窓のない部屋に24時間換気設備'],
    ['非常用照明', '廊下・階段・出口・客室に、停電時1ルクス以上のバッテリー内蔵照明'],
    ['床の強さ', '設計荷重を1,800→2,000N/㎡へ見直し、必要なら補強'],
  ]),
  gap(),
  h2('消防法'),
  bullet('自動火災報知設備・誘導灯の設置'),
  bullet('カーテン・じゅうたんは防炎物品'),
  h2('旅館業法・自治体条例'),
  bullet('フロント（玄関帳場）の設置（緩和あり）'),
  bullet('客室の広さ（1人あたり3.3㎡など）と、トイレ・洗面'),
  callout('数値や必要な工事は、建物の状況や条例で変わります。役所・消防署・保健所と事前に協議して確定します。'),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: '24303D' } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 44, bold: true, color: NAVY },
        paragraph: { spacing: { before: 0, after: 120 }, keepNext: true } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 30, bold: true, color: NAVY },
        paragraph: { spacing: { before: 280, after: 60 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 23, bold: true, color: NAVY },
        paragraph: { spacing: { before: 160, after: 80 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '・', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 280 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('住宅から旅館への用途変更について　', { size: 16, color: GRAY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GRAY })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(b => fs.writeFileSync(process.argv[2], b));
