# StreamElements Chat Spin Wheel Widget

This project contains a ready-to-paste StreamElements custom widget that:

- listens for `!spin` in chat
- spins a wheel animation on stream
- selects one random hero from your list
- displays the winner (and the chatter username)

## Paste Into StreamElements

1. Create a new **Custom Widget** in StreamElements.
2. Copy `widget.html` into the widget **HTML** tab.
3. Copy `widget.css` into the widget **CSS** tab.
4. Copy `widget.js` into the widget **JS** tab.
5. Copy `widget-fields.json` into the widget **Fields** tab.
6. Save and add the widget to your overlay.

## Notes

- Command matching is exact by default (`!spin`).
- While a spin is in progress, additional `!spin` messages are ignored.
- Hero list includes `INVISIBLE WOMAN` (corrected from the typo `NVISIBLE WOMAN`).
