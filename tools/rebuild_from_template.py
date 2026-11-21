# 物件のタスク管理表を、今のテンプレートで作り直すときに「どのセルに何を書くか」を出す。
# 使い方：python3 -I tools/rebuild_from_template.py <テンプレート.xlsx> <物件の今の表.xlsx> <出力.json>
#   テンプレートと物件の表は Drive コネクタで xlsx に書き出したもの（顧客データなのでリポジトリに入れない）。
#   出力の writes を、テンプレートを Drive で複製したスプレッドシートへ Google Sheets コネクタで書き込む
#   （valueInputOption は USER_ENTERED。日付は「YYYY/MM/DD HH:MM:SS」の文字列で、Sheets が日付として読む）。
# 引き継ぐもの（2026-11-21 利用者の指示「終わった分すべて」）：
#   各ボックスのシート：チェック・不要・HELP・HELPメモ・社長コメント、実施日（チェックした日。式が NOW() で付けるので、元の日付を値で上書き）、
#     備考（テンプレートと違うものだけ。テンプレートに備考があれば「／」でつなぐ）
#   ボックス一覧：一括不要、完了実績（完了のボックスだけ。同じく値で上書き）
#   表紙：邸名・着工予定日・担当者・ゲート（基準日）の日付
# タスクの照合は drive_to_import.py と同じ（文言の一致 → 似た文言）。ボックスをまたいで移ったタスクは、文言が同じものだけ当てる。
import sys,json,re,datetime as dt,openpyxl
from openpyxl.utils import get_column_letter as L
tplf,oldf,out=sys.argv[1:4]
def norm(x): return re.sub(r'\s','',str(x or '')).replace('〜','~').replace('～','~')
def bigram(s):
    m={}
    for i in range(len(s)-1): m[s[i:i+2]]=m.get(s[i:i+2],0)+1
    return m
def sim(a,b):
    l=0
    while l<len(a) and l<len(b) and a[l]==b[l]: l+=1
    if l>=8: return 0.95+0.04*l/max(len(a),len(b))
    if min(len(a),len(b))>=4 and min(len(a),len(b))/max(len(a),len(b))>=0.25 and (a in b or b in a): return 0.9+0.04*min(len(a),len(b))/max(len(a),len(b))
    A,B=bigram(a),bigram(b); ta,tb=sum(A.values()),sum(B.values())
    return 2*sum(min(v,B.get(k,0)) for k,v in A.items())/(ta+tb) if ta+tb else 0
SIM_MIN=0.6
def truthy(v):
    if isinstance(v,bool): return v
    return str(v).strip() in ('True','TRUE','true','1','1.0') if v is not None else False
def dstr(v):
    if isinstance(v,dt.datetime): return None if v.year<2000 else v.strftime('%Y/%m/%d %H:%M:%S')
    if isinstance(v,dt.date): return None if v.year<2000 else v.strftime('%Y/%m/%d')
    return None
def text(v): return '' if v is None else str(v).strip()
RENAMED={'発注':'発注①','竣工書類':'引渡後業務'}

T=openpyxl.load_workbook(tplf)                  # テンプレート（式のまま。書き込み先の形を見る）
O=openpyxl.load_workbook(oldf,data_only=True)   # 今の表（計算済みの値）
writes=[]; rep={'boxes':0,'boxesNotInTemplate':[],'checkedNotMatched':[],'bySimilarity':0,'crossBox':0,'doneBoxesNowOpen':[],'notes':0}
def w(sheet,r,c,v): writes.append({'sheet':sheet,'cell':f'{L(c)}{r}','value':v})

def sheet_rows(ws):
    """ボックスのシートの見出しと、タスクの行（行番号, 文言）"""
    hr=next((r for r in range(1,11) if any(text(c.value)=='チェック' for c in ws[r])),None)
    if hr is None: return None,None
    H=[text(c.value) for c in ws[hr]]
    col=lambda n:(H.index(n)+1 if n in H else None)
    ct=col('すること') or col('チェック項目')
    if ct is None and col('カテゴリー'): ct=col('カテゴリー')+1
    C=dict(c=col('チェック'),f=col('不要'),h=col('HELP！😢'),d=col('実施日'),hd=col('HELP'),t=ct,
           n=col('備考') or col('メモ'),hm=col('HELP！😢メモ'),sc=col('社長コメント'))
    rows=[(r,norm(ws.cell(r,ct).value)) for r in range(hr+1,ws.max_row+1) if ct and norm(ws.cell(r,ct).value)]
    return C,rows

# --- ボックス一覧：名前 → 行・シート名 ---
def box_list(wb):
    ws=wb['ボックス一覧']; H=[norm(c.value) for c in ws[2]]
    out=[]; seen=set()
    for r in range(3,ws.max_row+1):
        nm=ws.cell(r,3).value
        if not norm(nm): continue
        sn=next((s for s in wb.sheetnames if s==text(nm).replace('\n','')),None) or next((s for s in wb.sheetnames if norm(s)==norm(nm)),None)
        if not sn or sn in seen: continue   # 重複の行（着工~監査① など）は飛ばす
        seen.add(sn); out.append(dict(row=r,name=norm(nm),sheet=sn,group=text(ws.cell(r,1).value)))
    return out,H
TB,TH=box_list(T); OB,OH=box_list(O)
tcol=lambda n:TH.index(n)+1; ocol=lambda n:OH.index(n)+1
# フェーズ（A列）は結合セルで最初の行にしか無いので、前の行から引き継ぐ
for lst in (TB,OB):
    g=''
    for b in lst: g=b['group'] or g; b['group']=g
# 「実行予算」は、テンプレートでは38「原価管理」と116「実行予算」。古い表で1行だけなら116に当てる
pair={}
for ob in OB:
    nm=RENAMED.get(ob['name'],ob['name'])
    cand=[tb for tb in TB if tb['name']==nm and tb['sheet'] not in pair.values()]
    tb=next((c for c in cand if c['group']==ob['group']),cand[0] if cand else None)
    if tb: pair[ob['sheet']]=tb['sheet']
    else: rep['boxesNotInTemplate'].append(ob['name'])
rep['boxes']=len(pair)
Trow={b['sheet']:b['row'] for b in TB}; Orow={b['sheet']:b['row'] for b in OB}
ows=O['ボックス一覧']; tws='ボックス一覧'

# --- 各ボックスのシート ---
tinfo={}
for tsn in Trow:
    C,rows=sheet_rows(T[tsn]); tinfo[tsn]=(C,rows,set())
leftover=[]   # 当たらなかったチェック済みの行（あとでボックスをまたいで文言の一致を探す）
def copy_row(osh,oC,orow,tsn,trow):
    tC=tinfo[tsn][0]; tinfo[tsn][2].add(trow)
    g=lambda k:osh.cell(orow,oC[k]).value if oC.get(k) else None
    if truthy(g('c')):
        w(tsn,trow,tC['c'],True)
        if tC.get('d') and dstr(g('d')): w(tsn,trow,tC['d'],dstr(g('d')))
    if truthy(g('f')): w(tsn,trow,tC['f'],True)
    if truthy(g('h')):
        w(tsn,trow,tC['h'],True)
        if tC.get('hd') and dstr(g('hd')): w(tsn,trow,tC['hd'],dstr(g('hd')))
    for k in ('hm','sc'):
        if tC.get(k) and text(g(k)): w(tsn,trow,tC[k],text(g(k)))
    on=text(g('n')); tn=text(T[tsn].cell(trow,tC['n']).value) if tC.get('n') else ''
    if tC.get('n') and on and norm(on)!=norm(tn) and norm(on) not in norm(tn):
        w(tsn,trow,tC['n'],(tn+'／'+on) if tn else on); rep['notes']+=1
def has_mark(osh,oC,r): return any(truthy(osh.cell(r,oC[k]).value) for k in ('c','f','h') if oC.get(k)) or (oC.get('hm') and text(osh.cell(r,oC['hm']).value))
for osn,tsn in pair.items():
    osh=O[osn]; oC,orows=sheet_rows(osh)
    if not orows: continue
    tC,trows,used=tinfo[tsn]
    if not trows: continue
    ou=set(); m={}
    for i,(r,tx) in enumerate(orows):
        j=next((j for j,(tr,tt) in enumerate(trows) if tt==tx and tr not in used and j not in m.values()),None)
        if j is not None: m[i]=j; ou.add(i)
    cand=sorted(((sim(tx,tt),i,j) for i,(r,tx) in enumerate(orows) if i not in ou for j,(tr,tt) in enumerate(trows) if j not in m.values() and tr not in used),reverse=True)
    for sc,i,j in cand:
        if sc<SIM_MIN: break
        if i in m or j in m.values(): continue
        m[i]=j; rep['bySimilarity']+=1
    for i,j in m.items(): copy_row(osh,oC,orows[i][0],tsn,trows[j][0])
    for i,(r,tx) in enumerate(orows):
        if i not in m and has_mark(osh,oC,r): leftover.append((osh,oC,r,tx,osn))
    # ボックス一覧：一括不要・完了実績
    orr,trr=Orow[osn],Trow[tsn]
    bulk=truthy(ows.cell(orr,ocol('一括不要')).value)
    if bulk: w(tws,trr,tcol('一括不要'),True)
    st=text(ows.cell(orr,ocol('状態')).value); k=dstr(ows.cell(orr,ocol('完了実績')).value)
    if st=='完了' and not bulk and k: w(tws,trr,tcol('完了実績'),k)
# ボックスをまたいで移ったタスク：文言が同じで、まだ使っていない行に当てる
for osh,oC,r,tx,osn in leftover:
    hit=next(((tsn,tr) for tsn,(C,rows,used) in tinfo.items() if rows for tr,tt in rows if tt==tx and tr not in used),None)
    if hit: copy_row(osh,oC,r,hit[0],hit[1]); rep['crossBox']+=1
    else: rep['checkedNotMatched'].append(f'{osn}：{tx[:30]}')
# 前の表で完了だったのに、新しい表ではタスクが残るボックス（テンプレートで増えたタスクなど）
done_cells={(x['sheet'],x['cell']) for x in writes if x['value'] is True}
for osn,tsn in pair.items():
    if text(ows.cell(Orow[osn],ocol('状態')).value)!='完了' or truthy(ows.cell(Orow[osn],ocol('一括不要')).value): continue
    C,rows,_=tinfo[tsn]
    if not rows: continue
    left=[tt[:30] for tr,tt in rows if (tsn,f"{L(C['c'])}{tr}") not in done_cells and (tsn,f"{L(C['f'])}{tr}") not in done_cells]
    if left: rep['doneBoxesNowOpen'].append({'box':tsn,'open':len(left),'of':len(rows),'tasks':left[:5]})

# --- 表紙 ---
oc=O['表紙']; tc=T['表紙']
w('表紙',1,1,text(oc['A1'].value))
if dstr(oc['C2'].value): w('表紙',2,3,dstr(oc['C2'].value))
for r in range(6,21):
    a=text(tc.cell(r,1).value)
    orr=next((x for x in range(6,21) if text(oc.cell(x,1).value)==a),None)
    v=text(oc.cell(orr,3).value) if orr else ''
    if a and v and v!=a: w('表紙',r,3,v)
# ゲート：テンプレートは G6:G20 に名前・I列に日付。古い表は「ゲート（基準日）一覧」の下（A列に名前・C列に日付）か、G〜I列
og={}
for r in range(1,oc.max_row+1):
    for nc,dc in ((1,3),(7,9)):
        n=text(oc.cell(r,nc).value); d=dstr(oc.cell(r,dc).value)
        if n and d: og.setdefault(n,d)
rep['gates']={}
for r in range(6,21):
    n=text(tc.cell(r,7).value)
    if n in og: w('表紙',r,9,og[n]); rep['gates'][n]=og[n]
rep['writes']=len(writes)
json.dump({'writes':writes,'report':rep},open(out,'w',encoding='utf8'),ensure_ascii=False,indent=0)
print(json.dumps(rep,ensure_ascii=False,indent=1))
