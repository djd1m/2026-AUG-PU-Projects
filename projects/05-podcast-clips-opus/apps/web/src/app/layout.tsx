import type { ReactNode } from 'react';
import './globals.css';
export const metadata = { title: 'КлипМейкер' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}
