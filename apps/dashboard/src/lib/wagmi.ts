import { createConfig, http, type Transport } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { supportedChains } from './networks';

export const wagmiConfig = createConfig({
	chains: supportedChains,
	transports: Object.fromEntries(supportedChains.map((c) => [c.id, http()])) as Record<
		number,
		Transport
	>,
	connectors: [injected()],
	ssr: true
});

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig;
	}
}
