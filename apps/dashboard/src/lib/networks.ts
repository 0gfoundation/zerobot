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
			registry: '0x3B525C6cB41552Edb97DAe3a3f2401cE7723f319',
			dispatcher: '0x06C3CDe215cE11F3b010FD9e66d80B82B730e95E'
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
