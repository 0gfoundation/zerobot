'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConfig, useConnect, useConnection, useConnectors, type Connector } from 'wagmi';
import { reconnect } from 'wagmi/actions';
import { renderSVG } from 'uqr';
import { defaultNetwork } from '@/lib/networks';
import {
	METAMASK,
	rememberWcWallet,
	storePlatform,
	visibleWalletCount,
	walletDeepLink,
	walletIcon,
	walletRank,
	walletsNotAnnounced,
	type WcWallet
} from './wallets';

/**
 * The connect modal, after 0g-hub's (`components/wallet/wallet-modal.tsx`
 * there), kept to what this app needs: EVM only, 0G only, English only.
 * The API is the hub's, `WalletModalProvider` and `useWalletModal().open()`,
 * so moving to the hub's modal once it is a shared package changes the
 * provider and the import, not the pages.
 */

const WalletModalContext = createContext<{ open(): void } | null>(null);

export function useWalletModal() {
	const context = useContext(WalletModalContext);
	if (!context) throw new Error('useWalletModal needs a WalletModalProvider');
	return context;
}

export function WalletModalProvider({ children }: { children: ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);
	const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);
	return (
		<WalletModalContext.Provider value={value}>
			{children}
			{/* Mounted only while open, so every open starts fresh and closing ends its pairing */}
			{isOpen && <WalletModal onClose={() => setIsOpen(false)} />}
		</WalletModalContext.Provider>
	);
}

/** The slice of the WalletConnect provider the modal reads */
interface WcProvider {
	session?: unknown;
	disconnect?: () => Promise<void>;
	on(event: 'display_uri', listener: (uri: string) => void): void;
	removeListener(event: 'display_uri', listener: (uri: string) => void): void;
	signer?: { client?: { core?: { relayer?: { restartTransport?: () => Promise<void> } } } };
}

/** No URI this long after a tap means the relay's websocket never connected */
const PAIRING_TIMEOUT_MS = 15_000;

const rowFrame =
	'flex h-[52px] w-full cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 text-left text-sm font-medium transition-colors hover:bg-ink/5';
const foldFrame =
	'flex w-full cursor-pointer items-center justify-between rounded-2xl border border-dashed border-line px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5';

function isRejection(err: unknown): boolean {
	const e = err as { name?: string; code?: number; message?: string } | undefined;
	return (
		e?.name === 'UserRejectedRequestError' || e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '')
	);
}

function WalletModal({ onClose }: { onClose: () => void }) {
	const config = useConfig();
	const connectors = useConnectors();
	const { status } = useConnection();
	const connect = useConnect();
	const dialog = useRef<HTMLDialogElement>(null);

	const [isTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);
	const [platform] = useState(() => storePlatform(navigator.userAgent));
	const [view, setView] = useState<'list' | 'qr'>('list');
	const [wcUri, setWcUri] = useState<string | null>(null);
	const [tapped, setTapped] = useState<string | null>(null);
	const [showAll, setShowAll] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const [copied, setCopied] = useState(false);

	/** Which WalletConnect path the user chose, read by the URI listener */
	const wcChoice = useRef<WcWallet | 'qr' | null>(null);
	const pairing = useRef(false);
	const metaMaskPending = useRef(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cleanups = useRef<(() => void)[]>([]);

	const metaMask = connectors.find((c) => c.type === 'metaMask');
	const wc = connectors.find((c) => c.type === 'walletConnect');
	const injectedIds = connectors.filter((c) => c.type === 'injected').map((c) => c.id);
	// Browser wallets that announced themselves, on the hub's allowlist and
	// in its order. MetaMask is its own row through the SDK.
	const announced = connectors
		.filter((c) => c.type === 'injected' && walletRank(c.id) > 0)
		.sort((a, b) => walletRank(a.id) - walletRank(b.id));
	// The generic fallback, for a wallet older than EIP-6963, only when
	// nothing announced and a non-MetaMask provider exists
	const ethereum = (window as { ethereum?: { isMetaMask?: boolean } }).ethereum;
	const generic =
		announced.length === 0 && ethereum && !ethereum.isMetaMask
			? connectors.find((c) => c.id === 'injected')
			: undefined;
	const phoneWallets = isTouch && wc ? walletsNotAnnounced(injectedIds) : [];
	const visible = showAll ? phoneWallets.length : visibleWalletCount(phoneWallets.length);

	useEffect(() => {
		dialog.current?.showModal();
		return () => {
			for (const cleanup of cleanups.current) cleanup();
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	// Any connection, however it settles, ends the modal
	useEffect(() => {
		if (status === 'connected') onClose();
	}, [status, onClose]);

	// On a phone the pairing starts with the open, so each wallet row has
	// its link in hand and opens it inside the tap's own gesture. Not while
	// wagmi restores a session: ending a stale session would end that one.
	useEffect(() => {
		if (isTouch && wc && status !== 'reconnecting') void beginPairing(wc);
		// Once per open
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function clearTimer() {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
	}

	/**
	 * Create the WalletConnect pairing through wagmi's connect, so wagmi owns
	 * the attempt. One at a time: the SDK drops the previous pairing when a
	 * new one starts, which would kill the URI a row already holds.
	 */
	async function beginPairing(connector: Connector) {
		if (pairing.current) return;
		pairing.current = true;
		const provider = (await connector.getProvider()) as WcProvider;
		// A session the provider kept that wagmi doesn't hold isn't one the
		// user made here, and connect would adopt it without a tap
		if (provider.session) await provider.disconnect?.().catch(() => {});
		const onUri = (uri: string) => {
			clearTimer();
			setWcUri(uri);
			// A row tapped before the relay answered opens now. Outside the
			// gesture iOS may open it as a page, so the row stays a live link.
			const choice = wcChoice.current;
			if (choice && choice !== 'qr') window.location.assign(walletDeepLink(choice, uri));
		};
		provider.on('display_uri', onUri);
		cleanups.current.push(() => provider.removeListener('display_uri', onUri));
		connect.mutate(
			// chainId lands the wallet on 0G inside its own connect prompt
			{ connector, chainId: defaultNetwork.chain.id },
			{
				onError: (err) => {
					pairing.current = false;
					setWcUri(null);
					// Nobody chose WalletConnect: the proposal expired under an idle modal
					if (wcChoice.current === null) return;
					wcChoice.current = null;
					setTapped(null);
					setError(isRejection(err) ? DECLINED : FAILED);
				}
			}
		);
	}

	/**
	 * Tapping a wallet link foregrounds the wallet and the OS suspends this
	 * tab with its relay socket, so the approval can arrive while the socket
	 * is dead and connect never resolves. On wake, restart the transport and
	 * adopt a settled session with a targeted reconnect.
	 */
	async function armWake(connector: Connector) {
		const provider = (await connector.getProvider()) as WcProvider;
		const wake = () => {
			if (document.visibilityState !== 'visible') return;
			void provider.signer?.client?.core?.relayer?.restartTransport?.().catch(() => {});
			let tries = 0;
			const adopt = () => {
				if (config.state.status === 'connected') return;
				if (provider.session) {
					void reconnect(config, { connectors: [connector] });
					return;
				}
				// The session can settle a few seconds after the restart
				if (++tries < 6) setTimeout(adopt, 1000);
			};
			setTimeout(adopt, 800);
		};
		document.addEventListener('visibilitychange', wake);
		window.addEventListener('focus', wake);
		cleanups.current.push(() => {
			document.removeEventListener('visibilitychange', wake);
			window.removeEventListener('focus', wake);
		});
	}

	/**
	 * The MetaMask SDK refuses a second connect while one is pending over its
	 * phone transport, and the pending one only ends with the app's answer,
	 * which never comes without the app. Disconnecting resets it.
	 */
	async function dropMetaMaskLink() {
		if (!metaMaskPending.current || !metaMask) return;
		metaMaskPending.current = false;
		await metaMask.disconnect().catch(() => {});
	}

	/** A wallet with its own prompt: MetaMask or a browser extension */
	async function start(connector: Connector) {
		setError(null);
		setTimedOut(false);
		setTapped(connector.id);
		wcChoice.current = null;
		rememberWcWallet(null);
		await dropMetaMaskLink();
		if (connector.type === 'metaMask' && isTouch) metaMaskPending.current = true;
		connect.mutate(
			{ connector, chainId: defaultNetwork.chain.id },
			{
				onError: (err) => {
					metaMaskPending.current = false;
					setTapped(null);
					setError(isRejection(err) ? DECLINED : FAILED);
				}
			}
		);
	}

	/** A WalletConnect choice: a phone wallet's row, or the desktop QR */
	function chooseWc(choice: WcWallet | 'qr') {
		if (!wc) return;
		setError(null);
		setTimedOut(false);
		wcChoice.current = choice;
		void dropMetaMaskLink();
		if (choice === 'qr') {
			setView('qr');
		} else {
			setTapped(choice.id);
			rememberWcWallet(choice);
			void armWake(wc);
		}
		if (!pairing.current) void beginPairing(wc);
		if (wcUri === null && timer.current === null) {
			timer.current = setTimeout(() => {
				timer.current = null;
				if (config.state.status === 'connected') return;
				for (const cleanup of cleanups.current) cleanup();
				cleanups.current = [];
				pairing.current = false;
				wcChoice.current = null;
				setTapped(null);
				setTimedOut(true);
			}, PAIRING_TIMEOUT_MS);
		}
	}

	function close() {
		dialog.current?.close();
	}

	const pendingTag = (label: string) => (
		<span className="inline-flex shrink-0 items-center gap-2 text-xs font-normal text-ink-soft">
			<Spinner />
			{label}
		</span>
	);

	const extensionRow = (connector: Connector, name = connector.name) => (
		<li key={connector.id}>
			<button type="button" className={rowFrame} onClick={() => start(connector)}>
				<WalletMark icon={walletIcon(name, connector.icon)} />
				<span className="min-w-0 flex-1 truncate">{name}</span>
				{tapped === connector.id && pendingTag(isTouch ? `Opening ${name}` : 'Check your wallet')}
			</button>
			{/* A phone's MetaMask tap is a private-scheme link, silent without the app */}
			{isTouch && platform && tapped === connector.id && connector.type === 'metaMask' && (
				<StoreLink name={METAMASK.name} href={METAMASK.store[platform]} />
			)}
		</li>
	);

	const phoneRow = (wallet: WcWallet) => {
		const body = (
			<>
				<WalletMark icon={wallet.icon} />
				<span className="min-w-0 flex-1 truncate">{wallet.name}</span>
				{tapped === wallet.id && pendingTag(`Opening ${wallet.name}`)}
			</>
		);
		return (
			<li key={wallet.id}>
				{wcUri ? (
					// A real link, so the tap's own gesture opens the app
					<a href={walletDeepLink(wallet, wcUri)} className={rowFrame} onClick={() => chooseWc(wallet)}>
						{body}
					</a>
				) : (
					<button type="button" className={rowFrame} onClick={() => chooseWc(wallet)}>
						{body}
					</button>
				)}
				{platform && tapped === wallet.id && <StoreLink name={wallet.name} href={wallet.store[platform]} />}
			</li>
		);
	};

	return (
		<dialog
			ref={dialog}
			onClose={onClose}
			onClick={(e) => {
				// A click on the backdrop lands on the dialog element itself
				if (e.target === dialog.current) close();
			}}
			className="m-auto flex max-h-[90vh] w-[26rem] supports-[height:100dvh]:max-h-[90dvh] max-w-[90vw] flex-col rounded-[32px] border border-line bg-bg p-0 text-ink shadow-xl backdrop:bg-ink/24 [&:not([open])]:hidden"
		>
			<div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4">
				<div className="flex min-w-0 items-center gap-3">
					{view === 'qr' && (
						<button type="button" aria-label="Back" onClick={() => setView('list')} className={roundButton}>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
								<path d="M8.5 3 4.5 7l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</button>
					)}
					<h2 className="truncate text-xl font-medium">{view === 'qr' ? 'Scan to connect' : 'Connect a wallet'}</h2>
				</div>
				<button type="button" aria-label="Close" onClick={close} className={roundButton}>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
						<path d="M3.5 3.5 10.5 10.5 M10.5 3.5 3.5 10.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
					</svg>
				</button>
			</div>

			{/* flex-auto, not flex-1: older WebKit (Safari, and Chrome on iOS) collapses a
			    zero-basis child of a column whose height comes from its content, which left
			    only the title and a sliver of the first wallet visible */}
			<div className="min-h-0 flex-auto overflow-y-auto px-6 pb-6">
				{view === 'qr' ? (
					<div className="flex flex-col items-center gap-4">
						{wcUri ? (
							<>
								<div
									className="w-56 rounded-2xl border border-line bg-white p-3 [&>svg]:h-full [&>svg]:w-full"
									dangerouslySetInnerHTML={{ __html: renderSVG(wcUri, { border: 0 }) }}
								/>
								<p className="text-center text-xs text-ink-soft">
									Open your wallet app and scan the code, or copy the link to paste into a wallet on this device.
								</p>
								<button
									type="button"
									className="flex h-11 w-full cursor-pointer items-center justify-center rounded-full border border-line text-sm font-medium transition-colors hover:bg-ink/5"
									onClick={() => {
										void navigator.clipboard.writeText(wcUri);
										setCopied(true);
									}}
								>
									{copied ? 'Copied' : 'Copy link'}
								</button>
							</>
						) : timedOut ? null : (
							<div className="flex size-56 items-center justify-center rounded-2xl border border-line">
								<Spinner />
							</div>
						)}
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{metaMask && extensionRow(metaMask, METAMASK.name)}
						{announced.map((c) => extensionRow(c))}
						{generic && extensionRow(generic, 'Browser wallet')}
						{phoneWallets.slice(0, visible).map(phoneRow)}
						{visible < phoneWallets.length && (
							<li>
								<button type="button" className={foldFrame} onClick={() => setShowAll(true)}>
									Other wallets ({phoneWallets.length - visible})
									<span aria-hidden className="text-ink-muted">
										›
									</span>
								</button>
							</li>
						)}
						{!isTouch && wc && (
							<li>
								<button type="button" className={rowFrame} onClick={() => chooseWc('qr')}>
									<span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-xs text-ink-soft">
										QR
									</span>
									<span className="min-w-0 flex-1 truncate">WalletConnect</span>
								</button>
							</li>
						)}
					</ul>
				)}

				{error && (
					<p className="mt-3 text-xs text-ink-soft" role="status">
						{error}
					</p>
				)}
				{timedOut && (
					<p className="mt-3 text-xs leading-relaxed text-ink-soft" role="status">
						Couldn&apos;t reach the WalletConnect network. Check your connection: some ad blockers and network
						filters block it. Pick a wallet to retry.
					</p>
				)}
			</div>
		</dialog>
	);
}

const DECLINED = 'Connection declined in the wallet. Pick a wallet to try again.';
const FAILED = 'Couldn’t open that wallet connection. Try again.';

const roundButton =
	'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-ink-soft shadow-sm transition-colors hover:text-ink';

function WalletMark({ icon }: { icon?: string }) {
	return icon ? (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={icon} alt="" className="size-7 shrink-0 rounded-lg" />
	) : (
		<span aria-hidden className="size-7 shrink-0 rounded-lg bg-ink/5" />
	);
}

/** Under a tapped row: a private scheme without its app opens nothing, so offer the store */
function StoreLink({ name, href }: { name: string; href: string }) {
	const host = new URL(href).hostname;
	const label =
		host === 'apps.apple.com' || host === 'itunes.apple.com'
			? `Get ${name} on the App Store`
			: host === 'play.google.com'
				? `Get ${name} on Google Play`
				: `Download ${name}`;
	return (
		<div className="mt-2 flex flex-col gap-2.5 rounded-2xl bg-ink/5 px-4 pt-3 pb-3.5">
			<p className="text-[13px] leading-relaxed text-ink-soft">
				Nothing opened? {name} is probably not installed on this device.
			</p>
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="flex h-10 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-on-ink transition-colors hover:bg-ink/80"
			>
				{label}
				<span aria-hidden>↗</span>
			</a>
		</div>
	);
}

function Spinner() {
	return (
		<span
			aria-hidden
			className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
		/>
	);
}
