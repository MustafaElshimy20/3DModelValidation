from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[1]
ANALYSES_DIR = BASE_DIR / "data" / "analyses"
ANALYSES_DIR.mkdir(parents=True, exist_ok=True)


def save_analysis(analysis_id: str, payload: dict[str, Any]) -> None:
    target = ANALYSES_DIR / f"{analysis_id}.json"
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_analysis(analysis_id: str) -> dict[str, Any] | None:
    target = ANALYSES_DIR / f"{analysis_id}.json"
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8"))
