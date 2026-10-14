from __future__ import annotations

# pyright: reportMissingImports=false

import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np

from backend.analyzer.geometry_checks import GeometryChecks
from backend.analyzer.topology_checks import TopologyChecks

try:
    import trimesh
except ImportError as exc:
    raise RuntimeError("trimesh is required to run the analyzer.") from exc

try:
    import open3d as o3d  # pyright: ignore[reportMissingImports]
except Exception:
    o3d = None

try:
    import pymeshlab  # pyright: ignore[reportMissingImports]
except Exception:
    pymeshlab = None

SUPPORTED_EXTENSIONS = {".stl", ".obj", ".ply", ".glb"}
LARGE_MESH_FACE_THRESHOLD = 30000
VERY_LARGE_MESH_FACE_THRESHOLD = 100000


def _normalize_mesh(loaded_mesh):
    if isinstance(loaded_mesh, trimesh.Scene):
        geometries = [geometry for geometry in loaded_mesh.geometry.values() if isinstance(geometry, trimesh.Trimesh)]
        if not geometries:
            raise ValueError("No triangle mesh geometry found in uploaded file.")
        return trimesh.util.concatenate(geometries)
    if not isinstance(loaded_mesh, trimesh.Trimesh):
        raise ValueError(f"Unsupported mesh payload: {type(loaded_mesh)!r}")
    return loaded_mesh


def _severity_score(error_groups: dict[str, list[dict[str, Any]]]) -> float:
    severity_weights = {"critical": 1.0, "high": 0.75, "medium": 0.45, "low": 0.2}
    weighted = 0.0
    for issues in error_groups.values():
        for issue in issues:
            weighted += severity_weights.get(issue.get("severity", "low"), 0.2)
    return round(min(weighted / 25.0, 1.0), 4)


def _error_summary(error_groups: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    summary = {group_name: len(items) for group_name, items in error_groups.items()}
    summary["total"] = sum(summary.values())
    return summary


def _mesh_centroid(mesh) -> list[float]:
    centroid = mesh.centroid
    return [float(centroid[0]), float(centroid[1]), float(centroid[2])]


def _pymeshlab_enrichments(mesh_path: str) -> dict[str, Any]:
    if pymeshlab is None:
        return {}
    try:
        mesh_set = pymeshlab.MeshSet()
        mesh_set.load_new_mesh(mesh_path)
        topology = mesh_set.get_topological_measures()
        return {
            "pymeshlab": {
                "genus": topology.get("genus_of_mesh"),
                "holes": topology.get("number_of_holes"),
                "border_components": topology.get("number_of_connected_components_on_border"),
            }
        }
    except Exception:
        return {}


def _analysis_profile(face_count: int) -> dict[str, bool]:
    is_large = face_count > LARGE_MESH_FACE_THRESHOLD
    is_very_large = face_count > VERY_LARGE_MESH_FACE_THRESHOLD
    return {
        "skip_non_manifold_vertices": is_large,
        "skip_self_intersections": is_large,
        "skip_internal_faces": is_large,
        "skip_inverted_normals": is_very_large,
        "skip_duplicate_vertices": is_very_large,
        "skip_pymeshlab": is_large,
        "lightweight_quality": is_large,
    }


def _skipped_issue(issue_type: str, message: str, center: list[float], metadata: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "type": issue_type,
            "severity": "low",
            "message": message,
            "position": center,
            "metadata": metadata,
        }
    ]


class ModelAnalyzer:
    def analyze_file(self, file_path: str | Path, original_filename: str | None = None) -> dict[str, Any]:
        start = time.perf_counter()
        path = Path(file_path)
        suffix = path.suffix.lower()
        if suffix not in SUPPORTED_EXTENSIONS:
            raise ValueError(f"Unsupported file format: {suffix}. Supported formats are STL, OBJ, PLY, and GLB.")

        loaded = trimesh.load(path, force="mesh")
        mesh = _normalize_mesh(loaded)
        face_count = int(len(mesh.faces))
        profile = _analysis_profile(face_count)
        center = _mesh_centroid(mesh)

        topology = TopologyChecks(mesh)
        geometry = GeometryChecks(mesh, trimesh, o3d)

        error_groups = {
            "holes": topology.boundary_edges(),
            "non_manifold_edges": topology.non_manifold_edges(),
            "non_manifold_vertices": (
                _skipped_issue(
                    "non_manifold_vertex_check_skipped",
                    f"Non-manifold vertex detection was skipped for interactive performance on a large mesh ({face_count} faces).",
                    center,
                    {"faces": face_count},
                )
                if profile["skip_non_manifold_vertices"]
                else topology.non_manifold_vertices()
            ),
            "open_meshes": topology.open_mesh(),
            "duplicate_faces": topology.duplicate_faces(),
            "duplicate_vertices": (
                _skipped_issue(
                    "duplicate_vertex_check_skipped",
                    f"Duplicate vertex detection was skipped for a very large mesh ({face_count} faces).",
                    center,
                    {"faces": face_count},
                )
                if profile["skip_duplicate_vertices"]
                else topology.duplicate_vertices()
            ),
            "self_intersections": (
                _skipped_issue(
                    "self_intersection_check_skipped",
                    f"Self-intersection detection was skipped for interactive performance on a large mesh ({face_count} faces).",
                    center,
                    {"faces": face_count},
                )
                if profile["skip_self_intersections"]
                else geometry.self_intersections(str(path))
            ),
            "degenerate_faces": geometry.degenerate_faces(),
            "zero_area_faces": geometry.zero_area_faces(),
            "inverted_normals": (
                _skipped_issue(
                    "inverted_normal_check_skipped",
                    f"Inverted normal detection was skipped for a very large mesh ({face_count} faces).",
                    center,
                    {"faces": face_count},
                )
                if profile["skip_inverted_normals"]
                else geometry.inverted_normals()
            ),
            "internal_faces": (
                _skipped_issue(
                    "internal_face_check_skipped",
                    f"Internal face detection was skipped for interactive performance on a large mesh ({face_count} faces).",
                    center,
                    {"faces": face_count},
                )
                if profile["skip_internal_faces"]
                else geometry.internal_faces()
            ),
            "disconnected_components": topology.disconnected_components(),
        }

        quality = geometry.mesh_quality(lightweight=profile["lightweight_quality"])
        model_info = {
            "filename": original_filename or path.name,
            "format": suffix.removeprefix("."),
            "vertices": int(len(mesh.vertices)),
            "faces": face_count,
            "watertight": quality["watertight"],
            "volume": quality["volume"],
            "surface_area": quality["surface_area"],
            "bounding_box": quality["bounding_box"],
            "triangle_statistics": quality["triangle_statistics"],
            "center": _mesh_centroid(mesh),
            **({} if profile["skip_pymeshlab"] else _pymeshlab_enrichments(str(path))),
        }

        severity_score = _severity_score(error_groups)
        duration = round(time.perf_counter() - start, 4)

        return {
            "model_info": model_info,
            "errors": error_groups,
            "error_summary": _error_summary(error_groups),
            "severity_score": severity_score,
            "analysis_duration_seconds": duration,
        }

    def analyze_bytes(self, filename: str, content: bytes) -> dict[str, Any]:
        suffix = Path(filename).suffix.lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name
        try:
            return self.analyze_file(temp_path, original_filename=filename)
        finally:
            Path(temp_path).unlink(missing_ok=True)
