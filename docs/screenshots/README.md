# Screenshots

These images back the gallery in the top-level [README](../../README.md). They're
WebPs captured by `scripts/screenshots.mjs` (run it with no arguments for usage):

```sh
GH_URL=https://your-gamehub GH_TOKEN=<api token> PRIVATE=1 GAME_ID=<id> node scripts/screenshots.mjs
```

`PRIVATE=1` hides library/system game counts, swaps your username and your
friends' names for "Player" and hides avatars. An API token is only sent to
`GH_URL`. `set-integrity` needs an admin login (`GH_USER`/`GH_PASS`).

## Shot list

Capture at a **16:9 desktop viewport (≥1920×1080, 2× / retina preferred)**,
default dark theme, on a library with real art so covers look good. Sign in as
an account with data, hide any personal/private info you don't want public.

| File | Page | What it should show |
| --- | --- | --- |
| `home.webp` | `/` | Big Picture home — featured/recent hero carousel with the **What's New** tab selected below |
| `library.webp` | `/` → Library | The cover grid with a few filters visible (systems/genre); avoid a screen full of placeholder covers |
| `game.webp` | `/game/<id>` | A well-scraped game: hero art, title, Play button, playtime/achievements, the Activity/Your Stuff/Game Info tabs |
| `recommended.webp` | Home → **Recommended** tab | The curated shelves (Play Next, Jump Back In, hidden gems) fully loaded (no green loading placeholders) |
| `set-integrity.webp` | Settings → Maintenance → **Set Integrity** | The verdict tiles (Verified / Bad-hack / Unknown) and the audit + missing-from-set sections |
| `play.webp` | `/play/<id>` | A game running in the browser (EmulatorJS), ideally a recognizable title |
| `saves.webp` | `/game/<id>` → **Your Stuff** | The Saves & states panel with a battery save and a few states (with thumbnails) |
| `mobile.webp` | `/mobile` at 430×932 | The mobile home (Jump back in, What's New) |
| `system.webp` | `/systems/<slug>` | A system's grid with the A–Z jump strip showing at the right edge (`SYSTEM=nes`) |

Optional extras you can add and reference in the README if you want a bigger
gallery: `collections.webp`, `scraping.webp` (provider priority list), `firmware.webp`.

## Tips

- Wait for art/thumbnails to finish loading before capturing (no shimmer/placeholders).
- Keep the OS cursor out of frame.
- Optimize before committing (e.g. `pngquant` / `oxipng`) so the repo stays light.
</content>
