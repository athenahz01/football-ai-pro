from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

SAMPLE_ID = "wikimedia_football_tennis"
CHUNK_SIZE = 1024 * 1024
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "samples" / "football_tennis.webm"
SOURCES_PATH = Path(__file__).resolve().parent / "sample_sources.json"
USER_AGENT = "FootballAIProPhase2CV/0.1 (Athena Huo development sample)"


def main() -> None:
    args = parse_args()
    source = load_source()
    output_path = args.output

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.exists() and not args.force:
        print(f"Sample already exists: {output_path}")
        print_license(source)
        return

    print("Downloading openly licensed sample clip.")
    print_license(source)
    download_file(source["download_url"], output_path)
    print(f"Saved sample clip to {output_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Download the openly licensed Wikimedia Commons football sample clip."
        )
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Local path for the downloaded sample clip.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Download again even when the output file already exists.",
    )
    return parser.parse_args()


def load_source() -> dict[str, str]:
    with SOURCES_PATH.open("r", encoding="utf-8") as source_file:
        sources = json.load(source_file)

    return sources[SAMPLE_ID]


def print_license(source: dict[str, str]) -> None:
    print(f"Source: {source['description_url']}")
    print(f"Author: {source['author']}")
    print(f"License: {source['license']} ({source['license_url']})")
    print(
        "Legal gate: process only openly licensed clips or video rights confirmed by Athena Huo."
    )


def download_file(url: str, output_path: Path) -> None:
    request = Request(url, headers={"User-Agent": USER_AGENT})

    with urlopen(request) as response:
        with output_path.open("wb") as output_file:
            while True:
                chunk = response.read(CHUNK_SIZE)
                if not chunk:
                    break
                output_file.write(chunk)


if __name__ == "__main__":
    main()
