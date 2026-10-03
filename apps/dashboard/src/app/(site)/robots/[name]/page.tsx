'use client';

import { use, useMemo, useState, type ReactNode } from 'react';
import { formatEther, parseEther } from 'viem';
import { useBalance, useConnection, useSwitchChain, useWalletClient } from 'wagmi';
import { CommandStatus, type ResolvedMenuItem } from '@0g-foundation/zerobot-sdk';
import { Button, ButtonLink } from '@0gfoundation/0g-ui/shell';
import { WalletControls } from '@/components/wallet-controls';
import { WalletAddress } from '@/components/wallet-address';
import { errorMessage, readClient, walletClient } from '@/lib/chain';
import { defaultNetwork } from '@/lib/networks';
import { useQueue } from '@/lib/use-queue';
import { useRobot } from '@/lib/use-robot';

const MAX_NOTE_BYTES = 64;
/** Headroom over the price for gas, so the transaction doesn't fail on fees */
const GAS_HEADROOM = parseEther('0.005');
const FAUCET_URL = 'https://faucet.0g.ai';

interface Submission {
	/** The robot's nonce before sending, so ours is at or after it */
	fromNonce: bigint;
	apiId: number;
	note: string;
	error?: string;
}

export default function RobotPage({ params }: { params: Promise<{ name: string }> }) {
	const { name } = use(params);
	const robot = useRobot(name);
	const { address, chainId } = useConnection();
	const { data: wallet } = useWalletClient();
	const switchChain = useSwitchChain();
	const balance = useBalance({ address, chainId: defaultNetwork.chain.id, query: { refetchInterval: 4000 } });
	const { entries } = useQueue(robot.data?.robotId);

	const [note, setNote] = useState('');
	const [move, setMove] = useState<ResolvedMenuItem | null>(null);
	const [submission, setSubmission] = useState<Submission | null>(null);

	const data = robot.data;
	const noteBytes = new TextEncoder().encode(note.trim()).length;
	const wrongChain = address && chainId !== defaultNetwork.chain.id;
	const enoughFunds = data && balance.data ? balance.data.value >= data.price + GAS_HEADROOM : false;

	const pending = entries.filter((e) => e.command.status === CommandStatus.Pending);
	const mine = useMemo(() => {
		if (!submission || !address) return undefined;
		return entries.find(
			(e) =>
				e.command.nonce >= submission.fromNonce &&
				e.command.sender.toLowerCase() === address.toLowerCase() &&
				e.command.apiId === submission.apiId &&
				e.command.note === submission.note
		);
	}, [entries, submission, address]);

	async function send() {
		if (!data || !wallet || !move) return;
		const trimmed = note.trim();
		const fromNonce = await readClient().getRobotNonce(data.robotId);
		setSubmission({ fromNonce, apiId: move.apiId, note: trimmed });
		try {
			await walletClient(wallet).dispatchCommand(data.robotId, move.apiId, '', {
				value: data.price,
				note: trimmed
			});
		} catch (err) {
			// The queue may already show it if only the slow receipt failed
			setSubmission((s) => (s ? { ...s, error: errorMessage(err) } : s));
		}
	}

	if (robot.isPending) return <p className="text-ink-muted">Loading…</p>;
	if (robot.error) return <p className="text-red-600">Couldn&apos;t load this robot: {robot.error.message}</p>;
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

			{submission && !submission.error ? (
				<Status
					displayName={displayName}
					found={mine}
					position={mine ? pending.findIndex((e) => e.command.nonce === mine.command.nonce) : -1}
					onAgain={() => {
						setSubmission(null);
						setMove(null);
					}}
				/>
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
						{noteBytes > MAX_NOTE_BYTES && <p className="mt-1 text-sm text-red-600">That name is too long.</p>}
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

					{submission?.error && <p className="mt-4 text-sm text-red-600">{submission.error}</p>}

					<div className="mt-6">
						<Button
							fullWidth
							onClick={send}
							disabled={!wallet || Boolean(wrongChain) || !enoughFunds || !move || noteBytes === 0 || noteBytes > MAX_NOTE_BYTES}
						>
							Pay {formatEther(data.price)} 0G
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
								<span>{e.command.note || 'Anonymous'}</span>
								<span className="text-ink-muted">{i === 0 ? 'now' : `#${i + 1}`}</span>
							</li>
						))}
					</ol>
				</section>
			)}
		</div>
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
						done ? 'bg-green-600 text-white' : 'bg-ink text-on-ink'
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

function Status({
	displayName,
	found,
	position,
	onAgain
}: {
	displayName: string;
	found: ReturnType<typeof useQueue>['entries'][number] | undefined;
	position: number;
	onAgain: () => void;
}) {
	let headline: string;
	let detail: string | null = null;
	if (!found) {
		headline = 'Confirm in your wallet';
		detail = 'Then hang tight. It takes a few seconds to reach the robot.';
	} else if (found.command.status === CommandStatus.Executed) {
		headline = 'Done!';
		detail = `Thanks for playing with ${displayName}.`;
	} else if (found.command.status !== CommandStatus.Pending) {
		headline = 'That one didn’t run';
		detail = 'The robot couldn’t do this move.';
	} else if (position <= 0) {
		headline = `${displayName} is doing your move now`;
		detail = 'Look at the stage!';
	} else {
		headline = `You’re #${position + 1} in the queue`;
		detail = `${position} ${position === 1 ? 'move' : 'moves'} ahead of you.`;
	}

	return (
		<section className="mt-8 rounded-2xl border border-hairline p-6 text-center">
			<p className="text-2xl font-semibold">{headline}</p>
			{detail && <p className="mt-2 text-ink-soft">{detail}</p>}
			{found && found.command.status !== CommandStatus.Pending && (
				<div className="mt-4">
					<Button onClick={onAgain}>Send another move</Button>
				</div>
			)}
		</section>
	);
}
