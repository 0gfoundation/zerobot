'use client';

import Link from 'next/link';
import { use, useEffect, useState, type ReactNode } from 'react';
import { useConnection, useWalletClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { CommandStatus } from '@0g-foundation/zerobot-sdk';
import { Button } from '@0gfoundation/0g-ui/shell';
import { SwitchNetwork } from '@/components/switch-network';
import { WalletAddress } from '@/components/wallet-address';
import { errorMessage, readClient, walletClient } from '@/lib/chain';
import { defaultNetwork } from '@/lib/networks';
import { useQueue, type QueueEntry } from '@/lib/use-queue';
import { useQueuePaused } from '@/lib/use-queue-paused';
import { useRobot } from '@/lib/use-robot';
import { useRobotStatus } from '@/lib/use-robot-status';

const card = 'rounded-2xl border border-hairline p-4';
const heading = 'mb-3 text-xs font-medium uppercase tracking-wider text-ink-muted';
const badge = 'rounded-full px-2 py-0.5 text-xs font-medium';

const STATUS_BADGE: Record<CommandStatus, { text: string; className: string }> = {
	[CommandStatus.Pending]: { text: 'Queued', className: 'bg-warning/15 text-warning' },
	[CommandStatus.Executed]: { text: 'Done', className: 'bg-success/15 text-success' },
	[CommandStatus.Failed]: { text: 'Didn’t run', className: 'bg-danger/15 text-danger' },
	[CommandStatus.Expired]: { text: 'Expired', className: 'bg-danger/15 text-danger' }
};

/**
 * The robot's console for its owner and operators: whether the operator and
 * robot are up, the queue and what ran, and the controls. Anyone can view it,
 * since it only shows chain state. The controls show to whoever the contract
 * lets use them.
 */
export default function ConsolePage({ params }: { params: Promise<{ name: string }> }) {
	const { name } = use(params);
	const robot = useRobot(name, { live: true });
	const data = robot.data;
	const status = useRobotStatus(data?.robotId);
	const { entries, error: queueError } = useQueue(data?.robotId, { history: 30 });
	const queuePaused = useQueuePaused(data?.robotId);
	const { address, chainId } = useConnection();
	const { data: wallet } = useWalletClient();
	/** Which control is waiting on the wallet */
	const [busy, setBusy] = useState<'payments' | 'queue' | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const isOperator = useQuery({
		queryKey: ['is-operator', data?.robotId, address],
		enabled: Boolean(data && address),
		queryFn: () => readClient().isOperator(data!.robotId, address!)
	});

	if (robot.isPending) return <p className="text-ink-muted">Loading…</p>;
	if (robot.error) return <p className="text-danger">Couldn&apos;t load this robot: {robot.error.message}</p>;
	if (!data) return <p>No robot called “{name}”.</p>;

	const isOwner = Boolean(address && address.toLowerCase() === data.robot.owner.toLowerCase());
	const wrongChain = Boolean(address && chainId !== defaultNetwork.chain.id);
	const paymentsOpen = data.robot.publicCommands;

	const canPauseQueue = isOwner || Boolean(isOperator.data);
	const paused = queuePaused.data ?? false;

	/** Send a transaction and reread the robot and queue once it lands */
	async function act(control: 'payments' | 'queue', write: (client: ReturnType<typeof walletClient>) => Promise<unknown>) {
		if (!wallet) return;
		setBusy(control);
		setActionError(null);
		try {
			await write(walletClient(wallet));
			await Promise.all([robot.refetch(), queuePaused.refetch()]);
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusy(null);
		}
	}

	const pending = entries.filter((e) => e.command.status === CommandStatus.Pending);
	const finished = entries.filter((e) => e.command.status !== CommandStatus.Pending).reverse();
	const s = status.data;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h1 className="text-2xl font-semibold">{data.displayName} console</h1>
				<div className="flex gap-4 text-sm">
					<Link href={`/robots/${name}`} className="underline">
						Public page
					</Link>
					<Link href={`/robots/${name}/stage`} className="underline">
						Stage screen
					</Link>
				</div>
			</div>

			<section className={card}>
				<h2 className={heading}>Status</h2>
				<dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<Fact label="Operator">
						<Dot on={s?.operatorOnline} /> {s ? (s.operatorOnline ? 'Online' : 'Offline') : '…'}
					</Fact>
					<Fact label="Robot">
						<Dot on={s?.robotOnline} />{' '}
						{s ? (s.robotOnline ? 'Connected' : s.operatorOnline ? 'Reconnecting' : 'Unknown') : '…'}
					</Fact>
					<Fact label="Battery">{s?.operatorOnline && s.battery !== undefined ? `${s.battery}%` : '–'}</Fact>
					<Fact label="Last report">{s?.lastSeen ? ago(now, s.lastSeen) : 'Never'}</Fact>
				</dl>
				<p className="mt-3 text-xs text-ink-muted">
					The operator reports every minute and when anything changes. Three missed reports count as offline.
				</p>
			</section>

			<section className={card}>
				<h2 className={heading}>Controls</h2>
				{wrongChain && (isOwner || canPauseQueue) && (
					<div className="mb-4">
						<SwitchNetwork />
					</div>
				)}
				<Control
					on={!paused}
					title={paused ? 'Queue paused' : 'Queue running'}
					detail={
						paused
							? 'The robot starts no new moves. Payments still come in and wait in the queue.'
							: 'Pausing lets the current move finish, then holds the rest, e.g. to reposition the robot.'
					}
				>
					{canPauseQueue && !wrongChain && (
						<Button
							variant={paused ? 'primary' : 'secondary'}
							disabled={busy !== null || queuePaused.isPending}
							onClick={() => act('queue', (c) => c.setQueuePaused(data.robotId, !paused))}
						>
							{busy === 'queue' ? 'Confirm in your wallet…' : paused ? 'Resume queue' : 'Pause queue'}
						</Button>
					)}
				</Control>
				<hr className="my-4 border-hairline" />
				<Control
					on={paymentsOpen}
					title={paymentsOpen ? 'Taking payments' : 'Payments paused'}
					detail={
						paymentsOpen
							? 'Pausing stops new moves being paid for. Queued moves still run.'
							: 'Nobody can pay for a move. The stage screen shows Paused instead of the QR code.'
					}
				>
					{isOwner && !wrongChain && (
						<Button
							variant={paymentsOpen ? 'secondary' : 'primary'}
							disabled={busy !== null}
							onClick={() => act('payments', (c) => c.configureRobot(data.robotId, { publicCommands: !paymentsOpen }))}
						>
							{busy === 'payments' ? 'Confirm in your wallet…' : paymentsOpen ? 'Pause payments' : 'Resume payments'}
						</Button>
					)}
				</Control>
				{actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
				{!isOwner && (
					<p className="mt-4 text-xs text-ink-muted">
						{!address
							? 'Connect the owner’s or an operator’s wallet to use these. '
							: canPauseQueue
								? 'This wallet is an operator, so it can pause the queue. Only the owner can pause payments. '
								: 'Only the owner and operators can pause the queue, and only the owner payments. '}
						Owner: <WalletAddress address={data.robot.owner} />
					</p>
				)}
			</section>

			<section className={card}>
				<h2 className={heading}>Queue ({pending.length})</h2>
				{pending.length === 0 ? (
					<p className="text-sm text-ink-muted">Nothing queued.</p>
				) : (
					<CommandTable entries={pending} menu={data.menu} now={now} firstLabel={s?.robotOnline && !paused ? 'Now' : undefined} />
				)}
				{queueError && <p className="mt-2 text-sm text-danger">Chain: {queueError}</p>}
			</section>

			<section className={card}>
				<h2 className={heading}>Recent</h2>
				{finished.length === 0 ? (
					<p className="text-sm text-ink-muted">Nothing yet.</p>
				) : (
					<CommandTable entries={finished} menu={data.menu} now={now} />
				)}
			</section>
		</div>
	);
}

function CommandTable({
	entries,
	menu,
	now,
	firstLabel
}: {
	entries: QueueEntry[];
	menu: { apiId: number; emoji?: string; label: string }[];
	now: number;
	/** Shown in place of the first row's position */
	firstLabel?: string;
}) {
	return (
		<div className="-mx-4 overflow-x-auto px-4">
			<table className="w-full text-sm">
				<thead className="text-left text-xs text-ink-muted">
					<tr>
						<th className="py-1 pr-3 font-normal">#</th>
						<th className="py-1 pr-3 font-normal">Name</th>
						<th className="py-1 pr-3 font-normal">Move</th>
						<th className="py-1 pr-3 font-normal">From</th>
						<th className="py-1 pr-3 font-normal">Paid</th>
						<th className="py-1 font-normal">Status</th>
					</tr>
				</thead>
				<tbody>
					{entries.map((e, i) => {
						const item = menu.find((m) => m.apiId === e.command.apiId);
						const statusBadge = STATUS_BADGE[e.command.status];
						return (
							<tr key={String(e.command.nonce)} className="border-t border-hairline">
								<td className="py-1.5 pr-3 text-ink-muted">
									{i === 0 && firstLabel ? firstLabel : String(e.command.nonce)}
								</td>
								<td className="max-w-40 truncate py-1.5 pr-3">{e.command.note || 'Anonymous'}</td>
								<td className="py-1.5 pr-3 whitespace-nowrap">
									{item ? `${item.emoji ?? ''} ${item.label}` : `API ${e.command.apiId}`}
								</td>
								<td className="py-1.5 pr-3">
									<WalletAddress address={e.command.sender} />
								</td>
								<td className="py-1.5 pr-3 whitespace-nowrap text-ink-muted">
									{ago(now, Number(e.command.timestamp) * 1000)}
								</td>
								<td className="py-1.5">
									<span className={`${badge} ${statusBadge.className}`}>{statusBadge.text}</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function Control({ on, title, detail, children }: { on: boolean; title: string; detail: string; children?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-2 font-medium">
					<Dot on={on} /> {title}
				</p>
				<p className="mt-0.5 text-sm text-ink-soft">{detail}</p>
			</div>
			{children}
		</div>
	);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<dt className="text-xs text-ink-muted">{label}</dt>
			<dd className="mt-0.5 flex items-center gap-1.5 font-medium">{children}</dd>
		</div>
	);
}

function Dot({ on }: { on: boolean | undefined }) {
	return (
		<span
			aria-hidden
			className={`inline-block size-2 shrink-0 rounded-full ${on === undefined ? 'bg-ink-muted' : on ? 'bg-success' : 'bg-danger'}`}
		/>
	);
}

/** "12s ago", "4m ago", "2h ago" */
function ago(now: number, then: number): string {
	const s = Math.max(0, Math.round((now - then) / 1000));
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	return `${Math.floor(s / 3600)}h ago`;
}
