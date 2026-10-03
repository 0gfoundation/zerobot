'use client';

import { useState } from 'react';

export function WalletAddress({
	address,
	full = false,
	copyable = false,
	className = ''
}: {
	address: string;
	full?: boolean;
	copyable?: boolean;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		await navigator.clipboard.writeText(address);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<span className={`inline-flex items-start gap-1.5 font-mono ${className}`}>
			<span className={full ? 'break-all select-all' : ''}>
				{full ? address : `${address.slice(0, 6)}…${address.slice(-4)}`}
			</span>
			{copyable && (
				<button
					type="button"
					onClick={copy}
					className="shrink-0 cursor-pointer text-xs text-ink-muted hover:text-ink"
					aria-label="Copy address"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			)}
		</span>
	);
}
