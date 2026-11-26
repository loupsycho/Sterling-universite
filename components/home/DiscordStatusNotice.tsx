import { AlertTriangle, Loader2, MonitorSmartphone, ShieldCheck, type LucideIcon } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { DiscordStatus } from '@/hooks/useDiscordActivity';

interface DiscordStatusNoticeProps {
  status: DiscordStatus;
  onRetry: () => void;
}

const copy: Record<DiscordStatus, { icon: LucideIcon; tone: string; text: string }> = {
  browser: {
    icon: MonitorSmartphone,
    tone: 'text-gold-300',
    text: "Sterling Campus s'ouvre depuis Discord. Lancez l'application depuis le salon du serveur pour continuer.",
  },
  connecting: {
    icon: Loader2,
    tone: 'text-gold-300 animate-spin',
    text: 'Connexion à Discord en cours...',
  },
  ready: {
    icon: ShieldCheck,
    tone: 'text-success-400',
    text: "Connecté à Discord. La vérification de votre accès au serveur sera disponible à l'étape suivante.",
  },
  error: {
    icon: AlertTriangle,
    tone: 'text-error-400',
    text: "Impossible de se connecter à Discord. Vérifiez votre connexion puis réessayez.",
  },
};

export default function DiscordStatusNotice({ status, onRetry }: DiscordStatusNoticeProps) {
  const { icon: Icon, tone, text } = copy[status];

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
      <Icon className={`h-5 w-5 ${tone}`} strokeWidth={1.75} aria-hidden="true" />
      <p className="text-sm leading-relaxed text-bone-300">{text}</p>
      {status === 'error' && (
        <Button variant="ghost" onClick={onRetry} className="min-h-10 px-5 text-xs">
          Réessayer
        </Button>
      )}
    </div>
  );
}
