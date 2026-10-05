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
import { ThemeButton } from '@0gfoundation/0g-ui/theme';
import { LOCAL_MODE } from '@/lib/mode';
import { WalletControls } from './wallet-controls';
import { ZeroGMark } from './zero-g-mark';

const ITEMS: ShellLinkItem[] = [
	{ href: '/robots', label: 'My robots' },
	...(LOCAL_MODE ? [{ href: '/recordings', label: 'Recordings' }] : []),
	{ href: 'https://faucet.0g.ai', label: 'Faucet', external: true },
	// Where builders go from the public site; a local dashboard runs from the repo already
	...(LOCAL_MODE ? [] : [{ href: 'https://github.com/0gfoundation/zerobot', label: 'SDK', external: true }])
];

// The router for this app's own pages; a plain anchor for an absolute URL
function NextLink({ href, ...props }: ShellLinkProps) {
	if (/^https?:\/\//.test(href)) return <a href={href} {...props} />;
	return <Link href={href} {...props} />;
}

/**
 * The shell's lockup (lockup.tsx in 0g-ui) with "Zerobot" as the name,
 * "Zero" in the brand purple. The shell's `product` only takes a string.
 * Sizes follow the package's `collapse="md"` classes.
 */
function Lockup() {
	return (
		<Link
			href="/robots"
			aria-label="Zerobot"
			className="flex shrink-0 items-center gap-2 rounded-[4px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:gap-3"
		>
			<ZeroGMark className="h-[23px] w-[48px] md:h-[31px] md:w-[64px]" />
			<span aria-hidden className="hidden h-[30px] w-px bg-lockup-rule md:block" />
			<span
				aria-hidden
				className="text-[14px] leading-[20px] font-bold whitespace-nowrap [text-box:trim-both_cap_alphabetic] md:text-[16px] md:leading-[22px]"
			>
				<span className="text-brand-900">Zero</span>bot
			</span>
		</Link>
	);
}

export function SiteHeader() {
	return (
		<ShellProvider Link={NextLink} pathname={usePathname()}>
			<ShellHeader
				logo={<Lockup />}
				items={ITEMS}
				navLabel="Main"
				controls={
					<div className="flex items-center gap-2">
						<ThemeButton toDarkLabel="Switch to dark mode" toLightLabel="Switch to light mode" />
						<WalletControls />
					</div>
				}
				collapse="md"
				menu={{ label: 'Menu', closeLabel: 'Close menu' }}
			/>
			<ShellScroll collapse="md" />
		</ShellProvider>
	);
}
