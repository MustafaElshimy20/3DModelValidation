from __future__ import annotations

from typing import Any

import numpy as np

from backend.analyzer.topology_checks import face_center

AREA_EPSILON = 1e-10
MAX_SELF_INTERSECTION_FACES = 50000
MAX_INTERNAL_FACE_RAYS = 20000


def triangle_area(v0: np.ndarray, v1: np.ndarray, v2: np.ndarray) -> float:
    return 0.5 * float(np.linalg.norm(np.cross(v1 - v0, v2 - v0)))


def triangle_aspect_ratio(v0: np.ndarray, v1: np.ndarray, v2: np.ndarray) -> float:
    lengths = [
        np.linalg.norm(v1 - v0),
        np.linalg.norm(v2 - v1),
        np.linalg.norm(v0 - v2),
    ]
    shortest = min(lengths)
    if shortest < 1e-12:
        return float("inf")
    return float(max(lengths) / shortest)


class GeometryChecks:
    def __init__(self, mesh, trimesh_module, open3d_module=None):
        self.mesh = mesh
        self.vertices = mesh.vertices
        self.faces = mesh.faces
        self.trimesh = trimesh_module
        self.open3d = open3d_module

    def degenerate_faces(self) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for face_index, face in enumerate(self.faces):
            v0, v1, v2 = (self.vertices[face[offset]] for offset in range(3))
            area = triangle_area(v0, v1, v2)
            if area >= AREA_EPSILON:
                continue
            center = np.mean([v0, v1, v2], axis=0)
            payload = {
                "type": "degenerate_face",
                "severity": "high",
                "message": f"Face {face_index} has near-zero area.",
                "position": [float(center[0]), float(center[1]), float(center[2])],
                "face_indices": [int(face_index)],
                "metadata": {"area": area},
            }
            results.append(payload)
        return results

    def zero_area_faces(self) -> list[dict[str, Any]]:
        return [
            {
                **issue,
                "type": "zero_area_face",
                "message": issue["message"].replace("near-zero", "zero"),
            }
            for issue in self.degenerate_faces()
        ]

    def inverted_normals(self) -> list[dict[str, Any]]:
        centroid = self.mesh.centroid
        results: list[dict[str, Any]] = []
        for face_index, face in enumerate(self.faces):
            v0, v1, v2 = (self.vertices[face[offset]] for offset in range(3))
            center = (v0 + v1 + v2) / 3.0
            outward = center - centroid
            normal = np.cross(v1 - v0, v2 - v0)
            if float(np.dot(outward, normal)) >= 0:
                continue
            results.append(
                {
                    "type": "inverted_normal",
                    "severity": "medium",
                    "message": f"Face {face_index} appears to have inverted winding.",
                    "position": [float(center[0]), float(center[1]), float(center[2])],
                    "face_indices": [int(face_index)],
                }
            )
        return results

    def self_intersections(self, temp_path: str | None = None) -> list[dict[str, Any]]:
        if len(self.faces) > MAX_SELF_INTERSECTION_FACES:
            center = self.mesh.centroid
            return [
                {
                    "type": "self_intersection_check_skipped",
                    "severity": "low",
                    "message": (
                        "Self-intersection check was skipped because the mesh is too large "
                        f"for an interactive request ({len(self.faces)} faces)."
                    ),
                    "position": [float(center[0]), float(center[1]), float(center[2])],
                    "metadata": {"face_limit": MAX_SELF_INTERSECTION_FACES, "faces": int(len(self.faces))},
                }
            ]

        face_ids: set[int] = set()
        try:
            broken_faces = self.trimesh.repair.broken_faces(self.mesh)
            face_ids.update(int(face_id) for face_id in np.atleast_1d(broken_faces).tolist())
        except Exception:
            pass

        if self.open3d is not None and temp_path:
            try:
                o3d_mesh = self.open3d.io.read_triangle_mesh(temp_path)
                if hasattr(o3d_mesh, "get_self_intersecting_triangles"):
                    pairs = o3d_mesh.get_self_intersecting_triangles()
                    for pair in pairs:
                        face_ids.update(int(index) for index in pair)
                elif o3d_mesh.is_self_intersecting():
                    face_ids.update(range(min(len(self.faces), 32)))
            except Exception:
                pass

        results: list[dict[str, Any]] = []
        for face_index in sorted(face_ids):
            face = self.faces[face_index]
            results.append(
                {
                    "type": "self_intersection",
                    "severity": "critical",
                    "message": f"Face {face_index} participates in a self-intersection.",
                    "position": face_center(self.vertices, face),
                    "face_indices": [int(face_index)],
                    "points": [self.vertices[int(vertex)].tolist() for vertex in face],
                }
            )
        return results

    def internal_faces(self) -> list[dict[str, Any]]:
        if len(self.faces) > MAX_INTERNAL_FACE_RAYS:
            center = self.mesh.centroid
            return [
                {
                    "type": "internal_face_check_skipped",
                    "severity": "low",
                    "message": (
                        "Internal-face ray casting was skipped because the mesh is too large "
                        f"for an interactive request ({len(self.faces)} faces)."
                    ),
                    "position": [float(center[0]), float(center[1]), float(center[2])],
                    "metadata": {"face_limit": MAX_INTERNAL_FACE_RAYS, "faces": int(len(self.faces))},
                }
            ]

        try:
            normals = self.mesh.face_normals
            centers = self.mesh.triangles_center
            origins = centers + normals * 1e-4
            _, ray_indices, _ = self.mesh.ray.intersects_location(origins, normals)
        except Exception:
            return []

        hit_counts: dict[int, int] = {}
        for ray_index in np.atleast_1d(ray_indices).tolist():
            ray_index = int(ray_index)
            hit_counts[ray_index] = hit_counts.get(ray_index, 0) + 1

        results: list[dict[str, Any]] = []
        for face_index, hit_count in hit_counts.items():
            if hit_count <= 0 or hit_count % 2 == 1:
                continue
            face = self.faces[face_index]
            results.append(
                {
                    "type": "internal_face",
                    "severity": "medium",
                    "message": f"Face {face_index} appears buried inside the mesh volume.",
                    "position": face_center(self.vertices, face),
                    "face_indices": [int(face_index)],
                    "metadata": {"ray_hits": hit_count},
                }
            )
        return results

    def mesh_quality(self, lightweight: bool = False) -> dict[str, Any]:
        aspect_ratios: list[float] = []
        face_areas: list[float] = []
        unique_edges: set[tuple[int, int]] = set()
        edge_lengths: list[float] = []

        for face in self.faces:
            v0, v1, v2 = (self.vertices[face[offset]] for offset in range(3))
            aspect_ratios.append(triangle_aspect_ratio(v0, v1, v2))
            face_areas.append(triangle_area(v0, v1, v2))
            for offset in range(3):
                a = int(face[offset])
                b = int(face[(offset + 1) % 3])
                edge = (a, b) if a < b else (b, a)
                if edge in unique_edges:
                    continue
                unique_edges.add(edge)
                edge_lengths.append(float(np.linalg.norm(self.vertices[a] - self.vertices[b])))

        bbox = self.mesh.bounding_box.bounds.tolist()
        watertight = False
        try:
            watertight = bool(self.mesh.is_watertight)
        except Exception:
            watertight = False

        volume = 0.0
        if not lightweight and watertight:
            try:
                volume = float(self.mesh.volume) if self.mesh.is_volume else 0.0
            except Exception:
                volume = 0.0

        return {
            "watertight": watertight,
            "volume": volume,
            "surface_area": float(self.mesh.area),
            "bounding_box": bbox,
            "triangle_statistics": {
                "aspect_ratio": {
                    "min": float(np.min(aspect_ratios)) if aspect_ratios else 0.0,
                    "max": float(np.max(aspect_ratios)) if aspect_ratios else 0.0,
                    "mean": float(np.mean(aspect_ratios)) if aspect_ratios else 0.0,
                },
                "face_area": {
                    "min": float(np.min(face_areas)) if face_areas else 0.0,
                    "max": float(np.max(face_areas)) if face_areas else 0.0,
                    "mean": float(np.mean(face_areas)) if face_areas else 0.0,
                },
                "edge_length": {
                    "min": float(np.min(edge_lengths)) if edge_lengths else 0.0,
                    "max": float(np.max(edge_lengths)) if edge_lengths else 0.0,
                    "mean": float(np.mean(edge_lengths)) if edge_lengths else 0.0,
                },
            },
        }
