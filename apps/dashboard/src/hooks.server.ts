import { startMockRobot } from '@0g-foundation/zerobot-sdk/mock';

// Start the mock robot server for dry-run mode.
// Runs on a separate port so it doesn't conflict with SvelteKit.
try {
	startMockRobot(9991);
} catch {
	// Already running or port in use — fine
}
