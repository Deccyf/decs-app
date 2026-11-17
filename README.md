# Dec's Tracker

An offline PWA for one person's money: pay and PAYE, the cash flow between pay
days, bills, debts, savings, house jobs, card collections and a games log. No
framework and nothing to install at runtime — it ships as a single `index.html`
that GitHub Pages serves and a phone keeps working with no signal.

## Layout

```
src/
  page.html          the HTML skeleton, with <!--@css--> <!--@seed--> <!--@js--> placeholders (and <!--@title-->)
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
variants/            other apps built from this code: one .json each, a seed and a cache name
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

## Variants

The same code can be built around another seed, for someone else. A seed can
carry a few switches of its own, and the app reads them at start-up:

| In the seed | What it does |
|---|---|
| `title` | The app's name: page title, heading, lock screen, About. Its first letter is the tab icon. |
| `storageKey` | Where the figures are kept on the phone. Like the main app's, it must never change once in use. |
| `backupName` | What a downloaded backup is called (`<name>-<date>.json`). |
| `payOnly` | Pay and its settings only: no bar of tabs, the gear goes to Settings and back. |
| `sundayLabel` | What the Sunday line on a payslip is called. |
| `pay.sundayAtT` | Sunday hours are paid at the plain hourly rate, not a premium. |
| `pay.nonCumulative` | A week 1 / month 1 tax code: every pay day is taxed on its own. |

`variants/vince.json` is one of these: **Vince's Pay**, published from
`Deccyf/vinces-app`. `npm run build:vince` writes `dist/vince/index.html` and
`dist/vince/sw.js` (not committed here); those two files replace the ones in
his repo, whose manifest and icons stay as they are. The service worker is this
app's own with the cache renamed, and its version is the `cache` in the
variant's file — bump it there whenever his `index.html` changes.

Both apps are served from the same address, which means they share one
localStorage and one set of offline caches. That is why each has a storage key
of its own, and why each service worker clears out only the caches that carry
its own name.

## How the figures work

Everything below lives in `calc.js` as a pure function, which is why the sums
can be tested without a browser.

**Pay.** `payCalc` works a 4-weekly payroll: cumulative PAYE against the tax
week, NI per period, overtime and Sunday premium, salary sacrifice and
allowances, pay rises with backpay, and Southeastern's EU holiday pay. Rates
live in `pay.taxYears`, one entry per year, so April is a data change rather
than a code change. The personal allowance is whatever the tax code says, as
the code's number × 10 + 9 — 12,579 for 1257L, which is what HMRC's own tables
use — and the app does not work the £100k taper out, because payroll does not
either, so it says when the code on file has clearly not been updated.

The sums were checked line by line against six real payslips, and these are
the rules that make them come out to the penny — each one was a penny or
forty out before:

- **Basic pay is four weekly rates.** Payroll holds a weekly rate, to the
  penny, over 313/6 weeks in the year (the "52.1667", which is taken as the
  fraction itself however many places it was typed to). £52,000 a year is
  £996.81 a week and £3,987.24 a period, not the £3,987.22 of dividing the
  year straight down.
- **Free pay is the code's weekly figure**, rounded up to the penny, times the
  tax week, and a code over 500 is so many 500s at £96.16 plus the remainder
  (`freeWeekly`). For 1257L that is £241.92 a week where a share of the year
  is £241.90; taxable pay is floored to the pound, so those pennies move 40p
  of tax on some pay days and none on others.
- **NI thresholds for four weeks** are the year's × 4/52, rounded up: £967 and
  £3,867, which is what a payslip prints as NI-able pay to the upper limit.
  NI is then taken to the penny by HMRC's rule, which looks only at the third
  decimal place (5 or less goes down, 6 or more up).
- **The Sunday premium is a share of the hourly rate** (`pay.sundayPct`, 12%
  on Southeastern), so a rise moves it with the hourly rate — which is not
  always the old premium put up by the same percentage, to the penny — and
  back-pays it on the Sunday hours logged. A flat figure an hour
  (`pay.sundayRate`) is still there for when the share is left blank, and one
  typed before this existed is carried over as a share where it is exactly a
  whole percentage of the hourly rate.
- **Each fixed line is its own penny amount.** A pension that changes part-way
  through a period is the old figure for its days and the new for its days,
  each rounded, as the payslip prints them.
- **A rise typed as a percentage makes a whole-pound salary**, because a pay
  scale is in whole pounds.

Tax is cumulative, so it depends on the year so far, and this app's year can
drift from payroll's: an hour paid a period late, or taken back, is a few
pounds in the running total and 40p of tax whenever it crosses a pound.
`pay.ytd` holds the payslip's own year to date (taxable pay and tax paid)
against a pay day, and the pay days after it are worked from that instead.

The schedule always holds the whole of the current tax year, since its totals
are on screen, plus last calendar year while its holiday pay is still an
estimate, plus four years ahead. Cumulative tax needs every pay day since 6
April, so when the schedule starts mid-year the earlier ones are worked out and
left out of what is returned. A fourteenth pay day in one tax year (HMRC's
"week 56", which a 28-day cycle hits every few years) is taxed on its own four
weeks. Holiday pay lands on a March pay day or not at all, so a year kept for
the record is never paid twice. Two backdated rises are each measured against
the one before, not both against the old salary.

London weighting (`pay.london`, £ a period) sits beside the salary rather than
among the "Every period" lines, because it moves with pay: a rise can carry a
new London figure as well as, or instead of, a new salary, and the shortfall is
back-paid with the rest (`londonBack`). It is taxed and NI'd like pay but is not
part of the hourly rate, so overtime and holiday pay leave it out. A rise can be
typed either way — as a percentage, or as the new salary — and each box shows
what the other comes to. A percentage is taken of the figures in force before
the change (`payBefore`) and is turned into the new salary and London weighting,
which are what is stored, so it moves the London weighting by the same amount;
a salary typed straight in leaves the London weighting alone, with the same
percentage offered as one tap. A single plain London
line under Every period is moved across on load, once; one with dates on it, or
more than one, is left alone, and having it in both places is flagged as
counting it twice. Blank settings fall back to a
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
Pay is carried from `allRows`, which keeps the pay days worked out only to get
the tax right, so a balance typed before the schedule on show still gets its pay.
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

A payment that leaves the bank before the day it was expected would be taken
off twice: once in the balance typed, and again when its date comes. Each
payment still to leave has a tick for that. Ticking one records the day the
balance was read against the month the payment was due (`bill.gone`), and
`billDates` puts that month's payment on that day instead: on or before the
reading, so it is neither carried off again nor still to come, and still
counted once in the pay period and the stretch between balances it really left
in. It stays on show, ticked, until the day it was expected, so it can be put
back.

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
clears, the last payment being only what was left. Over a run of dates
`linkedAmounts` carries each debt once and steps it from payment to payment,
which comes to the same pennies as working every date afresh from the statement
and is several times quicker. Nothing is worked over more than `SPAN_MAX`
months (125 years): past any real schedule, and there so a nonsense date costs
a moment rather than freezing the screen.

**Debts.** A balance is read off a statement and carried forward by `debtNow`:
the repayments due since come off it and interest goes back on at a twelfth of
the APR, so a mortgage drops by far less than its repayment. `balanceOn` records
the day the typed figure was true and the typed figure is never rewritten, so
retyping from the next statement restarts the projection. A debt with a balance
but no date is taken as true today on load, the same rule as the bank balance,
so nothing entered before dates were kept sits still for ever. The expected
clear date counts the payments with `debtPayoff` — month by month, interest to
the penny and then the payment, exactly as `debtNow` carries it, so the count
and the carry cannot disagree, and anything over a hundred years reads as not
clearing — and takes the last of them off
the real schedule (`payDates`): the funding bill's dates, moved off weekends and
missing its months off, or monthly from the statement where no bill pays it.
Changing the rate or the repayment carries the balance to today on the old terms
first, so the new ones only apply from now — except a blank APR being filled in,
which was never a rate, so it reworks the carry honestly from the statement. One
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
A reading that is not a real day, or is dated after today, is left out.

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
where old data shapes are migrated. It also puts right what a damaged or
hand-edited file can carry: words that are not text, ids that are not text
(the buttons find a row by its id), a bill day outside 1 to 31, a category or
treatment that is blank. A date is only a date in a year somebody could mean
(`isDate` and `isMonth` take 1900 to 2199), and a figure that is not a number
counts as nought. A restore is shaped on a copy and only put
in place once that works, so a bad file changes nothing. `payCalcNow()` keeps
the pay schedule between redraws until the pay settings or the date change.

**Typing is checked where it lands.** A number box the keyboard could not make
sense of — a lone minus sign — is refused rather than read as empty, hours
included. A date typed on a computer keyboard is taken when the box is left or
Enter is pressed, not at each digit: the browser reports a whole date at every
keystroke (the year 0002, then 0020, on the way to 2026) and redrawing on each
put the caret back at the start. A date picked from a calendar has no keys
behind it and lands at once, as on a phone. A choice box whose stored value is
not on its list shows that value rather than the first option.

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

See [test/README.md](test/README.md). The short version: `npm test` runs all
three suites, the calc tests need no browser, and the browser tests skip rather
than fail if Playwright is not installed.
