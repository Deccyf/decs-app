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
  calc.js            pure functions, no DOM — pay, tax, bank holidays, cash flow, savings, spending
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
than a code change. The personal allowance is whatever the tax code says, as
the code's number × 10 + 9 — 12,579 for 1257L, which is what HMRC's own tables
use — and the app does not work the £100k taper out, because payroll does not
either, so it says when the code on file has clearly not been updated.

The schedule always holds the whole of the current tax year, since its totals
are on screen, plus last calendar year while its holiday pay is still an
estimate, plus four years ahead. Cumulative tax needs every pay day since 6
April, so when the schedule starts mid-year the earlier ones are worked out and
left out of what is returned. A fourteenth pay day in one tax year (HMRC's
"week 56", which a 28-day cycle hits every few years) is taxed on its own four
weeks. Holiday pay lands on a March pay day or not at all, so a year kept for
the record is never paid twice. Two backdated rises are each measured against
the one before, not both against the old salary. Blank settings fall back to a
fresh install's defaults rather than turning every figure into NaN.

A payslip beats a projection. `pay.actual` holds a real net against a pay day,
and once one is typed it is what every downstream figure spends — the cash flow,
the year's total, the Home tile — while the breakdown stays as it was worked out,
because that is what explains the number. `projected` and `diff` are kept beside
it so the two can be compared, and `totals.diff` says how far the projection has
run from the payslips across the year. It works for a pay day that has not
happened yet, which is the point: the payslip turns up first. `payslipLead` is
how many days early, and `needsPayslip` is the one pay day worth asking about.

**The cash flow.** `runway` answers one question: what is genuinely free to
spend before the next pay day. The bank balance is typed with the date it was
true (`balance` / `balanceOn`) and carried forward from there, with the bills
due since coming off it. Pay day counts as gone rather than still to come, since
BACS lands in the small hours: `payCalc` rolls past today and `runway` carries
today's pay in, so the money is there from midnight rather than the next
morning. The one pay day never carried is the one still being shown as coming.
Bills landing on a weekend or bank holiday can shift to the next or previous
working day (`shiftDue`, with Easter worked out rather than tabulated). An
overdraft counts as spendable room; a buffer does not.

A bill dated pay day itself comes out of the pay rather than before it (`onPay`):
it leaves in the same early-morning batch the pay lands in, so rent on pay day
is not a shortfall, and the period that starts that day is the one that counts
it. Money the app moves itself — the card cleared with **Pay now** — is kept as
`balanceAdj` on top of the typed figure rather than rewriting it: the reading
keeps its date, the bills carried since still come off, and the next balance
typed takes the adjustment into the log with it.

**Bills.** A bill can have months off (`skip`, month numbers) for council tax
over ten instalments or a gym frozen for winter, and a month it changes price
each year (`review`), which nudges once a year until a new figure is typed or
the old one confirmed. `ended` is the last month paid, and it can be behind you
or ahead: a phone contract with its final month known stays live and counted,
showing the payments left, then drops out of the totals and the cash flow on its
own — once the last real payment has gone, which can be a few days into the
next month when a weekend moves it. A bill whose `started` month is still ahead
is not counted until it comes. The price check runs from the review month for
six months, across a year end too, and choosing the month counts as knowing
today's price. Changing an amount offers to keep the old price as a separate dated row,
which is what makes the price history real, and a known final month carries over
to the new price. A bill can link to a debt type instead of carrying its own
amount (`billAmount` / `debtDue`): it then pays each debt of that type only while
the debt still owes something, so a card's repayment stops when the card
clears, the last payment being only what was left.

**Debts.** A balance is read off a statement and carried forward by `debtNow`:
the repayments due since come off it and interest goes back on at a twelfth of
the APR, so a mortgage drops by far less than its repayment. `balanceOn` records
the day the typed figure was true and the typed figure is never rewritten, so
retyping from the next statement restarts the projection. A debt with a balance
but no date is taken as true today on load, the same rule as the bank balance,
so nothing entered before dates were kept sits still for ever. The expected
clear date counts the payments with `debtPayoff` and takes the last of them off
the real schedule (`payDates`): the funding bill's dates, moved off weekends and
missing its months off, or monthly from the statement where no bill pays it.
Changing the rate or the repayment carries the balance to today on the old terms
first, so the new ones only apply from now — except a blank APR, which was never
a rate, so filling it in reworks the carry honestly from the statement. One
thing still to know: retyping a balance moves the anchor, so a card that
cleared before its new statement is taken as having paid on the dates in
between. A dated history of terms would fix that; it is on the list. A blank APR is treated
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

## What it nudges about

Home carries a "Needs a look" card, and it only exists when there is something
in it. Every row is one tap to the place that deals with it. The red ones come
first and only three show until asked for the rest, so a long list never pushes
the figures off the screen. They are the main
way the app says anything, so they are worth knowing as a set before adding
another:

- **The cash flow.** Short before pay day or into the overdraft; pay day has
  been since the balance was typed; a balance a week old; a card due to clear in
  the next few days.
- **Bills.** One with no payment date, so it is missing from the cash flow; a
  price that moved last month; a price due to change this month.
- **Debts.** A fixed rate that has run out, so the figures still assume the old
  one; a debt being carried with no APR, which flatters it badly.
- **Pay.** The payslip figure, from a few days before pay day until a few days
  after, then it lets go — once there is a salary to have a payslip for.
- **The data itself.** No backup yet, or the last one over a month old.

Each clears by dealing with it, or by saying once that nothing has changed — a
bill price confirmed, a rate typed in. None of them can be swiped away on its
own, because a reminder that can be dismissed without doing anything is a
reminder that will be, and none of them nags forever either.

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

It is there for a phone picked up while unlocked, so that phone cannot undo it:
changing the PIN or turning it off asks for the one in use first. There is still
nothing stored to compare against — `pinMatches()` seals a byte with the key in
hand and checks the typed PIN's key opens it. While a PIN is set the figures are
covered the moment the app goes to the background (`body.veiled`), so the
picture the phone keeps for its app switcher shows nothing, as far as the phone
gives the page time to redraw, and after five minutes away it locks. Copying a
backup to the clipboard says first that it is plain text, since clipboard
history and sync are outside anything the PIN covers.

**The data lives on one phone**, so two things guard it: `askPersist()` asks the
browser for persistent storage on boot, and `S.backupOn` records the last
download so Home can nudge when it goes stale.

**Rendering is a full redraw.** Every change rebuilds the view from state, with
focus remembered by what the field edits and put back afterwards, and an error
boundary so a half-finished backup cannot white-screen the app. A redraw waits
for a pressed mouse button to come up, so the click that blurred a field still
lands. `normalize()` fills in anything a restored file is missing, drops list
entries that are not objects and months or dates that are not real, and is
where old data shapes are migrated. A restore is shaped on a copy and only put
in place once that works, so a bad file changes nothing. `payCalcNow()` keeps
the pay schedule between redraws until the pay settings or the date change.

**Storage is read even when it cannot be written**, so a phone out of space
still shows its figures; a failed save is said once and every later save still
tries. Anything stored that cannot be read is kept aside under
`decs-stuff-v1:unreadable` rather than saved over. Another copy of the app open
in another tab reloads this one when it saves, and with no key in hand nothing
is written over data that copy has encrypted. A PIN blob records the iterations
it was really sealed at, and one from an older strength is resealed at today's
the moment it is opened.

**Screen and keyboard.** Every label is tied to its field, so tapping the words
focuses the box and a screen reader names it by them. The tab bar is a proper
tab list: one tab stop, on the tab in use, with the arrow keys (and Home and
End) moving along it. Dates are formatted with non-breaking spaces, so "12 Mar
2027" wraps as a whole, and the same goes for "7h Sunday" and the separators
between figures. Colours are tokens with text contrast of at least 4.5:1 on
their backgrounds and field edges at 3:1, and a theme picked in Settings sets
`color-scheme` too, so the browser's own date pickers and dialogs follow it.

## Tests

See [test/README.md](test/README.md). The short version: `npm test` runs both
suites, the calc tests need no browser, and the browser tests skip rather than
fail if Playwright is not installed.
