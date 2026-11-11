
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import AppShell from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import { supabase } from '@/lib/supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error('Erreur de récupération de session :', error);
      }

      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert('Erreur de déconnexion : ' + error.message);
    }
  };

  const metadata = session?.user.user_metadata ?? {};
  const displayName =
    metadata.global_name ||
    metadata.username ||
    metadata.full_name ||
    'Membre';

  return (
    <AppShell>
      {loading ? (
        <section className="flex flex-1 items-center justify-center">
          <p className="text-sm tracking-widest text-gold-300">
            CHARGEMENT DE STERLING CAMPUS...
          </p>
        </section>
      ) : session ? (
        <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-full max-w-xl rounded-2xl border border-gold-500/20 bg-ink-900/70 p-8 shadow-xl">
            <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
              Sterling University
            </p>

            <h1 className="mt-6 text-3xl font-semibold text-bone-100">
              Bienvenue, {displayName}
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-bone-300">
              Votre connexion est établie.
              Retrouvez votre espace personnel et gérez vos personnages.
            </p>

            <div className="mt-8 rounded-xl border border-gold-500/10 bg-ink-950/70 p-5">
              <p className="text-sm text-bone-200">
                Mon espace personnel
              </p>
              <p className="mt-2 text-xs text-bone-400">
                La sélection de vos personnages sera bientôt disponible.
              </p>
            </div>

            <button
              onClick={handleSignOut}
              className="mt-8 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
            >
              Se déconnecter
            </button>
          </div>
        </section>
      ) : (
        <HomePage />
      )}
    </AppShell>
  );
}
