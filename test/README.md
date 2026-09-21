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

Both suites pin "today" to a fixed date, so the figures are the same on every
run — a lot of them assert exact pounds and pence. The browser tests do it by
replacing `window.Date` before the page loads, and each one asserts that the
page logged no console or uncaught errors.

Two habits worth keeping when adding tests here. Seed the fixture with the
shape the app stores rather than a raw object, since `normalize()` fills in
defaults and a `deepEqual` against the raw fixture will drift. And assert
against the element you mean — several selectors, `.ledger .lrow` among them,
appear in more than one card.
