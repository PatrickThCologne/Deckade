"""Command line: ``python -m rotation_radar build``."""

from __future__ import annotations

import argparse
import logging
import os
from datetime import date
from pathlib import Path

from rotation_radar.build import BuildOptions, build
from rotation_radar.config import Paths
from rotation_radar.rules import load_formats, load_rules

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per request is noise
    paths = Paths.for_repository(args.root)
    options = BuildOptions(
        today=args.today or date.today(),
        github_token=os.environ.get("GITHUB_TOKEN") or None,
    )
    build(paths, load_rules(paths.rules_file), load_formats(paths.rules_file), options)
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rotation_radar", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build_command = commands.add_parser("build", help="fetch all sources and write the snapshot")
    build_command.add_argument(
        "--root",
        type=Path,
        default=REPOSITORY_ROOT,
        help="repository root (default: this checkout)",
    )
    build_command.add_argument(
        "--today", type=date.fromisoformat, help="pretend it is this day (YYYY-MM-DD)"
    )
    return parser
