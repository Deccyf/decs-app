# Dec's Tracker

An offline PWA for one person's money: pay and PAYE, the cash flow between pay
days, bills, debts, savings, house jobs, card collections and a games log. No
framework and nothing to install at runtime — it ships as a single `index.html`
that GitHub Pages serves and a phone keeps working with no signal.

## Layout

```
src/
  page.html          the HTML skeleton, with <!--@css--> <!--@seed--> <!--@js--> placeholders
  styles.css         all styling; every colour is a token, so dark mode is a swap
  seed.json          the defaults a fresh install starts from
  calc.js            pure functions, no DOM — pay, tax, bank holidays, cash flow, savings
  app/core.js        state, storage, PIN encryption, undo history, theme, dialogs, html helpers
  app/views.js       one function per tab, returning HTML strings
  app/components.js  pieces the views share
  app/chart.js       the earnings canvas
  app/main.js        render, events, backup, boot
build.js             concatenates the above into index.html — no transforms, no dependencies
sw.js                the offline cache
test/                node:test; the browser tests need playwright (a dev dependency)
```

`npm run build` writes `index.html`. `npm test` builds first, so the tests always
run against the current source.

## Two things that must not change

**Edit `src/`, never `index.html`.** The built file is committed because Pages
serves it, but every build overwrites it.

**The localStorage key stays `decs-stuff-v1`.** Renaming it would orphan every
figure already saved on a phone. The theme sits beside it under
`decs-stuff-v1:theme`.

Bump `V` in `sw.js` whenever `index.html` changes, or installed phones keep
serving the old cache.

## How the figures work

Everything below lives in `calc.js` as a pure function, which is why the sums
can be tested without a browser.

**Pay.** `payCalc` works a 4-weekly payroll: cumulative PAYE against the tax
week, NI per period from thresholds derived the way HMRC derives them (weekly,
rounded up, multiplied), overtime and Sunday premium, salary sacrifice and
allowances, pay rises with backpay, and Southeastern's EU holiday pay. Rates
live in `pay.taxYears`, one entry per year, so April is a data change rather
than a code change. The personal allowance is whatever the tax code says — the
app does not work the £100k taper out, because payroll does not either, so it
says when the code on file has clearly not been updated.

A payslip beats a projection. `pay.actual` holds a real net against a pay day,
and once one is typed it is what every downstream figure spends — the cash flow,
the year's total, the Home tile — while the breakdown stays as it was worked out,
because that is what explains the number. `projected` and `diff` are kept beside
it so the two can be compared. Pay day itself counts as gone, not still to come:
BACS lands in the small hours, so `payCalc` rolls past today and `runway` carries
today's pay into the balance.

**The cash flow.** `runway` answers one question: what is genuinely free to
spend before the next pay day. The bank balance is typed with the date it was
true (`balance` / `balanceOn`) and carried forward from there, with the bills
due since coming off it. Bills landing on a weekend or bank holiday can shift to
the next or previous working day (`shiftDue`, with Easter worked out rather than
tabulated). An overdraft counts as spendable room; a buffer does not.

**Bills.** A bill can have months off (`skip`, month numbers) for council tax
over ten instalments or a gym frozen for winter, and a month it changes price
each year (`review`), which nudges once a year until a new figure is typed or
the old one confirmed. Changing an amount offers to keep the old price as a
separate dated row, which is what makes the price history real. A bill can link
to a debt type instead of carrying its own amount.

**Debts.** A balance is read off a statement and carried forward by `debtNow`:
the repayments due since come off it and interest goes back on at a twelfth of
the APR, so a mortgage drops by far less than its repayment. `balanceOn` records
the day the typed figure was true and the typed figure is never rewritten, so
retyping from the next statement restarts the projection. A blank APR is treated
as unknown and flagged, because taking the whole repayment off with no interest
flatters a real debt badly; type 0 for a genuine 0% deal. `rateEnds` records
when a fixed rate runs out and says so once it has.

**Savings.** One pot and a list. `money.savings` holds a single balance plus the
things being saved for, and `savingsCalc` measures every one of them against the
whole balance, because it is one pile of money rather than several. Buying one
takes what you paid out of the pot and moves it to the got list. The older
shape, several pots each holding their own money, is folded into this on load.

**Day-to-day spending** is inferred, not typed. Every balance read off the bank
is appended to `money.balanceLog`, and `spendLog` takes each pair of readings,
works out what the bills and pay should have done in between, and calls the
remainder spending. Stretches touching a pay day are shown but kept out of the
average, because the pay in them is this app's estimate rather than a payslip.

## The app layer

**Undo is general.** `commit()` snapshots the state before each change, and the
arrow in the header (or Ctrl+Z, Ctrl+Shift+Z to redo) puts the previous snapshot
back whole — a removed bill, a mistyped figure, a reset, a backup restored over
the top. The history is in memory only and never written to the device, so a
PIN-locked app leaves no unencrypted trail.

**The PIN lock encrypts rather than hides.** PBKDF2-SHA256 at 310,000 iterations
stretches the PIN into a non-extractable AES-GCM-256 key and the stored blob is
sealed with it. The PIN itself is never stored, so a forgotten one cannot be
recovered. Backups are deliberately written in the clear, which is the only way
back in.

**The data lives on one phone**, so two things guard it: `askPersist()` asks the
browser for persistent storage on boot, and `S.backupOn` records the last
download so Home can nudge when it goes stale.

**Rendering is a full redraw.** Every change rebuilds the view from state, with
focus remembered by what the field edits and put back afterwards, and an error
boundary so a half-finished backup cannot white-screen the app. `normalize()`
fills in anything a restored file is missing and is where old data shapes are
migrated.

## Tests

See [test/README.md](test/README.md). The short version: `npm test` runs both
suites, the calc tests need no browser, and the browser tests skip rather than
fail if Playwright is not installed.
