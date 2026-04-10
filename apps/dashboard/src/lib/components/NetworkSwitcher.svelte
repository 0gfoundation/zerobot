<script lang="ts">
	import { network } from '$lib/stores/network.svelte';
	import { networks } from '$lib/networks';

	let open = $state(false);
	let dropdownEl = $state<HTMLElement | null>(null);

	const allNetworks = Object.values(networks);

	function handleWindowPointerDown(e: PointerEvent) {
		if (!open) return;
		const target = e.target as HTMLElement;
		if (dropdownEl && !dropdownEl.contains(target)) {
			open = false;
		}
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<div class="relative" bind:this={dropdownEl}>
	<button
		onclick={() => (open = !open)}
		class="flex items-center gap-2 rounded-lg border border-line bg-surface-tertiary px-3 py-2 text-sm transition hover:bg-surface-hover"
	>
		<span class="h-2 w-2 rounded-full {network.chain.testnet ? 'bg-warning' : 'bg-success'}"></span>
		<span class="text-secondary">{network.chain.name}</span>
		<svg
			class="h-4 w-4 text-muted transition {open ? 'rotate-180' : ''}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if open}
		<div
			class="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface-secondary p-2 shadow-lg shadow-black/40"
		>
			{#each allNetworks as net}
				{@const isSelected = net.chain.id === network.chainId}
				<button
					onclick={() => {
						network.switchTo(net.chain.id);
						open = false;
					}}
					class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition
						{isSelected ? 'bg-surface-hover text-default' : 'text-secondary hover:bg-surface-hover'}"
				>
					<span class="h-2 w-2 rounded-full {net.chain.testnet ? 'bg-warning' : 'bg-success'}"></span>
					<span class="flex-1">{net.chain.name}</span>
					{#if isSelected}
						<svg class="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
