'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { useConnection, useWalletClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Robot } from '@0g-foundation/zerobot-sdk';
import { Button } from '@0gfoundation/0g-ui/shell';
import { DirectControl } from '@/components/direct-control';
import { errorMessage, readClient, walletClient } from '@/lib/chain';
import { LOCAL_MODE } from '@/lib/mode';
import { menuFor, ROBOT_TYPE_LABELS, robotIdFor } from '@/lib/robots';

/** bytes32 placeholder for "no storage root yet" */
const ZERO_STORAGE_ROOT = `0x${'0'.repeat(64)}` as const;

const card = 'rounded-2xl border border-hairline p-4';
const heading = 'mb-3 text-xs font-medium uppercase tracking-wider text-ink-muted';
const input = 'rounded-xl border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink';
const badge = 'rounded-full px-2 py-0.5 text-xs font-medium';

type OwnedRobot = Robot & { robotId: string; price: bigint };

export default function OwnerPage() {
	const { address, status } = useConnection();
	const { data: wallet } = useWalletClient();
	const queryClient = useQueryClient();
	const [log, setLog] = useState<string[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [newName, setNewName] = useState('');
	const [newType, setNewType] = useState('go2_pro');
	const [busy, setBusy] = useState(false);

	const addLog = (line: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`]);

	const robots = useQuery({
		queryKey: ['owned-robots', address],
		enabled: Boolean(address),
		queryFn: async (): Promise<OwnedRobot[]> => {
			const client = readClient();
			const owned = await client.listRobotsByOwner(address!);
			return Promise.all(owned.map(async (r) => ({ ...r, price: await client.getCommandPrice(r.robotId) })));
		}
	});

	/** Run an owner transaction, log it, and reload the list */
	async function run(label: string, write: (client: ReturnType<typeof walletClient>) => Promise<unknown>) {
		if (!wallet) return;
		setBusy(true);
		addLog(`${label}…`);
		try {
			await write(walletClient(wallet));
			addLog(`${label}: done`);
			await queryClient.invalidateQueries({ queryKey: ['owned-robots'] });
		} catch (err) {
			addLog(`${label} failed: ${errorMessage(err)}`);
		} finally {
			setBusy(false);
		}
	}

	async function register() {
		const name = newName.trim();
		if (!name) return;
		const robotId = robotIdFor(name);
		const existing = await readClient().getRobot(robotId);
		if (existing.owner !== '0x0000000000000000000000000000000000000000') {
			addLog(`A robot called "${name}" is already registered. Choose another name.`);
			return;
		}
		await run(`Registering ${name}`, (c) => c.registerRobot(robotId, name, newType, ZERO_STORAGE_ROOT));
		setNewName('');
	}

	if (status === 'reconnecting') return <p className="text-ink-muted">Restoring session…</p>;
	if (!address) {
		return (
			<div className="py-20 text-center">
				<h1 className="text-2xl font-semibold">Connect your wallet</h1>
				<p className="mt-2 text-ink-soft">Connect the wallet that owns your robots to manage them.</p>
			</div>
		);
	}

	const selectedRobot = robots.data?.find((r) => r.robotId === selected);

	return (
		<>
			<section className={card}>
				<h2 className={heading}>Your robots</h2>
				{robots.isPending ? (
					<p className="text-sm text-ink-muted">Loading…</p>
				) : robots.error ? (
					<p className="text-sm text-red-600">{errorMessage(robots.error)}</p>
				) : robots.data.length === 0 ? (
					<p className="text-sm text-ink-muted">No robots registered yet.</p>
				) : (
					<div className="space-y-3">
						{robots.data.map((r) => (
							<RobotRow
								key={r.robotId}
								robot={r}
								busy={busy}
								selected={r.robotId === selected}
								onSelect={() => setSelected(r.robotId)}
								run={run}
							/>
						))}
					</div>
				)}

				<hr className="my-4 border-hairline" />
				<h2 className={heading}>Register a robot</h2>
				<div className="flex flex-wrap gap-2">
					<input
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="e.g. my-go2-pro"
						className={`${input} min-w-48 flex-1`}
					/>
					<select value={newType} onChange={(e) => setNewType(e.target.value)} className={input}>
						{Object.entries(ROBOT_TYPE_LABELS).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
					<Button size="small" onClick={register} disabled={busy || !newName.trim()}>
						Register
					</Button>
				</div>
			</section>

			{LOCAL_MODE && selectedRobot && (
				<DirectControl
					key={selectedRobot.robotId}
					name={selectedRobot.name}
					robotType={selectedRobot.robotType}
					log={addLog}
				/>
			)}

			<section className={`${card} mt-4`}>
				<h2 className={heading}>Log</h2>
				<div className="h-40 overflow-y-auto rounded-xl bg-ink/5 p-3 font-mono text-xs whitespace-pre-wrap">
					{log.join('\n')}
				</div>
			</section>
		</>
	);
}

function RobotRow({
	robot: r,
	busy,
	selected,
	onSelect,
	run
}: {
	robot: OwnedRobot;
	busy: boolean;
	selected: boolean;
	onSelect: () => void;
	run: (label: string, write: (client: ReturnType<typeof walletClient>) => Promise<unknown>) => Promise<void>;
}) {
	const [price, setPrice] = useState(formatEther(r.price));
	const hasMenu = Boolean(menuFor(r.name));

	let parsedPrice: bigint | null = null;
	try {
		parsedPrice = parseEther(price);
	} catch {
		// Shown as disabled below
	}

	return (
		<div className={`rounded-xl border p-3 ${selected ? 'border-ink' : 'border-hairline'}`}>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium">{r.name}</span>
				<span className="text-sm text-ink-muted">{ROBOT_TYPE_LABELS[r.robotType] ?? r.robotType}</span>
				<span className={`${badge} ${r.active ? 'bg-green-600/15 text-green-700' : 'bg-red-600/15 text-red-700'}`}>
					{r.active ? 'Active' : 'Inactive'}
				</span>
				{r.publicCommands && <span className={`${badge} bg-ink/10`}>Public</span>}
			</div>
			<div className="mt-1 truncate font-mono text-xs text-ink-muted">{r.robotId}</div>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<Button
					size="small"
					variant="secondary"
					disabled={busy}
					onClick={() =>
						run(r.active ? `Deactivating ${r.name}` : `Activating ${r.name}`, (c) =>
							c.updateRobot(r.robotId, r.storageRoot, !r.active)
						)
					}
				>
					{r.active ? 'Deactivate' : 'Activate'}
				</Button>
				<Button
					size="small"
					variant="secondary"
					disabled={busy}
					onClick={() =>
						run(r.publicCommands ? `Closing ${r.name} to the public` : `Opening ${r.name} to the public`, (c) =>
							c.setPublicCommands(r.robotId, !r.publicCommands)
						)
					}
				>
					{r.publicCommands ? 'Close to public' : 'Open to public'}
				</Button>
				<span className="flex items-center gap-1 text-sm">
					<input
						value={price}
						onChange={(e) => setPrice(e.target.value)}
						className={`${input} w-24`}
						aria-label="Price per command in 0G"
					/>
					0G
				</span>
				<Button
					size="small"
					variant="secondary"
					disabled={busy || parsedPrice === null || parsedPrice === r.price}
					onClick={() => run(`Setting ${r.name}'s price to ${price} 0G`, (c) => c.setCommandPrice(r.robotId, parsedPrice!))}
				>
					Set price
				</Button>
				{LOCAL_MODE && r.active && !selected && (
					<Button size="small" onClick={onSelect}>
						Control
					</Button>
				)}
			</div>

			{hasMenu && (
				<div className="mt-3 flex gap-4 text-sm">
					<Link href={`/robots/${r.name}`} className="underline">
						Public page
					</Link>
					<Link href={`/robots/${r.name}/stage`} className="underline">
						Stage screen
					</Link>
				</div>
			)}
		</div>
	);
}
