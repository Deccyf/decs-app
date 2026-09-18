#!/usr/bin/env node
/* Assembles index.html from src/. No dependencies, no transforms — the app
   still ships as a single file; this only lets the source live in pieces you
   can actually find things in. Edit src/, run `npm run build`, commit both. */
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const JS = ['calc.js', 'app/core.js', 'app/views.js', 'app/components.js', 'app/chart.js', 'app/main.js'];

// function replacers: a plain string would have `$&`, `$'` and friends interpreted
const out = read('page.html')
  .replace('<!--@css-->', () => read('styles.css'))
  .replace('<!--@seed-->', () => read('seed.json').trim())
  .replace('<!--@js-->', () => JS.map(read).join(''));

fs.writeFileSync(path.join(__dirname, 'index.html'), out);
console.log(`index.html  ${(out.length / 1024).toFixed(0)}KB  from ${JS.length + 3} source files`);
