import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { frame: string; dot: string; title: string }> = {
	info: { frame: 'border-hairline bg-ink/5', dot: 'bg-ink-muted', title: 'text-ink' },
	success: { frame: 'border-success/30 bg-success/10', dot: 'bg-success', title: 'text-success' },
	warning: { frame: 'border-warning/30 bg-warning/10', dot: 'bg-warning', title: 'text-warning' },
	danger: { frame: 'border-danger/30 bg-danger/10', dot: 'bg-danger', title: 'text-danger' }
};

/** A message the user should act on or know before acting: a status, an error, a warning */
export function Notice({
	tone = 'info',
	title,
	children,
	className = ''
}: {
	tone?: Tone;
	title: ReactNode;
	children?: ReactNode;
	className?: string;
}) {
	const t = TONES[tone];
	return (
		<div
			role={tone === 'danger' ? 'alert' : 'status'}
			className={`flex gap-3 rounded-2xl border px-4 py-3 ${t.frame} ${className}`}
		>
			<span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${t.dot}`} />
			<div className="min-w-0">
				<p className={`font-medium ${t.title}`}>{title}</p>
				{children && <div className="mt-0.5 text-sm text-ink-soft">{children}</div>}
			</div>
		</div>
	);
}
