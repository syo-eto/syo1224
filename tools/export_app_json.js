// アプリの TASKS・staffList を drive_to_import.py 用に書き出す。
// 使い方：node tools/export_app_json.js <作業フォルダ>/conv/app.json
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../housing_roadmap_v7.html','utf8');
const T=eval(s.match(/const TASKS = (\[.*?\]);/s)[1]);
const st=eval(s.match(/let staffList=(\[.*?\]);/)[1]);
fs.writeFileSync(process.argv[2],JSON.stringify({tasks:T.map(t=>({no:t.no,name:t.name,group:t.group,category:t.category,items:t.items.map(i=>i.t),notes:t.items.map(i=>i.n||'')})),staff:st}));
console.log(process.argv[2],T.length);
