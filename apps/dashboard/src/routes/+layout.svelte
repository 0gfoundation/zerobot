<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();
</script>

<div class="flex min-h-screen flex-col font-sans">
	<Header />
	<main class="flex-1">
		{@render children()}
	</main>
</div>
