import { defineChain, type Chain } from 'viem';

export interface NetworkConfig {
	chain: Chain;
	contracts: {
		registry: `0x${string}`;
		dispatcher: `0x${string}`;
	};
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

// Mainnet placeholder — uncomment when ready
// export const zeroGMainnet = defineChain({
// 	id: 16661,
// 	name: '0G Mainnet',
// 	nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
// 	rpcUrls: {
// 		default: {
// 			http: ['https://evmrpc.0g.ai'],
// 			webSocket: ['wss://evmrpc-ws.0g.ai/']
// 		}
// 	},
// 	blockExplorers: {
// 		default: { name: '0G Explorer', url: 'https://chainscan.0g.ai' }
// 	}
// });

export const networks: Record<number, NetworkConfig> = {
	[zeroGTestnet.id]: {
		chain: zeroGTestnet,
		contracts: {
			registry: '0x291162e93D7A80Eb8F738882a28a7a8A5FBA73bb',
			dispatcher: '0x418bA7C231dac8Ef58b534BeE6adC50E703AA753'
		}
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
