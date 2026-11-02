import type { Metadata, Viewport } from 'next';
import { Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const sourceSans = Source_Sans_3({
  variable: '--font-source-sans',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
});

const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  weight: ['600', '700', '900'],
});

export const metadata: Metadata = {
  title: 'DomuSafe — Manuale casa & hub emergenza',
  description:
    'Runbook domestico cifrato: Famiglia, utenze, schede ICE, cassaforte e stampa A4.',
  applicationName: 'DomuSafe',
  icons: {
    icon: '/domusafe-logo.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b1f17',
  width: 'device-width',
  initialScale: 1,
  /* Zoom consentito: accessibilità + tablet/phone non tecnici. */
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${sourceSans.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
