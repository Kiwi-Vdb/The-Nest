THE NEST F8 EDITOR
==================

The F8 editor has two save levels:

1. Save Draft Locally
   - Stores the layout only in this browser.
   - Useful while you are still experimenting.
   - Friends and new visitors will not see it.

2. Publish For Everyone
   - Stores the page layout securely in the Cloudflare Worker/D1 database.
   - Every visitor receives the same positions automatically.
   - Requires you to be signed in with Twitch on Shop or My Nest.
   - Only the configured owner Twitch account can publish.

RECOMMENDED WORKFLOW
--------------------

1. Sign in with Twitch on Shop or My Nest.
2. Open the page you want to edit.
3. Press F8.
4. Move and resize the panels.
5. Use Save Draft Locally while testing.
6. Click Publish For Everyone when the page is ready.

The editor also shows:

- Name: the friendly label
- Editor ID: the stable layout key
- CSS selector: the exact CSS selector

CSS EXPORT BACKUP
-----------------

Copy All CSS and Download CSS Patch remain available as an offline backup.
When using that method, paste the generated override block at the very bottom
of the matching page CSS file and replace only an older F8 override block.
Do not replace the original styled selector rules.
