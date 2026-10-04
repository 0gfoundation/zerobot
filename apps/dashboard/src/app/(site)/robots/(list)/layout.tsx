import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Robots' };

export default function RobotsLayout({ children }: { children: ReactNode }) {
	return children;
}
