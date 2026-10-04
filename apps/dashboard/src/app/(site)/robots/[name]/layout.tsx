import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { displayNameFor } from '@/lib/robots';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
	// A plain title here would drop the root's template for the console below
	return { title: { default: displayNameFor((await params).name), template: '%s - Zerobot' } };
}

export default function RobotLayout({ children }: { children: ReactNode }) {
	return children;
}
