import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { SHELL_BOOTSTRAP } from '@0gfoundation/0g-ui/shell';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
	title: 'Zerobot',
	description: 'Pay to make real robots move, on 0G.'
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
			<body className="min-h-dvh font-sans">
				<script dangerouslySetInnerHTML={{ __html: SHELL_BOOTSTRAP }} />
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
