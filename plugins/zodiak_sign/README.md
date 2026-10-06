# Zodiac Sign

Stash plugin that shows a zodiac sign icon on the performer page.

The sign is derived from the performer's **Birthdate** field and is placed next to
the rating and O-Count, inside the same `quality-group` container Stash uses.

The symbols are the zodiac artwork by Denis Moskowitz from Wikimedia Commons,
used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [CREDITS.md](CREDITS.md) for the full terms and the list of changes.

## Features

* Zodiac sign icon next to the performer rating
* Calculated from the performer's existing Birthdate field, nothing extra to fill in
* Works on every performer tab (`/performers/86`, `/performers/86/scenes`, ...)
* Optional sign name next to the icon
* English and Russian sign names, following the Stash interface language
* Survives Stash re-renders and page navigation

## Usage

Open a performer page. If the performer has a birthdate, the sign appears next to
the stars:

```text
/performer/86/scenes
★ ★ ★ ★ ★  ♌
```

Hovering the icon shows the sign name and its date range.

Performers without a birthdate show nothing, so no placeholder is left behind.

## Date Ranges

| Sign           | Range           |
| -------------- | --------------- |
| Aquarius       | Jan 20 – Feb 18 |
| Pisces         | Feb 19 – Mar 20 |
| Aries          | Mar 21 – Apr 19 |
| Taurus         | Apr 20 – May 20 |
| Gemini         | May 21 – Jun 20 |
| Cancer         | Jun 21 – Jul 22 |
| Leo            | Jul 23 – Aug 22 |
| Virgo          | Aug 23 – Sep 22 |
| Libra          | Sep 23 – Oct 22 |
| Scorpio        | Oct 23 – Nov 21 |
| Sagittarius    | Nov 22 – Dec 21 |
| Capricorn      | Dec 22 – Jan 19 |

The twelve ranges form a contiguous partition of the year, so every calendar day
maps to exactly one sign.

## Settings

### Show sign name

Displays the sign name next to the icon, for example `♌ Leo`.

## Installation

### Plugin Source

Add the following plugin source to Stash:

```text
https://proudrykar.github.io/stash-plugins/main/index.yml
```

In Stash, open:

```text
Settings → Plugins → Available Plugins → Plugin Sources
```

Add the URL above and refresh the plugin list.

The plugin can then be installed and updated directly through Stash.

### Manual Installation

Clone the repository and copy the plugin directory to the Stash plugins directory:

```bash
git clone https://github.com/ProudRykar/stash-plugins.git
cp -r stash-plugins/plugins/zodiak_sign ~/.stash/plugins/zodiak_sign
```

Then reload plugins from:

```text
Settings → Plugins → Reload Plugins
```

## How It Works

The plugin is frontend-only. It has no backend process and no own database.

1. Stash renders the performer page through its `PerformerPage` component.
2. The plugin patches that component and reads `birthdate` from the performer
   object Stash already loaded, so no extra request is made in the normal case.
3. The birthdate is converted into a sign.
4. An SVG badge is appended to the `.quality-group` container of `#performer-page`.
5. A `MutationObserver` reinstalls the badge whenever React re-renders that
   container and removes the injected node.

If the component cannot be patched, the plugin falls back to querying the
performer over GraphQL. That fallback waits briefly and never overwrites data the
component patch already provided.

The sign glyphs are the zodiac symbols by Denis Moskowitz (Wikimedia Commons,
CC BY-SA 4.0). They are inline SVG stroke drawings on a 12x12 grid, coloured
entirely through CSS so they follow the Stash theme and the per-sign colour
without any external assets.

## Requirements

* Stash
* A modern browser with JavaScript support

No Python and no additional packages are required.

## Credits

* Zodiac sign symbols by [Denis Moskowitz](http://www.suberic.net/dmm/astro/),
  via [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Astrological_symbols),
  licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## License

The plugin code is distributed under the license of this repository.

The zodiac sign symbols are a separate work licensed under CC BY-SA 4.0.
See [CREDITS.md](CREDITS.md).
