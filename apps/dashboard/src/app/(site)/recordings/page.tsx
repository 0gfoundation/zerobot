'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { buildTimeline, samplePose, type RecordingFile, type Timeline } from '@0g-foundation/zerobot-sdk';
import { Button } from '@0gfoundation/0g-ui/shell';
import { RobotViewer, type RobotViewerHandle } from '@/components/robot-viewer';
import { LOCAL_MODE } from '@/lib/mode';
import type { RecordingListing } from '@/lib/server/recordings';

const POLL_MS = 1500;
const SPEEDS = [0.25, 0.5, 1];
/** Kernel widths for joint smoothing. Measured on a 10-run Hello: light costs ~12% of the wave, medium ~22%. */
const SMOOTHING = [
	{ label: 'Off', ms: 0 },
	{ label: 'Light', ms: 60 },
	{ label: 'Medium', ms: 80 }
];

const toggle = (on: boolean) =>
	`rounded-full border px-2 py-1 text-xs ${on ? 'border-ink' : 'border-hairline text-ink-soft hover:border-hairline-strong'}`;

/** Plays back `examples/record-commands.ts` output and follows new runs live. Local mode only. */
export default function RecordingsPage() {
	const [recordings, setRecordings] = useState<RecordingListing[]>([]);
	const [dir, setDir] = useState('');
	const [follow, setFollow] = useState(true);
	const [selected, setSelected] = useState<{ robot: string; name: string } | null>(null);
	const [timeline, setTimeline] = useState<Timeline | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [updatedAt, setUpdatedAt] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const [playing, setPlaying] = useState(true);
	const [speed, setSpeed] = useState(1);
	// Light looked best by eye on the 10-run recordings
	const [smoothingMs, setSmoothingMs] = useState(60);
	const [t, setT] = useState(0);
	const [viewerReady, setViewerReady] = useState(false);
	const viewer = useRef<RobotViewerHandle>(null);

	// The animation loop and poller read these without re-subscribing
	const state = useRef({ follow, selected, loadedMtime: 0, timeline, playing, speed, smoothingMs, t: 0 });
	state.current = { ...state.current, follow, selected, timeline, playing, speed, smoothingMs };

	const isSelected = (r: RecordingListing) => selected?.robot === r.robot && selected?.name === r.name;
	const selectedListing = recordings.find(isSelected);

	function select(r: RecordingListing, byUser = false) {
		if (byUser) setFollow(false);
		const s = state.current.selected;
		if (s?.robot === r.robot && s?.name === r.name) return;
		state.current.selected = { robot: r.robot, name: r.name };
		state.current.loadedMtime = 0;
		setSelected({ robot: r.robot, name: r.name });
		setTimeline(null);
	}

	useEffect(() => {
		if (!LOCAL_MODE) return;

		async function loadSelected(mtimeMs: number) {
			const s = state.current.selected;
			if (!s) return;
			try {
				const res = await fetch(`/api/recordings/${s.robot}/${s.name}`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const file = (await res.json()) as RecordingFile;
				if (state.current.selected?.robot !== s.robot || state.current.selected?.name !== s.name) return;
				const isUpdate = state.current.loadedMtime !== 0;
				state.current.loadedMtime = mtimeMs;
				const built = buildTimeline(file);
				setTimeline(built);
				setLoadError(null);
				if (isUpdate) setUpdatedAt(Date.now());
				else state.current.t = built.startMs;
			} catch (err) {
				setLoadError(err instanceof Error ? err.message : 'Failed to load recording');
			}
		}

		async function poll() {
			let list: RecordingListing[];
			try {
				const body = (await (await fetch('/api/recordings')).json()) as { dir: string; recordings: RecordingListing[] };
				list = body.recordings;
				setRecordings(list);
				setDir(body.dir);
			} catch {
				return;
			}
			if (state.current.follow && list.length > 0) select(list[0]);
			const s = state.current.selected;
			const current = list.find((r) => r.robot === s?.robot && r.name === s?.name);
			if (current && current.mtimeMs !== state.current.loadedMtime) await loadSelected(current.mtimeMs);
		}

		poll();
		const interval = setInterval(poll, POLL_MS);

		let frame = 0;
		let last = performance.now();
		let lastRender = 0;
		const tick = (time: number) => {
			const dt = time - last;
			last = time;
			const { timeline: tl, playing: on, speed: rate, smoothingMs: smooth } = state.current;
			if (tl && on) {
				state.current.t += dt * rate;
				if (state.current.t > tl.endMs) state.current.t = tl.startMs;
			}
			if (tl) {
				const pose = samplePose(tl, state.current.t, smooth);
				if (pose) viewer.current?.setPose(pose);
			}
			// The readout and coverage strip only need a few updates a second
			if (time - lastRender > 100) {
				lastRender = time;
				setT(state.current.t);
				setNow(Date.now());
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		return () => {
			clearInterval(interval);
			cancelAnimationFrame(frame);
		};
		// select only touches refs and setters
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (!LOCAL_MODE) {
		return <p className="text-ink-soft">Recordings are only available when the dashboard runs locally.</p>;
	}

	const span = timeline ? timeline.endMs - timeline.startMs : 1;
	const pct = (time: number) => (timeline ? ((time - timeline.startMs) / span) * 100 : 0);
	const sampledJoints = timeline ? timeline.joints.filter((s) => s.t >= 0).length : 0;
	const recentlyUpdated = now - updatedAt < 3000;

	function seek(e: MouseEvent<HTMLDivElement>) {
		if (!timeline) return;
		const rect = e.currentTarget.getBoundingClientRect();
		state.current.t = timeline.startMs + ((e.clientX - rect.left) / rect.width) * span;
	}

	function ago(ms: number): string {
		const s = Math.max(0, Math.round((now - ms) / 1000));
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.round(s / 60)}m ago`;
		return new Date(ms).toLocaleString();
	}

	return (
		<>
			<div className="mb-4 flex items-baseline justify-between gap-4">
				<h1 className="text-2xl font-semibold">Recordings</h1>
				<label className="flex items-center gap-2 text-sm text-ink-soft">
					<input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
					Follow latest
				</label>
			</div>

			<div className="grid gap-4 md:grid-cols-[14rem_1fr]">
				<aside className="rounded-2xl border border-hairline p-2">
					{recordings.length === 0 ? (
						<p className="p-2 text-sm text-ink-muted">
							No recordings in <code className="break-all">{dir || 'examples/recordings'}</code> yet.
						</p>
					) : (
						<ul className="flex flex-col gap-1">
							{recordings.map((r) => (
								<li key={`${r.robot}/${r.name}`}>
									<button
										type="button"
										onClick={() => select(r, true)}
										className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/5 ${
											isSelected(r) ? 'bg-ink/5 font-medium' : ''
										}`}
									>
										<span className="truncate">{r.name}</span>
										<span className="shrink-0 text-xs text-ink-muted">
											{r.robot} · {ago(r.mtimeMs)}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</aside>

				<section className="min-w-0">
					{selected ? (
						<>
							<RobotViewer
								ref={viewer}
								robotType={selected.robot === 'g1' ? 'g1' : 'go2_pro'}
								onLoad={() => setViewerReady(true)}
								className="h-[26rem] border border-hairline"
							/>
							{selected.robot !== 'go2' && (
								<p className="mt-3 text-sm text-warning">Playback only maps Go2 joints so far.</p>
							)}
							{loadError && <p className="mt-3 text-sm text-danger">{loadError}</p>}

							{timeline && viewerReady && (
								<>
									<div className="mt-3 flex flex-wrap items-center gap-3">
										<Button size="small" onClick={() => setPlaying(!playing)}>
											{playing ? 'Pause' : 'Play'}
										</Button>
										<div className="flex gap-1">
											{SPEEDS.map((s) => (
												<button key={s} type="button" onClick={() => setSpeed(s)} className={toggle(speed === s)}>
													{s}×
												</button>
											))}
										</div>
										<div
											className="flex items-center gap-1"
											title="Averages disagreement between runs, at some cost to fast motion"
										>
											<span className="mr-1 text-xs text-ink-muted">Smoothing</span>
											{SMOOTHING.map((o) => (
												<button
													key={o.ms}
													type="button"
													onClick={() => setSmoothingMs(o.ms)}
													className={toggle(smoothingMs === o.ms)}
												>
													{o.label}
												</button>
											))}
										</div>
										<span className="ml-auto font-mono text-sm text-ink-soft">
											{(t / 1000).toFixed(2)}s / {(timeline.endMs / 1000).toFixed(2)}s
										</span>
									</div>

									{/* Coverage strip: one dot per joint sample, coloured by run. Click to seek. */}
									<div
										onClick={seek}
										className="relative mt-3 h-8 cursor-pointer rounded-lg border border-hairline"
										title="Joint samples, one colour per run"
									>
										{timeline.joints
											.filter((s) => s.t >= timeline.startMs)
											.map((s, i) => (
												<span
													key={i}
													className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
													style={{
														left: `${pct(s.t)}%`,
														background: `hsl(${(s.run * 360) / Math.max(timeline.runCount, 1)} 80% 50%)`
													}}
												/>
											))}
										<div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${pct(t)}%` }} />
									</div>

									<dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
										<div>
											<dt className="text-xs text-ink-muted">Command</dt>
											<dd>{timeline.command}</dd>
										</div>
										<div>
											<dt className="text-xs text-ink-muted">Runs</dt>
											<dd className={recentlyUpdated ? 'font-medium' : ''}>
												{timeline.runCount}
												{recentlyUpdated ? ' · updated' : ''}
											</dd>
										</div>
										<div>
											<dt className="text-xs text-ink-muted">Joint samples</dt>
											<dd>
												{sampledJoints}{' '}
												<span className="text-ink-muted">
													(~{(sampledJoints / (timeline.endMs / 1000)).toFixed(1)} Hz)
												</span>
											</dd>
										</div>
										<div>
											<dt className="text-xs text-ink-muted">Last saved</dt>
											<dd>{selectedListing ? ago(selectedListing.mtimeMs) : '–'}</dd>
										</div>
									</dl>
								</>
							)}
						</>
					) : (
						<div className="flex h-[26rem] items-center justify-center rounded-2xl border border-hairline text-sm text-ink-muted">
							Select a recording
						</div>
					)}
				</section>
			</div>
		</>
	);
}
