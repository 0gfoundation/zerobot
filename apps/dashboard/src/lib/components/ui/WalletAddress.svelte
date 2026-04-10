<script lang="ts">
	let {
		address,
		truncate = true,
		copyable = false,
		class: className = ''
	}: {
		address: string;
		truncate?: boolean;
		copyable?: boolean;
		class?: string;
	} = $props();

	let copied = $state(false);

	function truncateAddress(addr: string): string {
		return addr.slice(0, 6) + '…' + addr.slice(-4);
	}

	async function copy() {
		await navigator.clipboard.writeText(address);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<span class="inline-flex items-start gap-1.5 font-mono {className}">
	{#if copyable}
		<button
			onclick={copy}
			class="mt-0.5 shrink-0 cursor-pointer text-muted transition-colors hover:text-default"
			aria-label="Copy wallet address"
			title={copied ? 'Copied!' : 'Copy address'}
		>
			{#if copied}
				<svg class="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			{:else}
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
				</svg>
			{/if}
		</button>
	{/if}
	<span class="select-all {truncate ? '' : 'break-all'}">{truncate ? truncateAddress(address) : address}</span>
</span>
