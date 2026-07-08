# The Nest Website

A clean standalone website build for the Kiwi Birb / BAR companion project.

## Pages

- `index.html` - Welcome page
- `hub.html` - Main HUB
- `twitch.html` - Twitch page
- `discord.html` - Discord page
- `community.html` - Community page
- `events.html` - Events page
- `shop.html` - Nest Shop

## Data

The website reads placeholder JSON from the `/data` folder.

Later, the Kiwi Birb Stream Assistant can update these files:

- `data/twitch.json`
- `data/community.json`
- `data/shop.json`
- profile/unlock/event data files added later

## Local preview

Open `index.html` in a browser.

For JSON loading to work reliably, run a local server from this folder:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## GitHub Pages

This folder can become its own GitHub Pages repository later.