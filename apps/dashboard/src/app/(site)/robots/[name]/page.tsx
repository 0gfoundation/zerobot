'use client';

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatEther, parseEther } from 'viem';
import { useBalance, useConnection, useSwitchChain, useWalletClient } from 'wagmi';
import { CommandStatus, waitForReceipt, type ResolvedMenuItem } from '@0g-foundation/zerobot-sdk';
import { Button, ButtonLink } from '@0gfoundation/0g-ui/shell';
import { MoveReceipts, type ReceiptCard } from '@/components/move-receipts';
import { WalletControls } from '@/components/wallet-controls';
import { Notice } from '@/components/notice';
import { WalletAddress } from '@/components/wallet-address';
import { errorMessage, readClient, walletClient } from '@/lib/chain';
import { defaultNetwork } from '@/lib/networks';
import { receiptView, useMoveReceipts, type MoveReceipt } from '@/lib/move-receipts';
import { useQueue } from '@/lib/use-queue';
import { useRobot } from '@/lib/use-robot';
import { useRobotStatus, type LiveStatus } from '@/lib/use-robot-status';

const MAX_NOTE_BYTES = 64;
/** Headroom over the price for gas, so the transaction doesn't fail on fees */
const GAS_HEADROOM = parseEther('0.005');
const FAUCET_URL = 'https://faucet.0g.ai';

function isRejection(err: unknown): boolean {
	const e = err as { code?: unknown; message?: string } | undefined;
	return e?.code === 'ACTION_REJECTED' || e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '');
}

export default function RobotPage({ params }: { params: Promise<{ name: string }> }) {
	const { name } = use(params);
	const robot = useRobot(name);
	const { address, chainId } = useConnection();
	const { data: wallet } = useWalletClient();
	const switchChain = useSwitchChain();
	const balance = useBalance({ address, chainId: defaultNetwork.chain.id, query: { refetchInterval: 4000 } });
	const { entries } = useQueue(robot.data?.robotId, 50);
	const status = useRobotStatus(robot.data?.robotId);
	// Only take payment when the operator and robot are both up, or the move
	// would wait in the queue and expire
	const available = status.data?.robotOnline ?? false;

	const [note, setNote] = useState('');
	const [move, setMove] = useState<ResolvedMenuItem | null>(null);
	const { receipts, setReceipts, add, update, remove } = useMoveReceipts(robot.data?.robotId, entries);
	// null: open until the first payment, then collapsed under "New move"
	const [formOpen, setFormOpen] = useState<boolean | null>(null);
	const showForm = formOpen ?? receipts.length === 0;
	// Which request for a receipt is current, so a superseded one can't overwrite it
	const attempts = useRef(new Map<string, number>());
	const [now, setNow] = useState(() => Date.now());
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

	if (!data.robot.active || !data.robot.publicCommands || data.menu.length === 0) {
		return <p>{displayName} isn&apos;t taking requests right now.</p>;
	}

	return (
		<div className="mx-auto max-w-md">
			<h1 className="text-3xl font-semibold tracking-tight">Make {displayName} move</h1>
			<p className="mt-2 text-ink-soft">
				Pick a move and pay {formatEther(data.price)} 0G in testnet tokens. Your name shows on the big
				screen while {displayName} does it.
			</p>

			<Availability displayName={displayName} status={status.data} className="mt-4" />

			<MoveReceipts
				cards={receipts.map((receipt): ReceiptCard => {
					const item = data.menu.find((m) => m.apiId === receipt.apiId);
					return {
						receipt,
						view: receiptView(receipt, entries, now, displayName),
						emoji: item?.emoji,
						label: item?.label ?? 'Move'
					};
				})}
				onRetry={(id) => {
					const r = receipts.find((x) => x.id === id);
					if (r) void pay(r);
				}}
				onClose={remove}
				onClearCompleted={() =>
					setReceipts((prev) => prev.filter((r) => !receiptView(r, entries, now, displayName).terminal))
				}
			/>

			{!showForm ? (
				<button
					type="button"
					onClick={() => setFormOpen(true)}
					className="mt-4 flex w-full cursor-pointer items-center justify-between rounded-2xl border border-dashed border-hairline px-4 py-3 text-sm font-medium text-ink-soft hover:bg-ink/5"
				>
					New move
					<span aria-hidden>+</span>
				</button>
			) : (
				<>
				<Step n={1} title="Connect your wallet" done={Boolean(address) && !wrongChain} collapse>
					{!address && <WalletControls />}
					{wrongChain && (
						<Button onClick={() => switchChain.mutate({ chainId: defaultNetwork.chain.id })}>
							Switch to {defaultNetwork.chain.name}
						</Button>
					)}
				</Step>

				<Step n={2} title="Get testnet 0G" done={enoughFunds} collapse>
					{address && !enoughFunds && (
						<>
							<p className="text-sm text-ink-soft">
								You need at least {formatEther(data.price + GAS_HEADROOM)} 0G. Paste your address into
								the faucet, then come back. This updates by itself.
							</p>
							<WalletAddress address={address} full copyable className="mt-2 text-sm" />
							<div className="mt-3">
								<ButtonLink href={FAUCET_URL} external variant="secondary" size="small">
									Open the faucet
								</ButtonLink>
							</div>
						</>
					)}
					{balance.data && (
						<p className="mt-2 text-xs text-ink-muted">Balance: {formatEther(balance.data.value)} 0G</p>
					)}
				</Step>

				<Step n={3} title="Your name" done={noteBytes > 0 && noteBytes <= MAX_NOTE_BYTES}>
					<input
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Shown on the screen"
						maxLength={MAX_NOTE_BYTES}
						className="w-full rounded-xl border border-hairline bg-bg px-4 py-3 text-base outline-none focus:border-ink"
					/>
					{noteBytes > MAX_NOTE_BYTES && <p className="mt-1 text-sm text-danger">That name is too long.</p>}
				</Step>

				<Step n={4} title="Pick a move" done={Boolean(move)}>
					<div className="grid gap-2">
						{data.menu.map((item) => (
							<button
								key={item.apiId}
								type="button"
								onClick={() => setMove(item)}
								className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
									move?.apiId === item.apiId ? 'border-ink bg-ink/5' : 'border-hairline hover:border-hairline-strong'
								}`}
							>
								<span className="text-3xl">{item.emoji}</span>
								<span>
									<span className="block font-medium">{item.label}</span>
									<span className="block text-sm text-ink-soft">{item.description}</span>
								</span>
							</button>
						))}
					</div>
				</Step>

				<div className="mt-6">
					<Button
						fullWidth
						onClick={() => pay()}
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
						{!status.data
							? `Checking ${displayName}…`
							: available
								? `Pay ${formatEther(data.price)} 0G`
								: status.data.operatorOnline
									? `${displayName} is reconnecting…`
									: `${displayName} is offline`}
					</Button>
				</div>
				</>
			)}

			{pending.length > 0 && (
				<section className="mt-8">
					<h2 className="text-sm font-medium uppercase tracking-wider text-ink-muted">In the queue</h2>
					<ol className="mt-2 space-y-1 text-sm">
						{pending.map((e, i) => (
							<li key={String(e.command.nonce)} className="flex justify-between">
								<span className={myNonces.has(String(e.command.nonce)) ? 'font-semibold' : ''}>
									{e.command.note || 'Anonymous'}
								</span>
								<span className="text-ink-muted">{i === 0 ? 'now' : `#${i + 1}`}</span>
							</li>
						))}
					</ol>
				</section>
			)}
		</div>
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
	if (!status) return null;
	if (status.robotOnline) {
		const battery = status.battery === undefined ? '' : ` · battery ${status.battery}%`;
		return (
			<p className={`flex items-center gap-2 text-sm text-ink-soft ${className}`}>
				<span aria-hidden className="size-2 rounded-full bg-success" />
				{displayName} is online{battery}
			</p>
		);
	}
	if (status.operatorOnline) {
		return (
			<Notice tone="warning" title={`${displayName} is reconnecting`} className={className}>
				{displayName} lost its connection and is coming back. Moves are paused until then, so you
				can&apos;t pay yet. This page updates by itself.
			</Notice>
		);
	}
	return (
		<Notice tone="warning" title={`${displayName} is offline`} className={className}>
			{displayName} isn&apos;t taking moves right now. You can still connect your wallet and get testnet 0G
			while you wait. This page updates by itself.
		</Notice>
	);
}

function Step({
	n,
	title,
	done,
	collapse = false,
	children
}: {
	n: number;
	title: string;
	done: boolean;
	/** Hide the step's content once it's done */
	collapse?: boolean;
	children?: ReactNode;
}) {
	return (
		<section className="mt-6">
			<h2 className="flex items-center gap-2 font-medium">
				<span
					className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
						done ? 'bg-success text-bg' : 'bg-ink text-on-ink'
					}`}
				>
					{done ? '✓' : n}
				</span>
				{title}
			</h2>
			{!(done && collapse) && children && <div className="mt-3">{children}</div>}
		</section>
	);
}
