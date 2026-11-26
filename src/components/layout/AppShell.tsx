import type { ReactNode } from 'react';
import SterlingLogo from '@/components/brand/SterlingLogo';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-gold-500/10 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <SterlingLogo size="sm" />
          <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-bone-300/60">Boston</span>
        </div>
        <div className="gold-hairline opacity-60" />
      </header>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
