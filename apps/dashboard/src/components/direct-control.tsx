'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@0gfoundation/0g-ui/shell';
import { RobotViewer } from './robot-viewer';
import { useRobotConnection } from '@/lib/use-robot-connection';
import { ROBOT_TYPE_LABELS } from '@/lib/robots';

const GO2_POSTURES: [number, string][] = [
	[1004, 'StandUp'],
	[1005, 'StandDown'],
	[1002, 'BalanceStand'],
	[1006, 'RecoveryStand'],
	[1009, 'Sit'],
	[1010, 'RiseSit']
];
const GO2_ACTIONS: [number, string][] = [
	[1016, 'Hello'],
	[1017, 'Stretch'],
	[1022, 'Dance1'],
	[1023, 'Dance2'],
	[1036, 'FingerHeart'],
	[1029, 'Scrape'],
	[1020, 'Content'],
	[1030, 'FrontFlip'],
	[2044, 'Handstand']
];
const G1_MODES: [number, string][] = [
	[4, 'Stand'],
	[2, 'Squat'],
	[706, 'Balance Squat'],
	[702, 'Lie Down'],
	[1, 'Damping']
];
const G1_ACTIONS: [number, string][] = [
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
];

const card = 'rounded-2xl border border-hairline p-4';
const heading = 'mb-3 text-xs font-medium uppercase tracking-wider text-ink-muted';
const chip = 'rounded-full border border-hairline px-3 py-1.5 text-sm hover:border-hairline-strong';
const input = 'w-full rounded-xl border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink';

/** Drive a robot over WebRTC from this browser. Local mode only: it needs the robot's network. */
export function DirectControl({
	name,
	robotType,
	log
}: {
	name: string;
	robotType: string;
	log: (line: string) => void;
}) {
	const robot = useRobotConnection((msg) => log(`← ${JSON.stringify(msg).slice(0, 120)}`));
	const [mode, setMode] = useState<'robot' | 'dryrun'>('robot');
	const [ip, setIp] = useState('192.168.123.18');
	const [deviceKey, setDeviceKey] = useState('');
	// Fields typed in before the local config arrives win over it
	const edited = useRef({ ip: false, deviceKey: false });

	// Pre-fill from the local server, which reads ROBOT_IP and ROBOT_DEVICE_KEY from the repo's .env
	useEffect(() => {
		let cancelled = false;
		fetch('/api/robot-config')
			.then((res) => (res.ok ? res.json() : {}))
			.then((config: { ip?: string; deviceKey?: string }) => {
				if (cancelled) return;
				if (config.ip && !edited.current.ip) setIp(config.ip);
				if (config.deviceKey && !edited.current.deviceKey) setDeviceKey(config.deviceKey);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);
	const [speed, setSpeed] = useState(0.3);
	const isG1 = robotType === 'g1';

	async function toggle() {
		if (robot.connected) {
			robot.disconnect();
			log('Disconnected');
			return;
		}
		const target = mode === 'dryrun' ? '127.0.0.1' : ip;
		log(mode === 'dryrun' ? 'Starting dry run…' : `Connecting to ${target}…`);
		await robot.connect(target, mode === 'robot' ? deviceKey.trim() || undefined : undefined);
	}

	function send(apiId: number, label: string) {
		robot.sendCommand(apiId);
		log(`→ ${label} (${apiId})`);
	}

	const hold = (vx: number, vy: number, vyaw: number) => ({
		onPointerDown: () => robot.startMove(vx, vy, vyaw, robotType),
		onPointerUp: () => robot.stopMove(robotType),
		onPointerLeave: () => robot.stopMove(robotType)
	});
	const pad = 'flex h-10 w-10 select-none items-center justify-center rounded-lg border border-hairline hover:border-hairline-strong';

	return (
		<>
			<section className={`${card} mt-4`}>
				<div className="mb-3 flex items-baseline justify-between">
					<h2 className={heading}>Direct control</h2>
					<span className="text-sm">
						<span className="font-medium">{name}</span>{' '}
						<span className="text-ink-muted">{ROBOT_TYPE_LABELS[robotType] ?? robotType}</span>
					</span>
				</div>

				{robot.status === 'disconnected' ? (
					<>
						<div className="mb-3 flex gap-2">
							{(['robot', 'dryrun'] as const).map((m) => (
								<button
									key={m}
									type="button"
									onClick={() => setMode(m)}
									className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
										mode === m ? 'border-ink' : 'border-hairline text-ink-soft'
									}`}
								>
									{m === 'robot' ? 'Connect to robot' : 'Dry run'}
								</button>
							))}
						</div>
						{mode === 'robot' ? (
							<div className="flex flex-wrap items-end gap-3">
								<label className="min-w-40 flex-1 text-xs text-ink-muted">
									Robot IP (local network)
									<input value={ip} onChange={(e) => {
											edited.current.ip = true;
											setIp(e.target.value);
										}} className={`${input} mt-1`} />
								</label>
								<label className="min-w-40 flex-1 text-xs text-ink-muted">
									Device key (Go2 firmware 1.1.15+)
									<input
										type="password"
										autoComplete="off"
										placeholder="32 hex characters"
										value={deviceKey}
										onChange={(e) => {
											edited.current.deviceKey = true;
											setDeviceKey(e.target.value);
										}}
										className={`${input} mt-1`}
									/>
								</label>
								<Button size="small" onClick={toggle}>
									Connect
								</Button>
							</div>
						) : (
							<div className="flex items-center justify-between gap-4">
								<p className="text-sm text-ink-soft">
									Commands go to this server&apos;s mock robot, which acknowledges them without moving anything.
								</p>
								<Button size="small" onClick={toggle}>
									Start dry run
								</Button>
							</div>
						)}
					</>
				) : (
					<div className="flex items-center justify-between">
						<span className="text-sm">
							{robot.connected
								? mode === 'dryrun'
									? 'Dry run active'
									: `Connected to ${ip}`
								: robot.status === 'connecting'
									? 'Connecting…'
									: 'Validating…'}
						</span>
						{robot.connected && (
							<Button size="small" variant="secondary" onClick={toggle}>
								Disconnect
							</Button>
						)}
					</div>
				)}
				{robot.error && <p className="mt-2 text-sm text-danger">{robot.error}</p>}
			</section>

			<RobotViewer robotType={robotType} className="mt-4 h-72 border border-hairline" />

			{robot.connected && (
				<div className="mt-4 grid gap-4 md:grid-cols-2">
					<section className={card}>
						<h2 className={heading}>Posture</h2>
						<div className="flex flex-wrap gap-2">
							{isG1
								? G1_MODES.map(([id, label]) => (
										<button
											key={id}
											type="button"
											className={chip}
											onClick={() => {
												robot.sendG1LocoCommand(id);
												log(`→ G1 mode: ${label}`);
											}}
										>
											{label}
										</button>
									))
								: GO2_POSTURES.map(([id, label]) => (
										<button key={id} type="button" className={chip} onClick={() => send(id, label)}>
											{label}
										</button>
									))}
						</div>

						<h2 className={`${heading} mt-4`}>Movement</h2>
						<label className="mb-3 flex items-center gap-3 text-xs text-ink-muted">
							Speed
							<input
								type="range"
								min="0.1"
								max="1.0"
								step="0.1"
								value={speed}
								onChange={(e) => setSpeed(Number(e.target.value))}
								className="flex-1"
							/>
							<span className="w-8 text-right font-mono">{speed.toFixed(1)}</span>
						</label>
						<div className="flex flex-col items-center gap-1">
							<div className="flex gap-1">
								<button type="button" className={pad} title="Rotate left" {...hold(0, 0, speed * 3)}>↺</button>
								<button type="button" className={pad} title="Forward" {...hold(speed, 0, 0)}>↑</button>
								<button type="button" className={pad} title="Rotate right" {...hold(0, 0, -speed * 3)}>↻</button>
							</div>
							<div className="flex gap-1">
								<button type="button" className={pad} title="Strafe left" {...hold(0, speed, 0)}>←</button>
								<button type="button" className={`${pad} text-danger`} title="Stop" onClick={() => robot.stopMove(robotType)}>■</button>
								<button type="button" className={pad} title="Strafe right" {...hold(0, -speed, 0)}>→</button>
							</div>
							<div className="flex gap-1">
								<div className="h-10 w-10" />
								<button type="button" className={pad} title="Backward" {...hold(-speed, 0, 0)}>↓</button>
								<div className="h-10 w-10" />
							</div>
						</div>
						{robot.moving && <p className="mt-2 text-center text-xs">Moving, release to stop</p>}
					</section>

					<section className={card}>
						<h2 className={heading}>Actions</h2>
						<div className="flex flex-wrap gap-2">
							{isG1
								? G1_ACTIONS.map(([id, label]) => (
										<button
											key={id}
											type="button"
											className={chip}
											onClick={() => {
												robot.sendG1ArmAction(id);
												log(`→ G1 arm: ${label}`);
											}}
										>
											{label}
										</button>
									))
								: GO2_ACTIONS.map(([id, label]) => (
										<button key={id} type="button" className={chip} onClick={() => send(id, label)}>
											{label}
										</button>
									))}
						</div>
					</section>
				</div>
			)}
		</>
	);
}
