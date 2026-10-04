'use client';

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatEther, parseEther } from 'viem';
import { useBalance, useConnection, useWalletClient } from 'wagmi';
import { CommandStatus, waitForReceipt, type ResolvedMenuItem } from '@0g-foundation/zerobot-sdk';
import { MoveReceipts, type ReceiptCard } from '@/components/move-receipts';
import { WalletControls } from '@/components/wallet-controls';
import { METAMASK } from '@/components/wallet/wallets';
import { FaucetStep } from '@/components/faucet-step';
import { MoveIcon } from '@/components/move-icon';
import { Notice } from '@/components/notice';
import { SwitchNetwork } from '@/components/switch-network';
import { errorMessage, readClient, walletClient } from '@/lib/chain';
import { defaultNetwork } from '@/lib/networks';
import { robotFamily } from '@/lib/robots';
import { receiptView, useMoveReceipts, type MoveReceipt } from '@/lib/move-receipts';
import { useQueue } from '@/lib/use-queue';
import { useQueuePaused } from '@/lib/use-queue-paused';
import { useRobot } from '@/lib/use-robot';
import { useRobotStatus, type LiveStatus } from '@/lib/use-robot-status';

const MAX_NOTE_BYTES = 64;
/** The move grid's size: "Coming soon" cards fill what the menu doesn't */
const MOVE_SLOTS = 6;
/** Headroom over the price for gas, so the transaction doesn't fail on fees */
const GAS_HEADROOM = parseEther('0.005');

const ONLINE: LiveStatus = { operatorOnline: true, robotOnline: true, battery: 82, lastSeen: 0 };

/**
 * Previews for each state, e.g. `?demo=offline`; a bare `?demo` is `online`.
 * Display only: paying still needs the robot to be online for real.
 */
const DEMO_STATES = {
	online: { status: ONLINE, paused: false, queuePaused: false },
	break: { status: ONLINE, paused: false, queuePaused: true },
	paused: { status: ONLINE, paused: true, queuePaused: false },
	reconnecting: { status: { ...ONLINE, robotOnline: false, battery: undefined }, paused: false, queuePaused: false },
	offline: {
		status: { operatorOnline: false, robotOnline: false, lastSeen: 0 },
		paused: false,
		queuePaused: false
	}
} satisfies Record<string, { status: LiveStatus; paused: boolean; queuePaused: boolean }>;
type DemoState = keyof typeof DEMO_STATES;
/** The demo's queue: the first is running, and one is "yours" */
const DEMO_QUEUE = ['Priya', 'Marcus', 'Aiko', 'Diego', 'Sam'];
const DEMO_MINE = 'Diego';

function isRejection(err: unknown): boolean {
	const e = err as { code?: unknown; message?: string } | undefined;
	return e?.code === 'ACTION_REJECTED' || e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '');
}

export default function RobotPage({ params }: { params: Promise<{ name: string }> }) {
	const { name } = use(params);
	const robot = useRobot(name, { live: true });
	const { address, chainId } = useConnection();
	const { data: wallet } = useWalletClient();
	const balance = useBalance({ address, chainId: defaultNetwork.chain.id, query: { refetchInterval: 4000 } });
	const { entries } = useQueue(robot.data?.robotId, { history: 50 });
	const status = useRobotStatus(robot.data?.robotId);
	const queuePaused = useQueuePaused(robot.data?.robotId).data ?? false;
	// Only take payment when the operator and robot are both up, or the move
	// would wait in the queue and expire, and the owner hasn't paused payments
	const paused = robot.data ? !robot.data.robot.publicCommands : false;
	const available = (status.data?.robotOnline ?? false) && !paused;

	const [note, setNote] = useState('');
	const [move, setMove] = useState<ResolvedMenuItem | null>(null);
	const { receipts, setReceipts, add, update, remove } = useMoveReceipts(robot.data?.robotId, entries);
	// null: open until the first payment, then collapsed under "New move"
	const [formOpen, setFormOpen] = useState<boolean | null>(null);
	const showForm = formOpen ?? receipts.length === 0;
	// Which request for a receipt is current, so a superseded one can't overwrite it
	const attempts = useRef(new Map<string, number>());
	const [now, setNow] = useState(() => Date.now());
	const [demo, setDemo] = useState<DemoState | null>(null);
	useEffect(() => {
		const value = new URLSearchParams(window.location.search).get('demo');
		if (value !== null) setDemo(value in DEMO_STATES ? (value as DemoState) : 'online');
	}, []);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const data = robot.data;
	const noteBytes = new TextEncoder().encode(note.trim()).length;
	const wrongChain = address && chainId !== defaultNetwork.chain.id;
	const enoughFunds = data && balance.data ? balance.data.value >= data.price + GAS_HEADROOM : false;

	const pending = entries.filter((e) => e.command.status === CommandStatus.Pending);
	const myNonces = new Set(receipts.map((r) => r.nonce).filter(Boolean));

	/**
	 * Ask the wallet to pay for a move. A new payment gets a receipt; a retry
	 * asks again for an existing one. The wallet can't take back the earlier
	 * request, so if both are confirmed the second gets its own receipt.
	 */
	async function pay(existing?: MoveReceipt) {
		if (!data || !wallet || !address) return;
		const apiId = existing?.apiId ?? move?.apiId;
		const name = existing?.note ?? note.trim();
		if (apiId === undefined) return;
		const id = existing?.id ?? crypto.randomUUID();
		if (existing) {
			update(id, { stage: 'signing', startedAt: Date.now(), error: undefined });
		} else {
			const fromNonce = String(await readClient().getRobotNonce(data.robotId));
			add({ id, apiId, note: name, sender: address, fromNonce, startedAt: Date.now(), stage: 'signing' });
			setFormOpen(false);
			setMove(null);
		}
		const attempt = (attempts.current.get(id) ?? 0) + 1;
		attempts.current.set(id, attempt);

		try {
			// The hash as soon as the wallet signs, rather than after the receipt
			const tx = await walletClient(wallet).dispatcher.dispatchCommand(data.robotId, apiId, '', name, {
				value: data.price
			});
			setReceipts((prev) => {
				const r = prev.find((x) => x.id === id);
				if (r?.txHash && r.txHash !== tx.hash) {
					return [
						{ ...r, id: crypto.randomUUID(), txHash: tx.hash, stage: 'sent', nonce: undefined, startedAt: Date.now(), error: undefined },
						...prev
					];
				}
				return prev.map((x) =>
					x.id === id ? { ...x, txHash: tx.hash, stage: x.nonce ? x.stage : 'sent', error: undefined } : x
				);
			});
			// A reverted payment never reaches the queue, so say so
			waitForReceipt(tx).catch((err) =>
				setReceipts((prev) =>
					prev.map((x) =>
						x.txHash === tx.hash && !x.nonce ? { ...x, stage: 'failed', error: errorMessage(err) } : x
					)
				)
			);
		} catch (err) {
			if (attempts.current.get(id) !== attempt) return;
			setReceipts((prev) =>
				prev.map((x) =>
					x.id === id && !x.txHash && !x.nonce
						? { ...x, stage: isRejection(err) ? 'rejected' : 'failed', error: errorMessage(err) }
						: x
				)
			);
		}
	}

	if (robot.isPending) return <p className="text-ink-muted">Loading…</p>;
	if (robot.error) return <p className="text-danger">Couldn&apos;t load this robot: {robot.error.message}</p>;
	if (!data) return <p>No robot called “{name}”.</p>;

	const displayName = data.displayName;
	const stepsDone = [
		Boolean(address) && !wrongChain,
		enoughFunds,
		noteBytes > 0 && noteBytes <= MAX_NOTE_BYTES,
		Boolean(move)
	];
	const activeStep = stepsDone.indexOf(false);

	// What the page shows about the robot: its real state, or a `?demo=` preview
	const shown = demo ? DEMO_STATES[demo] : { status: status.data, paused, queuePaused };
	const queueRows = pending.map((e) => ({
		key: String(e.command.nonce),
		name: e.command.note || 'Anonymous',
		apiId: e.command.apiId,
		mine: myNonces.has(String(e.command.nonce))
	}));
	const shownQueue =
		demo && shown.status?.robotOnline && queueRows.length === 0
			? DEMO_QUEUE.map((name, i) => ({
					key: `demo-${i}`,
					name,
					apiId: data.menu[i % data.menu.length].apiId,
					mine: name === DEMO_MINE
				}))
			: queueRows;

	if (!data.robot.active || data.menu.length === 0) {
		return <p>{displayName} isn&apos;t taking requests right now.</p>;
	}

	return (
		<div className="mx-auto max-w-md">
			{/* The stage screen's look: the brand purple, the price badge, the live state */}
			<section className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-[#9200e1] to-[#b75fff] p-6 text-white shadow-[0_24px_60px_-24px_rgba(146,0,225,0.7)]">
				<div aria-hidden className="absolute -top-20 -right-16 -z-10 size-56 rounded-full bg-white/15 blur-3xl" />
				{robotFamily(data.robot.robotType) === 'go2' && (
					// A render of the stage's Go2 model, faint behind the text
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src="/images/go2.webp"
						alt=""
						className="pointer-events-none absolute -right-8 -bottom-6 -z-10 w-60 opacity-30 select-none"
					/>
				)}
				<StatusChip displayName={displayName} status={shown.status} paused={shown.paused} />
				<h1 className="mt-4 text-4xl font-bold tracking-tight">Make {displayName} move</h1>
				<p className="mt-2 text-white/85">
					Your name goes up on the big screen while {displayName} does your move.
				</p>
				<p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 whitespace-nowrap">
					<span className="text-3xl font-bold tabular-nums">{formatEther(data.price)} 0G</span>
					<span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-semibold">Testnet</span>
					<span className="text-lg font-medium text-white/85">/ per move</span>
				</p>
				{defaultNetwork.metaMaskOnly && (
					<p className="mt-3 flex items-center gap-2 text-sm font-medium text-white/90">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={METAMASK.icon} alt="" className="size-5" />
						Pay with MetaMask
					</p>
				)}
			</section>

			{shown.paused ? (
				<Notice tone="warning" title="Moves are paused" className="mt-4">
					Back soon. Moves already paid for still run.
				</Notice>
			) : (
				<Availability displayName={displayName} status={shown.status} className="mt-4" />
			)}

			{shown.queuePaused && !shown.paused && (
				<Notice tone="info" title={`${displayName} is taking a short break`} className="mt-4">
					You can still pay. Your move waits in line.
				</Notice>
			)}

			<MoveReceipts
				cards={receipts.map((receipt): ReceiptCard => {
					const item = data.menu.find((m) => m.apiId === receipt.apiId);
					return {
						receipt,
						view: receiptView(receipt, entries, now, displayName, queuePaused),
						icon: <MoveIcon robotType={data.robot.robotType} move={item} />,
						label: item?.label ?? 'Move'
					};
				})}
				onRetry={(id) => {
					const r = receipts.find((x) => x.id === id);
					if (r) void pay(r);
				}}
				onClose={remove}
				onClearCompleted={() =>
					setReceipts((prev) => prev.filter((r) => !receiptView(r, entries, now, displayName, queuePaused).terminal))
				}
			/>

			{!showForm ? (
				<button
					type="button"
					onClick={() => setFormOpen(true)}
					className="mt-4 flex w-full cursor-pointer items-center justify-between rounded-2xl border border-dashed border-brand-500/50 px-4 py-3 font-semibold text-brand-900 hover:bg-brand-500/10"
				>
					New move
					<span aria-hidden className="text-xl">+</span>
				</button>
			) : (
				<div className="mt-8">
				<Step n={1} title="Connect your wallet" done={stepsDone[0]} active={activeStep === 0} collapse>
					{!address && <WalletControls />}
					{wrongChain && <SwitchNetwork />}
				</Step>

				<Step n={2} title="Get testnet 0G" done={stepsDone[1]} active={activeStep === 1} collapse>
					{/* Only once step 1 is done: a wallet asked to sign before it's on the
					    network can lose the reply (MetaMask on a phone did) */}
					{address && !wrongChain && !enoughFunds && (
						<FaucetStep address={address} needed={data.price + GAS_HEADROOM} />
					)}
					{address && !wrongChain && balance.data && (
						<p className="mt-2 text-xs text-ink-muted">Balance: {formatEther(balance.data.value)} 0G</p>
					)}
				</Step>

				<Step n={3} title="Your name" done={stepsDone[2]} active={activeStep === 2}>
					<input
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Shown on the screen"
						maxLength={MAX_NOTE_BYTES}
						className="w-full rounded-xl border border-ink/15 bg-bg px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
					/>
					{noteBytes > MAX_NOTE_BYTES && <p className="mt-1 text-sm text-danger">That name is too long.</p>}
				</Step>

				<Step n={4} title="Pick a move" done={stepsDone[3]} active={activeStep === 3} last>
					<div className="grid grid-cols-2 gap-2">
						{data.menu.map((item) => (
							<button
								key={item.apiId}
								type="button"
								onClick={() => setMove(item)}
								aria-pressed={move?.apiId === item.apiId}
								className={`flex min-h-32 cursor-pointer flex-col rounded-2xl border p-3 text-left transition ${
									move?.apiId === item.apiId
										? 'border-brand-500 bg-brand-500/10 ring-1 ring-brand-500'
										: 'border-ink/10 hover:border-brand-500/50'
								}`}
							>
								<MoveIcon robotType={data.robot.robotType} move={item} variant="tile" />
								<span className="mt-2.5 text-xl leading-tight font-bold">{item.label}</span>
								<span className="mt-1 line-clamp-3 text-sm leading-snug text-ink-soft">{item.description}</span>
							</button>
						))}
						{Array.from({ length: Math.max(0, MOVE_SLOTS - data.menu.length) }, (_, i) => (
							<div
								key={`soon-${i}`}
								aria-hidden
								className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ink/15 p-3 text-center text-ink-muted"
							>
								<span className="text-2xl leading-none opacity-60">＋</span>
								<span className="text-sm font-medium">Coming soon</span>
							</div>
						))}
					</div>
				</Step>

				<div className="mt-6">
					<button
						type="button"
						onClick={() => pay()}
						className="flex h-14 w-full cursor-pointer items-center justify-center rounded-full bg-linear-to-br from-[#9200e1] to-[#b75fff] text-lg font-semibold text-white shadow-[0_12px_32px_-12px_rgba(146,0,225,0.8)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:from-ink/10 disabled:to-ink/10 disabled:text-ink-muted disabled:shadow-none"
						disabled={
							!available ||
							!wallet ||
							Boolean(wrongChain) ||
							!enoughFunds ||
							!move ||
							noteBytes === 0 ||
							noteBytes > MAX_NOTE_BYTES
						}
					>
						{shown.paused
							? 'Paused'
							: !shown.status
							? `Checking ${displayName}…`
							: shown.status.robotOnline
								? `Pay ${formatEther(data.price)} 0G`
								: shown.status.operatorOnline
									? `${displayName} is reconnecting…`
									: `${displayName} is offline`}
					</button>
				</div>
				</div>
			)}

			{shownQueue.length > 0 && (
				<section className="mt-8">
					<h2 className="flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-ink-muted uppercase">
						Up next
						<span className="rounded-full bg-ink/10 px-2 py-0.5 tracking-normal text-ink">{shownQueue.length}</span>
					</h2>
					<ol className="mt-3 space-y-1.5">
						{shownQueue.map((e, i) => {
							const item = data.menu.find((m) => m.apiId === e.apiId);
							return (
								<li
									key={e.key}
									className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
										i === 0 ? 'border-brand-500/50 bg-brand-500/10' : 'border-ink/10'
									}`}
								>
									<span
										className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold ${
											i === 0 ? 'bg-brand-500 text-white' : 'bg-ink/10 text-ink-muted'
										}`}
									>
										{i === 0 ? 'Now' : i + 1}
									</span>
									<span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
									{e.mine && (
										<span className="shrink-0 rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
											You
										</span>
									)}
									<span className="flex shrink-0 items-center gap-1.5 text-sm text-ink-muted">
										{item?.label} <MoveIcon robotType={data.robot.robotType} move={item} />
									</span>
								</li>
							);
						})}
					</ol>
				</section>
			)}
		</div>
	);
}

/** The hero's live state, as the stage shows it */
function StatusChip({
	displayName,
	status,
	paused
}: {
	displayName: string;
	status: LiveStatus | undefined;
	paused: boolean;
}) {
	const [dot, text] = paused
		? ['bg-amber-300', 'Paused']
		: !status
			? ['bg-white/60', `Checking ${displayName}…`]
			: status.robotOnline
				? ['bg-emerald-300', `${displayName} is online${status.battery === undefined ? '' : ` · battery ${status.battery}%`}`]
				: status.operatorOnline
					? ['bg-amber-300', `${displayName} is reconnecting`]
					: ['bg-red-300', `${displayName} is offline`];
	return (
		<p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
			<span className="relative flex size-2">
				{status?.robotOnline && !paused && (
					<span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${dot}`} />
				)}
				<span className={`relative inline-flex size-2 rounded-full ${dot}`} />
			</span>
			{text}
		</p>
	);
}

/** Whether the robot can take a move right now, shown before anyone starts */
function Availability({
	displayName,
	status,
	className
}: {
	displayName: string;
	status: LiveStatus | undefined;
	className?: string;
}) {
	// Online needs no notice: the hero's chip says so
	if (!status || status.robotOnline) return null;
	if (status.operatorOnline) {
		return (
			<Notice tone="warning" title={`${displayName} is reconnecting`} className={className}>
				Back in a moment. You can pay once {displayName} reconnects.
			</Notice>
		);
	}
	return (
		<Notice tone="warning" title={`${displayName} is offline`} className={className}>
			Get set up now and pay when {displayName} is back.
		</Notice>
	);
}

/**
 * One step of the form on a timeline: its number, and a line down to the
 * next step that fills in once this one is done.
 */
function Step({
	n,
	title,
	done,
	active,
	last = false,
	collapse = false,
	children
}: {
	n: number;
	title: string;
	done: boolean;
	/** The first step not done yet */
	active: boolean;
	last?: boolean;
	/** Hide the step's content once it's done */
	collapse?: boolean;
	children?: ReactNode;
}) {
	const showContent = !(done && collapse) && children;
	return (
		<section className={`relative flex gap-4 ${last ? '' : 'pb-7'}`}>
			{!last && (
				<span
					aria-hidden
					className={`absolute top-9 bottom-1 left-[15px] w-0.5 rounded-full transition-colors duration-500 ${
						done ? 'bg-brand-500' : 'bg-ink/10'
					}`}
				/>
			)}
			<span
				className={`relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-500 ${
					done
						? 'bg-brand-500 text-white'
						: active
							? 'bg-bg text-brand-900 ring-2 ring-brand-500'
							: 'bg-ink/10 text-ink-muted'
				}`}
			>
				{done ? '✓' : n}
			</span>
			<div className="min-w-0 flex-1">
				<h2 className={`flex h-8 items-center font-semibold ${done || active ? '' : 'text-ink-muted'}`}>{title}</h2>
				{showContent && <div className="mt-3">{children}</div>}
			</div>
		</section>
	);
}
