import { md5 } from '$lib/utils/md5';

type RtcStatus = 'disconnected' | 'connecting' | 'validating' | 'connected';

class RobotConnectionState {
	status = $state<RtcStatus>('disconnected');
	error = $state<string | null>(null);

	private pc: RTCPeerConnection | null = null;
	private dataChannel: RTCDataChannel | null = null;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private onMessageCallbacks: Array<(msg: Record<string, unknown>) => void> = [];
	private validationResolve: (() => void) | null = null;

	connected = $derived(this.status === 'connected');

	onMessage(cb: (msg: Record<string, unknown>) => void) {
		this.onMessageCallbacks.push(cb);
		return () => {
			this.onMessageCallbacks = this.onMessageCallbacks.filter((c) => c !== cb);
		};
	}

	async connect(robotIp: string) {
		this.error = null;
		this.status = 'connecting';

		try {
			this.pc = new RTCPeerConnection({ sdpSemantics: 'unified-plan' } as any);
			this.dataChannel = this.pc.createDataChannel('data', { ordered: true });
			this.pc.addTransceiver('video', { direction: 'recvonly' });
			this.pc.addTransceiver('audio', { direction: 'sendrecv' });

			this.setupDataChannel();

			const offer = await this.pc.createOffer();
			await this.pc.setLocalDescription(offer);

			const resp = await fetch('/api/negotiate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ robotIp, sdpOffer: offer.sdp, token: '' })
			});
			const answer = await resp.json();
			if (answer.error) throw new Error(answer.error);

			await this.pc.setRemoteDescription(
				new RTCSessionDescription({ type: 'answer', sdp: answer.sdp })
			);

			// Wait for validation
			this.status = 'validating';
			await new Promise<void>((resolve, reject) => {
				this.validationResolve = resolve;
				setTimeout(() => reject(new Error('Validation timeout')), 10000);
			});

			this.status = 'connected';
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Connection failed';
			this.status = 'disconnected';
		}
	}

	disconnect() {
		if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
		this.dataChannel?.close();
		this.pc?.close();
		this.pc = null;
		this.dataChannel = null;
		this.heartbeatInterval = null;
		this.status = 'disconnected';
	}

	sendCommand(apiId: number, params?: Record<string, unknown>) {
		if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
		this.dataChannel.send(
			JSON.stringify({
				type: 'req',
				topic: 'rt/api/sport/request',
				data: {
					header: { identity: { id: Date.now() % 2147483648, api_id: apiId } },
					parameter: params ? JSON.stringify(params) : ''
				}
			})
		);
	}

	private setupDataChannel() {
		if (!this.dataChannel) return;

		this.dataChannel.onopen = () => {};
		this.dataChannel.onclose = () => this.disconnect();
		this.dataChannel.onerror = () => {
			this.error = 'Data channel error';
		};
		this.dataChannel.onmessage = (e: MessageEvent) => {
			if (typeof e.data !== 'string') return;
			try {
				const msg = JSON.parse(e.data);
				if (msg.type === 'validation') {
					if (msg.data === 'Validation Ok.') {
						this.startHeartbeat();
						this.validationResolve?.();
					} else {
						const hex = md5('UnitreeGo2_' + msg.data);
						this.dataChannel?.send(
							JSON.stringify({ type: 'validation', data: btoa(hex) })
						);
					}
					return;
				}
				if (msg.type !== 'heartbeat') {
					this.onMessageCallbacks.forEach((cb) => cb(msg));
				}
			} catch {}
		};
	}

	private startHeartbeat() {
		this.heartbeatInterval = setInterval(() => {
			if (this.dataChannel?.readyState === 'open') {
				const now = new Date();
				this.dataChannel.send(
					JSON.stringify({
						type: 'heartbeat',
						data: {
							timeInStr: now.toISOString().replace('T', ' ').slice(0, 19),
							timeInNum: Math.floor(now.getTime() / 1000)
						}
					})
				);
			}
		}, 2000);
	}
}

export const robot = new RobotConnectionState();
