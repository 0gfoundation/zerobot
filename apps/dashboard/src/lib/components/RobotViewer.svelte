<script module lang="ts">
	export interface RobotPose {
		/** Joint angles in radians, keyed by URDF joint name */
		joints?: Record<string, number>;
		/** Base position in metres, Z-up */
		position?: [number, number, number];
		/** Base orientation as [x, y, z, w], Z-up */
		quaternion?: [number, number, number, number];
	}
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import URDFLoader, { type URDFRobot } from 'urdf-loader';

	let {
		robotType = 'go2_pro',
		class: className = '',
		onload
	}: {
		robotType?: string;
		class?: string;
		/** Called once the model has loaded and `setPose` will take effect */
		onload?: () => void;
	} = $props();

	let container: HTMLDivElement;
	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	let animationId: number;
	/** URDFs are Z-up (ROS convention). This group turns them upright in three.js's Y-up scene. */
	let world: THREE.Group;
	let robot: URDFRobot | null = null;
	let loadGeneration = 0;
	let loading = $state(true);
	let error = $state<string | null>(null);

	const ROBOT_CONFIGS: Record<
		string,
		{
			urdf: string;
			meshPath: string;
			cameraPos: [number, number, number];
			targetY: number;
			standPose: RobotPose;
		}
	> = {
		go2: {
			urdf: '/models/go2/go2.urdf',
			meshPath: '/models/go2/',
			cameraPos: [0.85, 0.55, 0.85],
			targetY: 0.2,
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
	 * Move the robot. Unset fields keep their current value. The camera
	 * follows the base so walking recordings stay in view.
	 */
	export function setPose(pose: RobotPose) {
		if (!robot) return;
		for (const [name, value] of Object.entries(pose.joints ?? {})) {
			robot.setJointValue(name, value);
		}
		if (pose.position) robot.position.set(...pose.position);
		if (pose.quaternion) robot.quaternion.set(...pose.quaternion);

		// Keep the camera's offset from the robot as the base moves
		const base = robot.getWorldPosition(new THREE.Vector3());
		const delta = new THREE.Vector3(base.x - controls.target.x, 0, base.z - controls.target.z);
		controls.target.add(delta);
		camera.position.add(delta);
	}

	function getRobotKey(type: string): string {
		if (type.startsWith('g1')) return 'g1';
		return 'go2';
	}

	onMount(() => {
		initScene();
	});

	onDestroy(() => {
		if (animationId) cancelAnimationFrame(animationId);
		renderer?.dispose();
		controls?.dispose();
	});

	function initScene() {
		scene = new THREE.Scene();

		camera = new THREE.PerspectiveCamera(
			50,
			container.clientWidth / container.clientHeight,
			0.01,
			100
		);

		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.2;
		container.appendChild(renderer.domElement);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.enablePan = false;
		controls.minDistance = 0.3;
		controls.maxDistance = 5;

		const ambientLight = new THREE.AmbientLight(0x404050, 1.5);
		scene.add(ambientLight);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
		directionalLight.position.set(2, 3, 2);
		directionalLight.castShadow = true;
		scene.add(directionalLight);

		const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5);
		fillLight.position.set(-2, 1, -1);
		scene.add(fillLight);

		const gridHelper = new THREE.GridHelper(2, 20, 0x333355, 0x222240);
		scene.add(gridHelper);

		world = new THREE.Group();
		world.rotation.x = -Math.PI / 2;
		scene.add(world);

		const resizeObserver = new ResizeObserver(() => {
			if (!container) return;
			camera.aspect = container.clientWidth / container.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(container.clientWidth, container.clientHeight);
		});
		resizeObserver.observe(container);

		function animate() {
			animationId = requestAnimationFrame(animate);
			controls.update();
			renderer.render(scene, camera);
		}
		animate();
	}

	function loadRobot() {
		const key = getRobotKey(robotType);
		const config = ROBOT_CONFIGS[key];
		if (!config) {
			error = `No model available for ${robotType}`;
			loading = false;
			return;
		}

		if (robot) {
			world.remove(robot);
			robot = null;
		}

		const generation = ++loadGeneration;
		const gltfLoader = new GLTFLoader();

		const loader = new URDFLoader();
		loader.workingPath = config.meshPath;

		// Use GLTFLoader for .glb mesh files
		loader.loadMeshCb = (path: string, manager: THREE.LoadingManager, onComplete: (mesh: THREE.Object3D) => void) => {
			gltfLoader.load(path, (gltf) => {
				// Apply material to all meshes in the loaded scene
				gltf.scene.traverse((child: THREE.Object3D) => {
					if ((child as THREE.Mesh).isMesh) {
						const mesh = child as THREE.Mesh;
						mesh.material = new THREE.MeshStandardMaterial({
							color: 0x2a2a4a,
							metalness: 0.3,
							roughness: 0.6
						});
						mesh.castShadow = true;
						mesh.receiveShadow = true;
					}
				});
				onComplete(gltf.scene);
			}, undefined, (err: any) => {
				console.warn('Failed to load mesh:', path, err);
				onComplete(new THREE.Object3D());
			});
		};

		loader.load(config.urdf, (result: URDFRobot) => {
			if (generation !== loadGeneration) return;

			robot = result;
			world.add(robot);

			camera.position.set(...config.cameraPos);
			controls.target.set(0, config.targetY, 0);
			setPose(config.standPose);
			controls.update();
			onload?.();

			loading = false;
		}, undefined, (err: any) => {
			if (generation !== loadGeneration) return;
			console.error('Failed to load URDF:', err);
			error = 'Failed to load robot model';
			loading = false;
		});
	}

	$effect(() => {
		if (renderer && robotType) {
			loading = true;
			error = null;
			loadRobot();
		}
	});
</script>

<div
	class="relative overflow-hidden rounded-lg border border-line bg-surface {className}"
	bind:this={container}
>
	{#if loading}
		<div class="absolute inset-0 flex items-center justify-center bg-surface/80">
			<span class="text-sm text-muted">Loading model...</span>
		</div>
	{/if}
	{#if error}
		<div class="absolute inset-0 flex items-center justify-center bg-surface/80">
			<span class="text-sm text-danger">{error}</span>
		</div>
	{/if}
</div>
