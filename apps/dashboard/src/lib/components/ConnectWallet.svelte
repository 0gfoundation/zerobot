<script lang="ts">
	import { wallet, isRejection } from '$lib/stores/wallet.svelte';

	let {
		onconnected
	}: {
		onconnected?: () => void;
	} = $props();

	let error = $state<string | null>(null);
	let attempted = $state(false);

	async function handleConnect(connector: (typeof wallet.connectors)[number]) {
		error = null;
		attempted = true;
		await wallet.connect(connector);
		if (wallet.error) {
			error = wallet.error;
		} else if (wallet.connected) {
			onconnected?.();
		}
	}
</script>

<div class="flex w-full flex-col gap-3">
	{#if error || wallet.error}
		<div class="rounded-lg bg-danger-muted p-4 text-sm text-danger">
			{error || wallet.error}
		</div>
	{/if}

	{#if wallet.connecting}
		<div class="flex flex-col items-center gap-3">
			<div
				class="flex w-full items-center justify-between rounded-xl bg-surface-secondary px-5 py-4 opacity-60"
			>
				<span class="text-lg font-semibold text-default">Connecting Wallet…</span>
			</div>
			<p class="text-sm text-muted">Approve the connection in your wallet</p>
			<button
				onclick={() => {
					wallet.cancel();
					error = null;
					attempted = false;
				}}
				class="text-sm font-medium text-muted underline hover:text-secondary"
			>
				Cancel
			</button>
		</div>
	{:else}
		{@const metamask = wallet.connectors.find((c) => c.name === 'MetaMask')}
		{#if metamask}
			<button
				onclick={() => handleConnect(metamask)}
				class="flex w-full cursor-pointer items-center justify-between rounded-xl bg-surface-secondary px-5 py-4 transition hover:bg-surface-hover"
			>
				<span class="text-lg font-semibold text-default">{metamask.name}</span>
				{#if metamask.icon}
					<img src={metamask.icon} alt={metamask.name} class="h-8 w-8 rounded-lg" />
				{/if}
			</button>
		{:else if wallet.ready}
			<div
				class="relative flex w-full items-center justify-between rounded-xl bg-surface-secondary px-5 py-4 opacity-50"
			>
				<span class="text-lg font-semibold text-default">MetaMask</span>
				<span class="text-sm font-medium text-muted">Not Installed</span>
			</div>
			<div class="rounded-lg border border-warning bg-warning-muted p-4 text-sm text-warning">
				No compatible wallets installed. Installing MetaMask is recommended.
			</div>
		{/if}
	{/if}
</div>
