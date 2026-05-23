import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// `@0glabs/0g-serving-broker` is an optional peer dep of the SDK reached
	// only via a dynamic import inside `AIBroker.initialize()`. The dashboard
	// doesn't call that path, but importing anything from the SDK root barrel
	// puts it in the dep graph. Exclude it from dev dep-optimization, and keep
	// it externalized from the production bundle.
	optimizeDeps: {
		exclude: ['@0glabs/0g-serving-broker']
	},
	build: {
		rollupOptions: {
			external: ['@0glabs/0g-serving-broker']
		}
	}
});
