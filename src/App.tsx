
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
  const [accessLoading, setAccessLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus | null>(null);
  const [mode, setMode] = useState<AppMode>('choice');

  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [characterError, setCharacterError] = useState('');
  const [characterMessage, setCharacterMessage] = useState('');
  const [form, setForm] = useState<CharacterForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingCharacter, setSavingCharacter] = useState(false);

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

    const loadAdminData = async () => {
      setPlayersLoading(true);
      setCharactersLoading(true);
      setPlayersError('');
      setCharacterError('');

      const [playersResult, charactersResult] = await Promise.all([
        supabase
          .from('players')
          .select('id, discord_username, registration_status, created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('characters')
          .select(
            'id, player_id, name, first_name, age, character_type, course_position, housing, avatar_url'
          )
          .order('name', { ascending: true }),
      ]);

      if (!mounted) return;

      if (playersResult.error) {
        console.error(playersResult.error);
        setPlayersError('Impossible de charger les joueurs.');
      } else {
        setPlayers(playersResult.data as Player[]);
      }

      if (charactersResult.error) {
        console.error(charactersResult.error);
        setCharacterError('Impossible de charger les personnages.');
      } else {
        setCharacters(charactersResult.data as Character[]);
      }

      setPlayersLoading(false);
      setCharactersLoading(false);
    };

    loadAdminData();

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

  const handleFormChange = (
    field: keyof CharacterForm,
    value: string
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetCharacterForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setCharacterError('');
    setCharacterMessage('');
  };

  const handleEditCharacter = (character: Character) => {
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
    setCharacterError('');
    setCharacterMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveCharacter = async () => {
    if (!form.player_id || !form.name.trim() || !form.first_name.trim()) {
      setCharacterError('Choisis un joueur et renseigne le nom et le prénom.');
      return;
    }

    const age = form.age.trim() ? Number(form.age) : null;

    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
      setCharacterError('L’âge renseigné n’est pas valide.');
      return;
    }

    setSavingCharacter(true);
    setCharacterError('');
    setCharacterMessage('');

    if (editingId) {
      const { error } = await supabase.rpc('admin_update_character', {
        p_character_id: editingId,
        p_name: form.name.trim(),
        p_first_name: form.first_name.trim(),
        p_age: age,
        p_character_type: form.character_type,
        p_course_position: form.course_position.trim() || null,
        p_housing: form.housing.trim() || null,
      });

      if (error) {
        console.error(error);
        setCharacterError('Impossible de modifier ce personnage.');
        setSavingCharacter(false);
        return;
      }
    } else {
      const { error } = await supabase.from('characters').insert({
        player_id: form.player_id,
        name: form.name.trim(),
        first_name: form.first_name.trim(),
        age,
        character_type: form.character_type,
        course_position: form.course_position.trim() || null,
        housing: form.housing.trim() || null,
      });

      if (error) {
        console.error(error);
        setCharacterError('Impossible de créer ce personnage.');
        setSavingCharacter(false);
        return;
      }
    }

    const { data, error: reloadError } = await supabase
      .from('characters')
      .select(
        'id, player_id, name, first_name, age, character_type, course_position, housing, avatar_url'
      )
      .order('name', { ascending: true });

    if (reloadError) {
      console.error(reloadError);
      setCharacterError('Personnage enregistré, mais la liste n’a pas pu être actualisée.');
    } else {
      setCharacters(data as Character[]);
      setCharacterMessage(
        editingId ? 'Personnage modifié avec succès.' : 'Personnage créé avec succès.'
      );
      resetCharacterForm();
    }

    setSavingCharacter(false);
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!window.confirm('Veux-tu vraiment supprimer ce personnage ?')) return;

    setCharacterError('');
    setCharacterMessage('');

    const { error } = await supabase
      .from('characters')
      .delete()
      .eq('id', characterId);

    if (error) {
      console.error(error);
      setCharacterError('Impossible de supprimer ce personnage.');
      return;
    }

    setCharacters((current) =>
      current.filter((character) => character.id !== characterId)
    );

    if (editingId === characterId) resetCharacterForm();

    setCharacterMessage('Personnage supprimé.');
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

  const playerName = (playerId: string) => {
    const player = players.find((item) => item.id === playerId);
    return player?.discord_username || `Membre ${playerId.slice(0, 8)}`;
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

            <h2 className="mt-8 text-xl font-semibold text-gold-300">
              Demandes en attente ({pendingPlayers.length})
            </h2>

            {playersLoading ? (
              <p className="mt-5 text-sm text-bone-300">Chargement des joueurs...</p>
            ) : pendingPlayers.length === 0 ? (
              <p className="mt-5 rounded-xl border border-white/10 p-5 text-sm text-bone-300">
                Aucune demande en attente pour le moment.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {pendingPlayers.map((player) => (
                  <article key={player.id} className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-5">
                    <p className="font-semibold text-bone-100">
                      {player.discord_username || `Membre ${player.id.slice(0, 8)}`}
                    </p>
                    <p className="mt-1 text-xs text-bone-400">
                      Inscription : {new Date(player.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        disabled={updatingId === player.id}
                        onClick={() => handlePlayerStatus(player.id, 'approved')}
                        className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 disabled:opacity-50"
                      >
                        Accepter
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

            {playersError && <p className="mt-4 text-sm text-red-300">{playersError}</p>}

            <h2 className="mt-12 text-xl font-semibold text-bone-100">
              Autres comptes ({otherPlayers.length})
            </h2>

            <div className="mt-5 space-y-3">
              {otherPlayers.map((player) => (
                <article key={player.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/50 p-4">
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

            <div className="my-12 border-t border-gold-500/20" />

            <h2 className="text-2xl font-semibold text-gold-300">
              Gestion des personnages
            </h2>
            <p className="mt-2 text-sm text-bone-300">
              Crée et attribue les personnages aux joueurs dont l'inscription est acceptée.
            </p>

            <div className="mt-6 rounded-2xl border border-gold-500/20 bg-ink-900/70 p-5 sm:p-7">
              <h3 className="text-lg font-semibold text-bone-100">
                {editingId ? 'Modifier un personnage' : 'Créer un personnage'}
              </h3>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-bone-300">
                  Joueur
                  <select
                    value={form.player_id}
                    onChange={(event) => handleFormChange('player_id', event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100"
                  >
                    <option value="">Choisir un joueur</option>
                    {players
                      .filter((player) => player.registration_status === 'approved')
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.discord_username || `Membre ${player.id.slice(0, 8)}`}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="text-sm text-bone-300">
                  Statut
                  <select
                    value={form.character_type}
                    onChange={(event) => handleFormChange('character_type', event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100"
                  >
                    <option value="Étudiant(e)">Étudiant(e)</option>
                    <option value="Membre du personnel">Membre du personnel</option>
                  </select>
                </label>

                <label className="text-sm text-bone-300">
                  Nom
                  <input
                    value={form.name}
                    onChange={(event) => handleFormChange('name', event.target.value)}
                    placeholder="Nom de famille"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100"
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Prénom
                  <input
                    value={form.first_name}
                    onChange={(event) => handleFormChange('first_name', event.target.value)}
                    placeholder="Prénom"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100"
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Âge
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={form.age}
                    onChange={(event) => handleFormChange('age', event.target.value)}
                    placeholder="Âge"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100"
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Poste ou cursus
                  <input
                    value={form.course_position}
                    onChange={(event) => handleFormChange('course_position', event.target.value)}
                    placeholder="Ex. Psychologue ou Droit"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100"
                  />
                </label>

                <label className="text-sm text-bone-300 sm:col-span-2">
                  Logement
                  <input
                    value={form.housing}
                    onChange={(event) => handleFormChange('housing', event.target.value)}
                    placeholder="Résidence, fraternité, sororité..."
                    className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100"
                  />
                </label>
              </div>

              {characterError && (
                <p className="mt-4 text-sm text-red-300">{characterError}</p>
              )}
              {characterMessage && (
                <p className="mt-4 text-sm text-green-300">{characterMessage}</p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  disabled={savingCharacter}
                  onClick={handleSaveCharacter}
                  className="rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950 disabled:opacity-50"
                >
                  {savingCharacter ? 'Enregistrement...' : editingId ? 'Enregistrer les modifications' : 'Créer le personnage'}
                </button>
                {editingId && (
                  <button
                    onClick={resetCharacterForm}
                    className="rounded-lg border border-white/20 px-5 py-3 text-sm text-bone-300"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </div>

            <h3 className="mt-10 text-xl font-semibold text-bone-100">
              Personnages enregistrés ({characters.length})
            </h3>

            {charactersLoading ? (
              <p className="mt-5 text-sm text-bone-300">Chargement des personnages...</p>
            ) : characterError && characters.length === 0 ? (
              <p className="mt-5 text-sm text-red-300">{characterError}</p>
            ) : characters.length === 0 ? (
              <p className="mt-5 rounded-xl border border-white/10 p-5 text-sm text-bone-300">
                Aucun personnage n'a encore été créé.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {characters.map((character) => (
                  <article key={character.id} className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-bone-100">
                          {character.first_name} {character.name}
                        </p>
                        <p className="mt-1 text-xs text-gold-300">
                          {character.character_type || 'Statut non renseigné'}
                        </p>
                        <p className="mt-2 text-sm text-bone-300">
                          Joueur : {playerName(character.player_id)}
                        </p>
                        <p className="mt-1 text-xs text-bone-400">
                          {character.age ? `${character.age} ans` : 'Âge non renseigné'}
                          {character.course_position ? ` · ${character.course_position}` : ''}
                          {character.housing ? ` · ${character.housing}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditCharacter(character)}
                          className="rounded-lg border border-gold-500/40 px-3 py-2 text-xs text-gold-300"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDeleteCharacter(character.id)}
                          className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-300"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

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
