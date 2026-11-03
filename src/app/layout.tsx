import type { Metadata, Viewport } from 'next';
import { Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import { PwaRegister } from '@/components/PwaRegister';
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
  title: 'DomuSafe — Manuale casa e hub emergenza',
  description:
    'Manuale digitale della casa per la Famiglia: utenze, schede ICE, cassaforte e stampa A4. Dati protetti sull’account.',
  applicationName: 'DomuSafe',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DomuSafe',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/domusafe-logo.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b1f17' },
    { media: '(prefers-color-scheme: dark)', color: '#06110c' },
  ],
  width: 'device-width',
  initialScale: 1,
  /* Zoom consentito: accessibilità + tablet/phone non tecnici. */
  viewportFit: 'cover',
};

/** Anti-FOUC: applica tema da localStorage prima del paint. */
const themeBootScript = `
(function(){
  try {
    var p = localStorage.getItem('domusafe-theme-preference') || 'system';
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = p === 'dark' || (p === 'system' && dark) ? 'dark' : 'light';
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${sourceSans.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
