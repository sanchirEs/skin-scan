---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

## Scope

The phase 1 mobile flow at `/`: welcome, tips, camera, analyzing, quiz, report, order, thank you. Visitor mode: Operate. Audience: skincare customers on their phones, usually arriving from social media. Task: scan, understand the reading, and send an order request. Proof and content: measured readings per face zone, with sample products until the real catalog arrives. Constraints: the photo never leaves the phone, wording is cosmetic, skin tone is never scored, and the screen acts as the light.

## Direction contract

THESIS: The skin report reads like a test strip held against its printed key. Each measure is a colored pad, and the reading is a mark on a calibrated key that you can check against your own face. This refuses the category default: a circular "skin score 78" gauge on a pastel gradient with a glossy beauty photo.

OWN-WORLD: Strip white #F3F5F2 ground and ink #15191B, with one deep vial-cap teal #0E4D48 for the top band and the primary actions. Colour lives only inside pads, keys, the tone key and the photo. The redness key runs pink to crimson, evenness sand to umber, dark circles lilac-grey to plum, and shine matte to sheen. Type is Archivo: expanded width for headings, normal width for body, condensed width for key numerals. Corners: strips 10px, pads 4px, cards 14px, inputs 10px, buttons full pill.

STORY: You learn what the camera actually measured and where, and you see that your tone is a place on a range, not a problem. You trust the routine because every product names the reading it answers. Then you tap "Order these".

FIRST VIEWPORT: On the welcome screen at 390x844, a teal top band (brand left, "about 1 minute" right) sits above an expanded headline, two lines of plain explanation, and a full-width example strip of four labelled pads marked "example". The primary pill "Start skin check" is pinned to the bottom. On the report, the strip leads, with the mirrored photo and its zone overlay right below it.

FORM: Reagent test strip read against its key, candidate 4 of 7 (face chart, swatch deck, back-of-pack label, test strip, vanity mirror, skin forecast, herbarium). seed: 7e183cfb. The camera screen shows one instruction at a time, from terminal wayfinding. The report layout is mirrored and bilateral like the face, from labanotation. Colour is kept inside the keys, from the lexicon plate. States stamp instead of vanishing (from your answers, removed), from the ticket wallet. Each reading is paired with the zone that proves it, from monochrome product marketing.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: the strip develops. After analysis, the pads fill from strip white to their reading colour one after another, then each key's marker settles at the reading. It plays once, and is instant under reduced motion.

## Unresolved

Brand name, logo, palette override, currency, launch country, real catalog.
