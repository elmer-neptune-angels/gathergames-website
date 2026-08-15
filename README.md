# GatherGames Website

Temporary one-page marketing site for [GatherGames](https://gathergames.io) — local-multiplayer family games for iPhone and iPad, a [Neptune Angels](https://neptuneangels.com) product.

Static site (plain HTML/CSS/JS), deployed on Vercel. Push to `main` auto-deploys.

- App source: `elmer-neptune-angels/gather` (private)
- Style mirrors `elmer-neptune-angels/neptune-angels-website`

## Landing page concepts

`designs/` holds four full-page concepts for the next version of the landing page. Open
`designs/index.html` to compare them side by side, or any page directly:

| Concept | File | Direction |
| --- | --- | --- |
| Back Seat | `designs/back-seat.html` | Highway signage — leads with the road trip |
| Eight Seats | `designs/eight-seats.html` | Dark, premium; hero animates seats filling in tap order |
| No Signal | `designs/no-signal.html` | Apple-product-page restraint; offline is the whole pitch |
| Deck of 37 | `designs/deck-of-37.html` | Risograph print; the 37-game collection is the hero |

Each page is self-contained (no build step, no external fonts or CDNs) and carries the same
content, so picking one is a design decision rather than a copy decision.

Before going live with whichever wins:

1. **App Store link** — search each file for `AT LAUNCH`. The button's `href="#notify"` becomes the
   real App Store URL, and the "Coming soon" marker next to it comes out.
2. **Apple badge** — the buttons are custom-styled. Apple's marketing guidelines ask for their
   supplied badge artwork on live pages; swap it in at that point.
3. **Notify form** — the email capture is a stub that only updates its own button. Point it at a
   real list (Formspree, Buttondown, ConvertKit) before shipping.
4. **Game titles** — `Deck of 37` and `Back Seat` show the five known titles and render the rest as
   placeholders. Search for `TODO` to drop in the full list.
5. **Typography** — the pages use system font stacks so they load instantly and render identically
   offline. If you want more character, `Back Seat` and `Deck of 37` are the two that would gain
   most from a licensed display face.
