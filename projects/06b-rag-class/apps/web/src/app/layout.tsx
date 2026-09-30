import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'RAG-бот для сайта',
  description: 'Бот отвечает посетителям по страницам и PDF владельца и показывает источник каждого ответа.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
