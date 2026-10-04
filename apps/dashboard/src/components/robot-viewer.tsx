'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import URDFLoader, { type URDFRobot } from 'urdf-loader';

export interface RobotPose {
	/** Joint angles in radians, keyed by URDF joint name */
	joints?: Record<string, number>;
	/** Base position in metres, Z-up */
	position?: [number, number, number];
	/** Base orientation as [x, y, z, w], Z-up */
	quaternion?: [number, number, number, number];
}

export interface RobotViewerHandle {
	/**
	 * Move the robot. Unset fields keep their current value. The camera
	 * follows the base so walking recordings stay in view.
	 */
	setPose(pose: RobotPose): void;
	/** Back to the standing pose the model loads in */
	stand(): void;
}

interface RobotConfig {
	urdf: string;
	meshPath: string;
	cameraPos: [number, number, number];
	targetY: number;
	standPose: RobotPose;
	/** Foot links (at the centre of each foot sphere) and the sphere radius, for grounding */
	feet?: { links: string[]; radius: number };
}

const ROBOT_CONFIGS: Record<string, RobotConfig> = {
	go2: {
		urdf: '/models/go2/go2.urdf',
		meshPath: '/models/go2/',
		cameraPos: [0.85, 0.55, 0.85],
		targetY: 0.2,
		feet: { links: ['FR_foot', 'FL_foot', 'RR_foot', 'RL_foot'], radius: 0.022 },
		standPose: {
			position: [0, 0, 0.31],
			joints: Object.fromEntries(
				['FR', 'FL', 'RR', 'RL'].flatMap((leg) => [
					[`${leg}_hip_joint`, 0],
					[`${leg}_thigh_joint`, 0.67],
					[`${leg}_calf_joint`, -1.3]
				])
			)
		}
	},
	g1: {
		urdf: '/models/g1/g1.urdf',
		meshPath: '/models/g1/',
		cameraPos: [1.5, 1.0, 1.5],
		targetY: 0.5,
		standPose: { position: [0, 0, 0.79] }
	}
};

/**
 * A recorded base height more than this above the grounded height means
 * the robot is airborne (jumps, flips), so the recording wins.
 */
const AIRBORNE_M = 0.05;

/** Brand purples (0G Brand Guide 2025): Deep Purple and Hero Purple */
const DEEP_PURPLE = 0x9200e1;
const HERO_PURPLE = 0xb75fff;

/** A soft purple pool of light for the stage floor, fading to nothing at the rim */
function glowTexture(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 256;
	const ctx = canvas.getContext('2d')!;
	const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
	gradient.addColorStop(0, 'rgba(183, 95, 255, 0.55)');
	gradient.addColorStop(0.45, 'rgba(146, 0, 225, 0.22)');
	gradient.addColorStop(1, 'rgba(146, 0, 225, 0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 256, 256);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/**
 * The venue look in place of the grid: a floor that takes the robot's
 * shadow, a purple glow and two rings under it, and a purple rim light.
 */
function addStage(scene: THREE.Scene, key: THREE.DirectionalLight) {
	key.shadow.mapSize.set(2048, 2048);
	Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 8 });

	const flat = (mesh: THREE.Mesh, y: number) => {
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.y = y;
		scene.add(mesh);
	};
	flat(
		new THREE.Mesh(
			new THREE.CircleGeometry(1.1, 64),
			new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, toneMapped: false })
		),
		-0.002
	);
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.5 }));
	floor.receiveShadow = true;
	flat(floor, 0);
	for (const [radius, opacity] of [
		[0.5, 0.55],
		[0.78, 0.25]
	]) {
		flat(
			new THREE.Mesh(
				new THREE.RingGeometry(radius, radius + 0.005, 128),
				new THREE.MeshBasicMaterial({ color: HERO_PURPLE, transparent: true, opacity, depthWrite: false, toneMapped: false })
			),
			0.001
		);
	}

	const rim = new THREE.DirectionalLight(DEEP_PURPLE, 3);
	rim.position.set(-1.5, 1.2, -2);
	scene.add(rim);
}

function robotKey(type: string): string {
	return type.startsWith('g1') ? 'g1' : 'go2';
}

interface Scene {
	renderer: THREE.WebGLRenderer;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	/** URDFs are Z-up (ROS convention). This group turns them upright in three.js's Y-up scene. */
	world: THREE.Group;
	robot: URDFRobot | null;
}

export function RobotViewer({
	robotType = 'go2_pro',
	className = '',
	variant = 'grid',
	onLoad,
	ref
}: {
	robotType?: string;
	className?: string;
	/** `stage`: a lit floor with a purple glow for the venue screen, in place of the grid. Read once, on mount. */
	variant?: 'grid' | 'stage';
	/** Called once the model has loaded and `setPose` will take effect */
	onLoad?: () => void;
	ref?: Ref<RobotViewerHandle>;
}) {
	const container = useRef<HTMLDivElement>(null);
	const scene = useRef<Scene | null>(null);
	const onLoadRef = useRef(onLoad);
	onLoadRef.current = onLoad;
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	function setPose(pose: RobotPose) {
		const s = scene.current;
		const robot = s?.robot;
		if (!s || !robot) return;
		for (const [name, value] of Object.entries(pose.joints ?? {})) {
			robot.setJointValue(name, value);
		}
		if (pose.position) robot.position.set(...pose.position);
		if (pose.quaternion) robot.quaternion.set(...pose.quaternion);

		// Recorded body height and merged joint angles come from different
		// runs, so taken as-is the feet can sink below the ground or float
		// above it. Rest the lowest foot on the grid unless clearly airborne.
		const feet = ROBOT_CONFIGS[robotKey(robotType)]?.feet;
		if (pose.position && feet) {
			robot.updateMatrixWorld(true);
			const point = new THREE.Vector3();
			const lowestFoot = Math.min(
				...feet.links
					.map((name) => robot.links[name])
					.filter(Boolean)
					.map((link) => s.world.worldToLocal(link.getWorldPosition(point)).z)
			);
			if (Number.isFinite(lowestFoot)) {
				const groundedZ = robot.position.z - (lowestFoot - feet.radius);
				if (robot.position.z - groundedZ < AIRBORNE_M) robot.position.z = groundedZ;
			}
		}

		// Keep the camera's offset from the robot as the base moves
		const base = robot.getWorldPosition(new THREE.Vector3());
		const delta = new THREE.Vector3(base.x - s.controls.target.x, 0, base.z - s.controls.target.z);
		s.controls.target.add(delta);
		s.camera.position.add(delta);
	}

	useImperativeHandle(ref, () => ({
		setPose,
		stand() {
			const config = ROBOT_CONFIGS[robotKey(robotType)];
			if (config) setPose(config.standPose);
		}
	}));

	// Scene, once
	useEffect(() => {
		const el = container.current!;
		const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.01, 100);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		// The canvas fills its container through CSS. A size set in pixels on
		// the element would stop the container shrinking below it.
		renderer.setSize(el.clientWidth, el.clientHeight, false);
		renderer.domElement.style.display = 'block';
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.2;
		el.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.enablePan = false;
		controls.minDistance = 0.3;
		controls.maxDistance = 5;

		const threeScene = new THREE.Scene();
		threeScene.add(new THREE.AmbientLight(0x404050, 1.5));
		const key = new THREE.DirectionalLight(0xffffff, 2);
		key.position.set(2, 3, 2);
		key.castShadow = true;
		threeScene.add(key);
		const fill = new THREE.DirectionalLight(0x8888ff, 0.5);
		fill.position.set(-2, 1, -1);
		threeScene.add(fill);
		// Sky/ground fill so surfaces facing away from the key light keep their shape
		threeScene.add(new THREE.HemisphereLight(0xffffff, 0x303048, 1.2));
		if (variant === 'stage') addStage(threeScene, key);
		else threeScene.add(new THREE.GridHelper(2, 20, 0x8a8aa8, 0x55557a));

		const world = new THREE.Group();
		world.rotation.x = -Math.PI / 2;
		threeScene.add(world);

		scene.current = { renderer, camera, controls, world, robot: null };

		const resize = new ResizeObserver(() => {
			camera.aspect = el.clientWidth / el.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(el.clientWidth, el.clientHeight, false);
		});
		resize.observe(el);

		let frame = 0;
		const animate = () => {
			frame = requestAnimationFrame(animate);
			controls.update();
			renderer.render(threeScene, camera);
		};
		animate();

		return () => {
			cancelAnimationFrame(frame);
			resize.disconnect();
			controls.dispose();
			renderer.dispose();
			renderer.domElement.remove();
			scene.current = null;
		};
		// The scene is built once; a variant change would need a new viewer
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Model, per robot type
	useEffect(() => {
		const s = scene.current;
		if (!s) return;
		const config = ROBOT_CONFIGS[robotKey(robotType)];
		if (!config) {
			setError(`No model available for ${robotType}`);
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		let cancelled = false;

		const gltfLoader = new GLTFLoader();
		const loader = new URDFLoader();
		loader.workingPath = config.meshPath;
		loader.loadMeshCb = (path, _manager, onComplete) => {
			gltfLoader.load(
				path,
				(gltf) => {
					gltf.scene.traverse((child) => {
						const mesh = child as THREE.Mesh;
						if (!mesh.isMesh) return;
						mesh.material = new THREE.MeshStandardMaterial({
							// Light grey, close to the real robots
							color: 0xb4b8c4,
							metalness: 0.2,
							roughness: 0.55
						});
						mesh.castShadow = true;
						mesh.receiveShadow = true;
					});
					onComplete(gltf.scene);
				},
				undefined,
				(err) => {
					console.warn('Failed to load mesh:', path, err);
					onComplete(new THREE.Object3D());
				}
			);
		};

		loader.load(
			config.urdf,
			(robot) => {
				if (cancelled) return;
				s.robot = robot;
				s.world.add(robot);
				s.camera.position.set(...config.cameraPos);
				s.controls.target.set(0, config.targetY, 0);
				setPose(config.standPose);
				s.controls.update();
				setLoading(false);
				onLoadRef.current?.();
			},
			undefined,
			(err) => {
				if (cancelled) return;
				console.error('Failed to load URDF:', err);
				setError('Failed to load robot model');
				setLoading(false);
			}
		);

		return () => {
			cancelled = true;
			if (s.robot) {
				s.world.remove(s.robot);
				s.robot = null;
			}
		};
		// setPose reads robotType, which is this effect's dependency
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [robotType]);

	return (
		<div ref={container} className={`relative overflow-hidden rounded-2xl ${className}`}>
			{loading && (
				<div className="absolute inset-0 flex items-center justify-center">
					<span className="text-sm text-ink-muted">Loading model…</span>
				</div>
			)}
			{error && (
				<div className="absolute inset-0 flex items-center justify-center">
					<span className="text-sm text-danger">{error}</span>
				</div>
			)}
		</div>
	);
}
