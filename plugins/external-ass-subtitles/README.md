# External ASS Subtitles

Stash plugin for displaying external subtitles next to scene videos.

The plugin supports **ASS/SSA**, **SRT**, and **VTT** subtitle files. ASS/SSA subtitles are rendered using [JASSUB](https://github.com/ThaUnknown/jassub), preserving their original styling, positioning, formatting, and fonts.

SRT and VTT subtitles can be displayed using Stash's native Video.js subtitle system.

## Features

* External `.ass`, `.ssa`, `.srt`, and `.vtt` subtitle files
* Multiple subtitle tracks
* Subtitle selection from the video player's CC menu
* Native Stash CC menu integration
* Custom subtitle selection menu
* ASS/SSA styling and positioning through JASSUB
* Native SRT/VTT rendering through Video.js
* Automatic subtitle discovery next to scene video files
* Optional search in subtitle subdirectories
* Language detection from subtitle filenames
* Subtitle source detection from filenames
* UTF-8, UTF-8 BOM, CP1251, and Japanese encodings
* Unicode support, including Cyrillic and Japanese text
* No external Python packages required

## Supported Formats

### ASS / SSA

ASS and SSA subtitles are rendered using JASSUB.

This allows the plugin to preserve features such as:

* Custom fonts
* Font sizes
* Colors
* Outline and shadow
* Positioning
* Alignment
* Margins
* Styles
* Advanced ASS formatting

### SRT / VTT

SRT and VTT subtitles use Stash's native Video.js text-track system.

SRT files are converted to WebVTT when required, while VTT files can be used directly.

## Subtitle Discovery

The plugin automatically searches for subtitle files located next to the scene video.

For example:

```text
Episode 01.mp4
Episode 01.eng.ass
Episode 01.ru.srt
Episode 01.jpn.vtt
```

The plugin matches subtitle files to the video filename, allowing additional language, source, or release information after the video name.

Supported extensions:

```text
.ass
.ssa
.srt
.vtt
```

## Subtitle Naming

Language codes can be included in the filename.

Examples:

```text
video.ass
video.en.ass
video.eng.ass
video.ru.ass
video.jpn.ass
video.zh.ass
video.ko.ass
```

The plugin recognizes common language codes including:

| Code               | Language  |
| ------------------ | --------- |
| `en`, `eng`        | English   |
| `ru`, `rus`        | Русский   |
| `ja`, `jpn`        | 日本語       |
| `de`, `ger`, `deu` | Deutsch   |
| `fr`, `fra`        | Français  |
| `es`, `spa`        | Español   |
| `it`, `ita`        | Italiano  |
| `pt`, `por`        | Português |
| `zh`, `zho`        | 中文        |
| `ko`, `kor`        | 한국어       |

## Subtitle Sources

Additional information in the filename can be displayed as the subtitle source.

For example:

```text
Episode 01.eng_SubDESU-H.ass
Episode 01.eng_MuchoHentai.ass
Episode 01.ru.srt
```

can appear as:

```text
English — SubDESU-H
English — MuchoHentai
Русский
```

This makes it easier to distinguish multiple subtitle releases for the same language.

## Subtitle Selection

The plugin supports two subtitle selection modes.

### Native CC Menu

When **Use native CC menu** is enabled, external subtitles are added to Stash's native Video.js CC menu.

ASS/SSA tracks are used as selectors for JASSUB rendering, while SRT/VTT tracks are handled directly by Video.js.

This allows all supported subtitle formats to appear together in the player's subtitle menu.

### Custom Menu

The custom mode provides a dedicated subtitle selector for external subtitle tracks.

It can be useful when the native CC menu is unavailable or when a separate subtitle control is preferred.

## Settings

The plugin provides the following settings:

### Search subtitle subdirectories

Also search subdirectories next to the scene video when looking for subtitle files.

### Show subtitles by default

Automatically enable the first available external subtitle track.

### Use native CC menu

Use Stash's native Video.js CC menu instead of the custom subtitle selector.

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

Clone the repository:

```bash
git clone https://github.com/ProudRykar/external-ass-subtitles.git
```

Copy the plugin directory to the Stash plugins directory:

```text
~/.stash/plugins/external-ass-subtitles/
```

Then reload plugins from:

```text
Settings → Plugins → Reload Plugins
```

## Requirements

* Stash
* A modern browser with JavaScript support

No additional Python packages need to be installed.

## How It Works

The plugin consists of a small Python backend and a JavaScript frontend.

The backend:

1. Receives the current Stash scene ID.
2. Retrieves the scene's video files.
3. Searches for matching external subtitle files.
4. Detects their format and language.
5. Reads the subtitle contents.
6. Returns the available subtitle tracks to the frontend.

The frontend:

1. Detects the active Stash video player.
2. Adds external subtitle tracks to the player.
3. Uses JASSUB for ASS/SSA rendering.
4. Uses Video.js for SRT/VTT rendering.
5. Provides subtitle track selection.

## Development

The plugin source code is maintained separately from the Stash plugin distribution repository.

Source repository:

https://github.com/ProudRykar/external-ass-subtitles

The plugin is synchronized automatically to the main plugin repository:

https://github.com/ProudRykar/stash-plugins

The distribution repository is used to generate the plugin source index for Stash.

## Credits

* [JASSUB](https://github.com/ThaUnknown/jassub) — ASS/SSA subtitle rendering
* [DejaVu Sans](https://dejavu-fonts.github.io/) — bundled fallback font
* [Liberation Fonts](https://github.com/liberationfonts/liberation-fonts) — bundled fallback font

## License

See the repository and individual bundled components for their respective licenses.
