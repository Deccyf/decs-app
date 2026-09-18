# Dec's Tracker

A single-file offline PWA: pay, cash flow, bills, savings pots, debt, house jobs,
collections and a games log. No framework, no dependencies at runtime.

```
src/
  page.html          the HTML skeleton, with <!--@css--> <!--@seed--> <!--@js--> placeholders
  styles.css         all styling; every colour is a token so dark mode is a swap
  seed.json          the defaults a fresh install starts from
  calc.js            pure functions, no DOM — pay, tax, bank holidays, cash flow, pots
  app/core.js        state, storage, PIN encryption, theme, dialogs, html helpers
  app/views.js       one function per tab, returning HTML strings
  app/components.js  pieces the views share
  app/chart.js       the earnings canvas
  app/main.js        render, events, backup, boot
build.js             concatenates the above into index.html — nothing else
test/                node:test; the browser tests need playwright (dev dependency)
```

`npm run build` writes `index.html`. `npm test` builds first, so the tests always
run against the current source. **Edit `src/`, not `index.html`** — the built
file is committed because GitHub Pages serves it, but it is overwritten on every
build.

The localStorage key is `decs-stuff-v1` and must stay that way: renaming it
would orphan every figure already saved on a phone.
