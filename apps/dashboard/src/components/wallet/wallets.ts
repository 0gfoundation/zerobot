/**
 * The wallets the connect modal offers, after 0g-hub's measured lists
 * (`components/wallet/wc-links.ts` and `connectors.ts` there). A wallet is
 * listed only if it reaches 0G with no manual step. Keep these in step
 * with the hub until the hub's modal is a shared package.
 */

/** A wallet reached over WalletConnect on a phone, by its own app's link. */
export interface WcWallet {
	id: string;
	name: string;
	icon: string;
	/** The app's WalletConnect link; the pairing URI is appended, encoded */
	link: string;
	/** Its EIP-6963 rdns root, if it announces one. A page where it did already has its row. */
	rdns?: string;
	/** Where the app is when a tap opens nothing */
	store: { ios: string; android: string };
}

/** MetaMask first, then the wallets with 0G built in, as the hub orders them. */
export const WC_WALLETS: readonly WcWallet[] = [
	{
		id: 'rabby',
		name: 'Rabby',
		icon: '/wallets/rabby.png',
		rdns: 'io.rabby',
		link: 'rabby://wc?uri=',
		store: {
			ios: 'https://apps.apple.com/us/app/rabby-wallet-crypto-evm/id6474381673',
			android: 'https://play.google.com/store/apps/details?id=com.debank.rabbymobile'
		}
	},
	{
		id: 'okx',
		name: 'OKX Wallet',
		icon: '/wallets/okx.png',
		rdns: 'com.okex.wallet',
		link: 'okex://main/wc?uri=',
		store: {
			ios: 'https://apps.apple.com/us/app/okx-buy-bitcoin-eth-crypto/id1327268470',
			android: 'https://play.google.com/store/apps/details?id=com.okinc.okex.gp'
		}
	},
	{
		id: 'bitget',
		name: 'Bitget Wallet',
		icon: '/wallets/bitget.png',
		rdns: 'com.bitget',
		link: 'bitkeep://wc?uri=',
		store: {
			ios: 'https://web3.bitget.com/en/wallet-download?type=0',
			android: 'https://web3.bitget.com/en/wallet-download?type=0'
		}
	},
	{
		id: 'zerion',
		name: 'Zerion',
		icon: '/wallets/zerion.png',
		rdns: 'io.zerion',
		link: 'zerion://wc?uri=',
		store: {
			ios: 'https://apps.apple.com/app/id1456732565',
			android: 'https://play.google.com/store/apps/details?id=io.zerion.android'
		}
	},
	{
		id: 'safepal',
		name: 'SafePal',
		icon: '/wallets/safepal.png',
		rdns: 'com.safepal',
		link: 'safepalwallet://wc?uri=',
		store: {
			ios: 'https://apps.apple.com/app/safepal-wallet/id1548297139',
			android: 'https://play.google.com/store/apps/details?id=io.safepal.wallet'
		}
	},
	{
		id: 'ledger',
		name: 'Ledger Wallet',
		icon: '/wallets/ledger.png',
		link: 'ledgerlive://wc?uri=',
		store: {
			ios: 'https://itunes.apple.com/app/id1361671700',
			android: 'https://play.google.com/store/apps/details?id=com.ledger.live'
		}
	}
];

export const METAMASK = {
	name: 'MetaMask',
	icon: '/wallets/metamask.svg',
	store: {
		ios: 'https://apps.apple.com/us/app/metamask/id1438144202',
		android: 'https://play.google.com/store/apps/details?id=io.metamask'
	}
} as const;

/** Browser wallets offered when they announce themselves (EIP-6963), by rdns root, in order */
export const WALLET_ORDER = [
	'io.metamask',
	'io.rabby',
	'com.okex.wallet',
	'com.bitget',
	'io.zerion',
	'com.coinbase',
	'com.safepal',
	'com.trustwallet',
	'pro.tokenpocket',
	'me.rainbow',
	'com.fordefi'
] as const;

/** The rank of an announced wallet, or -1 if it isn't one we offer. In-app browsers announce variants like `io.metamask.mobile`. */
export function walletRank(rdns: string): number {
	return WALLET_ORDER.findIndex((root) => rdns === root || rdns.startsWith(`${root}.`));
}

/** Logos for wallets we know by name, so every surface draws the same art */
export function walletIcon(name: string, announced?: string): string | undefined {
	const known = [METAMASK, ...WC_WALLETS].find((w) => w.name.toLowerCase() === name.trim().toLowerCase());
	return known?.icon ?? announced;
}

/** The phone wallets that didn't announce themselves on this page */
export function walletsNotAnnounced(announced: readonly string[]): WcWallet[] {
	return WC_WALLETS.filter(
		(w) => w.rdns === undefined || !announced.some((id) => id === w.rdns || id.startsWith(`${w.rdns}.`))
	);
}

/** Five or fewer all show; more show four and fold the rest, so the fold never hides just one */
export function visibleWalletCount(total: number): number {
	return total <= 5 ? total : 4;
}

/** The wc: URI carries its own @, ?, & and =, so it must be fully encoded */
export function walletDeepLink(wallet: WcWallet, wcUri: string): string {
	return `${wallet.link}${encodeURIComponent(wcUri)}`;
}

export function storePlatform(userAgent: string): 'ios' | 'android' | null {
	if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
	if (/Android/i.test(userAgent)) return 'android';
	return null;
}

/**
 * The WalletConnect SDK reads this key on each later request (a switch, a
 * signature) and opens the stored wallet, so the app comes forward with the
 * prompt. Reown's AppKit writes it when a wallet's link opens a connection;
 * a custom modal has to write it itself, or every request after connect
 * leaves the user to find the app.
 */
const WC_DEEPLINK_KEY = 'WALLETCONNECT_DEEPLINK_CHOICE';

export function rememberWcWallet(wallet: WcWallet | null): void {
	try {
		if (wallet === null) localStorage.removeItem(WC_DEEPLINK_KEY);
		else
			localStorage.setItem(
				WC_DEEPLINK_KEY,
				JSON.stringify({ href: wallet.link.slice(0, -'wc?uri='.length), name: wallet.name })
			);
	} catch {
		// Private windows, quota: the user opens the app themselves
	}
}
