'use client';

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatEther } from 'viem';
import {
	CommandStatus,
	buildTimeline,
	getSchemasForRobotType,
	samplePose,
	type RecordingFile,
	type Timeline
} from '@0g-foundation/zerobot-sdk';
import { BrandQr } from '@/components/brand-qr';
import { MoveIcon } from '@/components/move-icon';
import { RobotViewer, type RobotViewerHandle } from '@/components/robot-viewer';
import { METAMASK } from '@/components/wallet/wallets';
import { ZeroGMark } from '@/components/zero-g-mark';
import { defaultNetwork } from '@/lib/networks';
import { robotFamily } from '@/lib/robots';
import { recordingTime, schedule, type Hold, type Slot } from '@/lib/schedule';
import { useQueue } from '@/lib/use-queue';
import { useQueuePaused } from '@/lib/use-queue-paused';
import { useRobot } from '@/lib/use-robot';
import { useRobotStatus } from '@/lib/use-robot-status';

/** Joint smoothing for playback; "Light" on the recordings page */
const SMOOTHING_MS = 60;

/** Names for `?demo`, which fills an empty queue to preview the layout */
const DEMO_NAMES = ['Priya', 'Marcus', 'Aiko', 'Diego', 'Sam', 'Lena'];

/** What the screen shows about the robot, from its status or a `?demo=` preview */
interface StageState {
	robotOnline: boolean;
	queuePaused: boolean;
	operatorOnline: boolean;
	/** False hides the QR behind "Paused" */
	publicCommands?: boolean;
	battery?: number;
}

/**
 * Previews for each state the venue can see, e.g. `?demo=offline`. A bare
 * `?demo` is `playing`. Display only: the schedule still follows the chain.
 */
const DEMO_STATES = {
	playing: { robotOnline: true, queuePaused: false, operatorOnline: true, battery: 82 },
	waiting: { robotOnline: true, queuePaused: false, operatorOnline: true, battery: 82 },
	break: { robotOnline: true, queuePaused: true, operatorOnline: true, battery: 82 },
	paused: { robotOnline: true, queuePaused: false, operatorOnline: true, publicCommands: false, battery: 82 },
	'low-battery': { robotOnline: true, queuePaused: false, operatorOnline: true, battery: 14 },
	reconnecting: { robotOnline: false, queuePaused: false, operatorOnline: true },
	offline: { robotOnline: false, queuePaused: false, operatorOnline: false }
} satisfies Record<string, StageState>;
type DemoState = keyof typeof DEMO_STATES;
/** The pause between loops of the demo's move */
const DEMO_LOOP_GAP_MS = 1500;

/**
 * The venue screen: the robot model playing each move in step with the
 * real robot, the QR code to the robot's page, and the queue of names.
 */
export default function StagePage({ params }: { params: Promise<{ name: string }> }) {
	const { name } = use(params);
	const robot = useRobot(name, { live: true });
	const data = robot.data;
	// The operator checks for commands every 500ms; matching it means the model
	// starts each move when the robot does
	const { entries, error } = useQueue(data?.robotId, { history: 12, pollMs: 500 });
	const viewer = useRef<RobotViewerHandle>(null);
	const [viewerReady, setViewerReady] = useState(false);
	const [timelines, setTimelines] = useState<Map<number, Timeline>>(new Map());
	const [now, setNow] = useState(() => Date.now());
	const [demo, setDemo] = useState<DemoState | null>(null);
	useEffect(() => {
		const value = new URLSearchParams(window.location.search).get('demo');
		if (value !== null) setDemo(value in DEMO_STATES ? (value as DemoState) : 'playing');
	}, []);
	const demoRef = useRef(demo);
	demoRef.current = demo;
	const status = useRobotStatus(data?.robotId);
	const robotOnline = status.data?.robotOnline ?? false;
	const queuePaused = useQueuePaused(data?.robotId).data ?? false;
	// When the operator starts nothing new: while the robot is away or the
	// queue is paused. Kept as times so moves before a hold keep their slots,
	// and the ones after start from its end rather than catching up.
	const held = !robotOnline || queuePaused;
	const [holds, setHolds] = useState<Hold[]>([{ from: 0, to: Infinity }]);
	useEffect(() => {
		setHolds((prev) => {
			const last = prev[prev.length - 1];
			const open = last?.to === Infinity;
			if (held === open) return prev;
			return held ? [...prev, { from: Date.now(), to: Infinity }] : [...prev.slice(0, -1), { ...last, to: Date.now() }];
		});
	}, [held]);

	// A projector reads better dark
	useEffect(() => {
		const root = document.documentElement;
		const previous = root.dataset.theme;
		root.dataset.theme = 'dark';
		return () => {
			if (previous) root.dataset.theme = previous;
			else delete root.dataset.theme;
		};
	}, []);

	const schemas = useMemo(() => {
		if (!data) return new Map();
		return new Map(getSchemasForRobotType(data.robot.robotType).map((s) => [s.apiId, s]));
	}, [data]);
	// Only menu moves run, so only they get a slot
	const menu = useMemo(() => new Set<number>(data?.menu.map((m) => m.apiId)), [data]);

	// Recordings for each move on the menu
	useEffect(() => {
		if (!data) return;
		let cancelled = false;
		const family = robotFamily(data.robot.robotType);
		Promise.all(
			data.menu.map(async (item) => {
				const res = await fetch(`/recordings/${family}/${item.command.toLowerCase()}.json`);
				if (!res.ok) return null;
				return [item.apiId, buildTimeline((await res.json()) as RecordingFile)] as const;
			})
		).then((loaded) => {
			if (!cancelled) setTimelines(new Map(loaded.filter((l) => l !== null)));
		});
		return () => {
			cancelled = true;
		};
	}, [data]);

	const slots = useMemo(
		() => (robotOnline ? schedule(entries, schemas, menu, holds) : []),
		[entries, schemas, menu, robotOnline, holds]
	);
	const slotsRef = useRef<Slot[]>([]);
	slotsRef.current = slots;

	// Animate the model through whichever slot is running
	useEffect(() => {
		if (!viewerReady) return;
		let frame = 0;
		let idle = true;
		let lastTick = 0;
		const tick = () => {
			const t = Date.now();
			const slot = slotsRef.current.find((s) => s.start <= t && t < s.end);
			const timeline = slot && timelines.get(slot.schema.apiId);
			const demoTimeline = demoRef.current === 'playing' ? timelines.values().next().value : undefined;
			if (slot && timeline) {
				const pose = samplePose(timeline, recordingTime(slot, t - slot.start), SMOOTHING_MS);
				if (pose) viewer.current?.setPose(pose);
				idle = false;
			} else if (demoTimeline) {
				const pose = samplePose(demoTimeline, t % (demoTimeline.endMs + DEMO_LOOP_GAP_MS), SMOOTHING_MS);
				if (pose) viewer.current?.setPose(pose);
				idle = false;
			} else if (!idle) {
				viewer.current?.stand();
				idle = true;
			}
			// The queue list only needs a few updates a second
			if (t - lastTick > 250) {
				lastTick = t;
				setNow(t);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [viewerReady, timelines]);

	const pageUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/robots/${name}`;

	if (robot.isPending) return <Centered>Loading…</Centered>;
	if (!data) return <Centered>No robot called “{name}”.</Centered>;

	const current = slots.find((s) => s.start <= now && now < s.end);
	const upcoming = slots.filter((s) => s.start > now);
	// Pending commands the schedule hasn't placed, e.g. ones from before this page loaded
	const unplaced = entries.filter(
		(e) => e.command.status === CommandStatus.Pending && !slots.some((s) => s.entry === e)
	);
	const done = entries
		.filter((e) => e.command.status === CommandStatus.Executed || slots.some((s) => s.entry === e && s.end <= now))
		.slice(-5)
		.reverse();
	const labelFor = (apiId: number) => data.menu.find((m) => m.apiId === apiId);
	const queued = [...upcoming.map((s) => s.entry), ...unplaced].map((e) => ({
		key: String(e.command.nonce),
		name: e.command.note || 'Anonymous',
		apiId: e.command.apiId
	}));
	const queue =
		demo && demo !== 'offline' && demo !== 'reconnecting' && queued.length === 0
			? DEMO_NAMES.map((name, i) => ({ key: `demo-${i}`, name, apiId: data.menu[i % data.menu.length].apiId }))
			: queued;

	const shown: StageState = demo
		? DEMO_STATES[demo]
		: {
				robotOnline,
				queuePaused,
				operatorOnline: status.data?.operatorOnline ?? false,
				battery: status.data?.battery
			};
	const publicCommands = shown.publicCommands ?? data.robot.publicCommands;
	const idleMessage =
		shown.robotOnline && shown.queuePaused
			? `${data.displayName} is taking a short break`
			: (!demo && status.isPending) || shown.robotOnline
				? `${data.displayName} is waiting for a move`
				: shown.operatorOnline
					? `${data.displayName} is reconnecting…`
					: `${data.displayName} is offline`;
	// The demo plays the first menu move, as the model's loop does
	const nowPlaying = current
		? { name: current.entry.command.note || 'Anonymous', apiId: current.entry.command.apiId }
		: demo === 'playing'
			? { name: 'Will', apiId: data.menu[0].apiId }
			: undefined;
	const currentMove = nowPlaying && labelFor(nowPlaying.apiId);

	return (
		<div className="relative isolate grid h-dvh grid-cols-[minmax(0,1fr)_31rem] grid-rows-[auto_minmax(0,1fr)] gap-x-12 gap-y-4 overflow-hidden bg-bg px-12 py-6 text-ink">
			{/* A purple spotlight on the stage, a softer one behind the QR, and a faint dot field */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_60%_at_35%_68%,rgba(146,0,225,0.32),transparent_70%),radial-gradient(ellipse_40%_45%_at_88%_30%,rgba(183,95,255,0.14),transparent_70%)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] bg-size-[28px_28px] [mask-image:radial-gradient(ellipse_60%_55%_at_35%_60%,black,transparent_75%)]"
			/>

			<header className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<ZeroGMark className="h-[38px] w-[78px] text-ink" />
					<span aria-hidden className="h-9 w-px bg-lockup-rule" />
					<span className="text-2xl font-bold">
						<span className="text-brand-900">Zero</span>bot
					</span>
				</div>
				<div className="flex items-center gap-4 text-lg">
					{shown.battery !== undefined && shown.operatorOnline && (
						<span className={shown.battery < 20 ? 'font-semibold text-warning' : 'text-ink-muted'}>
							Battery {shown.battery}%
						</span>
					)}
				</div>
			</header>

			<section className="relative col-start-1 flex min-h-0 min-w-0 flex-col">
				<div className="relative flex min-h-0 flex-1 flex-col">
					<RobotViewer
						ref={viewer}
						robotType={data.robot.robotType}
						variant="stage"
						onLoad={() => setViewerReady(true)}
						className="min-h-0 flex-1"
					/>
					<div className="pointer-events-none absolute top-0 left-0 max-w-[44rem] rounded-3xl border border-white/10 bg-white/[0.05] px-8 py-6 backdrop-blur-md">
						{nowPlaying ? (
							<>
								<p className="flex items-center gap-3 text-base font-semibold tracking-[0.2em] text-brand-500 uppercase">
									<span className="relative flex size-2.5">
										<span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-75" />
										<span className="relative inline-flex size-2.5 rounded-full bg-brand-500" />
									</span>
									Now playing
								</p>
								<p className="mt-3 flex items-center gap-4 text-5xl leading-tight font-semibold">
									{currentMove?.label} <MoveIcon robotType={data.robot.robotType} move={currentMove} />
								</p>
								<p className="mt-2 truncate text-2xl text-ink-muted">
									for <span className="font-medium text-ink">{nowPlaying.name}</span>
								</p>
							</>
						) : (
							<>
								<p className="text-base font-semibold tracking-[0.2em] text-ink-muted uppercase">Stage</p>
								<p className="mt-3 text-4xl leading-tight font-semibold">{idleMessage}</p>
							</>
						)}
					</div>
				</div>

				<div className="mt-6 flex h-12 items-center gap-3 overflow-hidden [mask-image:linear-gradient(to_right,black_85%,transparent)]">
					<span className="shrink-0 text-sm font-semibold tracking-[0.2em] text-ink-muted uppercase">Just done</span>
					{done.length > 0 ? (
						done.map((e, i) => {
							const move = labelFor(e.command.apiId);
							return (
								<span
									key={String(e.command.nonce)}
									style={{ opacity: 1 - i * 0.15 }}
									className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-2 pr-5 pl-2 text-lg"
								>
									<span className="flex size-7 items-center justify-center rounded-full bg-success/20 text-sm text-success">
										✓
									</span>
									<span className="max-w-[12rem] truncate font-medium">{e.command.note || 'Anonymous'}</span>
									<span className="flex items-center gap-2 text-ink-muted">
										{move?.label} <MoveIcon robotType={data.robot.robotType} move={move} />
									</span>
								</span>
							);
						})
					) : (
						<span className="text-lg text-ink-muted">Nothing yet. The first move is yours.</span>
					)}
				</div>
				{error && <p className="absolute right-0 bottom-0 text-sm text-danger">Chain: {error}</p>}
			</section>

			{/* Spans both rows, so the QR starts level with the header */}
			<aside className="col-start-2 row-span-2 row-start-1 flex min-h-0 flex-col">
				{publicCommands ? (
					<>
						<figure className="rounded-[2rem] bg-white p-4 shadow-[0_0_90px_-20px_rgba(146,0,225,0.7)]">
							{/* Capped by the screen's height so five names in Up next always fit below */}
							{pageUrl && <BrandQr value={pageUrl} className="mx-auto block w-full max-w-[calc(100dvh-36rem)]" />}
							<figcaption className="mt-2 text-center">
								<span className="block text-4xl leading-tight font-bold tracking-tight text-black">Scan to make {data.displayName} move</span>
								<span className="block truncate font-mono text-sm text-[#7c7e89]">
									{pageUrl.replace(/^https?:\/\//, '')}
								</span>
							</figcaption>
						</figure>
						<p className="mt-4 flex items-center gap-3 rounded-2xl bg-linear-to-br from-[#9200e1] to-[#b75fff] px-6 py-3 whitespace-nowrap text-white">
							<span className="text-4xl font-bold tabular-nums">{formatEther(data.price)} 0G</span>
							<span className="rounded-full bg-white/20 px-3 py-1 text-base font-semibold">Testnet</span>
							<span className="text-2xl font-medium text-white/85">/ per move</span>
						</p>
						{defaultNetwork.metaMaskOnly && (
							<p className="mt-2 flex items-center justify-end gap-2.5 text-lg font-medium text-ink/90">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={METAMASK.icon} alt="" className="size-6" />
								Pay with MetaMask
							</p>
						)}
					</>
				) : (
					// Paused payments hide the QR, so nobody scans into a page that can't take them
					<div className="flex aspect-square flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
						<p className="text-5xl font-semibold">Paused</p>
						<p className="mt-4 text-2xl text-ink-muted">{data.displayName} isn&apos;t taking new moves right now. Back soon!</p>
					</div>
				)}

				<h2 className="mt-5 flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-ink-muted uppercase">
					Up next
					{queue.length > 0 && (
						<span className="rounded-full bg-white/10 px-2.5 py-0.5 text-ink tracking-normal">{queue.length}</span>
					)}
					{shown.queuePaused && shown.robotOnline && (
						<span className="rounded-full bg-warning/15 px-2.5 py-0.5 tracking-normal text-warning normal-case">
							Queue paused
						</span>
					)}
				</h2>
				<ol className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-hidden">
					{queue.slice(0, 5).map((e, i) => {
						const move = labelFor(e.apiId);
						return (
							<li
								key={e.key}
								className={`flex items-center gap-4 rounded-2xl border px-4 py-2 text-xl ${
									i === 0 ? 'border-brand-500/50 bg-brand-500/15' : 'border-white/5 bg-white/[0.04]'
								}`}
							>
								<span
									className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold ${
										i === 0 ? 'bg-brand-500 text-white' : 'bg-white/10 text-ink-muted'
									}`}
								>
									{i + 1}
								</span>
								<span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
								<span className="flex shrink-0 items-center gap-2 text-ink-muted">
									{move?.label} <MoveIcon robotType={data.robot.robotType} move={move} />
								</span>
							</li>
						);
					})}
					{queue.length === 0 && (
						<li className="rounded-2xl border border-dashed border-white/15 px-5 py-4 text-xl text-ink-muted">
							Nobody in line. Scan and be first!
						</li>
					)}
				</ol>
			</aside>
		</div>
	);
}

function Centered({ children }: { children: ReactNode }) {
	return <div className="flex h-dvh items-center justify-center bg-bg text-2xl text-ink">{children}</div>;
}
