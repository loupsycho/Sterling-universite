
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import AppShell from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import { supabase } from '@/lib/supabase';

type AppMode = 'choice' | 'admin' | 'player';
type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus | null>(null);
  const [mode, setMode] = useState<AppMode>('choice');

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setMode('choice');
      setIsAdmin(false);
      setRegistrationStatus(null);
      setLoading(true);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error);
      }
      setSession(data.session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadAccess = async () => {
      if (!session) {
        setIsAdmin(false);
        setRegistrationStatus(null);
        return;
      }

      const { data: adminData, error: adminError } =
        await supabase.rpc('is_admin');

      if (!mounted) return;

      const admin = !adminError && adminData === true;
      setIsAdmin(admin);

      if (admin) {
        setRegistrationStatus('approved');
        return;
      }

      const { data, error } = await supabase
        .from('players')
        .select('registration_status')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error('Erreur de vérification du compte :', error);
        setRegistrationStatus(null);
        return;
      }

      setRegistrationStatus(
        data?.registration_status as RegistrationStatus | null
      );
    };

    loadAccess();

    return () => {
      mounted = false;
    };
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMode('choice');
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
      ) : !session ? (
        <HomePage />
      ) : registrationStatus === null ? (
        <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold text-bone-100">
            Vérification de votre inscription
          </h1>
          <p className="mt-4 text-sm text-bone-300">
            Impossible de vérifier votre accès. Veuillez réessayer en vous reconnectant.
          </p>
          <button onClick={handleSignOut} className="mt-8 text-gold-300 underline">
            Se déconnecter
          </button>
        </section>
      ) : registrationStatus === 'pending' ? (
        <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="text-4xl">⌛</span>
          <h1 className="mt-6 text-3xl font-semibold text-gold-300">
            Demande en attente
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-bone-300">
            Votre demande d'inscription à Sterling University a bien été reçue.
            Elle sera examinée par l'administration. Vous pourrez accéder à votre
            espace personnel dès qu'elle sera acceptée.
          </p>
          <button onClick={handleSignOut} className="mt-10 text-sm text-bone-400 underline">
            Se déconnecter
          </button>
        </section>
      ) : registrationStatus === 'rejected' ? (
        <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="text-4xl">✕</span>
          <h1 className="mt-6 text-3xl font-semibold text-bone-100">
            Demande refusée
          </h1>
          <p className="mt-4 max-w-md text-sm text-bone-300">
            Votre demande d'inscription n'a pas été acceptée.
            Vous ne pouvez pas accéder à Sterling Campus.
          </p>
          <button onClick={handleSignOut} className="mt-10 text-sm text-bone-400 underline">
            Se déconnecter
          </button>
        </section>
      ) : mode === 'choice' ? (
        <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
            Sterling University
          </p>
          <h1 className="mt-6 text-3xl font-semibold text-bone-100">
            Bienvenue, {displayName}
          </h1>
          <p className="mt-4 text-sm text-bone-300">
            Choisissez l'espace que vous souhaitez rejoindre.
          </p>

          <div className="mt-10 grid w-full max-w-xl gap-5 sm:grid-cols-2">
            {isAdmin && (
              <button
                onClick={() => setMode('admin')}
                className="rounded-2xl border border-gold-500/40 bg-ink-900/80 p-8 text-left transition hover:border-gold-400 hover:bg-ink-800"
              >
                <span className="text-2xl">♛</span>
                <h2 className="mt-5 text-xl font-semibold text-gold-300">
                  Administration
                </h2>
                <p className="mt-3 text-sm text-bone-300">
                  Gérer les joueurs et les personnages.
                </p>
              </button>
            )}

            <button
              onClick={() => setMode('player')}
              className="rounded-2xl border border-gold-500/20 bg-ink-900/80 p-8 text-left transition hover:border-gold-400 hover:bg-ink-800"
            >
              <span className="text-2xl">♙</span>
              <h2 className="mt-5 text-xl font-semibold text-gold-300">
                Mon espace joueur
              </h2>
              <p className="mt-3 text-sm text-bone-300">
                Retrouver mes personnages et leurs téléphones.
              </p>
            </button>
          </div>

          <button onClick={handleSignOut} className="mt-10 text-sm text-bone-400 underline">
            Se déconnecter
          </button>
        </section>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
            Sterling University
          </p>
          <h1 className="mt-6 text-3xl font-semibold text-bone-100">
            {mode === 'admin' ? 'Administration' : 'Mon espace joueur'}
          </h1>
          <p className="mt-4 text-sm text-bone-300">
            {mode === 'admin'
              ? 'Votre espace de gestion sera bientôt disponible.'
              : 'Vos personnages seront bientôt disponibles.'}
          </p>
          <button
            onClick={() => setMode('choice')}
            className="mt-10 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
          >
            Retour au choix des espaces
          </button>
        </section>
      )}
    </AppShell>
  );
}
