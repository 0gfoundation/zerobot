/**
 * Starts the mock robot for dry runs when the server boots in local mode,
 * on its own port so it doesn't conflict with Next.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PUBLIC_ZEROBOT_MODE !== 'local') return;

	const { startMockRobot } = await import('@0g-foundation/zerobot-sdk/mock');
	const { MOCK_ROBOT_PORT } = await import('./lib/server/mock-robot');
	const mock = startMockRobot(MOCK_ROBOT_PORT);

	// Listen errors arrive asynchronously, so a try/catch can't see them.
	// Without this handler a busy port crashes the server.
	mock.on('error', (err: NodeJS.ErrnoException) => {
		if (err.code === 'EADDRINUSE') {
			console.warn(
				`[mock] Port ${MOCK_ROBOT_PORT} is in use, so this server's mock robot didn't start. ` +
					'If another dev server is running, start this one with a different MOCK_ROBOT_PORT.'
			);
		} else {
			console.error('[mock] Mock robot error:', err);
		}
	});
}
