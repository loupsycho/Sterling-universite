import { GraduationCap } from 'lucide-react';

interface SterlingLogoProps {
  size?: 'sm' | 'lg';
  showWordmark?: boolean;
}

const sizes = {
  sm: { ring: 'h-9 w-9', icon: 'h-4 w-4', title: 'text-lg', sub: 'text-[9px]' },
  lg: { ring: 'h-20 w-20', icon: 'h-9 w-9', title: 'text-4xl', sub: 'text-[11px]' },
};

export default function SterlingLogo({ size = 'sm', showWordmark = true }: SterlingLogoProps) {
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${s.ring} relative flex shrink-0 items-center justify-center rounded-full border border-gold-500/70 bg-gradient-to-b from-ink-800 to-ink-950 shadow-[0_0_32px_-8px_rgba(198,161,91,0.55)]`}
      >
        <div className="absolute inset-1 rounded-full border border-gold-500/20" />
        <GraduationCap className={`${s.icon} text-gold-300`} strokeWidth={1.5} aria-hidden="true" />
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className={`${s.title} font-display font-semibold tracking-[0.12em] gold-text`}>STERLING</span>
          <span className={`${s.sub} mt-1 font-sans font-medium uppercase tracking-[0.42em] text-gold-200/80`}>
            Campus
          </span>
        </div>
      )}
    </div>
  );
}
