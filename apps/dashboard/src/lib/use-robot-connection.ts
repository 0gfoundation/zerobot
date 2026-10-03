'use client';

import { useEffect, useRef, useState } from 'react';
import { Go2Connection } from '@0g-foundation/zerobot-sdk/robot';

type RtcStatus = 'disconnected' | 'connecting' | 'validating' | 'connected';

/**
 * React state around the SDK's `Go2Connection`, for direct control in local
 * mode. SDP exchange goes through `/api/negotiate` via `signalingProxyUrl`,
 * because the robot's signaling endpoint can't be reached cross-origin.
 */
export function useRobotConnection(onMessage?: (msg: Record<string, unknown>) => void) {
	const [status, setStatus] = useState<RtcStatus>('disconnected');
	const [error, setError] = useState<string | null>(null);
	const [moving, setMoving] = useState(false);
	const conn = useRef<Go2Connection | null>(null);
	const moveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
	const onMessageRef = useRef(onMessage);
	onMessageRef.current = onMessage;

	useEffect(
		() => () => {
			conn.current?.disconnect();
		},
		[]
	);

	async function connect(ip: string, deviceKey?: string) {
		setError(null);
		const c = new Go2Connection({ ip, deviceKey, signalingProxyUrl: '/api/negotiate' });
		conn.current = c;
		c.on('status', (s) => {
			if (s === 'connecting' || s === 'validating' || s === 'connected' || s === 'disconnected') setStatus(s);
		});
		c.on('message', (msg) => onMessageRef.current?.(msg));
		c.on('error', (err) => setError(err.message));
		try {
			await c.connect();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Connection failed');
			setStatus('disconnected');
			conn.current = null;
		}
	}

	function disconnect() {
		stopMove();
		conn.current?.disconnect();
		conn.current = null;
		setStatus('disconnected');
	}

	/** Send a Go2 sport command (api_id + optional params) */
	function sendCommand(apiId: number, params?: Record<string, unknown>) {
		try {
			conn.current?.sportCommand(apiId, params);
		} catch {
			// Data channel not open; status events will catch up
		}
	}

	/** G1 loco mode command (api_id 7101 on the sport request topic) */
	function sendG1LocoCommand(modeId: number) {
		sendCommand(7101, { data: modeId });
	}

	/** G1 arm action (api_id 7106 on rt/api/arm/request) */
	function sendG1ArmAction(actionId: number) {
		conn.current?.sendMessage({
			type: 'req',
			topic: 'rt/api/arm/request',
			data: {
				header: { identity: { id: Date.now() % 2147483648, api_id: 7106 } },
				parameter: JSON.stringify({ data: actionId })
			}
		});
	}

	function sendG1Joystick(lx: number, ly: number, rx: number, ry: number) {
		conn.current?.sendMessage({ type: 'msg', topic: 'rt/wirelesscontroller', data: { lx, ly, rx, ry, keys: 0 } });
	}

	/** Hold-to-move: resend every 500ms until `stopMove` */
	function startMove(vx: number, vy: number, vyaw: number, robotType = 'go2_pro') {
		stopMove(robotType);
		setMoving(true);
		const send =
			robotType === 'g1' ? () => sendG1Joystick(vx, vy, vyaw, 0) : () => sendCommand(1008, { x: vx, y: vy, z: vyaw });
		send();
		moveTimer.current = setInterval(send, 500);
	}

	function stopMove(robotType = 'go2_pro') {
		if (moveTimer.current) {
			clearInterval(moveTimer.current);
			moveTimer.current = null;
			if (robotType === 'g1') sendG1Joystick(0, 0, 0, 0);
			else sendCommand(1003); // StopMove
		}
		setMoving(false);
	}

	return {
		status,
		connected: status === 'connected',
		error,
		moving,
		connect,
		disconnect,
		sendCommand,
		sendG1LocoCommand,
		sendG1ArmAction,
		startMove,
		stopMove
	};
}
