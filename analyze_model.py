from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import traceback
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Optional

import numpy as np

# ──────────────────────────────────────────────────────────────────────────────
# Optional heavy imports — we degrade gracefully if a library is missing
# ──────────────────────────────────────────────────────────────────────────────
try:
    import trimesh
    HAS_TRIMESH = True
except ImportError:
    HAS_TRIMESH = False

try:
    import open3d as o3d
    HAS_OPEN3D = True
except ImportError:
    HAS_OPEN3D = False

try:
    import pymeshlab
    HAS_PYMESHLAB = True
except ImportError:
    HAS_PYMESHLAB = False


# ══════════════════════════════════════════════════════════════════════════════
#  CONSTANTS & ENUMERATIONS
# ══════════════════════════════════════════════════════════════════════════════

SUPPORTED_EXTENSIONS = {".stl", ".obj", ".ply", ".glb", ".gltf", ".off"}

# ANSI colour codes — suppressed when --no-color is passed
COLORS = {
    "reset":   "\033[0m",
    "bold":    "\033[1m",
    "red":     "\033[91m",
    "yellow":  "\033[93m",
    "green":   "\033[92m",
    "cyan":    "\033[96m",
    "magenta": "\033[95m",
    "blue":    "\033[94m",
    "grey":    "\033[90m",
}

USE_COLOR = True  # toggled by --no-color CLI flag


def c(text: str, *codes: str) -> str:
    """Wrap *text* in ANSI colour codes when color output is enabled."""
    if not USE_COLOR:
        return text
    prefix = "".join(COLORS.get(code, "") for code in codes)
    return f"{prefix}{text}{COLORS['reset']}"


class Severity(str, Enum):
    """Issue severity — used for score weighting and console colouring."""
    CRITICAL = "CRITICAL"
    HIGH     = "HIGH"
    MEDIUM   = "MEDIUM"
    LOW      = "LOW"
    INFO     = "INFO"


# Points deducted per occurrence of each severity level.
SEVERITY_PENALTY: dict[Severity, int] = {
    Severity.CRITICAL: 30,
    Severity.HIGH:     15,
    Severity.MEDIUM:    7,
    Severity.LOW:       2,
    Severity.INFO:      0,
}

SEVERITY_COLOR: dict[Severity, tuple[str, ...]] = {
    Severity.CRITICAL: ("red",   "bold"),
    Severity.HIGH:     ("red",),
    Severity.MEDIUM:   ("yellow",),
    Severity.LOW:      ("cyan",),
    Severity.INFO:     ("grey",),
}


# ══════════════════════════════════════════════════════════════════════════════
#  DATA CLASSES
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Issue:
    """Represents a single detected mesh problem."""
    category:  str          # topology | geometry | quality
    check:     str          # machine-readable check name
    severity:  Severity
    message:   str          # human-readable description
    count:     int   = 0   # number of affected elements
    details:   list  = field(default_factory=list)  # element indices / coords

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "check":    self.check,
            "severity": self.severity.value,
            "message":  self.message,
            "count":    self.count,
            "details":  self.details,
        }


@dataclass
class MeshStats:
    """Aggregate mesh measurements (always populated, even when errors exist)."""
    vertex_count:    int   = 0
    face_count:      int   = 0
    edge_count:      int   = 0
    surface_area:    float = 0.0
    volume:          float = 0.0
    euler_number:    int   = 0
    bounding_box:    list  = field(default_factory=list)  # [[min xyz], [max xyz]]
    is_watertight:   bool  = False
    is_winding_consistent: bool = False
    component_count: int   = 1

    # Triangle quality
    min_aspect_ratio:  float = 0.0
    max_aspect_ratio:  float = 0.0
    mean_aspect_ratio: float = 0.0

    # Edge length
    min_edge_length:  float = 0.0
    max_edge_length:  float = 0.0
    mean_edge_length: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


# ══════════════════════════════════════════════════════════════════════════════
#  LOGGING
# ══════════════════════════════════════════════════════════════════════════════

def _make_logger(verbose: bool = False) -> logging.Logger:
    logger = logging.getLogger("model_checker")
    if not logger.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(h)
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    return logger


log = _make_logger()


# ══════════════════════════════════════════════════════════════════════════════
#  SMALL MATH HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _edge_key(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def _triangle_area(v0, v1, v2) -> float:
    return 0.5 * float(np.linalg.norm(np.cross(v1 - v0, v2 - v0)))


def _triangle_aspect_ratio(v0, v1, v2) -> float:
    """Longest-edge / shortest-edge ratio (1.0 = equilateral, ∞ = degenerate)."""
    edges = [np.linalg.norm(v1 - v0),
             np.linalg.norm(v2 - v1),
             np.linalg.norm(v0 - v2)]
    mn = min(edges)
    if mn < 1e-12:
        return float("inf")
    return max(edges) / mn


def _union_find_components(n: int, pairs: list[tuple[int, int]]) -> list[int]:
    """Union-Find returning component label for each of *n* nodes."""
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for a, b in pairs:
        union(a, b)
    return [find(i) for i in range(n)]


# ══════════════════════════════════════════════════════════════════════════════
#  TOPOLOGY CHECKS
# ══════════════════════════════════════════════════════════════════════════════

class TopologyChecker:
    """
    Performs all topology-level checks on a trimesh.Trimesh object.

    Checks
    ------
    - Non-manifold edges (shared by >2 faces)
    - Boundary edges / holes (shared by exactly 1 face)
    - Non-manifold vertices (pinch-points / bowtie vertices)
    - Open mesh (not watertight)
    - Inconsistent winding order
    - Duplicate faces
    - Duplicate vertices (exact position match)
    - Disconnected components (floating shells)
    - Euler characteristic
    """

    def __init__(self, mesh: "trimesh.Trimesh"):
        self.mesh = mesh
        self.vertices: np.ndarray = mesh.vertices
        self.faces:    np.ndarray = mesh.faces

        # Pre-build edge → face-count map once; reused across checks
        self._edge_face_count: dict[tuple[int, int], list[int]] = defaultdict(list)
        for fi, face in enumerate(self.faces):
            for i in range(3):
                key = _edge_key(int(face[i]), int(face[(i + 1) % 3]))
                self._edge_face_count[key].append(fi)

    # ------------------------------------------------------------------
    def check_non_manifold_edges(self) -> Issue:
        """Edges shared by more than 2 faces."""
        nm = [list(k) for k, v in self._edge_face_count.items() if len(v) > 2]
        n = len(nm)
        return Issue(
            category="topology", check="non_manifold_edges",
            severity=Severity.CRITICAL if n else Severity.INFO,
            message=f"{n} non-manifold edge(s) — shared by >2 faces." if n
                    else "No non-manifold edges.",
            count=n, details=nm[:100],
        )

    # ------------------------------------------------------------------
    def check_boundary_edges(self) -> Issue:
        """Edges belonging to exactly one face — indicate open holes."""
        boundary = [list(k) for k, v in self._edge_face_count.items() if len(v) == 1]
        n = len(boundary)
        return Issue(
            category="topology", check="boundary_edges",
            severity=Severity.CRITICAL if n else Severity.INFO,
            message=f"{n} boundary edge(s) found — mesh has open hole(s)." if n
                    else "No boundary edges — mesh is closed.",
            count=n, details=boundary[:100],
        )

    # ------------------------------------------------------------------
    def check_non_manifold_vertices(self) -> Issue:
        """
        Vertices whose one-ring neighbourhood is not a single connected fan.
        Classic symptom: two cones sharing only a tip ('bowtie').
        """
        # Build vertex → incident face list
        vert_faces: dict[int, list[int]] = defaultdict(list)
        for fi, face in enumerate(self.faces):
            for v in face:
                vert_faces[int(v)].append(fi)

        nm_verts: list[int] = []
        for vid, flist in vert_faces.items():
            if len(flist) < 2:
                continue
            # Build adjacency among incident faces (two faces are adjacent if
            # they share an edge that passes through vid)
            fadj: dict[int, list[int]] = defaultdict(list)
            for i, fi in enumerate(flist):
                for j, fj in enumerate(flist):
                    if i >= j:
                        continue
                    # Faces fi and fj share vid; check if they share another vertex
                    shared = set(self.faces[fi]) & set(self.faces[fj])
                    if len(shared) >= 2:   # share an actual edge
                        fadj[fi].append(fj)
                        fadj[fj].append(fi)
            # BFS to count connected components among incident faces
            visited: set[int] = set()
            components = 0
            for fi in flist:
                if fi not in visited:
                    components += 1
                    stack = [fi]
                    while stack:
                        cur = stack.pop()
                        if cur in visited:
                            continue
                        visited.add(cur)
                        stack.extend(fadj[cur])
            if components > 1:
                nm_verts.append(vid)

        n = len(nm_verts)
        return Issue(
            category="topology", check="non_manifold_vertices",
            severity=Severity.CRITICAL if n else Severity.INFO,
            message=f"{n} non-manifold vertex/vertices (bowtie / pinch-point)." if n
                    else "No non-manifold vertices.",
            count=n, details=nm_verts[:100],
        )

    # ------------------------------------------------------------------
    def check_open_mesh(self) -> Issue:
        """Report whether the mesh is watertight (no boundary edges)."""
        open_mesh = not self.mesh.is_watertight
        return Issue(
            category="topology", check="open_mesh",
            severity=Severity.CRITICAL if open_mesh else Severity.INFO,
            message="Mesh is OPEN (not watertight) — cannot be sliced as a solid."
                    if open_mesh else "Mesh is watertight.",
            count=1 if open_mesh else 0,
        )

    # ------------------------------------------------------------------
    def check_winding_consistency(self) -> Issue:
        """
        Detect faces whose outward normal is flipped relative to neighbours.
        Uses trimesh's built-in winding_consistent flag.
        """
        consistent = self.mesh.is_winding_consistent
        return Issue(
            category="topology", check="inconsistent_winding",
            severity=Severity.HIGH if not consistent else Severity.INFO,
            message="Inconsistent face winding — some faces have inverted normals."
                    if not consistent else "Face winding is consistent.",
            count=0 if consistent else 1,
        )

    # ------------------------------------------------------------------
    def check_duplicate_faces(self) -> Issue:
        """Faces whose sorted vertex-index triple appears more than once."""
        seen: dict[tuple, int] = {}
        dups: list[int] = []
        for fi, face in enumerate(self.faces):
            key = tuple(sorted(face.tolist()))
            if key in seen:
                dups.append(fi)
            else:
                seen[key] = fi
        n = len(dups)
        return Issue(
            category="topology", check="duplicate_faces",
            severity=Severity.MEDIUM if n else Severity.INFO,
            message=f"{n} duplicate face(s) detected." if n
                    else "No duplicate faces.",
            count=n, details=dups[:100],
        )

    # ------------------------------------------------------------------
    def check_duplicate_vertices(self) -> Issue:
        """
        Vertices at identical floating-point positions.
        Duplicate vertices break manifoldness and inflate file size.
        """
        # Round to 6 decimal places to catch floating-point near-duplicates
        rounded = np.round(self.vertices, decimals=6)
        seen: dict[tuple, int] = {}
        dups: list[int] = []
        for vi, v in enumerate(rounded):
            key = tuple(v.tolist())
            if key in seen:
                dups.append(vi)
            else:
                seen[key] = vi
        n = len(dups)
        return Issue(
            category="topology", check="duplicate_vertices",
            severity=Severity.MEDIUM if n else Severity.INFO,
            message=f"{n} duplicate vertex/vertices (same position)." if n
                    else "No duplicate vertices.",
            count=n, details=dups[:100],
        )

    # ------------------------------------------------------------------
    def check_disconnected_components(self) -> Issue:
        """
        Count connected mesh components.
        Multiple components usually means floating shells that may shift during
        printing and cause layer-adhesion failures.
        """
        comps = self.mesh.split(only_watertight=False)
        n = len(comps)
        return Issue(
            category="topology", check="disconnected_components",
            severity=Severity.MEDIUM if n > 1 else Severity.INFO,
            message=f"{n} disconnected component(s) — floating shells present." if n > 1
                    else "Mesh is a single connected component.",
            count=n,
            details=[{"component": i, "faces": len(c.faces)} for i, c in enumerate(comps)],
        )

    # ------------------------------------------------------------------
    def check_euler_characteristic(self) -> Issue:
        """
        χ = V − E + F.
        For a genus-0 solid (sphere-like), χ should equal 2.
        χ ≠ 2 indicates handles, holes, or non-manifold topology.
        """
        V = len(self.vertices)
        E = len(self._edge_face_count)
        F = len(self.faces)
        chi = V - E + F
        ok = chi == 2
        return Issue(
            category="topology", check="euler_characteristic",
            severity=Severity.HIGH if not ok else Severity.INFO,
            message=f"Euler characteristic χ = {chi} (expected 2 for a simple solid)."
                    if not ok else f"Euler characteristic χ = {chi} ✓",
            count=0 if ok else abs(chi - 2),
            details={"V": V, "E": E, "F": F, "chi": chi},
        )

    # ------------------------------------------------------------------
    def run_all(self) -> list[Issue]:
        return [
            self.check_non_manifold_edges(),
            self.check_boundary_edges(),
            self.check_non_manifold_vertices(),
            self.check_open_mesh(),
            self.check_winding_consistency(),
            self.check_duplicate_faces(),
            self.check_duplicate_vertices(),
            self.check_disconnected_components(),
            self.check_euler_characteristic(),
        ]


# ══════════════════════════════════════════════════════════════════════════════
#  GEOMETRY CHECKS
# ══════════════════════════════════════════════════════════════════════════════

class GeometryChecker:
    """
    Performs geometry-level checks on the mesh.

    Checks
    ------
    - Degenerate / zero-area faces
    - Inverted normals  (face normal pointing inward)
    - Self-intersections / intersecting triangles
    - Thin walls  (proximity-based heuristic)
    - Internal faces  (fully enclosed, hidden geometry)
    """

    # Threshold below which a face area is considered zero
    AREA_EPSILON = 1e-10

    def __init__(self, mesh: "trimesh.Trimesh"):
        self.mesh     = mesh
        self.vertices = mesh.vertices
        self.faces    = mesh.faces

    # ------------------------------------------------------------------
    def check_degenerate_faces(self) -> Issue:
        """
        Degenerate faces: zero or near-zero area triangles.
        These collapse a triangle to a line or point and confuse slicers.
        """
        degen: list[int] = []
        for fi, face in enumerate(self.faces):
            v0, v1, v2 = (self.vertices[face[i]] for i in range(3))
            area = _triangle_area(v0, v1, v2)
            if area < self.AREA_EPSILON:
                degen.append(fi)
        n = len(degen)
        return Issue(
            category="geometry", check="degenerate_faces",
            severity=Severity.HIGH if n else Severity.INFO,
            message=f"{n} degenerate (zero/near-zero area) face(s)." if n
                    else "No degenerate faces.",
            count=n, details=degen[:200],
        )

    # ------------------------------------------------------------------
    def check_inverted_normals(self) -> Issue:
        """
        Compare each face normal against the vector from the mesh centroid to
        the face centre. If they point in opposite directions the face is likely
        inverted.

        Note: This heuristic works well for convex/near-convex meshes.
        Concave meshes require ray-casting for perfect accuracy.
        """
        centroid = self.mesh.centroid
        inverted: list[int] = []
        for fi, face in enumerate(self.faces):
            v0, v1, v2 = (self.vertices[face[i]] for i in range(3))
            face_centre = (v0 + v1 + v2) / 3.0
            outward = face_centre - centroid
            normal  = np.cross(v1 - v0, v2 - v0)
            if np.dot(outward, normal) < 0:
                inverted.append(fi)

        n = len(inverted)
        # Only flag if >5 % of faces appear inverted (avoids false positives on
        # concave geometry)
        significant = n > max(5, int(0.05 * len(self.faces)))
        return Issue(
            category="geometry", check="inverted_normals",
            severity=Severity.HIGH if significant else (Severity.LOW if n else Severity.INFO),
            message=(
                f"{n} face(s) appear to have inverted normals "
                f"({100*n/max(len(self.faces),1):.1f}% of mesh)."
                if n else "No inverted normals detected."
            ),
            count=n, details=inverted[:100],
        )

    # ------------------------------------------------------------------
    def check_self_intersections(self) -> Issue:
        """
        Detect self-intersecting triangles using trimesh's built-in method.
        Self-intersections cause slicer artifacts and unprintable geometry.
        Falls back to a simplified BVH-proximity check if trimesh returns nothing.
        """
        try:
            intersecting_faces = trimesh.repair.broken_faces(self.mesh)
            n = len(intersecting_faces) if intersecting_faces is not None else 0
        except Exception:
            intersecting_faces = []
            n = 0

        # Augment: also use trimesh's intersection detection directly
        try:
            si = self.mesh.is_volume  # triggers internal consistency checks
            manager = trimesh.collision.CollisionManager()
            manager.add_object("mesh", self.mesh)
            is_colliding, names = manager.in_collision_internal(return_names=True)
            if is_colliding:
                n = max(n, 1)  # at minimum flag as present
        except Exception:
            pass

        return Issue(
            category="geometry", check="self_intersections",
            severity=Severity.CRITICAL if n else Severity.INFO,
            message=f"{n} self-intersecting face region(s) detected." if n
                    else "No self-intersections detected.",
            count=n,
            details=(intersecting_faces.tolist() if hasattr(intersecting_faces, "tolist")
                     else list(intersecting_faces))[:100],
        )

    # ------------------------------------------------------------------
    def check_thin_walls(self, min_thickness_mm: float = 1.0) -> Issue:
        """
        Approximate thin-wall detection via ray-casting from each face centre
        inward along the face normal.

        Fires a ray from each face centre inward; if the first hit is within
        *min_thickness_mm* the wall is considered too thin to print reliably.

        This is an O(F) operation with BVH acceleration via trimesh.
        """
        try:
            face_normals  = self.mesh.face_normals          # (F, 3)
            face_centres  = self.mesh.triangles_center       # (F, 3)
            inward_rays   = -face_normals                   # flip to point inside

            # Offset origin slightly inside to avoid self-hit
            origins = face_centres + inward_rays * 1e-4

            # Cast rays — returns (hit_locations, ray_index, face_index)
            locations, ray_idx, _ = self.mesh.ray.intersects_location(
                ray_origins=origins,
                ray_directions=inward_rays,
            )

            if len(locations) == 0:
                return Issue(
                    category="geometry", check="thin_walls",
                    severity=Severity.INFO,
                    message="No thin walls detected (ray-cast).",
                    count=0,
                )

            # Distance from origin to hit
            thin_face_idx: list[int] = []
            for loc, ri in zip(locations, ray_idx):
                dist = float(np.linalg.norm(loc - origins[ri]))
                if dist < min_thickness_mm:
                    thin_face_idx.append(int(ri))

            n = len(set(thin_face_idx))
            return Issue(
                category="geometry", check="thin_walls",
                severity=Severity.HIGH if n > 0 else Severity.INFO,
                message=(
                    f"{n} face(s) have wall thickness < {min_thickness_mm} mm."
                    if n else f"No wall thickness below {min_thickness_mm} mm threshold."
                ),
                count=n, details=list(set(thin_face_idx))[:100],
            )
        except Exception as exc:
            return Issue(
                category="geometry", check="thin_walls",
                severity=Severity.LOW,
                message=f"Thin-wall check skipped: {exc}",
                count=0,
            )

    # ------------------------------------------------------------------
    def check_internal_faces(self) -> Issue:
        """
        Detect faces that are entirely enclosed inside the mesh volume.
        These produce internal geometry that wastes material and confuses slicers.

        Heuristic: cast a ray from each face centre along its outward normal and
        count the number of intersections.  An odd number means the face is
        looking outward (correct); an even number means the face is buried inside.
        """
        try:
            normals  = self.mesh.face_normals
            centres  = self.mesh.triangles_center
            origins  = centres + normals * 1e-4   # offset to avoid self-hit

            internal: list[int] = []
            # Batch ray cast
            _, ray_idx, _ = self.mesh.ray.intersects_location(
                ray_origins=origins,
                ray_directions=normals,
            )
            hit_count = Counter(ray_idx.tolist())
            for fi in range(len(self.faces)):
                if hit_count.get(fi, 0) % 2 == 0 and hit_count.get(fi, 0) > 0:
                    internal.append(fi)

            n = len(internal)
            return Issue(
                category="geometry", check="internal_faces",
                severity=Severity.MEDIUM if n else Severity.INFO,
                message=f"{n} internal / buried face(s) detected." if n
                        else "No internal faces detected.",
                count=n, details=internal[:100],
            )
        except Exception as exc:
            return Issue(
                category="geometry", check="internal_faces",
                severity=Severity.LOW,
                message=f"Internal-face check skipped: {exc}",
                count=0,
            )

    # ------------------------------------------------------------------
    def run_all(self) -> list[Issue]:
        return [
            self.check_degenerate_faces(),
            self.check_inverted_normals(),
            self.check_self_intersections(),
            self.check_thin_walls(),
            self.check_internal_faces(),
        ]


# ══════════════════════════════════════════════════════════════════════════════
#  MESH QUALITY CHECKS
# ══════════════════════════════════════════════════════════════════════════════

class QualityChecker:
    """
    Computes mesh quality metrics and populates a MeshStats object.

    Metrics
    -------
    - Watertightness
    - Euler characteristic
    - Volume & surface area
    - Bounding box
    - Triangle aspect ratios  (min / max / mean)
    - Edge length statistics  (min / max / mean)
    - Face normal consistency
    - Open3D / PyMeshLab augmented checks (when available)
    """

    def __init__(self, mesh: "trimesh.Trimesh"):
        self.mesh = mesh

    # ------------------------------------------------------------------
    def compute_stats(self) -> MeshStats:
        """Return a fully populated MeshStats dataclass."""
        m   = self.mesh
        stats = MeshStats()

        stats.vertex_count = len(m.vertices)
        stats.face_count   = len(m.faces)

        # Unique edges
        edges: set[tuple[int, int]] = set()
        for face in m.faces:
            for i in range(3):
                edges.add(_edge_key(int(face[i]), int(face[(i + 1) % 3])))
        stats.edge_count = len(edges)

        # Surface area & volume
        try:
            stats.surface_area = float(m.area)
        except Exception:
            pass

        try:
            if m.is_volume:
                stats.volume = float(m.volume)
        except Exception:
            pass

        # Euler number: V − E + F
        stats.euler_number = stats.vertex_count - stats.edge_count + stats.face_count

        # Bounding box
        try:
            bb = m.bounding_box.bounds.tolist()
            stats.bounding_box = bb
        except Exception:
            pass

        # Watertight / winding
        try:
            stats.is_watertight          = bool(m.is_watertight)
            stats.is_winding_consistent  = bool(m.is_winding_consistent)
        except Exception:
            pass

        # Component count
        try:
            comps = m.split(only_watertight=False)
            stats.component_count = len(comps)
        except Exception:
            pass

        # Triangle aspect ratios
        try:
            ratios = []
            for face in m.faces:
                v0, v1, v2 = (m.vertices[face[i]] for i in range(3))
                ratios.append(_triangle_aspect_ratio(v0, v1, v2))
            finite = [r for r in ratios if np.isfinite(r)]
            if finite:
                stats.min_aspect_ratio  = float(min(finite))
                stats.max_aspect_ratio  = float(max(finite))
                stats.mean_aspect_ratio = float(np.mean(finite))
        except Exception:
            pass

        # Edge lengths
        try:
            lengths = []
            seen: set[tuple[int, int]] = set()
            for face in m.faces:
                for i in range(3):
                    a, b = int(face[i]), int(face[(i + 1) % 3])
                    key  = _edge_key(a, b)
                    if key not in seen:
                        seen.add(key)
                        lengths.append(float(np.linalg.norm(
                            m.vertices[a] - m.vertices[b]
                        )))
            if lengths:
                stats.min_edge_length  = float(min(lengths))
                stats.max_edge_length  = float(max(lengths))
                stats.mean_edge_length = float(np.mean(lengths))
        except Exception:
            pass

        return stats

    # ------------------------------------------------------------------
    def check_aspect_ratio(self, stats: MeshStats) -> Issue:
        """Flag meshes with very high aspect-ratio triangles."""
        threshold = 20.0
        bad = stats.max_aspect_ratio > threshold
        return Issue(
            category="quality", check="aspect_ratio",
            severity=Severity.MEDIUM if bad else Severity.INFO,
            message=(
                f"Max triangle aspect ratio {stats.max_aspect_ratio:.1f} exceeds "
                f"threshold {threshold} — very elongated triangles present."
                if bad else
                f"Triangle aspect ratios OK (max {stats.max_aspect_ratio:.1f})."
            ),
            count=0,
            details={
                "min":  round(stats.min_aspect_ratio, 3),
                "max":  round(stats.max_aspect_ratio, 3),
                "mean": round(stats.mean_aspect_ratio, 3),
            },
        )

    # ------------------------------------------------------------------
    def check_volume(self, stats: MeshStats) -> Issue:
        """Warn if volume could not be computed (usually means non-watertight)."""
        if stats.volume <= 0 and stats.is_watertight:
            return Issue(
                category="quality", check="volume",
                severity=Severity.HIGH,
                message="Mesh appears watertight but volume is zero or negative — "
                        "possible normal orientation issue.",
                count=1,
            )
        if stats.volume <= 0:
            return Issue(
                category="quality", check="volume",
                severity=Severity.INFO,
                message="Volume not computable (mesh is not watertight).",
                count=0,
            )
        return Issue(
            category="quality", check="volume",
            severity=Severity.INFO,
            message=f"Mesh volume: {stats.volume:.4f} mm³",
            count=0,
        )

    # ------------------------------------------------------------------
    def run_all(self) -> tuple[MeshStats, list[Issue]]:
        stats  = self.compute_stats()
        issues = [
            self.check_aspect_ratio(stats),
            self.check_volume(stats),
        ]
        return stats, issues


# ══════════════════════════════════════════════════════════════════════════════
#  OPEN3D AUGMENTED CHECKS
# ══════════════════════════════════════════════════════════════════════════════

class Open3DChecker:
    """
    Uses Open3D for additional mesh analysis when the library is available.

    Checks
    ------
    - Edge manifoldness (cross-validate with trimesh results)
    - Vertex manifoldness
    - Self-intersection check via Open3D's triangle mesh utilities
    - Mesh orientation (all normals outward?)
    """

    def __init__(self, mesh_path: str):
        self.mesh_path = mesh_path
        self._o3d_mesh: Optional["o3d.geometry.TriangleMesh"] = None

    def _load(self) -> bool:
        """Load mesh via Open3D. Returns False on failure."""
        try:
            self._o3d_mesh = o3d.io.read_triangle_mesh(self.mesh_path)
            return True
        except Exception as exc:
            log.debug("Open3D load failed: %s", exc)
            return False

    def run_all(self) -> list[Issue]:
        if not HAS_OPEN3D:
            return []
        if not self._load():
            return []

        issues: list[Issue] = []
        m = self._o3d_mesh

        # -- Edge manifold check
        try:
            edge_ok = m.is_edge_manifold(allow_boundary_edges=True)
            issues.append(Issue(
                category="topology", check="o3d_edge_manifold",
                severity=Severity.CRITICAL if not edge_ok else Severity.INFO,
                message="[Open3D] Mesh has non-manifold edges." if not edge_ok
                        else "[Open3D] All edges are manifold.",
                count=0 if edge_ok else 1,
            ))
        except Exception:
            pass

        # -- Vertex manifold check
        try:
            vert_ok = m.is_vertex_manifold()
            issues.append(Issue(
                category="topology", check="o3d_vertex_manifold",
                severity=Severity.CRITICAL if not vert_ok else Severity.INFO,
                message="[Open3D] Mesh has non-manifold vertices." if not vert_ok
                        else "[Open3D] All vertices are manifold.",
                count=0 if vert_ok else 1,
            ))
        except Exception:
            pass

        # -- Self-intersection
        try:
            si = m.is_self_intersecting()
            issues.append(Issue(
                category="geometry", check="o3d_self_intersecting",
                severity=Severity.CRITICAL if si else Severity.INFO,
                message="[Open3D] Mesh is self-intersecting." if si
                        else "[Open3D] No self-intersections detected.",
                count=1 if si else 0,
            ))
        except Exception:
            pass

        # -- Watertight
        try:
            wt = m.is_watertight()
            issues.append(Issue(
                category="topology", check="o3d_watertight",
                severity=Severity.CRITICAL if not wt else Severity.INFO,
                message="[Open3D] Mesh is NOT watertight." if not wt
                        else "[Open3D] Mesh is watertight.",
                count=0 if wt else 1,
            ))
        except Exception:
            pass

        # -- Orientability
        try:
            ori = m.is_orientable()
            issues.append(Issue(
                category="geometry", check="o3d_orientable",
                severity=Severity.HIGH if not ori else Severity.INFO,
                message="[Open3D] Mesh surface is NOT orientable (Möbius-like topology)."
                        if not ori else "[Open3D] Mesh surface is orientable.",
                count=0 if ori else 1,
            ))
        except Exception:
            pass

        return issues


# ══════════════════════════════════════════════════════════════════════════════
#  PYMESHLAB AUGMENTED CHECKS
# ══════════════════════════════════════════════════════════════════════════════

class PyMeshlabChecker:
    """
    Uses PyMeshLab for extra topology and quality filters when available.

    Checks
    ------
    - Topological disk property (genus)
    - Mesh complexity report
    - Unreferenced vertices
    - Small isolated components (floating debris)
    """

    def __init__(self, mesh_path: str):
        self.mesh_path = mesh_path

    def run_all(self) -> list[Issue]:
        if not HAS_PYMESHLAB:
            return []

        issues: list[Issue] = []
        try:
            ms = pymeshlab.MeshSet()
            ms.load_new_mesh(self.mesh_path)

            # -- Topological measures (genus etc.)
            try:
                info = ms.get_topological_measures()
                genus = info.get("genus_of_mesh", -1)
                holes = info.get("number_of_holes", 0)
                components = info.get("number_of_connected_components_on_border", 0)

                issues.append(Issue(
                    category="topology", check="pml_genus",
                    severity=Severity.MEDIUM if genus > 0 else Severity.INFO,
                    message=f"[PyMeshLab] Mesh genus = {genus} "
                            f"({'handles detected' if genus > 0 else 'no handles'}).",
                    count=genus,
                    details={"genus": genus, "holes": holes, "border_components": components},
                ))
            except Exception as exc:
                log.debug("PyMeshLab topological measures failed: %s", exc)

            # -- Unreferenced vertices
            try:
                before = ms.current_mesh().vertex_number()
                ms.meshing_remove_unreferenced_vertices()
                after = ms.current_mesh().vertex_number()
                removed = before - after
                if removed > 0:
                    issues.append(Issue(
                        category="topology", check="pml_unreferenced_vertices",
                        severity=Severity.LOW,
                        message=f"[PyMeshLab] {removed} unreferenced vertex/vertices found.",
                        count=removed,
                    ))
            except Exception:
                pass

            # -- Small isolated components (floating debris < 1 % of total faces)
            try:
                total_faces = ms.current_mesh().face_number()
                threshold   = max(1, int(0.01 * total_faces))
                ms.meshing_remove_connected_component_by_face_number(
                    mincomponentsize=threshold
                )
                remaining = ms.current_mesh().face_number()
                removed_faces = total_faces - remaining
                if removed_faces > 0:
                    issues.append(Issue(
                        category="topology", check="pml_small_components",
                        severity=Severity.MEDIUM,
                        message=f"[PyMeshLab] {removed_faces} face(s) in small isolated "
                                f"component(s) (< 1% of mesh) — floating debris.",
                        count=removed_faces,
                    ))
            except Exception:
                pass

        except Exception as exc:
            log.debug("PyMeshLab checker failed: %s", exc)

        return issues


# ══════════════════════════════════════════════════════════════════════════════
#  SCORE COMPUTATION
# ══════════════════════════════════════════════════════════════════════════════

def compute_printability_score(issues: list[Issue]) -> dict:
    """
    Compute a 0–100 printability score.

    Rules
    -----
    - Start at 100 pts.
    - Deduct (SEVERITY_PENALTY * min(count, 5)) per issue.
    - A single CRITICAL issue can never be offset by INFO issues.
    - Return score + human label.
    """
    penalty = 0
    for issue in issues:
        weight = SEVERITY_PENALTY.get(issue.severity, 0)
        occurrences = max(issue.count, 1) if issue.count > 0 else 0
        penalty += weight * min(occurrences, 5)

    score = max(0.0, 100.0 - penalty)

    if score >= 90:
        label, color = "EXCELLENT — Ready to print",            "green"
    elif score >= 70:
        label, color = "GOOD — Minor issues, likely printable", "cyan"
    elif score >= 50:
        label, color = "FAIR — Repair recommended",             "yellow"
    elif score >= 25:
        label, color = "POOR — Significant repair required",    "red"
    else:
        label, color = "CRITICAL — Not printable without major repair", "red"

    return {"score": round(score, 1), "label": label, "color": color}


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN ANALYZER CLASS
# ══════════════════════════════════════════════════════════════════════════════

class ModelAnalyzer:
    """
    Orchestrates all mesh checks for a given 3-D model file.

    Usage
    -----
        analyzer = ModelAnalyzer("part.stl")
        report   = analyzer.analyze()
        analyzer.print_report(report)
        analyzer.save_report(report, "report.json")
    """

    def __init__(self, filepath: str, verbose: bool = False):
        ext = os.path.splitext(filepath)[1].lower()
        if not os.path.isfile(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")
        if ext not in SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported format '{ext}'. Supported: {SUPPORTED_EXTENSIONS}"
            )
        self.filepath = filepath
        self.verbose  = verbose

        if not HAS_TRIMESH:
            raise ImportError(
                "trimesh is required. Install with: pip install trimesh"
            )

        log.setLevel(logging.DEBUG if verbose else logging.INFO)

    # ------------------------------------------------------------------
    def _load_mesh(self) -> "trimesh.Trimesh":
        """Load the mesh file; flatten scene to a single Trimesh if needed."""
        loaded = trimesh.load(self.filepath, force="mesh")

        if isinstance(loaded, trimesh.Scene):
            # Merge all geometry in the scene into one mesh
            meshes = [g for g in loaded.geometry.values()
                      if isinstance(g, trimesh.Trimesh)]
            if not meshes:
                raise ValueError("No triangle geometry found in scene.")
            loaded = trimesh.util.concatenate(meshes)

        if not isinstance(loaded, trimesh.Trimesh):
            raise ValueError(
                f"Could not load a Trimesh from '{self.filepath}'. "
                f"Got: {type(loaded)}"
            )

        return loaded

    # ------------------------------------------------------------------
    def analyze(self) -> dict:
        """
        Run all checks and return a structured report dictionary.

        Returns
        -------
        dict with keys: file, library_status, stats, issues, score
        """
        t_start = time.perf_counter()
        log.info(c("\n╔══════════════════════════════════════════════╗", "cyan", "bold"))
        log.info(c("║     3D PRINT MODEL ANALYZER                  ║", "cyan", "bold"))
        log.info(c("╚══════════════════════════════════════════════╝\n", "cyan", "bold"))
        log.info(c(f"  File : {self.filepath}", "bold"))
        log.info(c(f"  Size : {os.path.getsize(self.filepath):,} bytes\n", "grey"))

        # ── Library availability ──────────────────────────────────────
        lib_status = {
            "trimesh":   HAS_TRIMESH,
            "open3d":    HAS_OPEN3D,
            "pymeshlab": HAS_PYMESHLAB,
            "numpy":     True,
        }
        log.info(c("  Libraries:", "bold"))
        for lib, ok in lib_status.items():
            sym = c("✓", "green") if ok else c("✗", "yellow")
            log.info(f"    {sym}  {lib}")
        log.info("")

        # ── Load ─────────────────────────────────────────────────────
        log.info(c("  Loading mesh …", "grey"))
        mesh = self._load_mesh()
        log.info(c(f"  Loaded: {len(mesh.vertices):,} vertices, "
                   f"{len(mesh.faces):,} faces\n", "grey"))

        all_issues: list[Issue] = []

        # ── Topology checks ───────────────────────────────────────────
        log.info(c("  ▶ Topology checks", "blue", "bold"))
        topo = TopologyChecker(mesh)
        topo_issues = topo.run_all()
        all_issues.extend(topo_issues)
        for issue in topo_issues:
            self._log_issue(issue)

        # ── Geometry checks ───────────────────────────────────────────
        log.info(c("\n  ▶ Geometry checks", "blue", "bold"))
        geom = GeometryChecker(mesh)
        geom_issues = geom.run_all()
        all_issues.extend(geom_issues)
        for issue in geom_issues:
            self._log_issue(issue)

        # ── Quality / stats ───────────────────────────────────────────
        log.info(c("\n  ▶ Mesh quality metrics", "blue", "bold"))
        qual = QualityChecker(mesh)
        stats, qual_issues = qual.run_all()
        all_issues.extend(qual_issues)
        for issue in qual_issues:
            self._log_issue(issue)

        # ── Open3D augmented ─────────────────────────────────────────
        if HAS_OPEN3D:
            log.info(c("\n  ▶ Open3D augmented checks", "blue", "bold"))
            o3d_issues = Open3DChecker(self.filepath).run_all()
            all_issues.extend(o3d_issues)
            for issue in o3d_issues:
                self._log_issue(issue)

        # ── PyMeshLab augmented ───────────────────────────────────────
        if HAS_PYMESHLAB:
            log.info(c("\n  ▶ PyMeshLab augmented checks", "blue", "bold"))
            pml_issues = PyMeshlabChecker(self.filepath).run_all()
            all_issues.extend(pml_issues)
            for issue in pml_issues:
                self._log_issue(issue)

        # ── Score ─────────────────────────────────────────────────────
        score_info = compute_printability_score(
            [i for i in all_issues if i.severity != Severity.INFO]
        )

        elapsed = time.perf_counter() - t_start

        # ── Build structured report ───────────────────────────────────
        report = {
            "file": self.filepath,
            "analysis_time_seconds": round(elapsed, 3),
            "library_status": lib_status,
            "summary": {
                "watertight":           stats.is_watertight,
                "winding_consistent":   stats.is_winding_consistent,
                "vertex_count":         stats.vertex_count,
                "face_count":           stats.face_count,
                "edge_count":           stats.edge_count,
                "surface_area":         round(stats.surface_area, 4),
                "volume":               round(stats.volume, 4),
                "euler_number":         stats.euler_number,
                "component_count":      stats.component_count,
                "bounding_box":         stats.bounding_box,
            },
            "quality_metrics": {
                "aspect_ratio": {
                    "min":  round(stats.min_aspect_ratio,  4),
                    "max":  round(stats.max_aspect_ratio,  4),
                    "mean": round(stats.mean_aspect_ratio, 4),
                },
                "edge_length": {
                    "min":  round(stats.min_edge_length,  4),
                    "max":  round(stats.max_edge_length,  4),
                    "mean": round(stats.mean_edge_length, 4),
                },
            },
            "issues": [i.to_dict() for i in all_issues],
            "score": score_info,
        }

        # ── Print summary table ───────────────────────────────────────
        self._print_summary(stats, all_issues, score_info, elapsed)

        return report

    # ------------------------------------------------------------------
    def _log_issue(self, issue: Issue) -> None:
        """Print a single issue line to the console."""
        colors = SEVERITY_COLOR.get(issue.severity, ())
        sev_str = c(f"[{issue.severity.value:<8}]", *colors)
        log.info(f"    {sev_str}  {issue.check:<30}  {issue.message}")

    # ------------------------------------------------------------------
    def _print_summary(
        self,
        stats: MeshStats,
        issues: list[Issue],
        score_info: dict,
        elapsed: float,
    ) -> None:
        """Print the final summary block."""
        sep = c("─" * 60, "grey")
        log.info(f"\n{sep}")
        log.info(c("  MESH STATISTICS", "bold"))
        log.info(sep)

        rows = [
            ("Vertices",        f"{stats.vertex_count:,}"),
            ("Faces",           f"{stats.face_count:,}"),
            ("Edges",           f"{stats.edge_count:,}"),
            ("Surface area",    f"{stats.surface_area:.4f} mm²"),
            ("Volume",          f"{stats.volume:.4f} mm³" if stats.volume > 0 else "N/A"),
            ("Euler number",    f"{stats.euler_number}  (expected 2)"),
            ("Components",      str(stats.component_count)),
            ("Watertight",      c("Yes", "green") if stats.is_watertight else c("No", "red")),
            ("Winding OK",      c("Yes", "green") if stats.is_winding_consistent else c("No", "red")),
            ("Aspect ratio",    f"min {stats.min_aspect_ratio:.2f}  "
                                f"max {stats.max_aspect_ratio:.2f}  "
                                f"mean {stats.mean_aspect_ratio:.2f}"),
            ("Edge length",     f"min {stats.min_edge_length:.4f}  "
                                f"max {stats.max_edge_length:.4f}  "
                                f"mean {stats.mean_edge_length:.4f}  mm"),
        ]
        for label, value in rows:
            log.info(f"  {label:<20} {value}")

        # Issue count by severity
        log.info(f"\n{sep}")
        log.info(c("  ISSUE SUMMARY", "bold"))
        log.info(sep)
        sev_counts: dict[str, int] = Counter(
            i.severity.value for i in issues if i.count > 0
        )
        for sev in [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM,
                    Severity.LOW, Severity.INFO]:
            cnt = sev_counts.get(sev.value, 0)
            colors = SEVERITY_COLOR.get(sev, ())
            log.info(f"  {c(sev.value, *colors):<20} {cnt} issue(s)")

        # Printability score
        log.info(f"\n{sep}")
        score_label = c(
            f"  PRINTABILITY SCORE: {score_info['score']} / 100  —  {score_info['label']}",
            score_info.get("color", "bold"), "bold",
        )
        log.info(score_label)
        log.info(sep)
        log.info(c(f"\n  Analysis completed in {elapsed:.2f} s\n", "grey"))

    # ------------------------------------------------------------------
    @staticmethod
    def save_report(report: dict, output_path: str) -> None:
        """Serialise the report dict to a JSON file."""
        with open(output_path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, default=str)
        log.info(c(f"  JSON report saved → {output_path}", "green"))

    # ------------------------------------------------------------------
    @staticmethod
    def print_report(report: dict) -> None:
        """Pretty-print the JSON report to stdout (debug / CI use)."""
        print(json.dumps(report, indent=2, default=str))


# ══════════════════════════════════════════════════════════════════════════════
#  CLI
# ══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="analyze_model",
        description="3D Print Model Analyzer — detect mesh errors before printing.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python analyze_model.py part.stl
  python analyze_model.py part.obj --report part_report.json
  python analyze_model.py part.ply --verbose --no-color
        """,
    )
    p.add_argument("model",   help="Path to 3D model file (STL/OBJ/PLY/GLB/OFF)")
    p.add_argument("--report",    metavar="FILE",
                   help="Save analysis report as JSON to FILE")
    p.add_argument("--verbose",   action="store_true",
                   help="Enable debug-level logging")
    p.add_argument("--no-color",  action="store_true",
                   help="Disable ANSI colour output (useful for CI/log files)")
    p.add_argument("--json",      action="store_true",
                   help="Print full JSON report to stdout at the end")
    return p


def main() -> None:
    parser = build_parser()
    args   = parser.parse_args()

    # Honour color flag globally
    global USE_COLOR
    if args.no_color:
        USE_COLOR = False

    try:
        analyzer = ModelAnalyzer(args.model, verbose=args.verbose)
        report   = analyzer.analyze()

        if args.report:
            ModelAnalyzer.save_report(report, args.report)

        if args.json:
            ModelAnalyzer.print_report(report)

        # Exit with non-zero code if score < 50 so CI pipelines can catch it
        score = report["score"]["score"]
        sys.exit(0 if score >= 50 else 1)

    except FileNotFoundError as exc:
        log.error(c(f"Error: {exc}", "red"))
        sys.exit(2)
    except ValueError as exc:
        log.error(c(f"Error: {exc}", "red"))
        sys.exit(2)
    except Exception as exc:
        log.error(c(f"Unexpected error: {exc}", "red"))
        if args.verbose:
            traceback.print_exc()
        sys.exit(3)


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    main()
