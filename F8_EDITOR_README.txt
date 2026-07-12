THE NEST F8 EDITOR
==================

The F8 editor now shows three separate names for the selected element:

1. Name       - the friendly label shown in the editor
2. Editor ID  - the stable internal key used by browser-saved layouts
3. CSS selector - the exact selector to find in the page CSS file

Example:
  Name: VIEW ALL CLIPS BUTTON
  Editor ID: clips-button
  CSS selector: .clips-hotspot

PERMANENTLY SAVING A LAYOUT
---------------------------

1. Press F8 and position the elements.
2. Click "Copy All CSS".
3. Open the matching CSS file, such as css/twitch.css.
4. Paste the generated override block at the VERY BOTTOM of the file.
5. On future exports, replace only the old block between:

   THE NEST F8 LAYOUT OVERRIDES: ... START
   THE NEST F8 LAYOUT OVERRIDES: ... END

Do not replace the original selector blocks. The original blocks contain visual
styling such as backgrounds, borders, animation, typography, and hover effects.
The F8 override block changes only left, top, width, and height.

"Copy Selected Override" follows the same rule: paste it at the bottom instead
of replacing the original styled selector.

The editor now reads CSS layout values before visual hover transforms are
applied, preventing animated elements from reporting misleading coordinates.
