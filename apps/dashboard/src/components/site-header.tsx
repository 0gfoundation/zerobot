'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
	ShellProvider,
	ShellScroll,
	SiteHeader as ShellHeader,
	type ShellLinkItem,
	type ShellLinkProps
} from '@0gfoundation/0g-ui/shell';
import { LOCAL_MODE } from '@/lib/mode';
import { WalletControls } from './wallet-controls';

const ITEMS: ShellLinkItem[] = [
	{ href: '/', label: 'My robots' },
	...(LOCAL_MODE ? [{ href: '/recordings', label: 'Recordings' }] : []),
	{ href: 'https://faucet.0g.ai', label: 'Faucet', external: true }
];

// The router for this app's own pages; a plain anchor for an absolute URL
function NextLink({ href, ...props }: ShellLinkProps) {
	if (/^https?:\/\//.test(href)) return <a href={href} {...props} />;
	return <Link href={href} {...props} />;
}

export function SiteHeader() {
	return (
		<ShellProvider Link={NextLink} pathname={usePathname()}>
			<ShellHeader
				product="Robots"
				items={ITEMS}
				navLabel="Main"
				controls={<WalletControls />}
				collapse="md"
				menu={{ label: 'Menu', closeLabel: 'Close menu' }}
			/>
			<ShellScroll collapse="md" />
		</ShellProvider>
	);
}
