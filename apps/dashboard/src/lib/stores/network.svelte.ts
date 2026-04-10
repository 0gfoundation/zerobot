import { networks, defaultNetwork, type NetworkConfig } from '$lib/networks';

class NetworkState {
	current = $state<NetworkConfig>(defaultNetwork);

	get chain() {
		return this.current.chain;
	}

	get contracts() {
		return this.current.contracts;
	}

	get chainId() {
		return this.current.chain.id;
	}

	switchTo(chainId: number) {
		const net = networks[chainId];
		if (!net) throw new Error(`Unsupported network: ${chainId}`);
		this.current = net;
	}
}

export const network = new NetworkState();
