# 取り込み用 JSON をアプリに埋め込んだ配布用ファイルを作る（開くと一度だけ自動で取り込む。applyDriveSeed）。
# 使い方：python3 -I tools/build_with_seed.py housing_roadmap_v7.html <取り込み用.json> <出力.html>
# 出力には顧客データが入るので、リポジトリには入れない。
import sys,json
src,data,out=sys.argv[1:4]
html=open(src,encoding='utf8').read()
seed=json.load(open(data,encoding='utf8'))
js=json.dumps(seed,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
i=html.index('<script>')
html=html[:i]+'<script>window.DRIVE_SEED='+js+';</script>\n'+html[i:]
open(out,'w',encoding='utf8').write(html)
print(out,len(html))
