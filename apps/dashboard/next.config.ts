import path from 'node:path';
import type { NextConfig } from 'next';

// Hosted mode only talks to the chain. Local mode, on the robot's network,
// adds what needs to reach the robot: direct control through the
// /api/negotiate proxy, the mock robot for dry runs, and live recordings.
// Vercel builds are hosted unless ZEROBOT_MODE says otherwise.
const mode = process.env.ZEROBOT_MODE ?? (process.env.VERCEL ? 'hosted' : 'local');

const config: NextConfig = {
	env: { NEXT_PUBLIC_ZEROBOT_MODE: mode },
	// The app imports robot menus from examples/ at the repo root
	turbopack: { root: path.resolve(import.meta.dirname, '../..') },
	// The SDK's robot and mock entries load @roamhq/wrtc at runtime in Node.
	// Bundling them would break that lookup, so the server requires them.
	serverExternalPackages: ['@0g-foundation/zerobot-sdk', '@roamhq/wrtc']
};

export default config;
