<script lang="ts">
	import { wallet } from '$lib/stores/wallet.svelte';
	import { network } from '$lib/stores/network.svelte';
	import ConnectWallet from './ConnectWallet.svelte';
	import NetworkSwitcher from './NetworkSwitcher.svelte';
	import WalletAddress from './ui/WalletAddress.svelte';

	let open = $state(false);
	let dropdownEl = $state<HTMLElement | null>(null);

	function handleWindowPointerDown(e: PointerEvent) {
		if (!open) return;
		const target = e.target as HTMLElement;
		if (dropdownEl && !dropdownEl.contains(target)) {
			open = false;
		}
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<header class="border-b border-line bg-surface-secondary">
	<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
		<nav class="flex items-baseline gap-5">
			<a href="/" class="text-lg font-bold text-accent">Zerobot</a>
			<a href="/recordings" class="text-sm text-secondary transition hover:text-default">Recordings</a>
		</nav>

		<div class="flex items-center gap-3">
			<NetworkSwitcher />

			<div class="relative" bind:this={dropdownEl}>
				{#if wallet.status === 'reconnecting'}
					<!-- Hydrating previous session — render nothing to avoid flash -->
				{:else if wallet.connected}
					<button
						onclick={() => (open = !open)}
						class="flex items-center gap-2 rounded-lg border border-line bg-surface-tertiary px-3 py-2 text-sm transition hover:bg-surface-hover"
					>
						<span class="h-2 w-2 rounded-full bg-success"></span>
						<WalletAddress address={wallet.address!} class="text-sm text-secondary" />
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
				{:else}
					<button
						onclick={() => (open = true)}
						class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent-hover"
					>
						Connect Wallet
					</button>
				{/if}

				{#if open}
					<div
						class="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-line bg-surface-secondary p-4 shadow-lg shadow-black/40"
					>
						{#if wallet.connected}
							<div class="mb-3">
								<span class="text-xs font-semibold tracking-wider uppercase text-muted"
									>Connected</span
								>
								<div class="mt-1">
									<WalletAddress
										address={wallet.address!}
										truncate={false}
										copyable
										class="text-sm text-accent"
									/>
								</div>
								<div class="mt-1 text-xs text-muted">{network.chain.name}</div>
							</div>
							<button
								onclick={() => {
									wallet.disconnect();
									open = false;
								}}
								class="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-secondary transition hover:bg-surface-hover"
							>
								Disconnect
							</button>
						{:else}
							<ConnectWallet onconnected={() => (open = false)} />
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</header>
