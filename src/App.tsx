
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AppShell from '@/components/AppShell';
import HomePage from '@/pages/HomePage';
import PlayerSpace from '@/pages/PlayerSpace';
import { supabase } from '@/lib/supabase';

type RegistrationStatus = 'pending' | 'approved' | 'rejected';
type AppMode = 'choice' | 'admin' | 'player';

type Player = {
  id: string;
  discord_username: string | null;
  registration_status: RegistrationStatus;
  created_at: string;
};

type Character = {
  id: string;
  player_id: string;
  name: string;
  first_name: string | null;
  age: number | null;
  character_type: string | null;
  course_position: string | null;
  housing: string | null;
  avatar_url: string | null;
};

type CharacterForm = {
  player_id: string;
  name: string;
  first_name: string;
  age: string;
  character_type: string;
  course_position: string;
  housing: string;
};

const emptyForm: CharacterForm = {
  player_id: '',
  name: '',
  first_name: '',
  age: '',
  character_type: 'Étudiant(e)',
  course_position: '',
  housing: '',
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus>('pending');
  const [mode, setMode] = useState<AppMode>('choice');

  const [players, setPlayers] = useState<Player[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);

  const [form, setForm] = useState<CharacterForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAccess = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setSession(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setSession(currentSession);

    const { data: adminResult, error: adminError } =
      await supabase.rpc('is_admin');

    if (adminError) {
      console.error(adminError);
      setError('Impossible de vérifier les accès.');
      setLoading(false);
      return;
    }

    const admin = adminResult === true;
    setIsAdmin(admin);

    if (admin) {
      setRegistrationStatus('approved');
      setLoading(false);
      return;
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('registration_status')
      .eq('id', currentSession.user.id)
      .maybeSingle();

    if (playerError || !player) {
      console.error(playerError);
      setError('Impossible de récupérer votre inscription.');
      setLoading(false);
      return;
    }

    setRegistrationStatus(player.registration_status);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const { data } = await supabase.auth.getSession();

      if (mounted) {
        await loadAccess(data.session);
      }
    };

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setLoading(true);
        void loadAccess(newSession);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAccess]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMode('choice');
  };

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;

    setError('');

    const [playersResult, charactersResult] = await Promise.all([
      supabase
        .from('players')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('characters')
        .select('*')
        .order('name', { ascending: true }),
    ]);

    if (playersResult.error) {
      console.error(playersResult.error);
      setError('Impossible de charger les comptes joueurs.');
      return;
    }

    if (charactersResult.error) {
      console.error(charactersResult.error);
      setError('Impossible de charger les personnages.');
      return;
    }

    setPlayers(playersResult.data as Player[]);
    setCharacters(charactersResult.data as Character[]);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && mode === 'admin') {
      void loadAdminData();
    }
  }, [isAdmin, mode, loadAdminData]);

  const updatePlayerStatus = async (
    playerId: string,
    status: RegistrationStatus
  ) => {
    setError('');
    setMessage('');

    const { error: updateError } = await supabase
      .from('players')
      .update({ registration_status: status })
      .eq('id', playerId);

    if (updateError) {
      console.error(updateError);
      setError('Impossible de modifier le statut de ce compte.');
      return;
    }

    setMessage(
      status === 'approved'
        ? 'Le compte a été accepté.'
        : 'Le compte a été refusé.'
    );

    await loadAdminData();
  };

  const updateForm = (field: keyof CharacterForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const editCharacter = (character: Character) => {
    setEditingId(character.id);

    setForm({
      player_id: character.player_id,
      name: character.name || '',
      first_name: character.first_name || '',
      age: character.age?.toString() || '',
      character_type: character.character_type || 'Étudiant(e)',
      course_position: character.course_position || '',
      housing: character.housing || '',
    });

    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveCharacter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.player_id || !form.name.trim() || !form.first_name.trim()) {
      setError('Merci de remplir le joueur, le nom et le prénom.');
      return;
    }

    const age = form.age.trim() ? Number(form.age) : null;

    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
      setError('Merci de saisir un âge valide.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    if (editingId) {
      const { error: updateError } = await supabase.rpc(
        'admin_update_character',
        {
          p_character_id: editingId,
          p_name: form.name.trim(),
          p_first_name: form.first_name.trim(),
          p_age: age,
          p_character_type: form.character_type,
          p_course_position: form.course_position.trim() || null,
          p_housing: form.housing.trim() || null,
        }
      );

      if (updateError) {
        console.error(updateError);
        setError('Impossible de modifier ce personnage.');
        setSaving(false);
        return;
      }

      setMessage('Le personnage a été modifié.');
    } else {
      const { error: insertError } = await supabase
        .from('characters')
        .insert({
          player_id: form.player_id,
          name: form.name.trim(),
          first_name: form.first_name.trim(),
          age,
          character_type: form.character_type,
          course_position: form.course_position.trim() || null,
          housing: form.housing.trim() || null,
        });

      if (insertError) {
        console.error(insertError);
        setError('Impossible de créer ce personnage.');
        setSaving(false);
        return;
      }

      setMessage('Le personnage a été créé.');
    }

    resetForm();
    await loadAdminData();
    setSaving(false);
  };

  const deleteCharacter = async (characterId: string) => {
    const confirmed = window.confirm(
      'Voulez-vous vraiment supprimer ce personnage ?'
    );

    if (!confirmed) return;

    setError('');
    setMessage('');

    const { error: deleteError } = await supabase
      .from('characters')
      .delete()
      .eq('id', characterId);

    if (deleteError) {
      console.error(deleteError);
      setError('Impossible de supprimer ce personnage.');
      return;
    }

    setMessage('Le personnage a été supprimé.');

    if (editingId === characterId) {
      resetForm();
    }

    await loadAdminData();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-bone-100">
        <p className="text-sm tracking-widest text-gold-300">
          STERLING UNIVERSITY · CHARGEMENT
        </p>
      </div>
    );
  }

  if (!session) {
    return <HomePage />;
  }

  if (error && !isAdmin && registrationStatus === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6 text-center text-bone-100">
        <div>
          <h1 className="text-2xl font-semibold">Une erreur est survenue</h1>
          <p className="mt-4 text-sm text-red-300">{error}</p>
          <button
            onClick={signOut}
            className="mt-8 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin && registrationStatus === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6 text-center text-bone-100">
        <div className="max-w-lg">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
            Sterling University
          </p>
          <h1 className="mt-6 text-3xl font-semibold">
            Demande en attente
          </h1>
          <p className="mt-4 text-sm leading-7 text-bone-300">
            Votre demande d'inscription a bien été enregistrée. Elle doit
            maintenant être examinée par l'administration.
          </p>
          <p className="mt-3 text-sm text-bone-400">
            Vous pourrez accéder à votre espace joueur après validation.
          </p>
          <button
            onClick={signOut}
            className="mt-8 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin && registrationStatus === 'rejected') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6 text-center text-bone-100">
        <div className="max-w-lg">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
            Sterling University
          </p>
          <h1 className="mt-6 text-3xl font-semibold">
            Demande refusée
          </h1>
          <p className="mt-4 text-sm leading-7 text-bone-300">
            Votre demande d'accès à Sterling University n'a pas été acceptée.
            Vous ne pouvez actuellement pas accéder à l'application.
          </p>
          <button
            onClick={signOut}
            className="mt-8 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-ink-950 text-bone-100">
        <header className="flex items-center justify-between border-b border-gold-500/20 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-300">
              Sterling University
            </p>
            <p className="mt-1 text-xs text-bone-400">
              {session.user.user_metadata?.global_name ||
                session.user.user_metadata?.name ||
                'Mon compte'}
            </p>
          </div>

          <button
            onClick={signOut}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs text-bone-300 transition hover:border-gold-500/40 hover:text-gold-300"
          >
            Déconnexion
          </button>
        </header>

        {isAdmin && mode === 'choice' && (
          <main className="flex min-h-[75vh] items-center justify-center px-6 py-12">
            <div className="w-full max-w-3xl">
              <p className="text-center text-xs uppercase tracking-[0.35em] text-gold-300">
                Sterling University
              </p>
              <h1 className="mt-5 text-center text-3xl font-semibold">
                Bienvenue
              </h1>
              <p className="mt-3 text-center text-sm text-bone-300">
                Choisissez l'espace auquel vous souhaitez accéder.
              </p>

              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                <button
                  onClick={() => setMode('admin')}
                  className="rounded-2xl border border-gold-500/30 bg-ink-900/70 p-8 text-left transition hover:border-gold-400 hover:bg-ink-900"
                >
                  <span className="text-3xl">⚜</span>
                  <h2 className="mt-5 text-xl font-semibold text-gold-300">
                    Administration
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-bone-300">
                    Gérer les inscriptions, les joueurs et les personnages de
                    l'université.
                  </p>
                </button>

                <button
                  onClick={() => setMode('player')}
                  className="rounded-2xl border border-white/10 bg-ink-900/70 p-8 text-left transition hover:border-gold-500/40"
                >
                  <span className="text-3xl">♙</span>
                  <h2 className="mt-5 text-xl font-semibold">
                    Mon espace joueur
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-bone-300">
                    Retrouver vos personnages et accéder à leur espace
                    personnel.
                  </p>
                </button>
              </div>
            </div>
          </main>
        )}

        {isAdmin && mode === 'admin' && (
          <main className="mx-auto w-full max-w-6xl px-6 py-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gold-300">
                  Espace administrateur
                </p>
                <h1 className="mt-3 text-3xl font-semibold">
                  Administration
                </h1>
              </div>

              <button
                onClick={() => setMode('choice')}
                className="rounded-xl border border-gold-500/30 px-5 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
              >
                Changer d'espace
              </button>
            </div>

            {message && (
              <p className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-green-300">
                {message}
              </p>
            )}

            {error && (
              <p className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                {error}
              </p>
            )}

            <section className="mt-12">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Demandes en attente</h2>
                <span className="text-sm text-gold-300">
                  {players.filter((p) => p.registration_status === 'pending').length}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {players.filter((p) => p.registration_status === 'pending').length === 0 ? (
                  <p className="rounded-xl border border-white/10 p-5 text-sm text-bone-400">
                    Aucune demande en attente.
                  </p>
                ) : (
                  players
                    .filter((p) => p.registration_status === 'pending')
                    .map((player) => (
                      <div
                        key={player.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold-500/20 bg-ink-900/60 p-5"
                      >
                        <div>
                          <p className="font-medium">
                            {player.discord_username || 'Membre Discord'}
                          </p>
                          <p className="mt-1 text-xs text-bone-400">
                            Demande reçue le{' '}
                            {new Date(player.created_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => updatePlayerStatus(player.id, 'approved')}
                            className="rounded-lg border border-green-500/30 px-4 py-2 text-xs text-green-300 hover:bg-green-500/10"
                          >
                            Accepter
                          </button>
                          <button
                            onClick={() => updatePlayerStatus(player.id, 'rejected')}
                            className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-300 hover:bg-red-500/10"
                          >
                            Refuser
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="text-xl font-semibold">Autres comptes</h2>
              <div className="mt-5 space-y-3">
                {players
                  .filter((p) => p.registration_status !== 'pending')
                  .map((player) => (
                    <div
                      key={player.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-ink-900/50 p-5"
                    >
                      <div>
                        <p className="font-medium">
                          {player.discord_username || 'Membre Discord'}
                        </p>
                        <p className="mt-1 text-xs text-bone-400">
                          {player.registration_status === 'approved'
                            ? 'Compte accepté'
                            : 'Compte refusé'}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {player.registration_status === 'approved' ? (
                          <button
                            onClick={() => updatePlayerStatus(player.id, 'rejected')}
                            className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-300"
                          >
                            Révoquer l'accès
                          </button>
                        ) : (
                          <button
                            onClick={() => updatePlayerStatus(player.id, 'approved')}
                            className="rounded-lg border border-green-500/30 px-4 py-2 text-xs text-green-300"
                          >
                            Réaccepter
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            <section className="mt-14 border-t border-gold-500/20 pt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-gold-300">
                Gestion des personnages
              </p>
              <h2 className="mt-3 text-2xl font-semibold">
                {editingId ? 'Modifier un personnage' : 'Créer un personnage'}
              </h2>
              <p className="mt-2 text-sm text-bone-400">
                Ajoutez ici les personnages dont la fiche a déjà été validée
                sur Discord.
              </p>

              <form
                onSubmit={saveCharacter}
                className="mt-7 grid gap-5 rounded-2xl border border-gold-500/20 bg-ink-900/60 p-6 sm:grid-cols-2"
              >
                <label className="text-sm text-bone-300 sm:col-span-2">
                  Joueur associé
                  <select
                    required
                    disabled={Boolean(editingId)}
                    value={form.player_id}
                    onChange={(e) => updateForm('player_id', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-4 py-3 text-sm text-bone-100 disabled:opacity-50"
                  >
                    <option value="">Sélectionner un joueur</option>
                    {players
                      .filter((p) => p.registration_status === 'approved')
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.discord_username || 'Membre Discord'}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="text-sm text-bone-300">
                  Nom
                  <input
                    required
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-4 py-3 text-sm text-bone-100"
                    placeholder="Nom du personnage"
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Prénom
                  <input
                    required
                    value={form.first_name}
                    onChange={(e) => updateForm('first_name', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-4 py-3 text-sm text-bone-100"
                    placeholder="Prénom du personnage"
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Âge
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={form.age}
                    onChange={(e) => updateForm('age', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-4 py-3 text-sm text-bone-100"
                    placeholder="Âge"
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Statut
                  <select
                    value={form.character_type}
                    onChange={(e) => updateForm('character_type', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-4 py-3 text-sm text-bone-100"
                  >
                    <option value="Étudiant(e)">Étudiant(e)</option>
                    <option value="Membre du personnel">Membre du personnel</option>
                  </select>
                </label>

                <label className="text-sm text-bone-300">
                  Poste ou cours
                  <input
                    value={form.course_position}
                    onChange={(e) => updateForm('course_position', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-4 py-3 text-sm text-bone-100"
                    placeholder="Ex. Droit, professeur..."
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Logement
                  <input
                    value={form.housing}
                    onChange={(e) => updateForm('housing', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-4 py-3 text-sm text-bone-100"
                    placeholder="Résidence, fraternité..."
                  />
                </label>

                <div className="flex flex-wrap gap-3 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-gold-500 px-6 py-3 text-sm font-medium text-ink-950 transition hover:bg-gold-400 disabled:opacity-50"
                  >
                    {saving
                      ? 'Enregistrement...'
                      : editingId
                        ? 'Enregistrer les modifications'
                        : 'Créer le personnage'}
                  </button>

                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-xl border border-white/10 px-6 py-3 text-sm text-bone-300"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </form>

              <div className="mt-10">
                <h3 className="text-lg font-semibold">
                  Personnages enregistrés ({characters.length})
                </h3>

                <div className="mt-5 space-y-3">
                  {characters.length === 0 ? (
                    <p className="rounded-xl border border-white/10 p-5 text-sm text-bone-400">
                      Aucun personnage enregistré pour le moment.
                    </p>
                  ) : (
                    characters.map((character) => {
                      const owner = players.find(
                        (p) => p.id === character.player_id
                      );

                      return (
                        <div
                          key={character.id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-ink-900/50 p-5"
                        >
                          <div>
                            <p className="font-medium">
                              {character.first_name} {character.name}
                            </p>
                            <p className="mt-1 text-xs text-bone-400">
                              {character.character_type || 'Personnage'} ·{' '}
                              {owner?.discord_username || 'Joueur inconnu'}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => editCharacter(character)}
                              className="rounded-lg border border-gold-500/30 px-4 py-2 text-xs text-gold-300"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => deleteCharacter(character.id)}
                              className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-300"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </main>
        )}

        {(!isAdmin || mode === 'player') && (
          <div>
            {isAdmin && (
              <div className="mx-auto max-w-5xl px-6 pt-6">
                <button
                  onClick={() => setMode('choice')}
                  className="rounded-xl border border-gold-500/30 px-5 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
                >
                  Retour au choix des espaces
                </button>
              </div>
            )}

            <PlayerSpace playerId={session.user.id} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
