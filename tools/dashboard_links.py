# ダッシュボード（xlsx）から、物件ごとの邸名・住所・タスク管理表のスプレッドシートIDを出す。
# 使い方：python3 -I tools/dashboard_links.py <dashboard.xlsx>
# 出力：1行1物件「連番<TAB>邸名<TAB>住所<TAB>ID」。保存名は「連番_邸名.xlsx」にする（drive_to_import.py がこの名前で照合する）
import sys,re,openpyxl
ws=openpyxl.load_workbook(sys.argv[1])['新築・フルリノベ']
n=0
for r in range(1,ws.max_row+1):
    name=ws.cell(r,1).value
    if not isinstance(name,str) or not name.strip().endswith('様') or name.strip() in ('例様','○○様'): continue
    link=ws.cell(r+2,1).hyperlink
    m=re.search(r'/d/([\w-]+)',link.target) if link and link.target else None
    n+=1
    print(n,name.strip(),(ws.cell(r+1,1).value or '').strip(),m.group(1) if m else '（リンクなし）',sep='\t')
