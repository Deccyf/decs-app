#!/usr/bin/env node
/* Assembles index.html from src/. No dependencies, no transforms — the app
   still ships as a single file; this only lets the source live in pieces you
   can actually find things in. Edit src/, run `npm run build`, commit both.

   `node build.js <name>` builds a variant instead: the same code around
   another seed, described in variants/<name>.json, written to dist/<name>/
   with a service worker of its own. See "Variants" in the README. */
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const JS = ['calc.js', 'app/core.js', 'app/views.js', 'app/components.js', 'app/chart.js', 'app/main.js'];
const text = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* The page around one seed. The seed names the app as well as filling it: its
   `title` is the page title, the heading and the lock screen, and the title's
   first letter is the icon in the browser tab. */
function page(seedText) {
  const title = JSON.parse(seedText).title || "Dec's Tracker";
  const initial = (title.match(/[A-Za-z0-9]/) || ['D'])[0].toUpperCase();
  // function replacers: a plain string would have `$&`, `$'` and friends interpreted
  return read('page.html')
    .replace(/<!--@title-->/g, () => text(title))
    .replace(/<!--@initial-->/g, () => initial)
    .replace('<!--@css-->', () => read('styles.css'))
    // a "<" in the seed could end the script element it sits in
    .replace('<!--@seed-->', () => seedText.trim().replace(/</g, '\\u003c'))
    .replace('<!--@js-->', () => JS.map(read).join(''));
}

/* A variant's service worker is this app's own with the cache renamed. The two
   apps can be served from the same address, where they share one set of caches,
   so each must only ever clear out its own. */
function worker(cache, title) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*-v\d+$/.test(cache)) throw new Error(`cache "${cache}" should look like some-name-v1`);
  let done = 0;
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')
    .replace(/^\/\*[^]*?\*\/\n/, () => { done++; return `/* ${title} — offline cache. Built by decs-app (node build.js); the version lives in its variants/ folder. */\n`; })
    .replace(/^const V = '[^']*';$/m, () => { done++; return `const V = '${cache}';`; })
    .replace(/^\/\/ the caches this app owns[^]*?^const MINE = .*;$/m, () => { done++; return `// the caches this app owns\nconst MINE = /^${cache.replace(/\d+$/, '')}/;`; });
  if (done !== 3) throw new Error('sw.js has changed shape: the variant build could not rename its cache');
  return sw;
}

function variant(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`"${name}" is not a variant name`);
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'variants', name + '.json'), 'utf8'));
  if (!v.seed || !v.seed.storageKey || !v.seed.title) throw new Error(`variants/${name}.json needs a seed with a storageKey and a title of its own`);
  const dir = path.join(__dirname, 'dist', name);
  fs.mkdirSync(dir, { recursive: true });
  const html = page(JSON.stringify(v.seed)), sw = worker(v.cache, v.seed.title);
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'sw.js'), sw);
  return { dir, html, sw };
}

function main() {
  const out = page(read('seed.json'));
  fs.writeFileSync(path.join(__dirname, 'index.html'), out);
  return out;
}

if (require.main === module) {
  const name = process.argv[2];
  if (name) {
    const v = variant(name);
    console.log(`dist/${name}/index.html  ${(v.html.length / 1024).toFixed(0)}KB  and sw.js — copy both over that app's own`);
  } else {
    const out = main();
    console.log(`index.html  ${(out.length / 1024).toFixed(0)}KB  from ${JS.length + 3} source files`);
  }
}
module.exports = { main, variant };
