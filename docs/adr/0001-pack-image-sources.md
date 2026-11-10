# 0001 – Pack images: official Wizards images, set symbols otherwise

Date: 2026-11-09 · Status: accepted

## Context

Every set is shown with one booster pack. The pipeline used to cut these out of TCGplayer
product photos. The TCGplayer Terms of Service do not allow using their material elsewhere
without written permission.

The Wizards Play Network has a product page per set (`wpn.wizards.com/en/products/<slug>`)
with official images on Contentful. The Fan Content Policy covers Wizards material, logos
included, as long as the logos are not changed.

## Decision

- `sources/wizards.py` finds the page of a set by its name (with the prefix
  `magic-the-gathering-` as a second try) and picks the single booster image: Play, Set,
  Draft, Beyond, plain, Collector. Displays, bundles, kits and infographics are skipped.
- Only sets released since War of the Spark (2019-05-03) are looked up. A check of every set
  on the site on 2026-11-09 found a single-pack image for all sets since Throne of Eldraine
  except Double Masters and Time Spiral Remastered, and for War of the Spark. No older set has
  one.
- An official image is stored once; its URL in `packs/sources.json` means the page is not
  requested again. Sets without one are checked again on every build (a handful of requests,
  one per second).
- Transparent images are cropped and scaled. Photos on white (2019/2020) lose their 4-pixel
  grey frame and go through the cut-out.
- The renders since 2024 show the pack slightly turned. `make_upright` maps the four corners
  of the outline onto a rectangle, so every pack faces the viewer like the older images.
  Images whose corners already sit on their bounding box stay untouched.
- Sets without an official image get no pack image; the website shows their set symbol.
  Images that no set uses any more are deleted, so earlier TCGplayer photos do not linger in
  the build cache. TCGplayer is not used at all.

## Consequences

- 52 sets, all of Standard among them, show an official image; 130 show their set symbol.
- Images from 2021–2023 are smaller (about 270 × 500 pixels instead of about 310 × 590). On
  the tiles (190 pixels high) there is no visible difference; on the set page they are
  slightly softer on high-density screens.
- Turning the renders changes the image geometry slightly. Whether that counts as changing
  the logos in the sense of the Fan Content Policy is open; without it the 2024+ packs lean.
- Still open: images for the older sets.
