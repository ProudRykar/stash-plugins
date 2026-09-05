import json
import re
import sys
from pathlib import Path

from stashapi.stashapp import StashInterface


PLUGIN_ID = "external-ass-subtitles"


LANGUAGES = {
    # English
    "en": "English",
    "eng": "English",

    # Russian
    "ru": "Русский",
    "rus": "Русский",

    # Japanese
    "ja": "日本語",
    "jpn": "日本語",

    # Chinese
    "zh": "中文",
    "chi": "中文",
    "zho": "中文",

    # Korean
    "ko": "한국어",
    "kor": "한국어",

    # German
    "de": "Deutsch",
    "ger": "Deutsch",
    "deu": "Deutsch",

    # French
    "fr": "Français",
    "fre": "Français",
    "fra": "Français",

    # Spanish
    "es": "Español",
    "spa": "Español",

    # Italian
    "it": "Italiano",
    "ita": "Italiano",

    # Portuguese
    "pt": "Português",
    "por": "Português",

    # Arabic
    "ar": "العربية",
    "ara": "العربية",

    # Polish
    "pl": "Polski",
    "pol": "Polski",

    # Dutch
    "nl": "Nederlands",
    "dut": "Nederlands",
    "nld": "Nederlands",

    # Turkish
    "tr": "Türkçe",
    "tur": "Türkçe",

    # Czech
    "cs": "Čeština",
    "cze": "Čeština",
    "ces": "Čeština",

    # Ukrainian
    "uk": "Українська",
    "ukr": "Українська",

    # Swedish
    "sv": "Svenska",
    "swe": "Svenska",

    # Danish
    "da": "Dansk",
    "dan": "Dansk",

    # Finnish
    "fi": "Suomi",
    "fin": "Suomi",

    # Norwegian
    "no": "Norsk",
    "nor": "Norsk",

    # Romanian
    "ro": "Română",
    "rum": "Română",
    "ron": "Română",

    # Hungarian
    "hu": "Magyar",
    "hun": "Magyar",

    # Greek
    "el": "Ελληνικά",
    "gre": "Ελληνικά",
    "ell": "Ελληνικά",

    # Hebrew
    "he": "עברית",
    "heb": "עברית",

    # Vietnamese
    "vi": "Tiếng Việt",
    "vie": "Tiếng Việt",

    # Thai
    "th": "ไทย",
    "tha": "ไทย",

    # Indonesian
    "id": "Bahasa Indonesia",
    "ind": "Bahasa Indonesia",

    # Malay
    "ms": "Bahasa Melayu",
    "may": "Bahasa Melayu",
    "msa": "Bahasa Melayu",
}


LANGUAGE_RE = re.compile(
    r"(?:^|[._-])("
    + "|".join(
        re.escape(code)
        for code in sorted(
            LANGUAGES,
            key=len,
            reverse=True,
        )
    )
    + r")(?:$|[._-])",
    re.IGNORECASE,
)


def log(message):
    print(
        f"[External ASS] {message}",
        file=sys.stderr,
        flush=True,
    )


def find_language(filename):
    stem = Path(filename).stem

    match = LANGUAGE_RE.search(stem)

    if not match:
        return None

    return match.group(1).lower()


def language_name(language):
    if not language:
        return "ASS"

    return LANGUAGES.get(
        language.lower(),
        language.upper(),
    )


def extract_source(filename, language):
    if not language:
        return ""

    stem = Path(filename).stem

    pattern = re.compile(
        rf"(?:^|[._-])"
        rf"{re.escape(language)}"
        rf"(?:[._-](.*))?$",
        re.IGNORECASE,
    )

    match = pattern.search(stem)

    if not match:
        return ""

    source = match.group(1) or ""

    source = source.replace("_", " ")

    return source.strip()


def make_label(path):
    filename = Path(path).name

    language = find_language(filename)

    if language:
        lang = language_name(language)

        source = extract_source(
            filename,
            language,
        )

        if source:
            return f"{lang} — {source}"

        return lang

    return Path(path).suffix.upper().lstrip(".")


def filename_matches_video(
    video_path,
    subtitle_path,
):
    video_stem = (
        Path(video_path)
        .stem
        .casefold()
    )

    subtitle_stem = (
        Path(subtitle_path)
        .stem
        .casefold()
    )

    if subtitle_stem == video_stem:
        return True

    if not subtitle_stem.startswith(
        video_stem
    ):
        return False

    remainder = subtitle_stem[
        len(video_stem):
    ]

    return remainder.startswith(
        (".", "_", "-", " ")
    )


def find_external_subtitles(video_path):
    video = Path(video_path)

    if not video.exists():
        log(
            f"Video does not exist: {video}"
        )
        return []

    directory = video.parent

    log(
        f"Searching subtitles in: {directory}"
    )

    result = []

    try:
        candidates = directory.iterdir()
    except OSError as exc:
        log(
            f"Failed to list directory: {exc}"
        )
        return []

    for candidate in candidates:
        if not candidate.is_file():
            continue

        if candidate.suffix.lower() not in {
            ".ass",
            ".ssa",
            ".srt",
            ".vtt"
        }:
            continue

        if not filename_matches_video(
            video,
            candidate,
        ):
            continue

        log(
            f"Found subtitle: {candidate}"
        )

        result.append(candidate)

    return sorted(
        result,
        key=lambda p: p.name.casefold(),
    )


def read_subtitle(path):
    encodings = (
        "utf-8-sig",
        "utf-8",
        "cp1251",
        "cp932",
        "shift_jis",
    )

    for encoding in encodings:
        try:
            with open(
                path,
                "r",
                encoding=encoding,
            ) as file:
                return file.read()

        except UnicodeDecodeError:
            continue

        except OSError as exc:
            log(
                f"Failed to read {path}: {exc}"
            )
            return None

    log(
        f"Unable to decode subtitle: {path}"
    )

    return None


def get_scene(stash, scene_id):
    log(
        f"Requesting scene {scene_id}..."
    )

    result = stash.call_GQL(
        """
        query FindScene($id: ID!) {
            findScene(id: $id) {
                id
                files {
                    path
                }
            }
        }
        """,
        {
            "id": str(scene_id),
        },
    )

    scene = result.get(
        "findScene"
    )

    if not scene:
        log(
            f"Scene {scene_id} was not found."
        )
        return None

    log(
        f"Scene {scene_id} loaded."
    )

    return scene


def build_tracks(scene):
    tracks = []

    for scene_file in scene.get(
        "files",
        [],
    ):
        video_path = scene_file.get(
            "path"
        )

        if not video_path:
            continue

        log(
            f"Scene file: {video_path}"
        )

        subtitles = find_external_subtitles(
            video_path
        )

        for subtitle_path in subtitles:
            text = read_subtitle(
                subtitle_path
            )

            if not text:
                continue

            language = find_language(
                subtitle_path.name
            )

            tracks.append(
                {
                    "label": make_label(
                        subtitle_path
                    ),
                    "language": (
                        language
                        or "und"
                    ),
                    "filename":
                        subtitle_path.name,
                    "path":
                        str(subtitle_path),
                    "format": 
                        subtitle_path.suffix.lower().lstrip("."),
                    "text": text,
                }
            )

    return tracks


def main():
    try:
        log("Plugin started.")

        raw = sys.stdin.read()

        log(
            f"Input length: {len(raw)}"
        )

        plugin_input = json.loads(raw)

        log(
            f"Input keys: {list(plugin_input.keys())}"
        )

        server_connection = (
            plugin_input[
                "server_connection"
            ]
        )

        args = plugin_input.get(
            "args",
            {},
        )

        log(
            f"Args: {args}"
        )

        stash = StashInterface(
            server_connection
        )

        mode = args.get("mode")

        log(
            f"Mode: {mode}"
        )

        if mode != "get_subtitles":
            print(
                json.dumps(
                    {
                        "output": None
                    }
                )
            )
            return

        scene_id = args.get(
            "scene_id"
        )

        if not scene_id:
            raise RuntimeError(
                "scene_id is missing"
            )

        scene = get_scene(
            stash,
            scene_id,
        )

        if scene is None:
            print(
                json.dumps(
                    {
                        "output": None
                    }
                )
            )
            return

        tracks = build_tracks(
            scene
        )

        log(
            f"Found {len(tracks)} subtitle tracks."
        )

        result = {
            "tracks": tracks
        }

        print(
            json.dumps(
                {
                    "output":
                        json.dumps(
                            result,
                            ensure_ascii=False,
                        )
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    except Exception as exc:
        log(
            f"FATAL: {type(exc).__name__}: {exc}"
        )

        import traceback

        traceback.print_exc(
            file=sys.stderr
        )

        raise


if __name__ == "__main__":
    main()