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

export function buildTimeline(file: RecordingFile): Timeline {
	const runs: RecordingRun[] = file.runs ?? [
		{ durationMs: file.durationMs ?? 0, streams: file.streams ?? {}, events: file.events ?? [] }
	];
	const motorCount = file.motorCount || GO2_JOINT_NAMES.length;

	const joints: JointSample[] = runs
		.flatMap((run, i) =>
			(run.streams[LOW_STATE] ?? []).map((m) => ({
				t: m.t,
				q: (m.data?.motor_state ?? []).slice(0, motorCount).map((s: { q: number }) => s.q),
				run: i
			}))
		)
		.filter((s) => s.q.length === motorCount)
		.sort((a, b) => a.t - b.t);

	const body = runs.length > 0 ? bodySamples(runs[0]) : [];
	const times = [...joints.map((s) => s.t), ...body.map((s) => s.t)];

	return {
		command: file.command,
		runCount: runs.length,
		startMs: times.length ? Math.min(0, ...times) : 0,
		endMs: Math.max(...runs.map((r) => r.durationMs), ...times, 0),
		joints,
		body
	};
}

/** Pose at `t` ms since send, interpolating joints and body linearly and holding the ends */
export function samplePose(timeline: Timeline, t: number): Pose | null {
	const { joints, body } = timeline;
	if (joints.length === 0) return null;

	const i = lastAtOrBefore(joints, t);
	const a = joints[Math.max(i, 0)];
	const b = joints[Math.min(i + 1, joints.length - 1)];
	const f = i < 0 || b.t === a.t ? (i < 0 ? 0 : 1) : (t - a.t) / (b.t - a.t);
	const q = a.q.map((v, k) => v + (b.q[k] - v) * f);

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
