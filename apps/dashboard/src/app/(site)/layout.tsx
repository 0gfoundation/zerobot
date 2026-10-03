import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site-header';

export default function SiteLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<SiteHeader />
			<main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16">{children}</main>
		</>
	);
}
