'use client';

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatEther } from 'viem';
import { renderSVG } from 'uqr';
import {
	CommandStatus,
	buildTimeline,
	getSchemasForRobotType,
	samplePose,
	type RecordingFile,
	type Timeline
} from '@0g-foundation/zerobot-sdk';
import { RobotViewer, type RobotViewerHandle } from '@/components/robot-viewer';
import { robotFamily } from '@/lib/robots';
import { recordingTime, schedule, type Slot } from '@/lib/schedule';
import { useQueue } from '@/lib/use-queue';
import { useRobot } from '@/lib/use-robot';

/** Joint smoothing for playback; "Light" on the recordings page */
const SMOOTHING_MS = 60;

/**
 * The venue screen: the robot model playing each move in step with the
 * real robot, the QR code to the robot's page, and the queue of names.
 */
export default function StagePage({ params }: { params: Promise<{ name: string }> }) {
	const { name } = use(params);
	const robot = useRobot(name);
	const data = robot.data;
	const { entries, error } = useQueue(data?.robotId, 12);
	const viewer = useRef<RobotViewerHandle>(null);
	const [viewerReady, setViewerReady] = useState(false);
	const [timelines, setTimelines] = useState<Map<number, Timeline>>(new Map());
	const [now, setNow] = useState(() => Date.now());

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

	const slots = useMemo(() => schedule(entries, schemas, menu), [entries, schemas, menu]);
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
			if (slot && timeline) {
				const pose = samplePose(timeline, recordingTime(slot, t - slot.start), SMOOTHING_MS);
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
	const qr = useMemo(
		() => (pageUrl ? renderSVG(pageUrl, { border: 2, whiteColor: '#ffffff', blackColor: '#000000' }) : ''),
		[pageUrl]
	);

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

	return (
		<div className="grid h-dvh grid-cols-[1fr_26rem] gap-8 bg-bg p-8 text-ink">
			<section className="relative flex min-h-0 flex-col">
				<div className="mb-4 h-20">
					{current ? (
						<>
							<p className="text-lg text-ink-muted">Now</p>
							<p className="text-4xl font-semibold">
								{labelFor(current.entry.command.apiId)?.emoji} {labelFor(current.entry.command.apiId)?.label}
								<span className="text-ink-muted"> for </span>
								{current.entry.command.note || 'Anonymous'}
							</p>
						</>
					) : (
						<p className="pt-6 text-4xl font-semibold text-ink-muted">{data.displayName} is waiting for a move</p>
					)}
				</div>
				<RobotViewer
					ref={viewer}
					robotType={data.robot.robotType}
					onLoad={() => setViewerReady(true)}
					className="min-h-0 flex-1"
				/>
				{error && <p className="absolute bottom-0 left-0 text-sm text-danger">Chain: {error}</p>}
			</section>

			<aside className="flex min-h-0 flex-col">
				<div className="rounded-3xl bg-white p-4" dangerouslySetInnerHTML={{ __html: qr }} />
				<p className="mt-4 text-2xl font-semibold">Scan to make {data.displayName} move</p>
				<p className="mt-1 text-ink-muted">
					{formatEther(data.price)} testnet 0G per move · {pageUrl.replace(/^https?:\/\//, '')}
				</p>

				<h2 className="mt-8 text-sm font-medium uppercase tracking-wider text-ink-muted">Up next</h2>
				<ol className="mt-2 space-y-2 text-xl">
					{[...upcoming.map((s) => s.entry), ...unplaced].slice(0, 6).map((e, i) => (
						<li key={String(e.command.nonce)} className="flex justify-between gap-4">
							<span className="truncate">
								<span className="text-ink-muted">#{i + 1}</span> {e.command.note || 'Anonymous'}
							</span>
							<span className="shrink-0 text-ink-muted">
								{labelFor(e.command.apiId)?.emoji} {labelFor(e.command.apiId)?.label}
							</span>
						</li>
					))}
					{upcoming.length + unplaced.length === 0 && <li className="text-ink-muted">Nobody yet. Be first!</li>}
				</ol>

				{done.length > 0 && (
					<>
						<h2 className="mt-8 text-sm font-medium uppercase tracking-wider text-ink-muted">Done</h2>
						<ol className="mt-2 space-y-1 text-lg text-ink-muted">
							{done.map((e) => (
								<li key={String(e.command.nonce)} className="flex justify-between gap-4">
									<span className="truncate">{e.command.note || 'Anonymous'}</span>
									<span className="shrink-0">
										{labelFor(e.command.apiId)?.emoji} {labelFor(e.command.apiId)?.label} ✓
									</span>
								</li>
							))}
						</ol>
					</>
				)}
			</aside>
		</div>
	);
}

function Centered({ children }: { children: ReactNode }) {
	return <div className="flex h-dvh items-center justify-center bg-bg text-2xl text-ink">{children}</div>;
}
