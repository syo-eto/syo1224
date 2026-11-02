// HTML内の<script>をすべて取り出して構文チェックする（ビルド不要のため、編集のたびに実行する）
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const file = process.argv[2] || path.join(__dirname, '..', 'housing_roadmap_v7.html');
const html = fs.readFileSync(file, 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const tmp = path.join(os.tmpdir(), 'housing_check.js');
fs.writeFileSync(tmp, js);
const r = cp.spawnSync('node', ['--check', tmp], { encoding: 'utf8' });
console.log(r.status === 0 ? '構文: OK' : '構文エラー:\n' + r.stderr);
process.exitCode = r.status;
