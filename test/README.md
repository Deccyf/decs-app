# Tests

```sh
npm test            # everything
npm run test:calc   # pure functions only, no browser needed
npm run test:ui     # browser tests
```

All three build `index.html` from `src/` first, so a stale build can never be
what gets tested.

`test/calc.test.js` reads the calc module straight out of the built
`index.html` rather than importing a module, because the app ships as one file
and there is nothing else to import. `extract.js` does that slicing and is the
only place that needs touching if the module's opening line changes.

`test/ui.test.js` drives the real page in Chromium over a throwaway static
server. Playwright is a dev dependency; without it those tests skip rather than
fail, so `npm test` still works on a bare checkout. Set `PW_CHROMIUM` to use a
browser you already have:

```sh
PW_CHROMIUM=/path/to/chromium npm test
```

`test/variant.test.js` builds the pay-only variant (`variants/vince.json`)
itself and drives that: the build is the same page with another seed and
nothing else, data stored by the version it replaces opens with nothing lost,
there is no way to a screen the variant does not have, and — with the main app
served beside it on one address, as the two are published — each keeps to its
own storage key and its own offline cache.

The suites pin "today" to a fixed date, so the figures are the same on every
run — a lot of them assert exact pounds and pence. The browser tests do it by
replacing `window.Date` before the page loads, and each one asserts that the
page logged no console or uncaught errors.

The last sections of each file hold the regressions from the two full reviews:
each test there reproduces a bug that was found and fixed, so a failure in one
means that bug is back.

Two things the browser tests have to know about how a browser behaves. Filling
a box and then dispatching `change` gives the page two change events, the
second from the browser itself when the redraw takes focus away; that is
harmless for a plain edit, but a test of something that depends on the order of
edits should type and Tab the way a person does. And a date box reports a whole
date at every digit typed, which is why dates typed by keyboard are tested key
by key.

Two habits worth keeping when adding tests here. Seed the fixture with the
shape the app stores rather than a raw object, since `normalize()` fills in
defaults and a `deepEqual` against the raw fixture will drift. And assert
against the element you mean — several selectors, `.ledger .lrow` among them,
appear in more than one card.
