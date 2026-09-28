<script lang="ts">
	import { wallet } from '$lib/stores/wallet.svelte';
	import { robot } from '$lib/stores/robot.svelte';
	import { network } from '$lib/stores/network.svelte';
	import RobotViewer from '$lib/components/RobotViewer.svelte';
	import { getChainClient } from '$lib/chain';
	import { keccak256, toBytes } from 'viem';

	/** bytes32 placeholder for "no storage root yet". */
	const ZERO_STORAGE_ROOT =
		'0x0000000000000000000000000000000000000000000000000000000000000000' as const;

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
	let deviceKey = $state('');
	let connectionMode = $state<'robot' | 'dryrun'>('robot');

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
			const chain = await getChainClient();
			const records = await chain.listRobotsByOwner(wallet.address);
			robots = records.map((r) => ({
				robotId: r.robotId as `0x${string}`,
				name: r.name,
				robotType: r.robotType,
				active: r.active,
				registeredAt: r.registeredAt
			}));
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
		const name = newRobotName.trim();
		const robotId = keccak256(toBytes(name));

		try {
			const chain = await getChainClient();

			// Pre-flight: is this robotId already taken?
			try {
				const existing = await chain.getRobot(robotId);
				if (existing.owner !== '0x0000000000000000000000000000000000000000') {
					log(`A robot with the name "${name}" is already registered. Choose a different name.`);
					return;
				}
			} catch {
				// getRobot reverted — robot doesn't exist; proceed with registration
			}

			log(`Registering "${name}" (${robotId.slice(0, 18)}...)...`);
			const receipt = await chain.registerRobot(robotId, name, newRobotType, ZERO_STORAGE_ROOT);
			log(receipt?.hash ? `Tx: ${receipt.hash}` : 'Tx submitted');
			log('Robot registered!');
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
			const chain = await getChainClient();
			await chain.updateRobot(robotId, ZERO_STORAGE_ROOT, !currentlyActive);
			log(currentlyActive ? 'Deactivated' : 'Activated');
			await loadRobots();
		} catch (err: any) {
			log(`Failed: ${err.shortMessage || err.message}`);
		}
	}

	function selectRobot(robotId: `0x${string}`) {
		selectedRobotId = robotId;
		const r = robots.find((r) => r.robotId === robotId);
		log(`Selected robot ${r?.name ?? robotId.slice(0, 18)}...`);
	}

	const selectedRobot = $derived(robots.find((r) => r.robotId === selectedRobotId));
	const isG1 = $derived(selectedRobot?.robotType === 'g1');

	async function toggleRtc() {
		if (robot.connected) {
			robot.disconnect();
			log('Disconnected');
		} else {
			const ip = connectionMode === 'dryrun' ? '127.0.0.1' : robotIp;
			log(connectionMode === 'dryrun' ? 'Starting dry run...' : `Connecting to ${ip}...`);
			await robot.connect(ip, connectionMode === 'robot' ? deviceKey.trim() || undefined : undefined);
			if (robot.connected) log(connectionMode === 'dryrun' ? 'Dry run active!' : 'Robot connected!');
			if (robot.error) log(`Error: ${robot.error}`);
		}
	}

	function sendCommand(apiId: number, params?: Record<string, unknown>) {
		robot.sendCommand(apiId, params);
		log(`→ Command ${apiId}${params ? ' ' + JSON.stringify(params) : ''}`);
	}

	let moveSpeed = $state(0.3);
</script>

<div class="mx-auto max-w-5xl px-4 py-6">
	{#if !wallet.settled && wallet.hasCachedSession}
		<!-- Returning user: wagmi is still restoring the prior session. Render the
		     dashboard shell with a loading placeholder so we don't flash the CTA. -->
		<section class="mb-4 rounded-lg border border-line bg-surface-tertiary p-4">
			<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">Your Robots</h2>
			<p class="text-sm text-muted">Restoring session…</p>
		</section>
	{:else if !wallet.connected}
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
						{@const isSelected = r.robotId === selectedRobotId}
						<div
							class="flex items-center gap-3 rounded border p-3 transition
								{isSelected
									? 'border-accent bg-accent-muted'
									: 'border-line bg-surface-secondary'}"
						>
							<div class="min-w-0 flex-1">
								<span class="font-semibold {isSelected ? 'text-accent' : 'text-default'}">{r.name}</span>
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
									{#if isSelected}
										<span class="rounded bg-surface-hover px-3 py-1 text-xs text-muted">Selected</span>
									{:else}
										<button
											onclick={() => selectRobot(r.robotId)}
											class="rounded bg-accent px-3 py-1 text-xs font-semibold text-black hover:bg-accent-hover"
										>
											Select
										</button>
									{/if}
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
				<div class="mb-3 flex items-baseline justify-between">
					<h2 class="text-xs font-semibold tracking-wider uppercase text-muted">
						Robot Connection
					</h2>
					<span class="text-sm">
						<span class="font-semibold text-default">{selectedRobot?.name}</span>
						<span class="ml-1 text-muted">{ROBOT_TYPE_LABELS[selectedRobot?.robotType ?? ''] ?? selectedRobot?.robotType}</span>
					</span>
				</div>

				{#if !robot.connected && robot.status === 'disconnected'}
					<div class="mb-3 flex gap-2">
						<button
							onclick={() => (connectionMode = 'robot')}
							class="flex-1 rounded-lg border px-3 py-2 text-sm transition
								{connectionMode === 'robot'
									? 'border-accent bg-accent-muted text-accent'
									: 'border-line bg-surface text-secondary hover:bg-surface-hover'}"
						>
							Connect to Robot
						</button>
						<button
							onclick={() => (connectionMode = 'dryrun')}
							class="flex-1 rounded-lg border px-3 py-2 text-sm transition
								{connectionMode === 'dryrun'
									? 'border-accent bg-accent-muted text-accent'
									: 'border-line bg-surface text-secondary hover:bg-surface-hover'}"
						>
							Dry Run
						</button>
					</div>
				{/if}

				{#if connectionMode === 'robot' && !robot.connected && robot.status === 'disconnected'}
					<div class="flex items-end gap-3">
						<div class="flex-1">
							<label for="robotIp" class="mb-1 block text-xs text-muted">Robot IP (local network)</label>
							<input
								id="robotIp"
								bind:value={robotIp}
								class="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-default focus:border-accent focus:outline-none"
							/>
						</div>
						<div class="flex-1">
							<label for="deviceKey" class="mb-1 block text-xs text-muted">Device key (Go2 firmware 1.1.15+)</label>
							<input
								id="deviceKey"
								type="password"
								autocomplete="off"
								placeholder="32 hex characters"
								bind:value={deviceKey}
								class="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-default focus:border-accent focus:outline-none"
							/>
						</div>
						<button
							onclick={toggleRtc}
							class="rounded bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
						>
							Connect
						</button>
					</div>
				{:else if connectionMode === 'dryrun' && !robot.connected && robot.status === 'disconnected'}
					<div class="flex items-center justify-between">
						<p class="text-sm text-muted">
							Simulate robot commands without physical hardware. Commands are acknowledged but not executed.
						</p>
						<button
							onclick={toggleRtc}
							class="ml-4 shrink-0 rounded bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
						>
							Start Dry Run
						</button>
					</div>
				{:else}
					<div class="flex items-center justify-between">
						<div>
							<span
								class="rounded-full px-2 py-0.5 text-xs font-semibold {robot.connected
									? 'bg-success-muted text-success'
									: 'bg-warning-muted text-warning'}"
							>
								{robot.connected
									? connectionMode === 'dryrun' ? 'Dry Run Active' : 'Connected'
									: robot.status === 'connecting' ? 'Connecting...' : 'Validating...'}
							</span>
							{#if robot.connected && connectionMode === 'robot'}
								<span class="ml-2 text-sm text-muted">{robotIp}</span>
							{/if}
						</div>
						{#if robot.connected}
							<button
								onclick={toggleRtc}
								class="rounded bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
							>
								Disconnect
							</button>
						{/if}
					</div>
				{/if}

				{#if robot.error}
					<p class="mt-2 text-sm text-danger">{robot.error}</p>
				{/if}
			</section>

			<RobotViewer robotType={selectedRobot?.robotType ?? 'go2_pro'} class="mb-4 h-72" />

			{#if robot.connected}
				<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
					<section class="rounded-lg border border-line bg-surface-tertiary p-4">
						<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
							Posture
						</h2>
						<div class="flex flex-wrap gap-2">
							{#if isG1}
								{#each [
									[4, 'Stand'],
									[2, 'Squat'],
									[706, 'Balance Squat'],
									[702, 'Lie Down'],
									[1, 'Damping']
								] as [mode, label]}
									<button
										onclick={() => { robot.sendG1LocoCommand(mode); log(`→ G1 Mode: ${label}`); }}
										class="rounded border border-line bg-surface-secondary px-3 py-1.5 text-sm text-default hover:bg-surface-hover"
									>
										{label}
									</button>
								{/each}
							{:else}
								{#each [
									[1004, 'StandUp'],
									[1005, 'StandDown'],
									[1002, 'BalanceStand'],
									[1006, 'RecoveryStand'],
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
							{/if}
						</div>

						<h2 class="mt-4 mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
							Movement
						</h2>
						<div class="mb-3 flex items-center gap-3">
							<label for="moveSpeed" class="text-xs text-muted">Speed</label>
							<input
								id="moveSpeed"
								type="range"
								min="0.1"
								max="1.0"
								step="0.1"
								bind:value={moveSpeed}
								class="flex-1 accent-accent"
							/>
							<span class="w-10 text-right font-mono text-xs text-secondary">{moveSpeed.toFixed(1)}</span>
						</div>
						<div class="flex items-center justify-center gap-1">
							<div class="flex flex-col gap-1">
								<div class="flex justify-center gap-1">
									<button
										onpointerdown={() => robot.startMove(0, 0, moveSpeed * 3, selectedRobot?.robotType)}
										onpointerup={() => robot.stopMove(selectedRobot?.robotType)}
										onpointerleave={() => robot.stopMove(selectedRobot?.robotType)}
										class="flex h-10 w-10 items-center justify-center rounded border border-line bg-surface-secondary text-sm text-muted hover:bg-surface-hover select-none"
										title="Rotate left"
									>↺</button>
									<button
										onpointerdown={() => robot.startMove(moveSpeed, 0, 0, selectedRobot?.robotType)}
										onpointerup={() => robot.stopMove(selectedRobot?.robotType)}
										onpointerleave={() => robot.stopMove(selectedRobot?.robotType)}
										class="flex h-10 w-10 items-center justify-center rounded border border-line bg-surface-secondary text-default hover:bg-surface-hover select-none {robot.moving ? 'bg-accent-muted border-accent' : ''}"
										title="Forward"
									>↑</button>
									<button
										onpointerdown={() => robot.startMove(0, 0, -moveSpeed * 3, selectedRobot?.robotType)}
										onpointerup={() => robot.stopMove(selectedRobot?.robotType)}
										onpointerleave={() => robot.stopMove(selectedRobot?.robotType)}
										class="flex h-10 w-10 items-center justify-center rounded border border-line bg-surface-secondary text-sm text-muted hover:bg-surface-hover select-none"
										title="Rotate right"
									>↻</button>
								</div>
								<div class="flex justify-center gap-1">
									<button
										onpointerdown={() => robot.startMove(0, moveSpeed, 0, selectedRobot?.robotType)}
										onpointerup={() => robot.stopMove(selectedRobot?.robotType)}
										onpointerleave={() => robot.stopMove(selectedRobot?.robotType)}
										class="flex h-10 w-10 items-center justify-center rounded border border-line bg-surface-secondary text-default hover:bg-surface-hover select-none"
										title="Strafe left"
									>←</button>
									<button
										onclick={() => robot.stopMove(selectedRobot?.robotType)}
										class="flex h-10 w-10 items-center justify-center rounded border border-line-strong bg-danger-muted text-sm text-danger hover:bg-danger/20 select-none"
										title="Stop"
									>■</button>
									<button
										onpointerdown={() => robot.startMove(0, -moveSpeed, 0, selectedRobot?.robotType)}
										onpointerup={() => robot.stopMove(selectedRobot?.robotType)}
										onpointerleave={() => robot.stopMove(selectedRobot?.robotType)}
										class="flex h-10 w-10 items-center justify-center rounded border border-line bg-surface-secondary text-default hover:bg-surface-hover select-none"
										title="Strafe right"
									>→</button>
								</div>
								<div class="flex justify-center gap-1">
									<div class="h-10 w-10"></div>
									<button
										onpointerdown={() => robot.startMove(-moveSpeed, 0, 0, selectedRobot?.robotType)}
										onpointerup={() => robot.stopMove(selectedRobot?.robotType)}
										onpointerleave={() => robot.stopMove(selectedRobot?.robotType)}
										class="flex h-10 w-10 items-center justify-center rounded border border-line bg-surface-secondary text-default hover:bg-surface-hover select-none"
										title="Backward"
									>↓</button>
									<div class="h-10 w-10"></div>
								</div>
							</div>
						</div>
						{#if robot.moving}
							<p class="mt-2 text-center text-xs text-accent">Moving — release to stop</p>
						{/if}
					</section>

					<section class="rounded-lg border border-line bg-surface-tertiary p-4">
						<h2 class="mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
							Actions
						</h2>
						<div class="flex flex-wrap gap-2">
							{#if isG1}
								{#each [
									[27, 'Handshake'],
									[18, 'High Five'],
									[19, 'Hug'],
									[26, 'Wave High'],
									[17, 'Applause'],
									[25, 'Wave Chest'],
									[12, 'Flying Kiss'],
									[20, 'Double Heart'],
									[21, 'Single Heart'],
									[15, 'Arms Horizontal'],
									[22, 'Cross'],
									[23, 'Right Hand Up'],
									[24, 'Light Wave'],
									[99, 'Arms Recover']
								] as [actionId, label]}
									<button
										onclick={() => { robot.sendG1ArmAction(actionId); log(`→ G1 Arm: ${label}`); }}
										class="rounded border border-line bg-surface-secondary px-3 py-1.5 text-sm text-default hover:bg-surface-hover"
									>
										{label}
									</button>
								{/each}
							{:else}
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
							{/if}
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
