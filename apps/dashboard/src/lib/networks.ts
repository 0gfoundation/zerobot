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
	rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
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
// 	rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
// 	blockExplorers: {
// 		default: { name: '0G Explorer', url: 'https://chainscan.0g.ai' }
// 	}
// });

export const networks: Record<number, NetworkConfig> = {
	[zeroGTestnet.id]: {
		chain: zeroGTestnet,
		contracts: {
			registry: '0x005E35a7bFcc98d2036EeBba1B5cC02E8d5523DC',
			dispatcher: '0x049d7D31E95a7BEdE2ce7D71E32fa0eA8819c0c3'
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

export const supportedChains = Object.values(networks).map((n) => n.chain);
export const defaultNetwork = networks[zeroGTestnet.id];
