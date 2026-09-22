import type { ReactNode } from 'react';
export const metadata = { title: 'КлипМейкер' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}
