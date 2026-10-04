import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { displayNameFor } from '@/lib/robots';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
	return { title: `${displayNameFor((await params).name)} stage` };
}

export default function StageLayout({ children }: { children: ReactNode }) {
	return children;
}
