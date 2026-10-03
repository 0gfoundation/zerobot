/**
 * Playback of command recordings made by `examples/record-commands.ts`.
 *
 * Joint state arrives at ~1 Hz over WebRTC, so a command is recorded several
 * times with the send staggered against the joint samples. Pooling every
 * run's samples by time since send gives a denser joint timeline. Body pose
 * comes from `rt/lf/sportmodestate` at ~20 Hz, which one run covers on its own.
 */

const LOW_STATE = 'rt/lf/lowstate';
const SPORT_STATE = 'rt/lf/sportmodestate';

/** URDF joint names in the order of Go2 lowstate `motor_state`: FR, FL, RR, RL legs, each hip, thigh, calf */
export const GO2_JOINT_NAMES = ['FR', 'FL', 'RR', 'RL'].flatMap((leg) =>
	['hip', 'thigh', 'calf'].map((part) => `${leg}_${part}_joint`)
);

interface RecordedMessage {
	t: number;
	data: any;
}

interface RecordingRun {
	offsetMs?: number;
	durationMs: number;
	streams: Record<string, RecordedMessage[]>;
	events: Array<{ t: number; kind: string; name?: string }>;
}

export interface RecordingFile {
	robot: string;
	command: string;
	estimatedDurationMs: number;
	motorCount: number;
	runs?: RecordingRun[];
	/** Files recorded before `--repeat` hold a single run at the top level */
	streams?: RecordingRun['streams'];
	events?: RecordingRun['events'];
	durationMs?: number;
}

export interface JointSample {
	/** Milliseconds since the command was sent */
	t: number;
	/** Joint angles in radians, in `GO2_JOINT_NAMES` order */
	q: number[];
	/** Index of the run the sample came from */
	run: number;
}

interface BodySample {
	t: number;
	/** Metres, Z-up, relative to the start position and heading */
	position: [number, number, number];
	/** [x, y, z, w], relative to the start heading */
	quaternion: [number, number, number, number];
}

export interface Timeline {
	command: string;
	runCount: number;
	startMs: number;
	endMs: number;
	joints: JointSample[];
	body: BodySample[];
}

export interface Pose {
	joints: Record<string, number>;
	position: [number, number, number];
	quaternion: [number, number, number, number];
}

type Quat = [number, number, number, number];

function quatMultiply([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
	return [
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
		aw * bw - ax * bx - ay * by - az * bz
	];
}

function yawOf([x, y, z, w]: Quat): number {
	return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

function nlerpQuat(a: Quat, b: Quat, f: number): Quat {
	// Take the short way round
	const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
	const q = a.map((v, i) => v + (sign * b[i] - v) * f) as Quat;
	const len = Math.hypot(...q);
	return q.map((v) => v / len) as Quat;
}

/** Index of the last element with `t <= time`, or -1 */
function lastAtOrBefore<T extends { t: number }>(items: T[], time: number): number {
	let lo = 0;
	let hi = items.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (items[mid].t <= time) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

function bodySamples(run: RecordingRun): BodySample[] {
	const raw = (run.streams[SPORT_STATE] ?? []).filter(
		(m) => m.data?.position && m.data?.imu_state?.quaternion
	);
	if (raw.length === 0) return [];

	// Reference is the sample closest to the command send
	const ref = raw.reduce((best, m) => (Math.abs(m.t) < Math.abs(best.t) ? m : best));
	const toXyzw = ([w, x, y, z]: number[]): Quat => [x, y, z, w];
	const yaw0 = yawOf(toXyzw(ref.data.imu_state.quaternion));
	const [x0, y0] = ref.data.position;
	const cos = Math.cos(-yaw0);
	const sin = Math.sin(-yaw0);
	const unYaw: Quat = [0, 0, Math.sin(-yaw0 / 2), Math.cos(-yaw0 / 2)];

	return raw.map((m) => {
		const [x, y, z] = m.data.position;
		const dx = x - x0;
		const dy = y - y0;
		return {
			t: m.t,
			position: [cos * dx - sin * dy, sin * dx + cos * dy, z],
			quaternion: quatMultiply(unYaw, toXyzw(m.data.imu_state.quaternion))
		};
	});
}

/** Search range and step for aligning runs by body motion */
const MAX_LAG_MS = 1000;
const LAG_STEP_MS = 10;
/** Below this pitch/roll range (rad) a run's body barely moves, so its timing can't be read from it */
const MIN_MOTION_RAD = 0.05;

/** Roll, pitch and height sampled every `LAG_STEP_MS` from t=0, or null if the body barely moves */
function motionSignal(run: RecordingRun): number[][] | null {
	const sport = (run.streams[SPORT_STATE] ?? []).filter((m) => m.data?.imu_state?.rpy);
	if (sport.length < 2) return null;
	const end = sport[sport.length - 1].t;
	const out: number[][] = [];
	let j = 0;
	for (let t = 0; t <= end; t += LAG_STEP_MS) {
		while (j < sport.length - 2 && sport[j + 1].t <= t) j++;
		const a = sport[j];
		const b = sport[j + 1];
		const f = Math.min(Math.max((t - a.t) / (b.t - a.t || 1), 0), 1);
		const pick = (m: RecordedMessage) => [
			m.data.imu_state.rpy[0],
			m.data.imu_state.rpy[1],
			m.data.body_height ?? m.data.position?.[2] ?? 0
		];
		const va = pick(a);
		const vb = pick(b);
		out.push(va.map((v, k) => v + (vb[k] - v) * f));
	}
	const range = (k: number) => Math.max(...out.map((v) => v[k])) - Math.min(...out.map((v) => v[k]));
	return Math.max(range(0), range(1)) >= MIN_MOTION_RAD ? out : null;
}

/** How many ms later run `a`'s motion happens than run `b`'s, by least squares over shifts */
function motionLag(a: number[][], b: number[][]): number {
	let best = 0;
	let bestCost = Infinity;
	for (let shift = -MAX_LAG_MS / LAG_STEP_MS; shift <= MAX_LAG_MS / LAG_STEP_MS; shift++) {
		let cost = 0;
		let n = 0;
		for (let i = 0; i < b.length; i++) {
			const ai = i + shift;
			if (ai < 0 || ai >= a.length) continue;
			for (let k = 0; k < 3; k++) cost += (a[ai][k] - b[i][k]) ** 2;
			n++;
		}
		// Require most of the signal to overlap so large shifts can't win on a sliver
		if (n < b.length / 2) continue;
		if (cost / n < bestCost) {
			bestCost = cost / n;
			best = shift;
		}
	}
	return best * LAG_STEP_MS;
}

/**
 * The robot doesn't always start a trick the same time after the command
 * (the first run of a session can lag by ~0.5 s), and merging by send time
 * then pairs one run's body with other runs' legs. Find each run's delay
 * from its 20 Hz body motion, relative to the most typical run, which also
 * supplies the body pose. Runs whose body barely moves keep a delay of 0.
 */
function alignRuns(runs: RecordingRun[]): { lags: number[]; reference: number } {
	const signals = runs.map(motionSignal);
	const moving = signals.flatMap((s, i) => (s ? [i] : []));
	if (moving.length < 2) return { lags: runs.map(() => 0), reference: 0 };

	// Delays against the first moving run, then re-based on the run with the median delay
	const first = signals[moving[0]]!;
	const raw = signals.map((s, i) => (s && i !== moving[0] ? motionLag(s, first) : 0));
	const byLag = [...moving].sort((a, b) => raw[a] - raw[b]);
	const reference = byLag[Math.floor(byLag.length / 2)];
	return { lags: raw.map((lag, i) => (signals[i] ? lag - raw[reference] : 0)), reference };
}

export function buildTimeline(file: RecordingFile): Timeline {
	const runs: RecordingRun[] = file.runs ?? [
		{ durationMs: file.durationMs ?? 0, streams: file.streams ?? {}, events: file.events ?? [] }
	];
	const motorCount = file.motorCount || GO2_JOINT_NAMES.length;
	const { lags, reference } = alignRuns(runs);

	const joints: JointSample[] = runs
		.flatMap((run, i) =>
			(run.streams[LOW_STATE] ?? []).map((m) => ({
				t: m.t - lags[i],
				q: (m.data?.motor_state ?? []).slice(0, motorCount).map((s: { q: number }) => s.q),
				run: i
			}))
		)
		.filter((s) => s.q.length === motorCount)
		.sort((a, b) => a.t - b.t);

	const body = runs.length > 0 ? bodySamples(runs[reference]).map((s) => ({ ...s, t: s.t - lags[reference] })) : [];
	const times = [...joints.map((s) => s.t), ...body.map((s) => s.t)];

	return {
		command: file.command,
		runCount: runs.length,
		// Playback starts when the command is sent. Samples from before it stay
		// in the timeline so the opening pose interpolates from the resting stance.
		startMs: 0,
		endMs: Math.max(...runs.map((r) => r.durationMs), ...times, 0),
		joints,
		body
	};
}

/**
 * Joint angle `k` at `t` by local linear regression with a Gaussian kernel.
 * Averages disagreement between runs while keeping slopes, so it flattens
 * real motion less than a plain moving average.
 */
function smoothedJoint(joints: JointSample[], t: number, k: number, sigmaMs: number): number | null {
	let sw = 0;
	let swx = 0;
	let swy = 0;
	let swxx = 0;
	let swxy = 0;
	for (let i = Math.max(lastAtOrBefore(joints, t - 3 * sigmaMs), 0); i < joints.length; i++) {
		const x = joints[i].t - t;
		if (x > 3 * sigmaMs) break;
		const w = Math.exp(-(x * x) / (2 * sigmaMs * sigmaMs));
		const y = joints[i].q[k];
		sw += w;
		swx += w * x;
		swy += w * y;
		swxx += w * x * x;
		swxy += w * x * y;
	}
	// Too sparse here (few runs, narrow kernel): let the caller interpolate linearly
	if (sw < 1e-3) return null;
	const det = sw * swxx - swx * swx;
	return det > 1e-9 ? (swy * swxx - swx * swxy) / det : swy / sw;
}

/**
 * Pose at `t` ms since send, holding the ends. Joints interpolate linearly,
 * or with `smoothingMs` > 0 are smoothed over that kernel width. Body pose
 * always interpolates linearly, since it comes from one run at ~20 Hz.
 */
export function samplePose(timeline: Timeline, t: number, smoothingMs = 0): Pose | null {
	const { joints, body } = timeline;
	if (joints.length === 0) return null;

	const i = lastAtOrBefore(joints, t);
	const a = joints[Math.max(i, 0)];
	const b = joints[Math.min(i + 1, joints.length - 1)];
	const f = i < 0 || b.t === a.t ? (i < 0 ? 0 : 1) : (t - a.t) / (b.t - a.t);
	const q = a.q.map((v, k) => {
		const smoothed = smoothingMs > 0 ? smoothedJoint(joints, t, k, smoothingMs) : null;
		return smoothed ?? v + (b.q[k] - v) * f;
	});

	let position: Pose['position'] = [0, 0, 0.31];
	let quaternion: Pose['quaternion'] = [0, 0, 0, 1];
	if (body.length > 0) {
		const j = lastAtOrBefore(body, t);
		const ba = body[Math.max(j, 0)];
		const bb = body[Math.min(j + 1, body.length - 1)];
		const g = j < 0 || bb.t === ba.t ? (j < 0 ? 0 : 1) : (t - ba.t) / (bb.t - ba.t);
		position = ba.position.map((v, k) => v + (bb.position[k] - v) * g) as Pose['position'];
		quaternion = nlerpQuat(ba.quaternion, bb.quaternion, g);
	}

	return {
		joints: Object.fromEntries(GO2_JOINT_NAMES.map((name, k) => [name, q[k]])),
		position,
		quaternion
	};
}
