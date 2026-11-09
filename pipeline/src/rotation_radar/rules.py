"""Standard rotation rules, loaded from ``rules.toml``."""

from __future__ import annotations

import tomllib
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from rotation_radar.domain.formats import FormatRule


@dataclass(frozen=True)
class SpecialRule:
    """A set that stays in Standard independently of the yearly rotation."""

    legal_until_at_least: int
    source: str


@dataclass(frozen=True)
class RotationRules:
    rotating_set_count: int = 6
    prerelease_lead: timedelta = timedelta(days=7)
    legal_share_threshold: float = 0.8
    lookback_years: int = 4
    official_rotation_date: date | None = None
    special_rules: Mapping[str, SpecialRule] = field(default_factory=dict)
    # Not a rotation rule, but read from the same file: sets left off the website entirely
    hidden_sets: frozenset[str] = frozenset()


def load_rules(path: Path) -> RotationRules:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    official = str(raw.get("official_rotation_date") or "")
    return RotationRules(
        rotating_set_count=int(raw["rotating_set_count"]),
        prerelease_lead=timedelta(days=int(raw["prerelease_lead_days"])),
        legal_share_threshold=float(raw["legal_share_threshold"]),
        lookback_years=int(raw["lookback_years"]),
        official_rotation_date=date.fromisoformat(official) if official else None,
        special_rules=_special_rules(raw.get("special_rules", {})),
        hidden_sets=frozenset(
            str(code).lower() for code in raw.get("catalog", {}).get("hidden", ())
        ),
    )


def load_formats(path: Path) -> tuple[FormatRule, ...]:
    """The non-rotating formats configured under ``[formats.<id>]``."""
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    return tuple(
        FormatRule(
            id=format_id,
            name=str(rule["name"]),
            set_types=frozenset(str(t) for t in rule["set_types"]),
            earliest_release=date.fromisoformat(str(rule["earliest_release"])),
            info_url=str(rule["info_url"]),
            banlist_url=str(rule["banlist_url"]),
        )
        for format_id, rule in raw.get("formats", {}).items()
    )


def _special_rules(raw: Mapping[str, Mapping[str, Any]]) -> dict[str, SpecialRule]:
    return {
        code.lower(): SpecialRule(
            legal_until_at_least=int(rule["legal_until_at_least"]),
            source=str(rule["source"]),
        )
        for code, rule in raw.items()
    }
