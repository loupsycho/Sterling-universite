import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-[0_8px_24px_-10px_rgba(198,161,91,0.8)] hover:from-gold-200 hover:to-gold-400 hover:shadow-[0_12px_32px_-10px_rgba(198,161,91,0.9)]',
  ghost:
    'border border-gold-500/40 bg-ink-900/40 text-gold-200 hover:border-gold-400 hover:bg-gold-500/10 hover:text-gold-100',
};

export default function Button({ variant = 'primary', icon, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold tracking-wide transition-all duration-300 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
