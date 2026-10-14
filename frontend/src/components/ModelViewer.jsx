import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Expand, Minimize, Loader2, AlertTriangle } from 'lucide-react';
import './ModelViewer.css';

async function loadOrbitControlsModule() {
  const module = await import('three/examples/jsm/controls/OrbitControls.js');
  return module.OrbitControls;
}

async function loadModelObject(extension, objectUrl, viewerMaterial) {
  if (extension === 'stl') {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
    return new Promise((resolve, reject) => {
      const loader = new STLLoader();
      loader.load(
        objectUrl,
        (geometry) => {
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          resolve(new THREE.Mesh(geometry, viewerMaterial.clone()));
        },
        undefined,
        reject,
      );
    });
  }

  if (extension === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    return new Promise((resolve, reject) => {
      const loader = new OBJLoader();
      loader.load(objectUrl, resolve, undefined, reject);
    });
  }

  if (extension === 'ply') {
    const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
    return new Promise((resolve, reject) => {
      const loader = new PLYLoader();
      loader.load(
        objectUrl,
        (geometry) => {
          geometry.computeVertexNormals();
          resolve(new THREE.Mesh(geometry, viewerMaterial.clone()));
        },
        undefined,
        reject,
      );
    });
  }

  if (extension === 'glb') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(objectUrl, (gltf) => resolve(gltf.scene), undefined, reject);
    });
  }

  throw new Error('Unsupported format for viewer. Please upload STL, OBJ, PLY, or GLB.');
}

function getExtension(fileName) {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
  });
}

function createViewerMaterial(wireframe) {
  return new THREE.MeshStandardMaterial({
    color: '#b8bec8',
    roughness: 0.52,
    metalness: 0.08,
    wireframe,
  });
}

function fitCameraToObject(camera, controls, object) {
  const boundingBox = new THREE.Box3().setFromObject(object);
  const size = boundingBox.getSize(new THREE.Vector3());
  const center = boundingBox.getCenter(new THREE.Vector3());

  object.position.sub(center);

  const normalizedBox = new THREE.Box3().setFromObject(object);
  const normalizedSize = normalizedBox.getSize(new THREE.Vector3());
  const normalizedMaxDim = Math.max(normalizedSize.x, normalizedSize.y, normalizedSize.z);

  if (normalizedMaxDim > 0) {
    const normalizeScale = 2.6 / normalizedMaxDim;
    object.scale.setScalar(normalizeScale);
  }

  const finalBox = new THREE.Box3().setFromObject(object);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(finalSize.x, finalSize.y, finalSize.z);

  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitDistance = maxDim / (2 * Math.tan(fov / 2));
  const distance = fitDistance * 1.4;

  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = Math.max(distance * 200, 2000);
  camera.position.set(distance * 0.95, distance * 0.7, distance * 1.1);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.minDistance = distance * 0.18;
  controls.maxDistance = distance * 9;
  controls.update();
}

function setWireframe(object, enabled) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        material.wireframe = enabled;
        material.needsUpdate = true;
      });
      return;
    }

    child.material.wireframe = enabled;
    child.material.needsUpdate = true;
  });
}

function dollyCamera(camera, controls, zoomFactor) {
  const target = controls.target.clone();
  const direction = camera.position.clone().sub(target);

  if (direction.lengthSq() === 0) return;

  const currentDistance = direction.length();
  const nextDistance = THREE.MathUtils.clamp(
    currentDistance * zoomFactor,
    controls.minDistance,
    controls.maxDistance,
  );

  direction.setLength(nextDistance);
  camera.position.copy(target.add(direction));
  controls.update();
}

function focusCameraOnPoint(camera, controls, point) {
  const target = point.clone();
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() === 0) {
    direction.set(1.4, 1.1, 1.6);
  }

  const nextPosition = target.clone().add(direction.setLength(Math.max(controls.minDistance * 1.8, 1.2)));
  controls.target.copy(target);
  camera.position.copy(nextPosition);
  controls.update();
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  }
}

function createIssueOverlays(report) {
  const group = new THREE.Group();
  const issues = Object.entries(report?.errors || {}).flatMap(([issueGroup, items]) =>
    (items || []).map((issue, index) => ({ ...issue, issueGroup, id: `${issueGroup}-${index}` })),
  );

  issues.forEach((issue) => {
    const color = issue.issueGroup === 'holes'
      ? '#ef4444'
      : issue.issueGroup === 'non_manifold_edges'
        ? '#facc15'
        : issue.issueGroup === 'self_intersections'
          ? '#a855f7'
          : issue.issueGroup === 'degenerate_faces' || issue.issueGroup === 'zero_area_faces'
            ? '#f97316'
            : '#38bdf8';

    if (Array.isArray(issue.edges) && issue.edges.length && Array.isArray(issue.points) && issue.points.length >= 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        issue.points.map((point) => new THREE.Vector3(point[0], point[1], point[2])),
      );
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      );
      line.userData.issueId = issue.id;
      group.add(line);
      return;
    }

    if (Array.isArray(issue.points) && issue.points.length >= 3) {
      const vertices = new Float32Array(issue.points.flat());
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex([0, 1, 2]);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      );
      mesh.userData.issueId = issue.id;
      group.add(mesh);
      return;
    }

    if (Array.isArray(issue.position) && issue.position.length === 3) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      );
      marker.position.set(issue.position[0], issue.position[1], issue.position[2]);
      marker.userData.issueId = issue.id;
      group.add(marker);
    }
  });

  return group;
}

function FullscreenButton({ isFullscreen, onClick }) {
  return (
    <button className="viewer-fullscreen-btn" onClick={onClick} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
      {isFullscreen ? <Minimize size={16} /> : <Expand size={16} />}
      <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
    </button>
  );
}

function ModelViewer({ file, report, selectedIssue, wireframe, showGrid, resetSignal, zoomInSignal, zoomOutSignal }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const gridRef = useRef(null);
  const axesRef = useRef(null);
  const overlaysRef = useRef(null);
  const frameRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  const viewerMaterial = useMemo(() => createViewerMaterial(false), []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) return undefined;

    let isDisposed = false;

    const initializeViewer = async () => {
      const OrbitControls = await loadOrbitControlsModule();
      if (isDisposed) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#ffffff');

      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
      camera.position.set(2.5, 2, 2.5);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.target.set(0, 0, 0);

      const ambientLight = new THREE.AmbientLight('#ffffff', 0.48);
      const hemisphereLight = new THREE.HemisphereLight('#f8fafc', '#e2e8f0', 0.72);
      const directionalKey = new THREE.DirectionalLight('#ffffff', 1.12);
      directionalKey.position.set(5, 8, 6);
      const directionalFill = new THREE.DirectionalLight('#dbeafe', 0.4);
      directionalFill.position.set(-6, 3, -5);

      scene.add(ambientLight);
      scene.add(hemisphereLight);
      scene.add(directionalKey);
      scene.add(directionalFill);

      const grid = new THREE.GridHelper(20, 20, '#94a3b8', '#e2e8f0');
      grid.position.y = -1.35;
      scene.add(grid);

      const axes = new THREE.AxesHelper(1.4);
      scene.add(axes);

      const overlays = new THREE.Group();

      const resize = () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resize();

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);

      const animate = () => {
        controls.update();
        renderer.render(scene, camera);
        frameRef.current = window.requestAnimationFrame(animate);
      };

      frameRef.current = window.requestAnimationFrame(animate);

      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
      controlsRef.current = controls;
      gridRef.current = grid;
      axesRef.current = axes;
      overlaysRef.current = overlays;
      resizeObserverRef.current = resizeObserver;
      setViewerReady(true);
    };

    initializeViewer().catch(() => {
      if (!isDisposed) {
        setError('Unable to initialize the 3D viewer. Please refresh and try again.');
      }
    });

    return () => {
      isDisposed = true;
      setViewerReady(false);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }

      resizeObserverRef.current?.disconnect();

      if (modelRef.current) {
        sceneRef.current?.remove(modelRef.current);
        disposeObject3D(modelRef.current);
        modelRef.current = null;
      }

      viewerMaterial.dispose();
      controlsRef.current?.dispose();
      rendererRef.current?.dispose();
      sceneRef.current?.clear();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      gridRef.current = null;
      axesRef.current = null;
      overlaysRef.current = null;
      resizeObserverRef.current = null;
    };
  }, [viewerMaterial]);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!viewerReady || !scene || !camera || !controls || !file) return undefined;

    const extension = getExtension(file.name);
    const objectUrl = URL.createObjectURL(file);
    let isCancelled = false;

    setIsLoading(true);
    setError('');

    if (modelRef.current) {
      scene.remove(modelRef.current);
      disposeObject3D(modelRef.current);
      modelRef.current = null;
    }

    const onModelReady = (model) => {
      if (!sceneRef.current || isCancelled) return;

      model.traverse((child) => {
        if (!child.isMesh) return;

        if (child.geometry && !child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals();
        }

        child.castShadow = false;
        child.receiveShadow = false;
        child.material = viewerMaterial.clone();
      });

      modelRef.current = model;
      scene.add(model);
      if (overlaysRef.current) {
        if (overlaysRef.current.parent) {
          overlaysRef.current.parent.remove(overlaysRef.current);
        }
        model.add(overlaysRef.current);
        clearGroup(overlaysRef.current);
        const overlayGroup = createIssueOverlays(report);
        while (overlayGroup.children.length) {
          overlaysRef.current.add(overlayGroup.children[0]);
        }
      }
      fitCameraToObject(camera, controls, model);
      setWireframe(model, wireframe);
      setIsLoading(false);
    };

    const onLoadError = (loadError) => {
      if (isCancelled) return;
      const message = loadError instanceof Error
        ? loadError.message
        : 'Unable to load model. Please upload a valid STL, OBJ, PLY, or GLB file.';
      setError(message);
      setIsLoading(false);
    };

    loadModelObject(extension, objectUrl, viewerMaterial)
      .then(onModelReady)
      .catch(onLoadError);

    return () => {
      isCancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, viewerMaterial, viewerReady, wireframe, report]);

  useEffect(() => {
    const overlays = overlaysRef.current;
    const model = modelRef.current;
    if (!overlays || !model) return;

    if (overlays.parent !== model) {
      overlays.parent?.remove(overlays);
      model.add(overlays);
    }

    clearGroup(overlays);
    const overlayGroup = createIssueOverlays(report);
    while (overlayGroup.children.length) {
      overlays.add(overlayGroup.children[0]);
    }
  }, [report]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    if (!camera || !controls || !model || !selectedIssue?.position) return;

    const point = model.localToWorld(new THREE.Vector3(
      selectedIssue.position[0],
      selectedIssue.position[1],
      selectedIssue.position[2],
    ));
    focusCameraOnPoint(camera, controls, point);
  }, [selectedIssue]);

  useEffect(() => {
    if (!modelRef.current) return;
    setWireframe(modelRef.current, wireframe);
  }, [wireframe]);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls || !modelRef.current) return;

    fitCameraToObject(camera, controls, modelRef.current);
  }, [resetSignal]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!camera || !controls) return;
    dollyCamera(camera, controls, 0.82);
  }, [zoomInSignal]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!camera || !controls) return;
    dollyCamera(camera, controls, 1.22);
  }, [zoomOutSignal]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen API errors and keep viewer usable.
    }
  };

  return (
    <div ref={containerRef} className={`model-viewer ${isFullscreen ? 'model-viewer-fullscreen' : ''}`}>
      <canvas ref={canvasRef} className="model-viewer-canvas" />

      <div className="viewer-overlay-actions">
        <FullscreenButton isFullscreen={isFullscreen} onClick={handleToggleFullscreen} />
      </div>

      {isLoading && (
        <div className="viewer-overlay viewer-overlay-loading">
          <Loader2 className="viewer-loader-icon" size={30} />
          <span>Loading model geometry...</span>
        </div>
      )}

      {error && (
        <div className="viewer-overlay viewer-overlay-error">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default ModelViewer;
