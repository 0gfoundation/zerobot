<script lang="ts">
	import { wallet } from '$lib/stores/wallet.svelte';
	import { robot } from '$lib/stores/robot.svelte';
	import { network } from '$lib/stores/network.svelte';
	import { REGISTRY_ABI } from '$lib/contracts/abis';
	import { keccak256, toBytes } from 'viem';
	import { getPublicClient } from '@wagmi/core';
	import { getConfig } from '$lib/wagmi';

	// --- Robot management state ---
	let robots = $state<
		Array<{
			robotId: `0x${string}`;
			name: string;
			robotType: string;
			active: boolean;
			registeredAt: bigint;
		}>
	>([]);
	let loadingRobots = $state(false);
	let selectedRobotId = $state<`0x${string}` | null>(null);

	// --- Registration form ---
	let newRobotName = $state('');
	let newRobotType = $state('go2_pro');
	let registering = $state(false);

	// --- WebRTC ---
	let robotIp = $state('192.168.123.18');

	const ROBOT_TYPE_LABELS: Record<string, string> = {
		go2_pro: 'Go2 Pro',
		go2_air: 'Go2 Air',
		go2_edu: 'Go2 Edu',
		g1: 'G1'
	};

	// --- Log ---
	let logLines = $state<string[]>([]);

	function log(msg: string) {
		const time = new Date().toLocaleTimeString();
		logLines = [...logLines, `[${time}] ${msg}`];
	}

	// Load robots when wallet connects
	$effect(() => {
		if (wallet.connected && wallet.address) {
			loadRobots();
		}
	});

	// Subscribe to robot messages
	$effect(() => {
		if (robot.connected) {
			return robot.onMessage((msg) => {
				log(`← ${JSON.stringify(msg).slice(0, 120)}`);
			});
		}
	});

	async function loadRobots() {
		if (!wallet.address) return;
		loadingRobots = true;
		robots = [];

		try {
			const client = getPublicClient(getConfig(), { chainId: network.chainId });
			const logs = await client.getLogs({
				address: network.contracts.registry,
				event: {
					type: 'event',
					name: 'RobotRegistered',
					inputs: [
						{ name: 'robotId', type: 'bytes32', indexed: true },
						{ name: 'owner', type: 'address', indexed: true },
						{ name: 'name', type: 'string', indexed: false },
						{ name: 'robotType', type: 'string', indexed: false }
					]
				},
				args: { owner: wallet.address },
				fromBlock: 0n
			});

			const results = [];
			for (const entry of logs) {
				const robotId = entry.args.robotId!;
				const data = (await client.readContract({
					address: network.contracts.registry,
					abi: REGISTRY_ABI,
					functionName: 'getRobot',
					args: [robotId]
				})) as {
					owner: string;
					name: string;
					robotType: string;
					storageRoot: string;
					active: boolean;
					registeredAt: bigint;
				};

				results.push({
					robotId,
					name: data.name,
					robotType: data.robotType,
					active: data.active,
					registeredAt: data.registeredAt
				});
			}
			robots = results;
			log(`Found ${robots.length} robot(s)`);
		} catch (err: any) {
			log(`Failed to load robots: ${err.message}`);
		} finally {
			loadingRobots = false;
		}
	}

	async function registerRobot() {
		if (!newRobotName.trim()) return;
		registering = true;
		const robotId = keccak256(toBytes(newRobotName.trim()));

		try {
			// Check if robot ID already exists
			const publicClient = getPublicClient(getConfig(), { chainId: network.chainId });
			const existing = (await publicClient.readContract({
				address: network.contracts.registry,
				abi: REGISTRY_ABI,
				functionName: 'getRobot',
				args: [robotId]
			})) as { owner: string };

			if (existing.owner !== '0x0000000000000000000000000000000000000000') {
				log(`A robot with the name "${newRobotName}" is already registered. Choose a different name.`);
				registering = false;
				return;
			}
		} catch {
			// getRobot failed — likely doesn't exist, proceed
		}

		log(`Registering "${newRobotName}" (${robotId.slice(0, 18)}...)...`);

		try {
			const hash = await wallet.writeContract({
				address: network.contracts.registry,
				abi: REGISTRY_ABI,
				functionName: 'registerRobot',
				args: [robotId, newRobotName.trim(), newRobotType, '0x0000000000000000000000000000000000000000000000000000000000000000']
			});
			log(`Tx: ${hash}`);
			log('Waiting for confirmation...');
			try {
				await wallet.waitForReceipt(hash);
				log('Robot registered!');
			} catch {
				log('Confirmation timed out — the transaction may still be processing. Reloading...');
			}
			newRobotName = '';
			await loadRobots();
		} catch (err: any) {
			log(`Registration failed: ${err.shortMessage || err.message}`);
		} finally {
			registering = false;
		}
	}

	async function toggleActive(robotId: `0x${string}`, currentlyActive: boolean) {
		try {
			log(currentlyActive ? 'Deactivating...' : 'Activating...');
			const hash = await wallet.writeContract({
				address: network.contracts.registry,
				abi: REGISTRY_ABI,
				functionName: 'updateRobot',
				args: [robotId, '0x0000000000000000000000000000000000000000000000000000000000000000', !currentlyActive]
			});
			try {
				await wallet.waitForReceipt(hash);
				log(currentlyActive ? 'Deactivated' : 'Activated');
			} catch {
				log('Confirmation timed out — reloading...');
			}
			await loadRobots();
		} catch (err: any) {
			log(`Failed: ${err.shortMessage || err.message}`);
		}
	}

	function selectRobot(robotId: `0x${string}`) {
		selectedRobotId = robotId;
		log(`Selected robot ${robotId.slice(0, 18)}...`);
	}

	async function toggleRtc() {
		if (robot.connected) {
			robot.disconnect();
			log('Disconnected from robot');
		} else {
			log(`Connecting to ${robotIp}...`);
			await robot.connect(robotIp);
			if (robot.connected) log('Robot connected!');
			if (robot.error) log(`Error: ${robot.error}`);
		}
	}

	function sendCommand(apiId: number, params?: Record<string, unknown>) {
		robot.sendCommand(apiId, params);
		log(`→ Command ${apiId}${params ? ' ' + JSON.stringify(params) : ''}`);
	}

	let moveX = $state(0.3);
	let moveY = $state(0);
	let moveZ = $state(0);
</script>

<div class="mx-auto max-w-5xl px-4 py-6">
	{#if !wallet.connected}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="mb-2 text-xl font-semibold text-default">Connect your wallet</h2>
			<p class="text-sm text-muted">Connect a wallet to manage and control your robots.</p>
		</div>
	{:else}
		<!-- YOUR ROBOTS -->
		<section class="mb-4 rounded-lg border border-line bg-surface-tertiary p-4">
			<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">Your Robots</h2>

			{#if loadingRobots}
				<p class="text-sm text-muted">Loading...</p>
			{:else if robots.length === 0}
				<p class="text-sm text-muted">No robots registered yet.</p>
			{:else}
				<div class="space-y-2">
					{#each robots as r}
						<div
							class="flex items-center gap-3 rounded border border-line bg-surface-secondary p-3"
						>
							<div class="min-w-0 flex-1">
								<span class="font-semibold text-default">{r.name}</span>
								<span class="ml-2 text-sm text-muted">{ROBOT_TYPE_LABELS[r.robotType] ?? r.robotType}</span>
								<span
									class="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold {r.active
										? 'bg-success-muted text-success'
										: 'bg-danger-muted text-danger'}"
								>
									{r.active ? 'Active' : 'Inactive'}
								</span>
								<div class="mt-1 truncate font-mono text-xs text-muted">{r.robotId}</div>
							</div>
							<div class="flex gap-2">
								{#if r.active}
									<button
										onclick={() => selectRobot(r.robotId)}
										class="rounded bg-accent px-3 py-1 text-xs font-semibold text-black hover:bg-accent-hover"
									>
										Select
									</button>
								{/if}
								<button
									onclick={() => toggleActive(r.robotId, r.active)}
									class="rounded border border-line-strong bg-surface px-3 py-1 text-xs text-secondary hover:bg-surface-hover"
								>
									{r.active ? 'Deactivate' : 'Activate'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<hr class="my-4 border-line" />

			<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
				Register New Robot
			</h2>
			<div class="flex gap-3">
				<input
					bind:value={newRobotName}
					placeholder="e.g. my-go2-pro"
					class="flex-1 rounded border border-line bg-surface px-3 py-2 text-sm text-default placeholder:text-muted focus:border-accent focus:outline-none"
				/>
				<select
					bind:value={newRobotType}
					class="rounded border border-line bg-surface px-3 py-2 text-sm text-default focus:border-accent focus:outline-none"
				>
					<option value="go2_pro">Go2 Pro</option>
					<option value="go2_air">Go2 Air</option>
					<option value="go2_edu">Go2 Edu</option>
					<option value="g1">G1</option>
				</select>
				<button
					onclick={registerRobot}
					disabled={registering || !newRobotName.trim()}
					class="rounded bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-50"
				>
					{registering ? 'Registering...' : 'Register'}
				</button>
			</div>
		</section>

		<!-- ROBOT CONTROL (after selecting a robot) -->
		{#if selectedRobotId}
			<section class="mb-4 rounded-lg border border-line bg-surface-tertiary p-4">
				<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
					Robot Connection
				</h2>
				<div class="flex items-end gap-3">
					<div class="flex-1">
						<label for="robotIp" class="mb-1 block text-xs text-muted">Robot IP (local network)</label>
						<input
							id="robotIp"
							bind:value={robotIp}
							class="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-default focus:border-accent focus:outline-none"
						/>
					</div>
					<button
						onclick={toggleRtc}
						class="rounded px-4 py-2 text-sm font-semibold {robot.connected
							? 'bg-danger text-white hover:bg-red-600'
							: 'bg-accent text-black hover:bg-accent-hover'}"
					>
						{robot.status === 'connecting' || robot.status === 'validating'
							? 'Connecting...'
							: robot.connected
								? 'Disconnect'
								: 'Connect'}
					</button>
				</div>
				<div class="mt-2">
					<span
						class="rounded-full px-2 py-0.5 text-xs font-semibold {robot.connected
							? 'bg-success-muted text-success'
							: robot.status === 'connecting' || robot.status === 'validating'
								? 'bg-warning-muted text-warning'
								: 'bg-danger-muted text-danger'}"
					>
						WebRTC: {robot.status}
					</span>
				</div>
				{#if robot.error}
					<p class="mt-2 text-sm text-danger">{robot.error}</p>
				{/if}
			</section>

			{#if robot.connected}
				<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
					<section class="rounded-lg border border-line bg-surface-tertiary p-4">
						<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
							Movement
						</h2>
						<div class="flex flex-wrap gap-2">
							{#each [
								[1004, 'StandUp'],
								[1005, 'StandDown'],
								[1002, 'BalanceStand'],
								[1006, 'RecoveryStand'],
								[1003, 'StopMove'],
								[1009, 'Sit'],
								[1010, 'RiseSit']
							] as [id, label]}
								<button
									onclick={() => sendCommand(id)}
									class="rounded border border-line bg-surface-secondary px-3 py-1.5 text-sm text-default hover:bg-surface-hover"
								>
									{label}
								</button>
							{/each}
						</div>
						<div class="mt-3">
							<span class="mb-1 block text-xs text-muted"
								>Move (x=fwd, y=left, z=rotate)</span
							>
							<div class="flex gap-2">
								<input
									type="number"
									bind:value={moveX}
									step="0.1"
									class="w-20 rounded border border-line bg-surface px-2 py-1.5 text-sm text-default focus:border-accent focus:outline-none"
								/>
								<input
									type="number"
									bind:value={moveY}
									step="0.1"
									class="w-20 rounded border border-line bg-surface px-2 py-1.5 text-sm text-default focus:border-accent focus:outline-none"
								/>
								<input
									type="number"
									bind:value={moveZ}
									step="0.1"
									class="w-20 rounded border border-line bg-surface px-2 py-1.5 text-sm text-default focus:border-accent focus:outline-none"
								/>
								<button
									onclick={() => sendCommand(1008, { x: moveX, y: moveY, z: moveZ })}
									class="rounded border border-line bg-surface-secondary px-3 py-1.5 text-sm text-default hover:bg-surface-hover"
								>
									Move
								</button>
							</div>
						</div>
					</section>

					<section class="rounded-lg border border-line bg-surface-tertiary p-4">
						<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
							Actions
						</h2>
						<div class="flex flex-wrap gap-2">
							{#each [
								[1016, 'Hello'],
								[1017, 'Stretch'],
								[1022, 'Dance1'],
								[1023, 'Dance2'],
								[1033, 'WiggleHips'],
								[1036, 'FingerHeart'],
								[1020, 'Content'],
								[1021, 'Wallow'],
								[1305, 'MoonWalk'],
								[1030, 'FrontFlip'],
								[1301, 'Handstand']
							] as [id, label]}
								<button
									onclick={() => sendCommand(id)}
									class="rounded border border-line bg-surface-secondary px-3 py-1.5 text-sm text-default hover:bg-surface-hover"
								>
									{label}
								</button>
							{/each}
						</div>
					</section>
				</div>
			{/if}
		{/if}
	{/if}

	<!-- LOG -->
	<section class="rounded-lg border border-line bg-surface-tertiary p-4">
		<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">Log</h2>
		<div
			class="h-44 overflow-y-auto rounded border border-line bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-secondary"
		>
			{#each logLines as line}
				{line + '\n'}
			{/each}
		</div>
	</section>
</div>
