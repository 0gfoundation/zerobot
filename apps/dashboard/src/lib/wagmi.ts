import { createConfig, http, type Config } from '@wagmi/core';
import { injected } from '@wagmi/connectors';
import { supportedChains } from '$lib/networks';

let _config: Config | null = null;

export function getConfig(): Config {
	if (!_config) {
		const transports: Record<number, ReturnType<typeof http>> = {};
		for (const chain of supportedChains) {
			transports[chain.id] = http();
		}

		_config = createConfig({
			chains: supportedChains as any,
			transports,
			connectors: [injected()],
			ssr: true
		});
	}
	return _config;
}
