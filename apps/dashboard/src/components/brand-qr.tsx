import { useMemo } from 'react';
import { QrCodeDataType, encode } from 'uqr';
import { ZERO_G_MARK_PATHS } from './zero-g-mark';

/** Deep Purple, the 0G brand colour, for the finder eyes and the mark */
const BRAND = '#9200e1';
/** Near-black plum for the data dots: dark enough for any phone to read */
const INK = '#1a0b2e';
/** Share of the code's width cleared for the logo. Level H recovers 30% loss; this covers about 7%. */
const LOGO_SHARE = 0.26;

/**
 * A QR code in the 0G style: dot modules, rounded purple finder eyes and the
 * 0G mark in the middle. Encoded at level H so the covered modules still
 * decode. Draw it on white; the dots assume a light ground.
 */
export function BrandQr({ value, className = '' }: { value: string; className?: string }) {
	const svg = useMemo(() => {
		const { size, data, types } = encode(value, { ecc: 'H', border: 0 });
		// The logo's square, centred, in whole modules and with the same parity as the code
		let logo = Math.ceil(size * LOGO_SHARE);
		if (logo % 2 !== size % 2) logo += 1;
		const logoStart = (size - logo) / 2;
		const inLogo = (x: number, y: number) =>
			x >= logoStart && x < logoStart + logo && y >= logoStart && y < logoStart + logo;
		const finders = [
			[0, 0],
			[size - 7, 0],
			[0, size - 7]
		];
		const inFinder = (x: number, y: number) => finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

		const dots: string[] = [];
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (!data[y][x] || inFinder(x, y) || inLogo(x, y)) continue;
				// Readers find the grid from the timing and alignment patterns, and
				// as dots they failed to decode at some sizes; they stay square
				const type = types[y][x];
				if (type === QrCodeDataType.Timing || type === QrCodeDataType.Alignment) dots.push(`M${x} ${y}h1v1h-1z`);
				else dots.push(`M${x + 0.5} ${y + 0.08}a.42 .42 0 1 1 0 .84a.42 .42 0 1 1 0-.84z`);
			}
		}
		return { size, dots: dots.join(''), finders, logoStart, logo };
	}, [value]);

	const { size, dots, finders, logoStart, logo } = svg;
	// The mark is 160×78 in its own units; fit it to the cleared square with a margin
	const markWidth = logo * 0.72;
	const markScale = markWidth / 160;
	const markHeight = 78 * markScale;

	return (
		<svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className={className} role="img" aria-label={`QR code for ${value}`}>
			<rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#ffffff" />
			<path d={dots} fill={INK} />
			{finders.map(([x, y]) => (
				<g key={`${x}-${y}`} fill={BRAND}>
					{/* Outer ring as one path with a hole, then the centre */}
					<path
						fillRule="evenodd"
						d={`M${x + 2} ${y}h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z M${x + 2} ${y + 1}a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z`}
					/>
					<rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} />
				</g>
			))}
			<rect
				x={logoStart + 0.3}
				y={logoStart + 0.3}
				width={logo - 0.6}
				height={logo - 0.6}
				rx={logo * 0.22}
				fill={BRAND}
			/>
			<g
				transform={`translate(${logoStart + (logo - markWidth) / 2} ${logoStart + (logo - markHeight) / 2}) scale(${markScale}) translate(0 -9)`}
				fill="#ffffff"
			>
				{ZERO_G_MARK_PATHS.map((d) => (
					<path key={d} d={d} />
				))}
			</g>
		</svg>
	);
}
