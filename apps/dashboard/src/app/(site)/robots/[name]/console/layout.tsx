import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { displayNameFor } from '@/lib/robots';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
	return { title: `${displayNameFor((await params).name)} console` };
}

export default function ConsoleLayout({ children }: { children: ReactNode }) {
	return children;
}
