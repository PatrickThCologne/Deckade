# 0004 – Counting visits with GoatCounter

Date: 2026-11-10 · Status: accepted

## Context

The operator wants to know how many people visit the site and where they come from (e.g.
Reddit). GitHub Pages keeps access logs but shows none of them, and its repository traffic
only counts views of the repository on github.com. Google Search Console only sees visits from
Google's search results. So the pages have to report visits themselves.

The site promised no cookies, nothing stored in the browser and no analytics. Cookies that are
not strictly necessary need consent in Germany (§ 25 TDDDG), which would mean a consent banner.

## Decision

- Visits are counted with GoatCounter (goatcounter.com, free for personal sites). According
  to its privacy page it sets no cookies, stores nothing in the browser, keeps only the country
  of the IP address and everything else as totals; its servers are at Hetzner in Germany and
  Finland.
- The count script is pinned (`count.v5.js`) with its hash (`VISIT_COUNTER` in
  `web/src/config/site.ts`), so a changed script does not run.
- It is loaded only in the production build and only once a page is shown
  (`web/src/lib/visit-counter.ts`): the tabs are prerendered on hover and the script skips
  prerendered pages. It skips localhost on its own.
- The privacy notice names GoatCounter, what it receives and the legal basis (Art. 6(1)(f)
  GDPR). There is no consent banner.

## Consequences

- One more third party receives each visitor's IP address with every page view.
- Whether counting without consent is allowed is an assessment, not legal advice: nothing is
  stored in the browser, but the script reads the screen size. GoatCounter's own view is that
  consent is "probably" not needed.
- If GoatCounter stops, the site works on; only the counting ends.
- The dashboard is at vazabee.goatcounter.com.
