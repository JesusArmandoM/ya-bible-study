import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  SACRED_STAGE_METADATA,
  type SacredAccentMode,
  type SacredStageStore,
  type SacredStageVariant,
} from '../../state/sacredStageStore';
import {
  STAGE_VISIBILITY_EPSILON,
  createSacredFrameState,
  stepSacredFrameStateInPlace,
} from './sacredStageMath';

export interface PointerTiltTarget {
  x: number;
  y: number;
}

export interface SacredStageRigProps {
  store: SacredStageStore;
  stage: SacredStageVariant;
  accentMode: SacredAccentMode;
  reducedMotion: boolean;
  paused: boolean;
  pointerTargetRef: MutableRefObject<PointerTiltTarget>;
}

function createBeveledStarGeometry(
  points: number,
  outerRadius: number,
  innerRadius: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const totalVertices = points * 2;
  for (let i = 0; i < totalVertices; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / points + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.055,
    bevelThickness: 0.055,
  });
  geometry.center();
  return geometry;
}

function createChaliceBowlGeometry(): THREE.LatheGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -0.34),
    new THREE.Vector2(0.14, -0.32),
    new THREE.Vector2(0.34, -0.22),
    new THREE.Vector2(0.5, -0.02),
    new THREE.Vector2(0.56, 0.24),
    new THREE.Vector2(0.5, 0.24),
    new THREE.Vector2(0.43, 0.02),
    new THREE.Vector2(0.24, -0.18),
    new THREE.Vector2(0.0, -0.24),
  ];
  return new THREE.LatheGeometry(profile, 32);
}

export function SacredStageRig({
  store,
  stage,
  accentMode,
  reducedMotion,
  paused,
  pointerTargetRef,
}: SacredStageRigProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  const frameStateRef = useRef(createSacredFrameState(stage, accentMode));
  const targetPrimaryColorRef = useRef(
    new THREE.Color(SACRED_STAGE_METADATA[stage].primaryColor),
  );
  const targetSecondaryColorRef = useRef(
    new THREE.Color(SACRED_STAGE_METADATA[stage].secondaryColor),
  );

  const rigRootRef = useRef<THREE.Group>(null);
  const sanctuaryGroupRef = useRef<THREE.Group>(null);
  const hospitalityRingsRef = useRef<THREE.Group>(null);
  const prayerOrbGroupRef = useRef<THREE.Group>(null);
  const prayerOrbMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const chosenAuraGroupRef = useRef<THREE.Group>(null);
  const gospelCodexGroupRef = useRef<THREE.Group>(null);
  const randomPolyGroupRef = useRef<THREE.Group>(null);
  const polyCoreRef = useRef<THREE.Mesh>(null);
  const polyCageRef = useRef<THREE.LineSegments>(null);
  const starOfFaithGroupRef = useRef<THREE.Group>(null);
  const impulseRingRef = useRef<THREE.Mesh>(null);
  const impulseRingMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const keyLightRef = useRef<THREE.PointLight>(null);
  const rimLightRef = useRef<THREE.PointLight>(null);

  // Offline studio PBR reflection map via RoomEnvironment (zero external network fetches).
  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    const roomEnvironment = new RoomEnvironment();
    const envRenderTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
    const previousEnvironment = scene.environment;

    scene.environment = envRenderTarget.texture;
    roomEnvironment.dispose();
    pmremGenerator.dispose();

    return () => {
      scene.environment = previousEnvironment;
      envRenderTarget.dispose();
    };
  }, [gl, scene]);

  // Procedural sacred geometries memoized once for the persistent Canvas lifetime.
  const geometries = useMemo(() => {
    const fourPointStar = createBeveledStarGeometry(4, 0.94, 0.25, 0.14);
    const fivePointStar = createBeveledStarGeometry(5, 0.88, 0.36, 0.16);
    const chaliceBowl = createChaliceBowlGeometry();
    const polyCore = new THREE.IcosahedronGeometry(0.76, 0);
    const dodecaSource = new THREE.DodecahedronGeometry(1.06, 0);
    const polyCageEdges = new THREE.EdgesGeometry(dodecaSource);
    dodecaSource.dispose();

    return {
      fourPointStar,
      fivePointStar,
      chaliceBowl,
      polyCore,
      polyCageEdges,
    };
  }, []);

  useEffect(() => {
    return () => {
      geometries.fourPointStar.dispose();
      geometries.fivePointStar.dispose();
      geometries.chaliceBowl.dispose();
      geometries.polyCore.dispose();
      geometries.polyCageEdges.dispose();
    };
  }, [geometries]);

  // Update target light colors when stage changes.
  useEffect(() => {
    const meta = SACRED_STAGE_METADATA[stage];
    targetPrimaryColorRef.current.set(meta.primaryColor);
    targetSecondaryColorRef.current.set(meta.secondaryColor);
  }, [stage]);

  // Ensure frameloop="demand" (reducedMotion) re-renders immediately on mount and stage/accent/pause changes.
  useEffect(() => {
    if (paused) {
      return;
    }
    invalidate();
    if (!reducedMotion || typeof requestAnimationFrame !== 'function') {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      invalidate();
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [stage, accentMode, reducedMotion, paused, invalidate]);

  // Also wake frameloop="demand" if a zustand impulse fires while reducedMotion is active.
  useEffect(() => {
    if (!reducedMotion || paused) {
      return;
    }
    return store.subscribe(() => {
      invalidate();
    });
  }, [store, reducedMotion, paused, invalidate]);

  useFrame((_, rawDelta) => {
    const storeSnapshot = store.getState();
    const frame = stepSacredFrameStateInPlace(frameStateRef.current, {
      delta: rawDelta,
      stage: storeSnapshot.stage,
      accentMode: storeSnapshot.accentMode,
      pointerTargetX: pointerTargetRef.current.x,
      pointerTargetY: pointerTargetRef.current.y,
      impulse: storeSnapshot.impulse,
      reducedMotion,
    });

    const rigRoot = rigRootRef.current;
    if (rigRoot) {
      rigRoot.position.y = frame.bobOffset;
      rigRoot.rotation.x = frame.tiltY * 0.85;
      rigRoot.rotation.y = frame.tiltX + Math.sin(frame.idleAngle) * 0.22;
    }

    const applyStageGroup = (
      group: THREE.Group | null,
      weight: number,
      extraScale = 0,
    ) => {
      if (!group) return;
      const isVisible = weight > STAGE_VISIBILITY_EPSILON;
      group.visible = isVisible;
      if (isVisible) {
        const s = 0.72 + 0.28 * weight + extraScale;
        group.scale.setScalar(s);
      }
    };

    const pulseScale =
      (frame.shockwave * 0.06 + frame.completionWave * 0.07) *
      (reducedMotion ? 0 : 1);

    applyStageGroup(
      sanctuaryGroupRef.current,
      frame.weights['sanctuary-emblem'],
      pulseScale,
    );
    if (hospitalityRingsRef.current) {
      const hospVisible = frame.hospitalityWeight > STAGE_VISIBILITY_EPSILON;
      hospitalityRingsRef.current.visible = hospVisible;
      if (hospVisible) {
        hospitalityRingsRef.current.scale.setScalar(
          0.85 + 0.15 * frame.hospitalityWeight,
        );
        hospitalityRingsRef.current.rotation.z = frame.idleAngle * 0.45;
      }
    }

    applyStageGroup(
      prayerOrbGroupRef.current,
      frame.weights['prayer-orb'],
      pulseScale,
    );
    if (prayerOrbMaterialRef.current) {
      prayerOrbMaterialRef.current.emissiveIntensity =
        0.55 + frame.emissiveBoost * 0.65;
    }

    applyStageGroup(
      chosenAuraGroupRef.current,
      frame.weights['chosen-aura'],
      pulseScale,
    );
    if (chosenAuraGroupRef.current && chosenAuraGroupRef.current.visible) {
      chosenAuraGroupRef.current.rotation.y = frame.idleAngle * 0.35;
    }

    applyStageGroup(
      gospelCodexGroupRef.current,
      frame.weights['gospel-codex'],
      pulseScale,
    );

    applyStageGroup(
      randomPolyGroupRef.current,
      frame.weights['random-polyhedron'],
      pulseScale,
    );
    if (polyCoreRef.current) {
      polyCoreRef.current.rotation.y =
        frame.idleAngle * 0.6 + frame.polyhedronAngle;
      polyCoreRef.current.rotation.x =
        0.35 + frame.polyhedronAngle * 0.65;
    }
    if (polyCageRef.current) {
      polyCageRef.current.rotation.y =
        -frame.idleAngle * 0.45 - frame.polyhedronAngle * 0.75;
      polyCageRef.current.rotation.z = frame.polyhedronAngle * 0.4;
    }

    applyStageGroup(
      starOfFaithGroupRef.current,
      frame.weights['star-of-faith'],
      pulseScale,
    );
    if (starOfFaithGroupRef.current && starOfFaithGroupRef.current.visible) {
      starOfFaithGroupRef.current.rotation.z = Math.sin(frame.idleAngle * 0.8) * 0.06;
    }

    // Shared transient shockwave / completion pulse ring.
    const ringEnergy = Math.max(frame.shockwave, frame.completionWave);
    if (impulseRingRef.current && impulseRingMatRef.current) {
      if (ringEnergy > 0.015 && !reducedMotion) {
        impulseRingRef.current.visible = true;
        const expansion = 1 + (1.4 - Math.min(ringEnergy, 1.4)) * 0.55;
        impulseRingRef.current.scale.setScalar(expansion);
        impulseRingMatRef.current.opacity = Math.min(0.72, ringEnergy * 0.52);
        impulseRingMatRef.current.color.copy(
          frame.completionWave >= frame.shockwave
            ? targetSecondaryColorRef.current
            : targetPrimaryColorRef.current,
        );
      } else {
        impulseRingRef.current.visible = false;
      }
    }

    // Dynamic liturgical key & rim lights.
    if (keyLightRef.current) {
      if (reducedMotion) {
        keyLightRef.current.color.copy(targetPrimaryColorRef.current);
      } else {
        keyLightRef.current.color.lerp(targetPrimaryColorRef.current, 0.14);
      }
      keyLightRef.current.intensity =
        3.2 + frame.emissiveBoost * 1.4 + frame.goldFlare * 2.2;
    }

    if (rimLightRef.current) {
      if (reducedMotion) {
        rimLightRef.current.color.copy(targetSecondaryColorRef.current);
      } else {
        rimLightRef.current.color.lerp(targetSecondaryColorRef.current, 0.14);
      }
      rimLightRef.current.intensity = 2.1 + frame.goldFlare * 1.8;
    }

    // Low-frequency diagnostic attributes on <canvas> (written ONLY on discrete state transitions).
    const canvasEl = gl.domElement;
    if (canvasEl.dataset.renderedStage !== frame.activeStage) {
      canvasEl.dataset.renderedStage = frame.activeStage;
    }
    const seqStr = String(frame.lastImpulseSequence);
    if (canvasEl.dataset.lastImpulseSeq !== seqStr) {
      canvasEl.dataset.lastImpulseSeq = seqStr;
    }
    const tiltedStr =
      Math.hypot(frame.tiltX, frame.tiltY) > 0.025 ? 'true' : 'false';
    if (canvasEl.dataset.tilted !== tiltedStr) {
      canvasEl.dataset.tilted = tiltedStr;
    }
  });

  return (
    <>
      <ambientLight intensity={0.55} color="#C7D2FE" />
      <directionalLight position={[2.8, 3.8, 4.2]} intensity={1.65} color="#FFFBEB" />
      <pointLight
        ref={keyLightRef}
        position={[0, 1.3, 2.8]}
        intensity={3.2}
        distance={9}
        color={SACRED_STAGE_METADATA[stage].primaryColor}
      />
      <pointLight
        ref={rimLightRef}
        position={[-2.4, -1.5, 2.0]}
        intensity={2.1}
        distance={8}
        color={SACRED_STAGE_METADATA[stage].secondaryColor}
      />

      <group ref={rigRootRef}>
        {/* 1. Sanctuary Emblem (Welcome, Lobby, Discussion + Section 2 Hospitality Rings) */}
        <group
          ref={sanctuaryGroupRef}
          visible={stage === 'sanctuary-emblem'}
        >
          <mesh geometry={geometries.fourPointStar}>
            <meshPhysicalMaterial
              color="#E2A83E"
              emissive="#784B08"
              emissiveIntensity={0.38}
              metalness={0.85}
              roughness={0.18}
              clearcoat={0.65}
              clearcoatRoughness={0.14}
            />
          </mesh>
          <mesh scale={0.34}>
            <octahedronGeometry args={[1, 0]} />
            <meshPhysicalMaterial
              color="#171B2E"
              emissive="#262D52"
              emissiveIntensity={0.45}
              metalness={0.5}
              roughness={0.15}
              clearcoat={1}
            />
          </mesh>
          <mesh rotation={[Math.PI * 0.36, Math.PI * 0.16, 0]}>
            <torusGeometry args={[1.12, 0.032, 16, 64]} />
            <meshStandardMaterial
              color="#F4C96B"
              emissive="#9A6B16"
              emissiveIntensity={0.35}
              metalness={0.88}
              roughness={0.22}
            />
          </mesh>
          <group
            ref={hospitalityRingsRef}
            visible={accentMode === 'hospitality'}
          >
            <mesh rotation={[-Math.PI * 0.3, Math.PI * 0.22, 0]}>
              <torusGeometry args={[1.28, 0.028, 16, 64]} />
              <meshStandardMaterial
                color="#E89B3C"
                emissive="#A15C14"
                emissiveIntensity={0.5}
                metalness={0.78}
                roughness={0.25}
              />
            </mesh>
            <mesh rotation={[Math.PI * 0.14, -Math.PI * 0.32, 0]}>
              <torusGeometry args={[1.4, 0.022, 16, 64]} />
              <meshStandardMaterial
                color="#FDE68A"
                emissive="#B4781E"
                emissiveIntensity={0.42}
                metalness={0.82}
                roughness={0.24}
              />
            </mesh>
          </group>
        </group>

        {/* 2. Liturgical Violet Prayer Orb (Section 1 Opening Prayer) */}
        <group ref={prayerOrbGroupRef} visible={stage === 'prayer-orb'}>
          <mesh>
            <sphereGeometry args={[0.74, 40, 40]} />
            <meshPhysicalMaterial
              ref={prayerOrbMaterialRef}
              color="#B855C8"
              emissive="#6B21A8"
              emissiveIntensity={0.55}
              metalness={0.16}
              roughness={0.12}
              clearcoat={1}
              clearcoatRoughness={0.08}
              transmission={0.22}
              thickness={0.9}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.32, 24, 24]} />
            <meshStandardMaterial
              color="#FAE8FF"
              emissive="#E879F9"
              emissiveIntensity={0.9}
              roughness={0.2}
            />
          </mesh>
          <mesh rotation={[Math.PI * 0.38, 0.35, 0]}>
            <torusGeometry args={[1.08, 0.028, 16, 64]} />
            <meshStandardMaterial
              color="#E2A83E"
              emissive="#926014"
              emissiveIntensity={0.4}
              metalness={0.85}
              roughness={0.22}
            />
          </mesh>
          <mesh rotation={[-Math.PI * 0.32, -0.42, 0]}>
            <torusGeometry args={[1.22, 0.022, 16, 64]} />
            <meshStandardMaterial
              color="#E879F9"
              emissive="#86198F"
              emissiveIntensity={0.55}
              metalness={0.55}
              roughness={0.28}
            />
          </mesh>
        </group>

        {/* 3. Radiant Golden Chosen Aura (Selected Volunteer Turn) */}
        <group ref={chosenAuraGroupRef} visible={stage === 'chosen-aura'}>
          <mesh geometry={geometries.chaliceBowl} position={[0, -0.04, 0]}>
            <meshPhysicalMaterial
              color="#E2A83E"
              emissive="#8C5A0E"
              emissiveIntensity={0.46}
              metalness={0.88}
              roughness={0.16}
              clearcoat={0.75}
            />
          </mesh>
          <mesh position={[0, -0.52, 0]}>
            <cylinderGeometry args={[0.08, 0.11, 0.38, 24]} />
            <meshStandardMaterial
              color="#E2A83E"
              metalness={0.88}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, -0.73, 0]}>
            <cylinderGeometry args={[0.34, 0.4, 0.08, 32]} />
            <meshStandardMaterial
              color="#F4C96B"
              metalness={0.88}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.24, 28, 28]} />
            <meshStandardMaterial
              color="#FFFBEB"
              emissive="#FBBF24"
              emissiveIntensity={1.05}
              roughness={0.12}
            />
          </mesh>
          <mesh position={[0, 0.42, 0]} rotation={[Math.PI * 0.44, 0, 0]}>
            <torusGeometry args={[0.66, 0.026, 16, 56]} />
            <meshStandardMaterial
              color="#FDE68A"
              emissive="#D97706"
              emissiveIntensity={0.65}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
          <mesh>
            <torusGeometry args={[1.16, 0.025, 16, 64]} />
            <meshStandardMaterial
              color="#E2A83E"
              emissive="#926014"
              emissiveIntensity={0.45}
              metalness={0.85}
              roughness={0.22}
            />
          </mesh>
        </group>

        {/* 4. Sanctuary Indigo Gospel Codex (Section 3 Gospel Reading) */}
        <group
          ref={gospelCodexGroupRef}
          visible={stage === 'gospel-codex'}
          rotation={[0.24, 0, 0]}
        >
          {/* Left Cover & Parchment Leaf */}
          <group position={[-0.44, 0, 0.06]} rotation={[0, 0.34, 0]}>
            <mesh>
              <boxGeometry args={[0.84, 1.14, 0.08]} />
              <meshPhysicalMaterial
                color="#6E75F5"
                emissive="#312E81"
                emissiveIntensity={0.48}
                metalness={0.42}
                roughness={0.26}
                clearcoat={0.65}
              />
            </mesh>
            <mesh position={[0.02, 0, 0.055]}>
              <boxGeometry args={[0.74, 1.02, 0.04]} />
              <meshStandardMaterial
                color="#F8FAFC"
                emissive="#CBD5E1"
                emissiveIntensity={0.18}
                roughness={0.42}
              />
            </mesh>
          </group>

          {/* Right Cover & Parchment Leaf */}
          <group position={[0.44, 0, 0.06]} rotation={[0, -0.34, 0]}>
            <mesh>
              <boxGeometry args={[0.84, 1.14, 0.08]} />
              <meshPhysicalMaterial
                color="#6E75F5"
                emissive="#312E81"
                emissiveIntensity={0.48}
                metalness={0.42}
                roughness={0.26}
                clearcoat={0.65}
              />
            </mesh>
            <mesh position={[-0.02, 0, 0.055]}>
              <boxGeometry args={[0.74, 1.02, 0.04]} />
              <meshStandardMaterial
                color="#F8FAFC"
                emissive="#CBD5E1"
                emissiveIntensity={0.18}
                roughness={0.42}
              />
            </mesh>
          </group>

          {/* Gilded Spine */}
          <mesh position={[0, 0, -0.06]}>
            <cylinderGeometry args={[0.085, 0.085, 1.2, 24]} />
            <meshStandardMaterial
              color="#E2A83E"
              emissive="#926014"
              emissiveIntensity={0.45}
              metalness={0.9}
              roughness={0.18}
            />
          </mesh>

          {/* Sanctuary Halo */}
          <mesh position={[0, 0, -0.18]}>
            <torusGeometry args={[1.18, 0.024, 16, 64]} />
            <meshStandardMaterial
              color="#818CF8"
              emissive="#4338CA"
              emissiveIntensity={0.5}
              metalness={0.65}
              roughness={0.25}
            />
          </mesh>
        </group>

        {/* 5. Faceted Randomizing Polyhedron (Random Selection) */}
        <group
          ref={randomPolyGroupRef}
          visible={stage === 'random-polyhedron'}
        >
          <mesh ref={polyCoreRef} geometry={geometries.polyCore}>
            <meshPhysicalMaterial
              color="#B855C8"
              emissive="#6B21A8"
              emissiveIntensity={0.52}
              metalness={0.35}
              roughness={0.18}
              clearcoat={0.92}
              flatShading
            />
          </mesh>
          <lineSegments ref={polyCageRef} geometry={geometries.polyCageEdges}>
            <lineBasicMaterial color="#E2A83E" transparent opacity={0.92} />
          </lineSegments>
          <mesh rotation={[Math.PI * 0.28, -Math.PI * 0.2, 0]}>
            <torusGeometry args={[1.24, 0.024, 16, 64]} />
            <meshStandardMaterial
              color="#E2A83E"
              emissive="#926014"
              emissiveIntensity={0.42}
              metalness={0.86}
              roughness={0.2}
            />
          </mesh>
        </group>

        {/* 6. Golden 5-Point Star of Faith (Section 5 Closing Prayer) */}
        <group ref={starOfFaithGroupRef} visible={stage === 'star-of-faith'}>
          <mesh geometry={geometries.fivePointStar}>
            <meshPhysicalMaterial
              color="#E2A83E"
              emissive="#926014"
              emissiveIntensity={0.5}
              metalness={0.88}
              roughness={0.16}
              clearcoat={0.78}
              clearcoatRoughness={0.12}
            />
          </mesh>
          <mesh>
            <torusGeometry args={[1.16, 0.036, 18, 64]} />
            <meshStandardMaterial
              color="#F4C96B"
              emissive="#9A6B16"
              emissiveIntensity={0.45}
              metalness={0.88}
              roughness={0.2}
            />
          </mesh>
          <mesh>
            <torusGeometry args={[0.98, 0.016, 12, 56]} />
            <meshStandardMaterial
              color="#FEF3C7"
              emissive="#D97706"
              emissiveIntensity={0.5}
              metalness={0.8}
              roughness={0.24}
            />
          </mesh>
        </group>

        {/* Shared transient action-coupled shockwave / completion ring */}
        <mesh ref={impulseRingRef} visible={false}>
          <torusGeometry args={[1.05, 0.026, 14, 64]} />
          <meshBasicMaterial
            ref={impulseRingMatRef}
            color="#E2A83E"
            transparent
            opacity={0}
          />
        </mesh>
      </group>
    </>
  );
}
