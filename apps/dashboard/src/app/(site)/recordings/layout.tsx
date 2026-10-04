import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Recordings' };

export default function RecordingsLayout({ children }: { children: ReactNode }) {
	return children;
}
