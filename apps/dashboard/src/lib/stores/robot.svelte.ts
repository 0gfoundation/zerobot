import { Go2Connection } from '@0g-foundation/zerobot-sdk/robot';

/**
 * Reactive wrapper around the SDK's `Go2Connection`. The store owns the
 * Svelte-runes UI state (status, error, hold-to-move loop) and delegates
 * everything WebRTC-shaped — peer connection, data channel, validation
 * handshake, heartbeat, sport commands — to the SDK.
 *
 * SDP exchange goes through `/api/negotiate` (a SvelteKit server endpoint)
 * via the SDK's `signalingProxyUrl` option, because the robot's local-network
 * signaling endpoint can't be reached cross-origin from the browser.
 */

type RtcStatus = 'disconnected' | 'connecting' | 'validating' | 'connected';

class RobotConnectionState {
	status = $state<RtcStatus>('disconnected');
	error = $state<string | null>(null);
	moving = $state(false);

	private conn: Go2Connection | null = null;
	private moveInterval: ReturnType<typeof setInterval> | null = null;
	private onMessageCallbacks: Array<(msg: Record<string, unknown>) => void> = [];

	connected = $derived(this.status === 'connected');

	onMessage(cb: (msg: Record<string, unknown>) => void) {
		this.onMessageCallbacks.push(cb);
		return () => {
			this.onMessageCallbacks = this.onMessageCallbacks.filter((c) => c !== cb);
		};
	}

	async connect(robotIp: string, deviceKey?: string) {
		this.error = null;
		const conn = new Go2Connection({
			ip: robotIp,
			deviceKey,
			signalingProxyUrl: '/api/negotiate'
		});
		this.conn = conn;

		// Mirror SDK status into our local state. The SDK's lifecycle goes
		// disconnected → connecting → validating → connected (then error on failure);
		// we only surface the subset our UI cares about.
		conn.on('status', (s) => {
			if (s === 'connecting' || s === 'validating' || s === 'connected' || s === 'disconnected') {
				this.status = s;
			}
		});
		conn.on('message', (msg) => {
			for (const cb of this.onMessageCallbacks) cb(msg);
		});
		conn.on('error', (err) => {
			this.error = err.message;
		});

		try {
			await conn.connect();
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Connection failed';
			this.status = 'disconnected';
			this.conn = null;
		}
	}

	disconnect() {
		this.stopMove();
		this.conn?.disconnect();
		this.conn = null;
		this.status = 'disconnected';
	}

	/** Send a Go2 sport command (api_id + optional params). */
	sendCommand(apiId: number, params?: Record<string, unknown>) {
		try {
			this.conn?.sportCommand(apiId, params);
		} catch {
			// Data channel not open — UI state will catch up via status events
		}
	}

	/** Send a G1 loco mode command (api_id 7101 with mode data). */
	sendG1LocoCommand(modeId: number) {
		// G1 loco lives on the sport-request topic with its own api_id,
		// so sportCommand handles it without a new SDK surface.
		this.sendCommand(7101, { data: modeId });
	}

	/** Send a G1 arm action (api_id 7106 on rt/api/arm/request). */
	sendG1ArmAction(actionId: number) {
		this.conn?.sendMessage({
			type: 'req',
			topic: 'rt/api/arm/request',
			data: {
				header: { identity: { id: Date.now() % 2147483648, api_id: 7106 } },
				parameter: JSON.stringify({ data: actionId })
			}
		});
	}

	/** Send G1 joystick input on rt/wirelesscontroller. */
	sendG1Joystick(lx: number, ly: number, rx: number, ry: number) {
		this.conn?.sendMessage({
			type: 'msg',
			topic: 'rt/wirelesscontroller',
			data: { lx, ly, rx, ry, keys: 0 }
		});
	}

	/** Hold-to-move: send the command every 500ms until stopMove. */
	startMove(vx: number, vy: number, vyaw: number, robotType: string = 'go2_pro') {
		this.stopMove(robotType);
		this.moving = true;
		const send =
			robotType === 'g1'
				? () => this.sendG1Joystick(vx, vy, vyaw, 0)
				: () => this.sendCommand(1008, { x: vx, y: vy, z: vyaw });
		send();
		this.moveInterval = setInterval(send, 500);
	}

	stopMove(robotType: string = 'go2_pro') {
		if (this.moveInterval) {
			clearInterval(this.moveInterval);
			this.moveInterval = null;
		}
		if (this.moving) {
			if (robotType === 'g1') {
				this.sendG1Joystick(0, 0, 0, 0);
			} else {
				this.sendCommand(1003); // StopMove
			}
			this.moving = false;
		}
	}
}

export const robot = new RobotConnectionState();
