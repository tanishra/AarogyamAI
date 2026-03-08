import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { SystemHealthIndicator } from '@/components/common/SystemHealthIndicator';

export const metadata: Metadata = {
  title: 'Clinical Zen - AI-Assisted Clinical Reasoning',
  description: 'Healthcare management system with AI-powered clinical decision support',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <SystemHealthIndicator />
        </Providers>
      </body>
    </html>
  );
}
