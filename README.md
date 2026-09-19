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

Undo is general: `commit()` snapshots the state before each change, and the
arrow in the header (or Ctrl+Z; Ctrl+Shift+Z to redo) puts the previous
snapshot back whole. The history is in memory only and is never written to the
device, so a PIN-locked app leaves no unencrypted trail.

Savings are one pot and a list. `money.savings` holds a single balance plus the
things being saved for, and `C.savingsCalc` measures every one of them against
the whole balance, because it is one pile of money rather than several. Buying
one takes what you paid out of the pot and moves it to the got list. The older
shape, several pots each holding their own money, is folded into that on load.

Day-to-day spending is inferred, not typed. Every balance read off the bank is
appended to `money.balanceLog`; `C.spendLog` takes each pair of readings, works
out what the bills and pay should have done in between, and calls the remainder
spending. Stretches touching a pay day are shown but kept out of the average,
because the pay in them is this app's estimate rather than a payslip.

The data lives only on the phone, so two things guard it: `askPersist()` asks
the browser for persistent storage on boot, and `S.backupOn` records the last
download so Home can nudge when it goes stale.
