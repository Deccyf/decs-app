# Tests

```sh
npm test            # everything
npm run test:calc   # pure functions only, no browser needed
npm run test:ui     # browser tests
```

`test/calc.test.js` reads the calc module straight out of `index.html` — the app
ships as one file with no build step, so the tests parse that file rather than
importing something that doesn't exist. If the module's opening line changes,
`extract.js` is the only place that needs updating.

`test/ui.test.js` drives the real page in Chromium. Playwright is a dev
dependency; without it those tests skip rather than fail, so `npm test` still
works on a bare checkout. Set `PW_CHROMIUM` to use a browser you already have:

```sh
PW_CHROMIUM=/path/to/chromium npm test
```

Both suites pin "today" to a fixed date, so the figures are the same on every
run — several of them assert exact pounds and pence.
