import { useState } from 'react';
import { Lock, Smartphone, Users } from 'lucide-react';
import SterlingLogo from '@/components/brand/SterlingLogo';
import Button from '@/components/ui/Button';
import DiscordMark from '@/components/brand/DiscordMark';
import DiscordStatusNotice from '@/components/home/DiscordStatusNotice';
import { useDiscordActivity } from '@/hooks/useDiscordActivity';
import { DISCORD_CLIENT_ID, initDiscordSdk, isRunningInsideDiscord } from '@/lib/discord';
import { supabase } from '@/lib/supabase';

const HERO_IMAGE =
  'https://images.pexels.com/photos/9985044/pexels-photo-9985044.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

const highlights = [
  { icon: Users, label: 'Personnages illimités' },
  { icon: Smartphone, label: 'Téléphone virtuel' },
  { icon: Lock, label: 'Accès réservé aux membres' },
];

export default function HomePage() {
  const { status, retry } = useDiscordActivity();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleDiscordLogin = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setLoginError('');

    try {
      if (isRunningInsideDiscord()) {
        const sdk = await initDiscordSdk();
        const { code } = await sdk.commands.authorize({
          client_id: DISCORD_CLIENT_ID,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify'],
        });

        // Appel direct à la fonction : seule la clé publique est envoyée.
        // Cela évite qu'un ancien jeton de session Supabase soit ajouté automatiquement.
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-activity-auth`;
        let response: Response;

        try {
          response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ code }),
          });
        } catch (fetchError) {
          console.error('Échec réseau vers la fonction Supabase :', fetchError);
          throw new Error(
            'Le navigateur bloque ou ne parvient pas à joindre Supabase (requête réseau/CORS). La fonction n’a probablement pas reçu la demande.'
          );
        }

        const responseText = await response.text();
        let data: {
          access_token?: string;
          supabase_token_hash?: string;
          error?: string;
        };

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(`Supabase a répondu avec un contenu illisible (HTTP ${response.status}).`);
        }

        if (!response.ok) {
          throw new Error(data.error || `Erreur Supabase HTTP ${response.status}.`);
        }

        if (!data.access_token || !data.supabase_token_hash) {
          throw new Error(data.error || 'La réponse du serveur de connexion est incomplète.');
        }

        await sdk.commands.authenticate({ access_token: data.access_token });
        const { error: sessionError } = await supabase.auth.verifyOtp({
          token_hash: data.supabase_token_hash,
          type: 'magiclink',
        });
        if (sessionError) throw sessionError;
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Une erreur inconnue est survenue.';
      console.error('Erreur de connexion Discord :', error);
      setLoginError(message);
      setIsSigningIn(false);
    }
  };

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0">
        <img src={HERO_IMAGE} alt="" className="h-full w-full scale-105 object-cover opacity-35 animate-fade-in" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950/85 to-ink-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(198,161,91,0.14),transparent_60%)]" />
      </div>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:px-10">
        <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}><SterlingLogo size="lg" /></div>
        <p className="mt-10 animate-fade-up text-[11px] font-medium uppercase tracking-[0.4em] text-gold-300/90" style={{ animationDelay: '0.25s' }}>
          Université de Boston, Massachusetts
        </p>
        <h1 className="mt-4 max-w-3xl animate-fade-up text-4xl font-semibold leading-tight text-bone-100 sm:text-5xl lg:text-6xl" style={{ animationDelay: '0.35s' }}>
          Bienvenue sur le campus <span className="gold-text">Sterling</span>
        </h1>
        <p className="mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-bone-300 sm:text-lg" style={{ animationDelay: '0.45s' }}>
          Votre personnage, son téléphone et sa vie universitaire, réunis dans une seule application accessible directement depuis Discord.
        </p>
        <div className="mt-10 flex w-full max-w-sm animate-fade-up flex-col items-center gap-4" style={{ animationDelay: '0.55s' }}>
          <Button className="w-full" onClick={handleDiscordLogin} disabled={status === 'connecting' || isSigningIn} icon={<DiscordMark className="h-4 w-4" />}>
            {isSigningIn ? 'Connexion...' : 'Se connecter avec Discord'}
          </Button>
          <DiscordStatusNotice status={status} onRetry={retry} />
          {loginError && (
            <p role="alert" className="w-full rounded-xl border border-red-400/30 bg-red-950/50 px-4 py-3 text-left text-sm leading-relaxed text-red-200">
              Erreur de connexion : {loginError}
            </p>
          )}
        </div>
        <ul className="mt-14 grid w-full max-w-2xl animate-fade-up grid-cols-1 gap-3 sm:grid-cols-3" style={{ animationDelay: '0.7s' }}>
          {highlights.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center justify-center gap-3 rounded-2xl border border-gold-500/15 bg-ink-900/60 px-4 py-4 text-sm text-bone-200 backdrop-blur-sm transition-colors duration-300 hover:border-gold-500/40">
              <Icon className="h-4 w-4 shrink-0 text-gold-400" strokeWidth={1.75} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
