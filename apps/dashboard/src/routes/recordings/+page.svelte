<script lang="ts">
	import { onMount } from 'svelte';
	import RobotViewer from '$lib/components/RobotViewer.svelte';
	import { buildTimeline, samplePose, type RecordingFile, type Timeline } from '$lib/playback';
	import type { RecordingListing } from '../api/recordings/+server';

	const POLL_MS = 1500;
	const SPEEDS = [0.25, 0.5, 1];
	/** Kernel widths for joint smoothing. Measured on a 10-run Hello: light costs ~12% of the wave, medium ~22%. */
	const SMOOTHING = [
		{ label: 'Off', ms: 0 },
		{ label: 'Light', ms: 60 },
		{ label: 'Medium', ms: 80 }
	];

	let recordings = $state<RecordingListing[]>([]);
	let dir = $state('');
	let follow = $state(true);
	let selected = $state<{ robot: string; name: string } | null>(null);
	let loadedMtime = 0;
	let timeline = $state<Timeline | null>(null);
	let loadError = $state<string | null>(null);
	let updatedAt = $state(0);
	let now = $state(Date.now());

	let playing = $state(true);
	let speed = $state(1);
	let smoothingMs = $state(0);
	let t = $state(0);

	let viewer = $state<ReturnType<typeof RobotViewer> | null>(null);
	let viewerReady = $state(false);

	const isSelected = (r: RecordingListing) => selected?.robot === r.robot && selected?.name === r.name;
	const selectedListing = $derived(recordings.find(isSelected));
	const span = $derived(timeline ? timeline.endMs - timeline.startMs : 1);
	const pct = (time: number) => (timeline ? ((time - timeline.startMs) / span) * 100 : 0);
	const sampledJoints = $derived(timeline ? timeline.joints.filter((s) => s.t >= 0).length : 0);
	const recentlyUpdated = $derived(now - updatedAt < 3000);

	function select(r: RecordingListing, byUser = false) {
		if (byUser) follow = false;
		if (isSelected(r)) return;
		selected = { robot: r.robot, name: r.name };
		loadedMtime = 0;
		timeline = null;
	}

	async function loadSelected(mtimeMs: number) {
		if (!selected) return;
		const { robot, name } = selected;
		try {
			const res = await fetch(`/api/recordings/${robot}/${name}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const file = (await res.json()) as RecordingFile;
			if (selected?.robot !== robot || selected?.name !== name) return;

			const isUpdate = loadedMtime !== 0;
			loadedMtime = mtimeMs;
			timeline = buildTimeline(file);
			loadError = null;
			if (isUpdate) updatedAt = Date.now();
			else t = timeline.startMs;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load recording';
		}
	}

	async function poll() {
		try {
			const res = await fetch('/api/recordings');
			const body = (await res.json()) as { dir: string; recordings: RecordingListing[] };
			recordings = body.recordings;
			dir = body.dir;
		} catch {
			return;
		}
		if (follow && recordings.length > 0) select(recordings[0]);
		const current = recordings.find(isSelected);
		if (current && current.mtimeMs !== loadedMtime) await loadSelected(current.mtimeMs);
	}

	onMount(() => {
		poll();
		const interval = setInterval(poll, POLL_MS);

		let frame = 0;
		let last = performance.now();
		const tick = (time: number) => {
			const dt = time - last;
			last = time;
			now = Date.now();
			if (timeline && playing) {
				t += dt * speed;
				if (t > timeline.endMs) t = timeline.startMs;
			}
			if (timeline && viewer && viewerReady) {
				const pose = samplePose(timeline, t, smoothingMs);
				if (pose) viewer.setPose(pose);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		return () => {
			clearInterval(interval);
			cancelAnimationFrame(frame);
		};
	});

	function seek(e: MouseEvent) {
		if (!timeline) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		t = timeline.startMs + ((e.clientX - rect.left) / rect.width) * span;
	}

	function ago(ms: number): string {
		const s = Math.max(0, Math.round((now - ms) / 1000));
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.round(s / 60)}m ago`;
		return new Date(ms).toLocaleString();
	}
</script>

<div class="mx-auto max-w-5xl px-4 py-6">
	<div class="mb-4 flex items-baseline justify-between gap-4">
		<h2 class="text-xl font-semibold">Recordings</h2>
		<label class="flex items-center gap-2 text-sm text-secondary">
			<input type="checkbox" bind:checked={follow} class="accent-accent" />
			Follow latest
		</label>
	</div>

	<div class="grid gap-4 md:grid-cols-[14rem_1fr]">
		<aside class="rounded-lg border border-line bg-surface-secondary p-2">
			{#if recordings.length === 0}
				<p class="p-2 text-sm text-muted">
					No recordings in <code class="break-all">{dir || 'examples/recordings'}</code> yet.
				</p>
			{:else}
				<ul class="flex flex-col gap-1">
					{#each recordings as r (r.robot + '/' + r.name)}
						<li>
							<button
								onclick={() => select(r, true)}
								class="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition hover:bg-surface-hover {isSelected(
									r
								)
									? 'bg-surface-tertiary text-accent'
									: 'text-default'}"
							>
								<span class="truncate">{r.name}</span>
								<span class="shrink-0 text-xs text-muted">{r.robot} · {ago(r.mtimeMs)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>

		<section class="min-w-0">
			{#if selected}
				<RobotViewer
					bind:this={viewer}
					robotType={selected.robot === 'g1' ? 'g1' : 'go2_pro'}
					onload={() => (viewerReady = true)}
					class="h-[26rem]"
				/>

				{#if selected.robot !== 'go2'}
					<p class="mt-3 text-sm text-warning">Playback only maps Go2 joints so far.</p>
				{/if}
				{#if loadError}
					<p class="mt-3 text-sm text-danger">{loadError}</p>
				{/if}

				{#if timeline}
					<div class="mt-3 flex flex-wrap items-center gap-3">
						<button
							onclick={() => (playing = !playing)}
							class="w-20 rounded bg-accent px-3 py-1.5 text-sm font-semibold text-black hover:bg-accent-hover"
						>
							{playing ? 'Pause' : 'Play'}
						</button>
						<div class="flex gap-1">
							{#each SPEEDS as s (s)}
								<button
									onclick={() => (speed = s)}
									class="rounded border px-2 py-1 text-xs {speed === s
										? 'border-accent text-accent'
										: 'border-line text-secondary hover:bg-surface-hover'}"
								>
									{s}×
								</button>
							{/each}
						</div>
						<div class="flex items-center gap-1" title="Averages disagreement between runs, at some cost to fast motion">
							<span class="mr-1 text-xs text-muted">Smoothing</span>
							{#each SMOOTHING as option (option.ms)}
								<button
									onclick={() => (smoothingMs = option.ms)}
									class="rounded border px-2 py-1 text-xs {smoothingMs === option.ms
										? 'border-accent text-accent'
										: 'border-line text-secondary hover:bg-surface-hover'}"
								>
									{option.label}
								</button>
							{/each}
						</div>
						<span class="ml-auto font-mono text-sm text-secondary">
							{(t / 1000).toFixed(2)}s / {(timeline.endMs / 1000).toFixed(2)}s
						</span>
					</div>

					<!-- Coverage strip: one dot per joint sample, coloured by run. Click to seek. -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						onclick={seek}
						class="relative mt-3 h-8 cursor-pointer rounded border border-line bg-surface-secondary"
						title="Joint samples, one colour per run"
					>
						{#each timeline.joints.filter((s) => s.t >= timeline!.startMs) as s, i (i)}
							<span
								class="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
								style="left: {pct(s.t)}%; background: hsl({(s.run * 360) /
									Math.max(timeline.runCount, 1)} 80% 60%)"
							></span>
						{/each}
						<div class="absolute inset-y-0 w-0.5 bg-accent" style="left: {pct(t)}%"></div>
					</div>

					<dl class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
						<div>
							<dt class="text-xs text-muted">Command</dt>
							<dd>{timeline.command}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted">Runs</dt>
							<dd class={recentlyUpdated ? 'text-accent' : ''}>
								{timeline.runCount}{recentlyUpdated ? ' · updated' : ''}
							</dd>
						</div>
						<div>
							<dt class="text-xs text-muted">Joint samples</dt>
							<dd>
								{sampledJoints}
								<span class="text-muted">
									(~{(sampledJoints / (timeline.endMs / 1000)).toFixed(1)} Hz)
								</span>
							</dd>
						</div>
						<div>
							<dt class="text-xs text-muted">Last saved</dt>
							<dd>{selectedListing ? ago(selectedListing.mtimeMs) : '–'}</dd>
						</div>
					</dl>
				{/if}
			{:else}
				<div
					class="flex h-[26rem] items-center justify-center rounded-lg border border-line text-sm text-muted"
				>
					Select a recording
				</div>
			{/if}
		</section>
	</div>
</div>
