import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

import styles from './ModelViewer.module.css'

/**
 * @param {{
 *   geometry?: THREE.BufferGeometry,
 *   texture?: THREE.Texture,
 *   scene?: THREE.Object3D,
 *   pointCloud?: boolean,
 *   autoRotate?: boolean,
 *   objectRef?: React.MutableRefObject<THREE.Object3D | null>,
 *   layoutClassName?: string,
 * }} props
 */
export function ModelViewer({ geometry, texture, scene, pointCloud = false, autoRotate = true, objectRef = undefined, layoutClassName = undefined }) {
  return (
    <div className={cx(styles.component, layoutClassName)}>
      <Canvas
        camera={{ position: [1.6, 1.1, 2.6], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        {/* Local lights only — no remote HDRI, so generation stays fully offline. */}
        <hemisphereLight args={['#ffffff', '#8888aa', 1.5]} />
        <ambientLight intensity={1.0} />
        <directionalLight position={[3, 4, 5]} intensity={2.5} />
        <directionalLight position={[-4, 2, -3]} intensity={1.2} />
        <directionalLight position={[0, -4, 2]} intensity={0.8} />

        <Scene {...{ geometry, texture, scene, pointCloud, autoRotate, objectRef }} />
      </Canvas>
    </div>
  )
}

// Scene owns both the mesh and OrbitControls so the interaction ref is shared.
function Scene({ geometry, texture, scene, pointCloud, autoRotate, objectRef }) {
  const meshRef = React.useRef(null)
  const userInteractedRef = React.useRef(false)

  const material = React.useMemo(
    () => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide }),
    [texture],
  )

  const pointsMaterial = React.useMemo(
    () => new THREE.PointsMaterial({ map: texture, size: 0.008, vertexColors: false, sizeAttenuation: true }),
    [texture],
  )

  // When pointCloud is active and we have a scene (multi-view GLB path), extract
  // all mesh geometries from the scene graph, merge them, and render as points.
  const scenePointGeometry = React.useMemo(() => {
    if (!scene || !pointCloud) return null
    const geos = []
    scene.traverse(obj => {
      if (obj.isMesh && obj.geometry) geos.push(obj.geometry)
    })
    if (geos.length === 0) return null
    return mergeGeometries(geos, false)
  }, [scene, pointCloud])

  const scenePointsMaterial = React.useMemo(
    () => new THREE.PointsMaterial({ size: 0.008, vertexColors: true, sizeAttenuation: true }),
    [],
  )

  React.useEffect(() => {
    if (objectRef) objectRef.current = meshRef.current
  }, [objectRef])

  useFrame((_, delta) => {
    if (autoRotate && !userInteractedRef.current && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.4
    }
  })

  return (
    <>
      {scene && pointCloud && scenePointGeometry ? (
        <points ref={meshRef} geometry={scenePointGeometry} material={scenePointsMaterial} />
      ) : scene ? (
        <primitive ref={meshRef} object={scene} />
      ) : pointCloud ? (
        <points ref={meshRef} {...{ geometry, material: pointsMaterial }} />
      ) : (
        <mesh ref={meshRef} {...{ geometry, material }} />
      )}
      <OrbitControls
        enablePan={false}
        minDistance={1.4}
        maxDistance={8}
        onStart={() => { userInteractedRef.current = true }}
      />
    </>
  )
}
