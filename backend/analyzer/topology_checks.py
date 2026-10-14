from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np

MAX_COMPONENT_SPLIT_FACES = 100000


def edge_key(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def face_center(vertices: np.ndarray, face: np.ndarray) -> list[float]:
    center = vertices[face].mean(axis=0)
    return [float(center[0]), float(center[1]), float(center[2])]


class TopologyChecks:
    def __init__(self, mesh):
        self.mesh = mesh
        self.vertices = mesh.vertices
        self.faces = mesh.faces
        self._edge_face_map = self._build_edge_face_map()

    def _build_edge_face_map(self) -> dict[tuple[int, int], list[int]]:
        edge_map: dict[tuple[int, int], list[int]] = defaultdict(list)
        for face_index, face in enumerate(self.faces):
            for offset in range(3):
                key = edge_key(int(face[offset]), int(face[(offset + 1) % 3]))
                edge_map[key].append(face_index)
        return edge_map

    def non_manifold_edges(self) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for edge, face_indices in self._edge_face_map.items():
            if len(face_indices) <= 2:
                continue
            points = self.vertices[list(edge)]
            position = self.vertices[list(edge)].mean(axis=0)
            results.append(
                {
                    "type": "non_manifold_edge",
                    "severity": "high",
                    "message": f"Edge {edge} is shared by {len(face_indices)} faces.",
                    "position": [float(position[0]), float(position[1]), float(position[2])],
                    "edges": [[int(edge[0]), int(edge[1])]],
                    "points": points.tolist(),
                    "face_indices": [int(index) for index in face_indices],
                    "metadata": {"shared_faces": len(face_indices)},
                }
            )
        return results

    def boundary_edges(self) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for edge, face_indices in self._edge_face_map.items():
            if len(face_indices) != 1:
                continue
            points = self.vertices[list(edge)]
            position = self.vertices[list(edge)].mean(axis=0)
            results.append(
                {
                    "type": "hole",
                    "severity": "critical",
                    "message": "Boundary edge indicates an open hole in the mesh.",
                    "position": [float(position[0]), float(position[1]), float(position[2])],
                    "edges": [[int(edge[0]), int(edge[1])]],
                    "points": points.tolist(),
                    "face_indices": [int(face_indices[0])],
                    "metadata": {"kind": "boundary_edge"},
                }
            )
        return results

    def non_manifold_vertices(self) -> list[dict[str, Any]]:
        vertex_faces: dict[int, list[int]] = defaultdict(list)
        for face_index, face in enumerate(self.faces):
            for vertex_index in face:
                vertex_faces[int(vertex_index)].append(face_index)

        results: list[dict[str, Any]] = []
        for vertex_index, face_indices in vertex_faces.items():
            if len(face_indices) < 3:
                continue

            adjacency: dict[int, set[int]] = defaultdict(set)
            for left_offset, left_face_index in enumerate(face_indices):
                for right_face_index in face_indices[left_offset + 1 :]:
                    shared = set(self.faces[left_face_index]) & set(self.faces[right_face_index])
                    if len(shared) >= 2:
                        adjacency[left_face_index].add(right_face_index)
                        adjacency[right_face_index].add(left_face_index)

            components = 0
            visited: set[int] = set()
            for face_index in face_indices:
                if face_index in visited:
                    continue
                components += 1
                stack = [face_index]
                while stack:
                    current = stack.pop()
                    if current in visited:
                        continue
                    visited.add(current)
                    stack.extend(adjacency[current] - visited)

            if components <= 1:
                continue

            position = self.vertices[vertex_index]
            results.append(
                {
                    "type": "non_manifold_vertex",
                    "severity": "high",
                    "message": f"Vertex {vertex_index} connects {components} disconnected face fans.",
                    "position": [float(position[0]), float(position[1]), float(position[2])],
                    "vertex_indices": [int(vertex_index)],
                    "face_indices": [int(index) for index in face_indices[:64]],
                    "metadata": {"fan_components": components},
                }
            )
        return results

    def duplicate_faces(self) -> list[dict[str, Any]]:
        seen: dict[tuple[int, int, int], int] = {}
        results: list[dict[str, Any]] = []
        for face_index, face in enumerate(self.faces):
            key = tuple(sorted(int(vertex) for vertex in face.tolist()))
            existing = seen.get(key)
            if existing is None:
                seen[key] = face_index
                continue
            results.append(
                {
                    "type": "duplicate_face",
                    "severity": "medium",
                    "message": f"Face {face_index} duplicates face {existing}.",
                    "position": face_center(self.vertices, face),
                    "face_indices": [int(existing), int(face_index)],
                    "metadata": {"duplicate_of": int(existing)},
                }
            )
        return results

    def duplicate_vertices(self) -> list[dict[str, Any]]:
        rounded = np.round(self.vertices, decimals=6)
        seen: dict[tuple[float, float, float], int] = {}
        results: list[dict[str, Any]] = []
        for vertex_index, vertex in enumerate(rounded):
            key = (float(vertex[0]), float(vertex[1]), float(vertex[2]))
            existing = seen.get(key)
            if existing is None:
                seen[key] = vertex_index
                continue
            results.append(
                {
                    "type": "duplicate_vertex",
                    "severity": "medium",
                    "message": f"Vertex {vertex_index} duplicates vertex {existing}.",
                    "position": [key[0], key[1], key[2]],
                    "vertex_indices": [int(existing), int(vertex_index)],
                    "metadata": {"duplicate_of": int(existing)},
                }
            )
        return results

    def open_mesh(self) -> list[dict[str, Any]]:
        if self.mesh.is_watertight:
            return []
        centroid = self.mesh.centroid
        return [
            {
                "type": "open_mesh",
                "severity": "critical",
                "message": "Mesh is not watertight and contains open boundaries.",
                "position": [float(centroid[0]), float(centroid[1]), float(centroid[2])],
                "metadata": {"watertight": False},
            }
        ]

    def disconnected_components(self) -> list[dict[str, Any]]:
        if len(self.faces) > MAX_COMPONENT_SPLIT_FACES:
            center = self.mesh.centroid
            return [
                {
                    "type": "component_check_skipped",
                    "severity": "low",
                    "message": (
                        "Disconnected component analysis was skipped because the mesh is too large "
                        f"for an interactive request ({len(self.faces)} faces)."
                    ),
                    "position": [float(center[0]), float(center[1]), float(center[2])],
                    "metadata": {"face_limit": MAX_COMPONENT_SPLIT_FACES, "faces": int(len(self.faces))},
                }
            ]

        try:
            components = self.mesh.split(only_watertight=False)
        except Exception as exc:
            center = self.mesh.centroid
            return [
                {
                    "type": "component_check_unavailable",
                    "severity": "low",
                    "message": f"Disconnected component check was skipped: {exc}",
                    "position": [float(center[0]), float(center[1]), float(center[2])],
                    "metadata": {"reason": str(exc)},
                }
            ]

        if len(components) <= 1:
            return []

        results: list[dict[str, Any]] = []
        for index, component in enumerate(components):
            bounds = component.bounding_box.bounds
            center = component.centroid
            results.append(
                {
                    "type": "disconnected_component",
                    "severity": "medium" if index > 0 else "low",
                    "message": f"Detected disconnected component {index + 1} with {len(component.faces)} faces.",
                    "position": [float(center[0]), float(center[1]), float(center[2])],
                    "metadata": {
                        "component_index": index,
                        "faces": len(component.faces),
                        "vertices": len(component.vertices),
                        "bounds": bounds.tolist(),
                    },
                }
            )
        return results
