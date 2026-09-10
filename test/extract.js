/* Pulls the calc module out of index.html so the pure functions can be tested
   in node. The app ships as one file on purpose — no build step — so the tests
   read that file rather than importing a module that doesn't exist. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'index.html');

function calc() {
  const html = fs.readFileSync(APP, 'utf8');
  const start = html.indexOf('const C = (() => {');
  const end = html.indexOf('/* ===== app: state, views, events ===== */');
  if (start < 0 || end < 0) throw new Error('could not find the calc module in index.html');
  const src = html.slice(start, end) + '\nmodule.exports = C;';
  const mod = { exports: {} };
  vm.runInNewContext(src, { module: mod, exports: mod.exports, console });
  return mod.exports;
}

/* The seed block is the app's own defaults; tests use it so they can't drift
   from what ships. */
function seed() {
  const html = fs.readFileSync(APP, 'utf8');
  const m = html.match(/<script id="seed"[^>]*>([\s\S]*?)<\/script>/);
  return JSON.parse(m[1]);
}

module.exports = { calc, seed, APP };
