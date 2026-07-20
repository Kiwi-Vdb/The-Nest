# The Nest Website

Clean standalone build for The Nest.

## What this version is

This is the first proper structure pass:
- reusable rail system
- embedded Weave
- Keystone-style panels
- separate pages
- JSON data folder ready for the Stream Assistant later

## Pages

- index.html
- hub.html
- twitch.html
- discord.html
- community.html
- events.html
- shop.html

## How to run locally

Open `index.html`, or for best results run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## F8 Layout Studio

The recommended editor is built into Kiwi Birb. Open the **The Nest** tab,
choose a page, and click **Open F8 Layout Editor**. Press F8 in the browser,
move or resize the outlined items, then click **Save & Publish**.

Drafts save automatically. Publishing updates the global Cloudflare layout and
asks Kiwi Birb to write `data/layouts/<page>.json`, commit only that snapshot,
and push it with the computer's existing Git credentials. The website loads the
newest Cloudflare or Git snapshot, so the Git copy is also a durable fallback.

See `F8_EDITOR_README.txt` for shortcuts and troubleshooting.

## How to upload

Copy the contents of this folder into your GitHub repository, commit, and push.

## Kiwi Birb prediction connection

Keep this `The Nest` folder beside the `Kiwi Birb` folder. Kiwi Birb v3.4.3 and later writes the current public prediction state to:

```text
data/prediction.json
```

The Twitch page refreshes that file every 15 seconds. Kiwi Birb's Nest Sync commits and pushes it automatically after prediction changes.

## Kiwi Birb recent clips connection

Kiwi Birb v3.4.4 and later refreshes the five newest public Twitch clips in:

```text
data/twitch.json
```

Each clip window on `twitch.html` is a separate F8-editable element. Clicking a populated card opens a larger Twitch clip player; the card also shows the clip title, duration, and view count.

## Twitch Current Game

Kiwi Birb v3.10.0 publishes Twitch `gameId`, `gameName`, and `gameBoxArtUrl`
alongside live status in `data/twitch.json`. The Twitch page selects its panel
automatically:

- Beyond All Reason uses the rich BAR lobby object and cached map artwork.
- Dota 2 uses a dedicated MOBA presentation.
- Every other category shows Twitch artwork, stream title, and viewers.
- Offline or stale data returns to a neutral automatic waiting state.

The BAR presentation still supports these states:

- `in_lobby`
- `in_game`
- `not_in_lobby`
- `unavailable`

Map previews are cached automatically under `assets/maps/`; no manual map image
collection is required. The entire Current Game card remains one movable and
resizable F8 element using the selector `.current-game-card`.
