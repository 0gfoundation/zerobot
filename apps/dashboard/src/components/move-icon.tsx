import { poseImageFor } from '@/lib/robots';

/**
 * A move's picture: the robot in the move's pose on a purple tile, or the
 * move's emoji when there's no render of it. `tile` fills its container
 * (the move cards); `inline` is sized to the text around it.
 */
export function MoveIcon({
	robotType,
	move,
	variant = 'inline'
}: {
	robotType: string;
	move: { command: string; emoji?: string } | undefined;
	variant?: 'tile' | 'inline';
}) {
	if (!move) return null;
	const src = poseImageFor(robotType, move.command);
	if (!src) {
		return variant === 'tile' ? (
			<span aria-hidden className="flex h-20 items-center justify-center rounded-xl bg-brand-500/10 text-4xl">
				{move.emoji}
			</span>
		) : (
			<span aria-hidden>{move.emoji}</span>
		);
	}
	return (
		<span
			aria-hidden
			className={`inline-flex shrink-0 items-center justify-center bg-linear-to-br from-[#9200e1] to-[#b75fff] align-middle ${
				variant === 'tile' ? 'flex h-20 w-full rounded-xl p-1.5' : 'size-[1.5em] rounded-[0.35em] p-[0.1em]'
			}`}
		>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={src} alt="" className="max-h-full max-w-full object-contain" />
		</span>
	);
}
