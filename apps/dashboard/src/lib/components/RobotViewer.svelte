<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import URDFLoader from 'urdf-loader';

	let {
		robotType = 'go2_pro',
		class: className = ''
	}: {
		robotType?: string;
		class?: string;
	} = $props();

	let container: HTMLDivElement;
	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	let animationId: number;
	let robot: THREE.Object3D | null = null;
	let loadGeneration = 0;
	let loading = $state(true);
	let error = $state<string | null>(null);

	const ROBOT_CONFIGS: Record<
		string,
		{ urdf: string; meshPath: string; cameraPos: [number, number, number]; targetY: number }
	> = {
		go2: {
			urdf: '/models/go2/go2.urdf',
			meshPath: '/models/go2/',
			cameraPos: [0.6, 0.4, 0.6],
			targetY: 0.15
		},
		g1: {
			urdf: '/models/g1/g1.urdf',
			meshPath: '/models/g1/',
			cameraPos: [1.5, 1.0, 1.5],
			targetY: 0.5
		}
	};

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
			scene.remove(robot);
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

		loader.load(config.urdf, (result: any) => {
			if (generation !== loadGeneration) return;

			robot = result;
			scene.add(robot!);

			camera.position.set(...config.cameraPos);
			controls.target.set(0, config.targetY, 0);
			controls.update();

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
