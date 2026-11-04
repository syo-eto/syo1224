# ドライブの各物件「タスク管理表」(xlsx) から、アプリの「物件を追加で取り込む」用の JSON を作る。
# 使い方：python3 -I tools/drive_to_import.py <作業フォルダ> <出力.json> <1_邸名.xlsx> ...
#   作業フォルダに conv/app.json（アプリの TASKS・staffList を書き出したもの）と drive2/dashboard.xlsx を置く。
#   xlsx のファイル名は「連番_邸名.xlsx」。邸名でダッシュボードの行を探し、住所を取る。
# 規則は CLAUDE.md の「ドライブからの物件の取り込み」を参照。
import sys,json,re,datetime as dt,pandas as pd
S=sys.argv[1]; out=sys.argv[2]; files=sys.argv[3:]
app=json.load(open(S+'/conv/app.json',encoding='utf8'))
def norm(x): return re.sub(r'\s','',str(x or '')).replace('〜','~').replace('～','~').replace('タスク管理表','ボックス管理表')
def isna(v):
    try: return pd.isna(v)
    except Exception: return False
def ymd(v):
    if isna(v) or v is None: return None
    if isinstance(v,(dt.datetime,dt.date,pd.Timestamp)):
        y=pd.Timestamp(v)
        return None if y.year<2000 else y.strftime('%Y-%m-%d')
    m=re.match(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})',str(v))
    return '%s-%02d-%02d'%(m.group(1),int(m.group(2)),int(m.group(3))) if m else None
def truthy(v):
    if isna(v): return False
    if isinstance(v,bool): return v
    return str(v).strip() in ('True','TRUE','true','1','1.0')
staff=app['staff']
def staffname(n):
    n=str(n).strip()
    c=[s for s in staff if s.split('　')[0]==n or s.replace('　','')==n.replace('　','')]
    return c[0] if len(c)==1 else n
APP={}
for t in app['tasks']: APP.setdefault(norm(t['name']),[]).append(t)
STAT={'完了':'完了','作業中':'進行中','進行中':'進行中','着手前':'着手前'}
CATS=['企画','企画補助','建築家','設計チェック','構造','設計作図','IC','申請','基礎監督','現場監督','工務補助','監査','技術']
res={'version':'7','boxNoVer':2,'exportedAt':dt.datetime.now().isoformat(),'props':[],'pStates':{},'tantoMap':{},'gateDates':{},'kanryoDates':{},'itemCheckDates':{},'staffList':[]}
dash=pd.read_excel(S+'/drive2/dashboard.xlsx',sheet_name='新築・フルリノベ',header=None)
A=[str(v).strip() if not isna(v) else '' for v in dash[0]]
report=[]
import os
for pid,f in enumerate(files,1):
    W=pd.read_excel(f,sheet_name=None,header=None); sheets=list(W.keys())
    cov=W['表紙']
    fn=re.sub(r'^\d+_','',os.path.basename(f)).replace('.xlsx','').replace('邸','')
    i=next(k for k,a in enumerate(A) if a and a.endswith('様') and fn.startswith(a))
    name=A[i]; addr=A[i+1]; ki=''
    for v in cov.iloc[0]:
        m=re.search(r'第\d+期',str(v)); ki=m.group(0) if m else ki
    chakko=ymd(cov.iloc[1,2])
    tanto={}
    for r in range(len(cov)):
        c=str(cov.iloc[r,0]).strip(); v=cov.iloc[r,2] if cov.shape[1]>2 else None
        if c in CATS and not isna(v) and str(v).strip() and str(v).strip()!=c:
            tanto[c]=staffname(v)
    for v in tanto.values():
        if v not in staff and v not in res['staffList']: res['staffList'].append(v)
    res['props'].append({'id':pid,'name':name,'addr':addr,'tanto':'','date':chakko or '','ki':ki,'status':''})
    res['tantoMap'][pid]=tanto
    res['gateDates'][pid]={'着工':chakko} if chakko else {}
    ps={'ts':{},'done':{},'fuyo':{},'help':{},'memo':{},'overrideDue':{}}
    BH=[re.sub(r'\s','',str(v)) for v in W['ボックス一覧'].iloc[1]]
    CS,CD,CK=BH.index('状態'),BH.index('期日'),BH.index('完了実績')
    b=W['ボックス一覧'].iloc[2:].copy(); b[0]=b[0].ffill()
    seen=set(); miss=[]; itemsMiss=0; itemsHit=0
    for _,row in b.iterrows():
        st=row[CS]
        if isna(row[3]) and (isna(st) or str(st).strip() not in STAT): continue
        if isna(st) or str(st).strip() not in STAT: st='着手前'
        nm=row[3] if not isna(row[3]) else row[2]
        cand=APP.get(norm(nm))
        if not cand: miss.append(norm(nm)); continue
        t=next((c for c in cand if c['no'] not in seen and str(row[0]).strip()==c.get('group')),None) or next((c for c in cand if c['no'] not in seen),cand[0])
        no=t['no']
        if no in seen: continue
        seen.add(no)
        ps['ts'][no]=STAT[str(st).strip()]
        d=ymd(row[CD]);
        if d: ps['overrideDue'][no]=d
        k=ymd(row[CK])
        if k and ps['ts'][no]=='完了': res['kanryoDates'][f'{pid}_{no}']=k
        # ボックスの中身
        sn=next((s for s in sheets if s==str(nm).strip() or s==t['name']),None) or next((s for s in sheets if norm(s)==norm(nm)),None)
        n=len(t['items'])
        done=[False]*n; fuyo=[False]*n; hlp=[False]*n; memo=['']*n
        if sn:
            sh=W[sn]
            hr=next((r for r in range(min(10,len(sh))) if any(str(v).strip()=='チェック' for v in sh.iloc[r])),None)
            if hr is not None:
                H=[str(v).strip() if not isna(v) else '' for v in sh.iloc[hr]]
                col=lambda name:(H.index(name) if name in H else None)
                ct=col('すること') if col('すること') is not None else col('チェック項目')
                if ct is None and col('カテゴリー') is not None: ct=col('カテゴリー')+1
                cc,cf,ch,cd,cm=col('チェック'),col('不要'),col('HELP！😢'),col('実施日'),col('HELP！😢メモ')
                rows=[]
                for r in range(hr+1,len(sh)):
                    tx=norm(sh.iloc[r,ct]) if ct is not None and not isna(sh.iloc[r,ct]) else ''
                    if not tx: continue
                    rows.append(dict(t=tx,c=truthy(sh.iloc[r,cc]) if cc is not None else False,f=truthy(sh.iloc[r,cf]) if cf is not None else False,
                        h=truthy(sh.iloc[r,ch]) if ch is not None else False,d=ymd(sh.iloc[r,cd]) if cd is not None else None,
                        m=str(sh.iloc[r,cm]) if cm is not None and not isna(sh.iloc[r,cm]) else '',u=False))
                for idx,it in enumerate(t['items']):
                    m=next((r for r in rows if not r['u'] and r['t']==norm(it)),None)
                    if not m: continue
                    m['u']=True; itemsHit+=1
                    fuyo[idx]=m['f']; done[idx]=m['c'] and not m['f']; hlp[idx]=m['h']; memo[idx]=m['m']
                    if (done[idx] or fuyo[idx]) and m['d']: res['itemCheckDates'][f'{pid}_{no}_{idx}']=m['d']
                itemsMiss+=sum(1 for r in rows if not r['u'] and (r['c'] or r['f'] or r['h']))
                um=[r['t'][:25] for r in rows if not r['u'] and (r['c'] or r['f'] or r['h'])]
        ps['done'][no]=done; ps['fuyo'][no]=fuyo; ps['help'][no]=hlp; ps['memo'][no]=memo
    # このタスク管理表に無いボックスは、全タスク不要（完了扱い）にする
    # ただし、同じフェーズの他のボックスが全部完了しているときだけ（先のフェーズのボックスは着手前のまま）
    absent=[t for t in app['tasks'] if t['no'] not in seen and all(ps['ts'].get(u['no'])=='完了' for u in app['tasks'] if u['group']==t['group'] and u['no'] in seen)]
    report_absent=[t['no'] for t in absent]
    for t in absent:
        n=len(t['items']); ps['ts'][t['no']]='完了'
        ps['done'][t['no']]=[False]*n; ps['fuyo'][t['no']]=[True]*n; ps['help'][t['no']]=[False]*n; ps['memo'][t['no']]=['']*n
    res['pStates'][pid]=ps
    cnt={s:list(ps['ts'].values()).count(s) for s in ('完了','進行中','着手前')}
    report.append(dict(name=name,addr=addr,ki=ki,chakko=chakko,boxes=len(seen),missingBoxes=miss,state=cnt,itemsMatched=itemsHit,checkedRowsNotMatched=itemsMiss,tanto=tanto,appBoxesNotInSheet=[t['no'] for t in app['tasks'] if t['no'] not in seen],markedFuyo=report_absent))
json.dump(res,open(out,'w',encoding='utf8'),ensure_ascii=False)
for r in report: print(json.dumps(r,ensure_ascii=False))
