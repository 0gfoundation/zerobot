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

/**
 * The shell's lockup (lockup.tsx in 0g-ui) with "Zerobot" as the name,
 * "Zero" in the brand purple. The shell's `product` only takes a string.
 * Sizes follow the package's `collapse="md"` classes.
 */
function Lockup() {
	return (
		<Link
			href="/"
			aria-label="Zerobot"
			className="flex shrink-0 items-center gap-2 rounded-[4px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:gap-3"
		>
			<svg viewBox="0 9 160 78" className="h-[23px] w-[48px] md:h-[31px] md:w-[64px]" fill="currentColor" aria-hidden>
				<path d="M12.7564 76.599C27.9701 90.3547 51.4889 89.9098 66.166 75.2651C81.302 60.1612 81.302 35.6736 66.166 20.5697C51.0293 5.4662 26.4887 5.4662 11.3523 20.5697C-2.85916 34.7506 -3.72755 57.2033 8.747 72.3955L21.1931 59.9763C15.4656 51.6888 16.2964 40.2495 23.6854 32.8765C32.0103 24.5694 45.5079 24.5694 53.8332 32.8765C62.1575 41.1836 62.1575 54.6519 53.8332 62.9589C47.4416 69.3364 38.0017 70.8179 30.1942 67.4029L51.0922 46.5499L46.9813 42.4482L12.7564 76.599Z" />
				<path d="M160 49.967C158.99 70.4282 142.045 86.7085 121.288 86.7085C99.8824 86.7085 82.5293 69.3927 82.5293 48.0328C82.5293 26.6729 99.8824 9.35762 121.288 9.35762C141.386 9.35762 157.912 24.6218 159.857 44.1657H142.255C140.432 34.2641 131.738 26.7618 121.289 26.7618C109.515 26.7618 99.9709 36.2851 99.9709 48.0328C99.9709 59.7812 109.515 69.3046 121.289 69.3046C130.327 69.3046 138.052 63.6914 141.153 55.7684H111.598V49.967H160Z" />
			</svg>
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
