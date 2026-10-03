import { createConfig, http, type Transport } from 'wagmi';
import { injected, metaMask, walletConnect } from 'wagmi/connectors';
import { supportedChains } from './networks';

const NAME = 'Zerobot';
const DESCRIPTION = 'Pay to make real robots move, on 0G.';
const PRODUCTION_ORIGIN = 'https://zerobot.0g.ai';

/** Wallets warn when the dapp's metadata doesn't match the page it's on */
function origin(): string {
	return typeof window === 'undefined' ? PRODUCTION_ORIGIN : window.location.origin;
}

/** Reown (WalletConnect) cloud project. Without one there is no phone or QR path. */
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

/**
 * Connectors as in 0g-hub's wagmi config:
 * - MetaMask through its own SDK, not the WalletConnect relay, which some
 *   countries block. It talks to the extension directly when there is one,
 *   and deep-links into the app on a phone.
 * - `injected` for browser wallets that predate EIP-6963 discovery. wagmi
 *   adds one connector per wallet that announces itself.
 * - WalletConnect for every other phone wallet and the desktop QR. Our
 *   modal draws the QR and the per-wallet links, so its own modal is off.
 */
export const wagmiConfig = createConfig({
	chains: supportedChains,
	transports: Object.fromEntries(supportedChains.map((c) => [c.id, http()])) as Record<number, Transport>,
	connectors: [
		metaMask({
			dapp: { name: NAME, url: origin() },
			ui: { preferExtension: true },
			analytics: { enabled: false }
		}),
		injected(),
		...(projectId
			? [
					walletConnect({
						projectId,
						metadata: { name: NAME, description: DESCRIPTION, url: origin(), icons: [`${origin()}/icon.svg`] },
						showQrModal: false
					})
				]
			: [])
	],
	ssr: true
});

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig;
	}
}
