import { defineChain, type Chain } from 'viem';

export interface NetworkConfig {
	chain: Chain;
	contracts: {
		registry: `0x${string}`;
		dispatcher: `0x${string}`;
	};
	/**
	 * Offer only MetaMask in the wallet modal, and name it on the stage and in
	 * the switch step. For a network the other wallets can't reach from a
	 * phone. Leave unset where they can, and the full list shows.
	 */
	metaMaskOnly?: boolean;
}

export const zeroGTestnet = defineChain({
	id: 16602,
	name: '0G Galileo Testnet',
	nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
	rpcUrls: {
		default: {
			http: ['https://evmrpc-testnet.0g.ai'],
			webSocket: ['wss://evmrpc-testnet.0g.ai/ws/']
		}
	},
	blockExplorers: {
		default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' }
	},
	testnet: true
});

/**
 * 0G mainnet. No contracts here yet, so not in `networks`; only offered to
 * wallets when connecting (`walletChains`).
 */
export const zeroGMainnet = defineChain({
	id: 16661,
	name: '0G Mainnet',
	nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
	rpcUrls: {
		default: { http: ['https://evmrpc.0g.ai'] }
	},
	blockExplorers: {
		default: { name: '0G Explorer', url: 'https://chainscan.0g.ai' }
	}
});

export const networks: Record<number, NetworkConfig> = {
	[zeroGTestnet.id]: {
		chain: zeroGTestnet,
		contracts: {
			registry: '0x291162e93D7A80Eb8F738882a28a7a8A5FBA73bb',
			dispatcher: '0x418bA7C231dac8Ef58b534BeE6adC50E703AA753'
		},
		// Phone wallets over WalletConnect approve only networks they know, and
		// Rabby, Trust and Bitget don't know Galileo. MetaMask adds it.
		metaMaskOnly: true
	}
	// [zeroGMainnet.id]: {
	// 	chain: zeroGMainnet,
	// 	contracts: {
	// 		registry: '0x...',
	// 		dispatcher: '0x...'
	// 	}
	// }
};

export const supportedChains = Object.values(networks).map((n) => n.chain) as [Chain, ...Chain[]];
export const defaultNetwork = networks[zeroGTestnet.id];

/**
 * The chains a wallet is asked for when connecting. A WalletConnect session
 * can't start unless the wallet knows one of them, and phone wallets with 0G
 * built in (Bitget, OKX, ...) have mainnet but not Galileo: offered Galileo
 * alone, Bitget kept asking to add it and never connected. With mainnet
 * offered too the session starts, and the pages then switch to Galileo,
 * which lets the wallet add it.
 */
export const walletChains = [...supportedChains, zeroGMainnet] as [Chain, ...Chain[]];
