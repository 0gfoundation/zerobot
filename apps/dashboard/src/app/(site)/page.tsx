'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatEther, isAddress, parseEther } from 'viem';
import { useConnection, useWalletClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Robot, RobotSettings } from '@0g-foundation/zerobot-sdk';
import { Button } from '@0gfoundation/0g-ui/shell';
import { DirectControl } from '@/components/direct-control';
import { WalletAddress } from '@/components/wallet-address';
import { errorMessage, readClient, walletClient } from '@/lib/chain';
import { LOCAL_MODE } from '@/lib/mode';
import { menuFor, ROBOT_TYPE_LABELS, robotIdFor } from '@/lib/robots';

/** bytes32 placeholder for "no storage root yet" */
const ZERO_STORAGE_ROOT = `0x${'0'.repeat(64)}` as const;

const card = 'rounded-2xl border border-hairline p-4';
const heading = 'mb-3 text-xs font-medium uppercase tracking-wider text-ink-muted';
const input = 'rounded-xl border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink';
const badge = 'rounded-full px-2 py-0.5 text-xs font-medium';
const label = 'flex items-center gap-2 text-sm';

type OwnedRobot = Robot & { robotId: string; price: bigint; operators: string[] };
type Run = (label: string, write: (client: ReturnType<typeof walletClient>) => Promise<unknown>) => Promise<boolean>;

function parsePrice(value: string): bigint | null {
	try {
		return parseEther(value.trim() || '0');
	} catch {
		return null;
	}
}

export default function OwnerPage() {
	const { address, status } = useConnection();
	const { data: wallet } = useWalletClient();
	const queryClient = useQueryClient();
	const [log, setLog] = useState<string[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const addLog = (line: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`]);

	const robots = useQuery({
		queryKey: ['owned-robots', address],
		enabled: Boolean(address),
		queryFn: async (): Promise<OwnedRobot[]> => {
			const client = readClient();
			const owned = await client.listRobotsByOwner(address!);
			return Promise.all(
				owned.map(async (r) => ({
					...r,
					price: await client.getCommandPrice(r.robotId),
					operators: await client.listOperators(r.robotId)
				}))
			);
		}
	});

	/** Run an owner transaction, log it, and reload the list */
	const run: Run = async (label, write) => {
		if (!wallet) return false;
		setBusy(true);
		addLog(`${label}…`);
		try {
			await write(walletClient(wallet));
			addLog(`${label}: done`);
			await queryClient.invalidateQueries({ queryKey: ['owned-robots'] });
			return true;
		} catch (err) {
			addLog(`${label} failed: ${errorMessage(err)}`);
			return false;
		} finally {
			setBusy(false);
		}
	};

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
					<p className="text-sm text-danger">{errorMessage(robots.error)}</p>
				) : robots.data.length === 0 ? (
					<p className="text-sm text-ink-muted">No robots registered yet.</p>
				) : (
					<div className="space-y-3">
						{robots.data.map((r) => (
							<RobotRow
								// Remount after a save so the form starts from the chain's values
								key={`${r.robotId}-${r.price}-${r.publicCommands}-${r.active}-${r.operators.join()}`}
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
				<RegisterForm busy={busy} run={run} log={addLog} />
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

/** Registers a robot and applies its settings in one transaction */
function RegisterForm({ busy, run, log }: { busy: boolean; run: Run; log: (line: string) => void }) {
	const [name, setName] = useState('');
	const [type, setType] = useState('go2_pro');
	const [price, setPrice] = useState('0');
	const [publicCommands, setPublicCommands] = useState(false);
	const [operator, setOperator] = useState('');

	const parsedPrice = parsePrice(price);
	const operatorValid = operator.trim() === '' || isAddress(operator.trim());

	async function register() {
		const trimmed = name.trim();
		const robotId = robotIdFor(trimmed);
		const existing = await readClient().getRobot(robotId);
		if (existing.owner !== '0x0000000000000000000000000000000000000000') {
			log(`A robot called "${trimmed}" is already registered. Choose another name.`);
			return;
		}
		const settings: RobotSettings = {
			...(parsedPrice ? { price: parsedPrice } : {}),
			...(publicCommands ? { publicCommands } : {}),
			...(operator.trim() ? { addOperators: [operator.trim()] } : {})
		};
		const ok = await run(`Registering ${trimmed}`, (c) =>
			c.registerRobot(robotId, trimmed, type, ZERO_STORAGE_ROOT, settings)
		);
		if (ok) setName('');
	}

	return (
		<>
			<h2 className={heading}>Register a robot</h2>
			<div className="flex flex-wrap gap-2">
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. my-go2-pro"
					className={`${input} min-w-48 flex-1`}
				/>
				<select value={type} onChange={(e) => setType(e.target.value)} className={input}>
					{Object.entries(ROBOT_TYPE_LABELS).map(([value, text]) => (
						<option key={value} value={value}>
							{text}
						</option>
					))}
				</select>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
				<label className={label}>
					Price
					<input value={price} onChange={(e) => setPrice(e.target.value)} className={`${input} w-24`} />
					0G
				</label>
				<label className={label}>
					<input type="checkbox" checked={publicCommands} onChange={(e) => setPublicCommands(e.target.checked)} />
					Open to the public
				</label>
				<input
					value={operator}
					onChange={(e) => setOperator(e.target.value)}
					placeholder="Operator address (optional)"
					className={`${input} min-w-64 flex-1 font-mono`}
				/>
			</div>
			<div className="mt-3">
				<Button size="small" onClick={register} disabled={busy || !name.trim() || parsedPrice === null || !operatorValid}>
					Register
				</Button>
			</div>
		</>
	);
}

/** A robot's settings as an editable form. Save applies every change in one transaction. */
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
	run: Run;
}) {
	const [price, setPrice] = useState(formatEther(r.price));
	const [publicCommands, setPublicCommands] = useState(r.publicCommands);
	const [active, setActive] = useState(r.active);
	const [operators, setOperators] = useState(r.operators);
	const [newOperator, setNewOperator] = useState('');
	const hasMenu = Boolean(menuFor(r.name));

	const parsedPrice = parsePrice(price);
	const changes: RobotSettings = {
		...(parsedPrice !== null && parsedPrice !== r.price ? { price: parsedPrice } : {}),
		...(publicCommands !== r.publicCommands ? { publicCommands } : {}),
		...(active !== r.active ? { active } : {}),
		addOperators: operators.filter((o) => !r.operators.includes(o)),
		removeOperators: r.operators.filter((o) => !operators.includes(o))
	};
	const changed =
		Object.keys(changes).some((k) => !k.endsWith('Operators')) ||
		changes.addOperators!.length > 0 ||
		changes.removeOperators!.length > 0;

	function addOperator() {
		const address = newOperator.trim();
		if (!isAddress(address) || operators.some((o) => o.toLowerCase() === address.toLowerCase())) return;
		setOperators([...operators, address]);
		setNewOperator('');
	}

	return (
		<div className={`rounded-xl border p-3 ${selected ? 'border-ink' : 'border-hairline'}`}>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium">{r.name}</span>
				<span className="text-sm text-ink-muted">{ROBOT_TYPE_LABELS[r.robotType] ?? r.robotType}</span>
				<span className={`${badge} ${r.active ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
					{r.active ? 'Active' : 'Inactive'}
				</span>
				{r.publicCommands && <span className={`${badge} bg-ink/10`}>Public</span>}
			</div>
			<div className="mt-1 truncate font-mono text-xs text-ink-muted">{r.robotId}</div>

			<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
				<label className={label}>
					Price
					<input
						value={price}
						onChange={(e) => setPrice(e.target.value)}
						className={`${input} w-24`}
						aria-label="Price per command in 0G"
					/>
					0G
				</label>
				<label className={label}>
					<input type="checkbox" checked={publicCommands} onChange={(e) => setPublicCommands(e.target.checked)} />
					Open to the public
				</label>
				<label className={label}>
					<input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
					Active
				</label>
			</div>

			<div className="mt-3 text-xs font-medium uppercase tracking-wider text-ink-muted">Operators</div>
			{operators.length > 0 ? (
				<ul className="mt-1 space-y-1">
					{operators.map((op) => (
						<li key={op} className="flex items-center justify-between gap-2 text-sm">
							<WalletAddress address={op} />
							<button
								type="button"
								className="text-xs text-ink-muted underline hover:text-ink"
								onClick={() => setOperators(operators.filter((o) => o !== op))}
							>
								Remove
							</button>
						</li>
					))}
				</ul>
			) : (
				<p className="mt-1 text-sm text-ink-muted">None. Only this wallet can submit receipts.</p>
			)}
			<div className="mt-2 flex flex-wrap gap-2">
				<input
					value={newOperator}
					onChange={(e) => setNewOperator(e.target.value)}
					placeholder="Operator address (0x…)"
					className={`${input} min-w-64 flex-1 font-mono`}
				/>
				<Button size="small" variant="secondary" disabled={!isAddress(newOperator.trim())} onClick={addOperator}>
					Add
				</Button>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<Button
					size="small"
					disabled={busy || !changed || parsedPrice === null}
					onClick={() => run(`Saving ${r.name}`, (c) => c.configureRobot(r.robotId, changes))}
				>
					Save
				</Button>
				{LOCAL_MODE && r.active && !selected && (
					<Button size="small" variant="secondary" onClick={onSelect}>
						Control
					</Button>
				)}
				{hasMenu && (
					<>
						<Link href={`/robots/${r.name}`} className="ml-2 text-sm underline">
							Public page
						</Link>
						<Link href={`/robots/${r.name}/stage`} className="text-sm underline">
							Stage screen
						</Link>
					</>
				)}
			</div>
		</div>
	);
}
