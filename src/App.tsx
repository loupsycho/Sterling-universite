
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import AppShell from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import { supabase } from '@/lib/supabase';

type AppMode = 'choice' | 'admin' | 'player';
type RegistrationStatus = 'pending' | 'approved' | 'rejected';

type Player = {
  id: string;
  discord_username: string | null;
  registration_status: RegistrationStatus;
  created_at: string;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus | null>(null);
  const [mode, setMode] = useState<AppMode>('choice');

  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setMode('choice');
      setIsAdmin(false);
      setRegistrationStatus(null);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error(error);
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
        setAccessLoading(false);
        return;
      }

      setAccessLoading(true);

      const { data: adminData, error: adminError } =
        await supabase.rpc('is_admin');

      if (!mounted) return;

      const admin = !adminError && adminData === true;
      setIsAdmin(admin);

      if (admin) {
        setRegistrationStatus('approved');
        setAccessLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('players')
        .select('registration_status')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error(error);
        setRegistrationStatus(null);
      } else {
        setRegistrationStatus(
          data?.registration_status as RegistrationStatus | null
        );
      }

      setAccessLoading(false);
    };

    loadAccess();

    return () => {
      mounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isAdmin || mode !== 'admin') return;

    let mounted = true;

    const loadPlayers = async () => {
      setPlayersLoading(true);
      setPlayersError('');

      const { data, error } = await supabase
        .from('players')
        .select('id, discord_username, registration_status, created_at')
        .order('created_at', { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error(error);
        setPlayersError('Impossible de charger la liste des joueurs.');
      } else {
        setPlayers(data as Player[]);
      }

      setPlayersLoading(false);
    };

    loadPlayers();

    return () => {
      mounted = false;
    };
  }, [isAdmin, mode]);

  const handlePlayerStatus = async (
    playerId: string,
    status: RegistrationStatus
  ) => {
    setUpdatingId(playerId);
    setPlayersError('');

    const { error } = await supabase
      .from('players')
      .update({ registration_status: status })
      .eq('id', playerId);

    if (error) {
      console.error(error);
      setPlayersError('La modification du statut a échoué.');
    } else {
      setPlayers((current) =>
        current.map((player) =>
          player.id === playerId
            ? { ...player, registration_status: status }
            : player
        )
      );
    }

    setUpdatingId(null);
  };

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

  const pendingPlayers = players.filter(
    (player) => player.registration_status === 'pending'
  );

  const otherPlayers = players.filter(
    (player) => player.registration_status !== 'pending'
  );

  const statusLabel = (status: RegistrationStatus) => {
    if (status === 'approved') return 'Accepté';
    if (status === 'rejected') return 'Refusé';
    return 'En attente';
  };

  return (
    <AppShell>
      {loading || accessLoading ? (
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
      ) : mode === 'admin' ? (
        <section className="flex flex-1 flex-col px-6 py-10">
          <div className="mx-auto w-full max-w-4xl">
            <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
              Sterling University
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-bone-100">
              Administration
            </h1>
            <p className="mt-3 text-sm text-bone-300">
              Consulte les demandes d'inscription et gère les accès.
            </p>

            {playersError && (
              <p className="mt-6 rounded-xl border border-red-500/30 p-4 text-sm text-red-300">
                {playersError}
              </p>
            )}

            <h2 className="mt-10 text-xl font-semibold text-gold-300">
              Demandes en attente ({pendingPlayers.length})
            </h2>

            {playersLoading ? (
              <p className="mt-5 text-sm text-bone-300">
                Chargement des joueurs...
              </p>
            ) : pendingPlayers.length === 0 ? (
              <p className="mt-5 rounded-xl border border-white/10 p-5 text-sm text-bone-300">
                Aucune demande en attente pour le moment.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {pendingPlayers.map((player) => (
                  <article
                    key={player.id}
                    className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-5"
                  >
                    <p className="font-semibold text-bone-100">
                      {player.discord_username || `Membre ${player.id.slice(0, 8)}`}
                    </p>
                    <p className="mt-1 text-xs text-bone-400">
                      Inscription : {new Date(player.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    <p className="mt-3 text-sm text-gold-300">
                      En attente de validation
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        disabled={updatingId === player.id}
                        onClick={() => handlePlayerStatus(player.id, 'approved')}
                        className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 disabled:opacity-50"
                      >
                        {updatingId === player.id ? 'Modification...' : 'Accepter'}
                      </button>
                      <button
                        disabled={updatingId === player.id}
                        onClick={() => handlePlayerStatus(player.id, 'rejected')}
                        className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <h2 className="mt-12 text-xl font-semibold text-bone-100">
              Autres comptes ({otherPlayers.length})
            </h2>

            <div className="mt-5 space-y-3">
              {otherPlayers.map((player) => (
                <article
                  key={player.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/50 p-4"
                >
                  <div>
                    <p className="font-medium text-bone-100">
                      {player.discord_username || `Membre ${player.id.slice(0, 8)}`}
                    </p>
                    <p className="mt-1 text-xs text-bone-400">
                      {statusLabel(player.registration_status)}
                    </p>
                  </div>
                  {player.registration_status === 'approved' ? (
                    <button
                      disabled={updatingId === player.id}
                      onClick={() => handlePlayerStatus(player.id, 'rejected')}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-300 disabled:opacity-50"
                    >
                      Refuser l'accès
                    </button>
                  ) : (
                    <button
                      disabled={updatingId === player.id}
                      onClick={() => handlePlayerStatus(player.id, 'approved')}
                      className="rounded-lg border border-gold-500/40 px-3 py-2 text-xs text-gold-300 disabled:opacity-50"
                    >
                      Accepter
                    </button>
                  )}
                </article>
              ))}
            </div>

            <button
              onClick={() => setMode('choice')}
              className="mt-10 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
            >
              Retour au choix des espaces
            </button>
          </div>
        </section>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
            Sterling University
          </p>
          <h1 className="mt-6 text-3xl font-semibold text-bone-100">
            Mon espace joueur
          </h1>
          <p className="mt-4 text-sm text-bone-300">
            Vos personnages seront bientôt disponibles.
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
