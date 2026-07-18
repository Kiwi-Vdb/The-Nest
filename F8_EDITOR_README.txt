THE NEST F8 LAYOUT STUDIO
=========================

QUICK WORKFLOW
--------------

1. Keep Kiwi Birb open.
2. Open Kiwi Birb > The Nest.
3. Choose a page and click Open F8 Layout Editor.
4. Press F8 in the browser.
5. Drag an outlined button/window to move it.
6. Select it and drag any outside handle to resize it.
7. Click Save & Publish.

That one button:

- saves the current layout for every visitor;
- writes a durable snapshot under The Nest/data/layouts/;
- commits only that page's snapshot; and
- pushes the commit using the Git credentials already available to Kiwi Birb.

Unrelated website files are never included in the layout commit.

AUTOMATIC DRAFTS
----------------

There is no separate draft-save step. Every move, resize, keyboard nudge, and
number-field edit is saved automatically in the browser. If the browser closes
before publishing, the draft is restored the next time that page opens.

EDITOR CONTROLS
---------------

- Editing dropdown: selects a button/window even when it is small or covered.
- Eight outside handles: resize from any side or corner without clipping.
- X/Y/Width/Height: exact percentage controls.
- Content scale: available only on panels that support internal scaling.
- Grid and Snap: optional alignment helpers.
- Undo/Redo: up to 100 layout changes.
- Dock button: moves the editor between the left and right edge.
- Ctrl+S: Save & Publish.
- Arrow keys: nudge the selected item; hold Shift for a larger step.

PUBLISHING
----------

When signed in with the owner Twitch account, Save & Publish updates the
Cloudflare layout immediately. With Kiwi Birb open, it also commits and pushes
the Git snapshot. The public website compares both copies and uses whichever
one is newest.

Advanced & backups contains reload, discard, CSS copy/download, and JSON
download tools. These are optional and are no longer part of the normal flow.
