import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const rubik = localFont({
  src: [
    { path: '../assets/rubik-regular.ttf', weight: '400' },
    { path: '../assets/rubik-bold.ttf', weight: '700' },
  ],
  display: 'swap',
  variable: '--font-rubik',
});

export const metadata: Metadata = {
  title: 'Партнёрская программа Proofwall',
  description: 'Рекомендуйте Proofwall и получайте вознаграждение за оплаченные покупки.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={rubik.variable}>{children}</body></html>;
}
