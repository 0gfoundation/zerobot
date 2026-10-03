import { startMockRobot } from '@0g-foundation/zerobot-sdk/mock';
import { MOCK_ROBOT_PORT } from '$lib/server/mock-robot';

// Start the mock robot server for dry-run mode, on its own port so it doesn't
// conflict with SvelteKit.
const mock = startMockRobot(MOCK_ROBOT_PORT);

// Listen errors arrive asynchronously, so a try/catch can't see them. Without
// this handler a busy port crashes the dev server, e.g. when the SDK is
// rebuilt and this module reloads while the previous mock still holds the port.
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
