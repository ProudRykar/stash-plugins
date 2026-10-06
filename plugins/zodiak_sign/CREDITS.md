# Credits

## Zodiac sign symbols

The twelve sign symbols used by this plugin are the zodiac symbol artwork by
**Denis Moskowitz**, obtained from Wikimedia Commons:

```text
https://commons.wikimedia.org/wiki/Category:Astrological_symbols
```

The individual files used are the "fixed width" variants:

| Sign        | File                                                             |
| ----------- | ---------------------------------------------------------------- |
| Aries       | [Aries symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Aries_symbol_(fixed_width).svg) |
| Taurus      | [Taurus symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Taurus_symbol_(fixed_width).svg) |
| Gemini      | [Gemini symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Gemini_symbol_(fixed_width).svg) |
| Cancer      | [Cancer symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Cancer_symbol_(fixed_width).svg) |
| Leo         | [Leo symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Leo_symbol_(fixed_width).svg) |
| Virgo       | [Virgo symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Virgo_symbol_(fixed_width).svg) |
| Libra       | [Libra symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Libra_symbol_(fixed_width).svg) |
| Scorpio     | [Scorpius symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Scorpius_symbol_(fixed_width).svg) |
| Sagittarius | [Sagittarius symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Sagittarius_symbol_(fixed_width).svg) |
| Capricorn   | [Capricornus symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Capricornus_symbol_(fixed_width).svg) |
| Aquarius    | [Aquarius symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Aquarius_symbol_(fixed_width).svg) |
| Pisces      | [Pisces symbol (fixed width).svg](https://commons.wikimedia.org/wiki/File:Pisces_symbol_(fixed_width).svg) |

Note that Commons spells the Scorpio and Capricorn files `Scorpius` and
`Capricornus`, following the IAU constellation names.

### License

```text
Creative Commons Attribution-Share Alike 4.0 International
CC BY-SA 4.0
https://creativecommons.org/licenses/by-sa/4.0/
```

### Changes made

The original files were modified in the following ways:

* The single `<path>` element's `d` attribute was extracted and is embedded
  directly in `index.js` instead of being loaded as a separate file.
* The per-element presentation attributes were removed (`stroke:#000`,
  `clip-rule`, `stroke-opacity`, `stroke-dasharray`). The equivalent
  properties are now applied through CSS so the symbols follow the Stash
  theme and the per-sign colours.
* `stroke-linecap`, `stroke-linejoin` and `stroke-miterlimit` keep their
  upstream values (`round`, `round`, `4`) and are declared once in CSS
  instead of on every element.
* `stroke-width` was raised from the upstream `0.6` to `0.7` so the symbols
  stay legible at the 1.35rem badge size.
* The `width` and `height` attributes were dropped in favour of the
  `viewBox`, which is preserved unchanged at `0 0 12 12`.
* `overflow: visible` was added in CSS so strokes are not clipped at the
  edges of the viewBox.

No geometry was changed. The path data is byte-for-byte identical to the
upstream files.
