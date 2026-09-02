# External ASS Subtitles

Stash plugin for displaying external ASS/SSA subtitles using
[JASSUB](https://github.com/ThaUnknown/jassub).

Unlike Stash's native external subtitle support, this plugin supports
ASS/SSA subtitle files with their original styling, positioning,
formatting and fonts.

## Features

- External `.ass` and `.ssa` subtitle files
- Multiple subtitle tracks
- Subtitle track selection from the video player
- ASS/SSA styling and positioning through JASSUB
- Automatic subtitle discovery next to scene video files
- Language detection from filenames
- UTF-8, UTF-8 BOM, CP1251 and Japanese encodings
- No external Python packages required

## Supported subtitle naming

The plugin detects subtitle files located next to the scene video.

Examples:

    video.ass
    video.en.ass
    video.eng.ass
    video.ru.ass
    video.jpn.ass
    video.zh.ass
    video.ko.ass

## Installation

### Manual installation

Copy the plugin directory to the Stash plugins directory:

    ~/.stash/plugins/external-ass-subtitles/

Then reload plugins from:

    Settings → Plugins → Reload Plugins

### Plugin source

Add the plugin repository source to Stash if a package repository is available.

## Requirements

- Stash
- Modern browser with JavaScript support

No Python packages need to be installed.

## Credits

- [JASSUB](https://github.com/ThaUnknown/jassub)
- DejaVu Sans
- Liberation Sans