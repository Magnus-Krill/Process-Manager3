const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../dashboard/public/index.html'), 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
new vm.Script(script); // Check the complete dashboard script, including template literals.
function grab(name) {
  const start = script.indexOf(`function ${name}(`);
  assert(start >= 0, `missing ${name}`);
  let depth = 0;
  let opened = false;
  for (let i = start; i < script.length; i++) {
    if (script[i] === '{') { depth++; opened = true; }
    if (script[i] === '}' && --depth === 0 && opened) return script.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '' });
  return elements.get(id);
};
const charts = [];
const sandbox = {
  document: { getElementById: element },
  renderChart: (...args) => { charts.push(args); return ''; },
  fmtSpeed: n => String(n),
  formatUptime: n => String(n),
  issueCountForProc: () => 0,
  escapeHtml: s => String(s),
  formatDate: s => String(s),
};
vm.createContext(sandbox);
vm.runInContext(`
  let cpuScale = 'global';
  let _lastSysData = { cpus: Array(4).fill({}) };
  let statsModalName = 'worker';
  const processes = { worker: { cpu: 200, memory: 20 } };
  const procHistory = { worker: { cpu: [100, 200, 400], mem: [10, 20, 30], conn: [] } };
  const _statsData = {};
  ${grab('cpuValue')}
  ${grab('cpuText')}
  ${grab('_tickStatsModal')}
`, sandbox);
const run = s => vm.runInContext(s, sandbox);
assert.strictEqual(run('cpuText(100)'), '25%');
assert.strictEqual(run('cpuText(400)'), '100%');
assert.strictEqual(run('cpuText(25, true)'), '25%', 'system API is already normalized');
assert.strictEqual(run('cpuText(undefined)'), '—');
assert.strictEqual(run('cpuText(NaN)'), '—');
run('_tickStatsModal()');
assert.strictEqual(element('sm-cpu-cur').textContent, '50%');
assert.deepStrictEqual(Array.from(charts[0][0]), [25, 50, 100]);
assert.strictEqual(charts[0][5], 100);
assert.deepStrictEqual(Array.from(run('procHistory.worker.cpu')), [100, 200, 400], 'history must stay raw');
charts.length = 0;
run("cpuScale = 'core'; _tickStatsModal()");
assert.strictEqual(element('sm-cpu-cur').textContent, '200%');
assert.strictEqual(run('cpuText(25, true)'), '100%', 'system process converted exactly once');
assert.deepStrictEqual(Array.from(charts[0][0]), [100, 200, 400]);
assert.strictEqual(charts[0][5], 400, 'per-core chart includes the full machine capacity');
run("cpuScale = 'global'; _lastSysData = { cpus: Array(16).fill({}) }");
assert.strictEqual(run('cpuText(100)'), '6.3%', 'use logical threads, not physical cores');
run('_lastSysData = null');
assert.strictEqual(run('cpuText(100)'), '—', 'do not assume the browser or server has one core');
run("cpuScale = 'core'");
assert.strictEqual(run('cpuText(100)'), '100%');
assert.strictEqual(run('cpuText(25, true)'), '—');
console.log('ok - CPU display conversion and history checks pass');
