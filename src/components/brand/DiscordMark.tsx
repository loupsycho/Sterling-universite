interface DiscordMarkProps {
  className?: string;
}

export default function DiscordMark({ className = '' }: DiscordMarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7.5 6.2C9 5.5 10.4 5.2 12 5.2s3 .3 4.5 1c.9 1.4 1.5 3 1.8 4.7-1.3 1.6-2.8 2.7-4.5 3.1l-.6-1.2" />
      <path d="M16.5 17.8c-1.5.7-3 1.1-4.5 1.1s-3-.4-4.5-1.1c-.6-1.2-1.3-2.2-1.8-3.1" />
      <path d="M7.5 6.2C5.9 8.3 5 10.7 4.8 13.2c-.1.2 0 .4.2.5 1.7 1.2 3.5 1.9 5.4 2.2l.6-1.2" />
      <path d="M16.5 6.2c1.6 2.1 2.5 4.5 2.7 7 .1.2 0 .4-.2.5-1.7 1.2-3.5 1.9-5.4 2.2" />
      <circle cx="9.2" cy="11.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="11.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
