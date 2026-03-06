import { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';
import './ModelViewer.css';

// Generate a sample 3D model (a torus knot) since we're simulating
function SampleModel({ wireframe, showIssues }) {
  const meshRef = useRef();
  const issueRefs = useRef([]);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002;
    }
  });

  // Create issue highlight positions
  const issuePositions = useMemo(() => [
    { position: [0.8, -0.5, 0.3], scale: 0.25, label: 'Non-Manifold Edges' },
    { position: [-0.6, 0.7, -0.2], scale: 0.2, label: 'Inverted Normals' },
    { position: [0.1, -0.8, 0.7], scale: 0.3, label: 'Thin Wall' },
    { position: [-0.4, 0.2, -0.8], scale: 0.18, label: 'Overhang' },
    { position: [0.5, 0.6, 0.5], scale: 0.15, label: 'Floating Geo' },
  ], []);

  return (
    <group ref={meshRef}>
      {/* Main Model */}
      <mesh castShadow receiveShadow>
        <torusKnotGeometry args={[1, 0.35, 200, 32]} />
        <meshStandardMaterial
          color="#94a3b8"
          metalness={0.3}
          roughness={0.4}
          wireframe={wireframe}
          transparent={wireframe}
          opacity={wireframe ? 0.6 : 1}
        />
      </mesh>

      {/* Issue Highlights */}
      {showIssues && issuePositions.map((issue, i) => (
        <group key={i} position={issue.position}>
          <mesh scale={issue.scale}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color="#ef4444"
              transparent
              opacity={0.35}
              emissive="#ef4444"
              emissiveIntensity={0.5}
            />
          </mesh>
          <mesh scale={issue.scale * 1.3}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color="#ef4444"
              transparent
              opacity={0.1}
              wireframe
            />
          </mesh>
          <PulsingRing scale={issue.scale} />
        </group>
      ))}
    </group>
  );
}

function PulsingRing({ scale }) {
  const ringRef = useRef();
  
  useFrame((state) => {
    if (ringRef.current) {
      const t = state.clock.elapsedTime;
      ringRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      ringRef.current.material.opacity = 0.3 + Math.sin(t * 3) * 0.15;
    }
  });

  return (
    <mesh ref={ringRef} scale={scale * 1.5}>
      <ringGeometry args={[0.8, 1, 32]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CameraSetup() {
  const { camera } = useThree();
  
  useEffect(() => {
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}

function ViewerFallback() {
  return (
    <Html center>
      <div className="viewer-loader">
        <Loader2 className="viewer-loader-icon" size={32} />
        <span>Loading 3D View...</span>
      </div>
    </Html>
  );
}

function ModelViewer({ wireframe, showIssues }) {
  return (
    <div className="model-viewer">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance'
        }}
        camera={{ fov: 45, near: 0.1, far: 100 }}
      >
        <CameraSetup />
        
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-3, 3, -3]} intensity={0.3} />
        <pointLight position={[0, 3, 0]} intensity={0.5} color="#818cf8" />
        
        <Suspense fallback={<ViewerFallback />}>
          <SampleModel wireframe={wireframe} showIssues={showIssues} />
          <ContactShadows
            position={[0, -1.6, 0]}
            opacity={0.5}
            scale={10}
            blur={2}
            far={4}
          />
          <Environment preset="city" />
        </Suspense>
        
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={2}
          maxDistance={10}
          autoRotate={false}
          makeDefault
        />
        
        {/* Grid */}
        <gridHelper args={[10, 20, '#1e293b', '#1e293b']} position={[0, -1.6, 0]} />
      </Canvas>
    </div>
  );
}

export default ModelViewer;
