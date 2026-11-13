
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import AppShell from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import PlayerSpace from '@/pages/PlayerSpace';
import SecretScoop from '@/components/SecretScoop';
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
  extracurricular_activity: string | null;
  study_program: string | null;
  university_responsibility: string | null;
  staff_job: string | null;
  housing: string | null;
  avatar_url: string | null;
};

type CharacterForm = {
  player_id: string;
  name: string;
  first_name: string;
  age: string;
  character_type: string;
  extracurricular_activity: string;
  study_program: string;
  university_responsibility: string;
  staff_job: string;
  housing: string;
};

const getSavedMode = (userId: string): AppMode => {
  try {
    const saved = localStorage.getItem(`sterling_app_mode_${userId}`);

    if (saved === 'admin' || saved === 'player' || saved === 'choice') {
      return saved;
    }
  } catch (error) {
    console.error('Impossible de récupérer la dernière page.', error);
  }

  return 'choice';
};

const activities = [
  '⚽ Football',
  '🏈 Rugby',
  '🏀 Basketball',
  '🏐 Volleyball',
  '🎾 Tennis',
  '🏸 Badminton',
  '🏊 Natation',
  '🎵 Musique',
  '🤸 Gymnastique',
  '🥊 Boxe',
  '🏃 Athlétisme',
  '💃 Danse',
  '⛸️ Patinage',
  '🎨 Art plastique & visuel',
  'Aucune activité',
];

const studyPrograms = [
  'DROIT & SCIENCES JURIDIQUES',
  'MÉDECINE & SCIENCES DE LA SANTÉ',
  'SCIENCES & RECHERCHE',
  'INFORMATIQUE & TECHNOLOGIES',
  'COMMERCE, ÉCONOMIE & GESTION',
  'PSYCHOLOGIE & SCIENCES SOCIALES',
  'ARTS, CULTURE & COMMUNICATION',
  'LETTRES & SCIENCES HUMAINES',
  'LANGUES ÉTRANGÈRES',
  'SPORT & ACTIVITÉS PHYSIQUES',
  'ASTROPHYSIQUE',
  'HISTOIRE, LINGUISTE & ARCHÉOLOGIE',
];

const houseResponsibilities = [
  'Chef(fe) de Kappa Gold',
  'Sous-chef(fe) de Kappa Gold',
  'Chef(fe) d’Omega Crow',
  'Sous-chef(fe) d’Omega Crow',
  'Chef(fe) d’Alpha King',
  'Sous-chef(fe) d’Alpha King',
];

const activityResponsibility = (activity: string) =>
  `Chef(fe) de ${activity.replace(/^[^\p{L}]+/u, '').trim()}`;

const staffJobs = [
  {
    category: 'Direction',
    jobs: ['Directeur', 'Directeur adjoint'],
  },
  {
    category: 'Corps enseignant',
    jobs: [
      'Professeur — Droit & sciences juridiques',
      'Professeur — Médecine & sciences de la santé',
      'Professeur — Sciences & recherche',
      'Professeur — Informatique & technologies',
      'Professeur — Commerce, économie & gestion',
      'Professeur — Psychologie & sciences sociales',
      'Professeur — Arts, culture & communication',
      'Professeur — Lettres & sciences humaines',
      'Professeur — Langues étrangères',
      'Professeur — Sport & activités physiques',
      'Professeur — Astrophysique',
      'Professeur — Histoire, Linguiste & Archéologie',
    ],
  },
  {
    category: 'Services universitaires',
    jobs: [
      'Psychologue',
      'Médecin universitaire',
      'Infirmier(ère)',
      'Surveillant(e)',
      'Secrétaire / Accueil',
      'Agent de sécurité',
      'Responsable des résidences étudiantes',
      'Conseiller d’orientation',
      'Bibliothécaire',
      'Agent d’entretien',
      'Personnel de la cafétéria',
    ],
  },
  {
    category: 'Vie universitaire',
    jobs: [
      'Responsable des événements universitaires',
      'Responsable de l’aile sportive',
      'Responsable adjoint de l’aile sportive',
    ],
  },
];

const housingOptions = [
  'Immeuble étudiant',
  'Résidence du personnel',
  'Omega Crow',
  'Kappa Gold',
  'Alpha King',
];

const emptyForm: CharacterForm = {
  player_id: '',
  name: '',
  first_name: '',
  age: '',
  character_type: 'Étudiant(e)',
  extracurricular_activity: '',
  study_program: '',
  university_responsibility: '',
  staff_job: '',
  housing: '',
};

const selectClass =
  'mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100';

const inputClass =
  'mt-2 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-3 text-bone-100';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus | null>(null);

  const [mode, setMode] = useState<AppMode>('choice');
  const [modeReady, setModeReady] = useState(false);
  const [adminScoopOpen, setAdminScoopOpen] = useState(false);
  const [scoopNotificationCount, setScoopNotificationCount] = useState(0);
  const [activeAdminCategory, setActiveAdminCategory] = useState<'home' | 'players' | 'management' | 'registered'>('home');
  const [activePlayerSection, setActivePlayerSection] = useState<'pending' | 'approved'>('pending');

  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [expandedCharacterPlayerId, setExpandedCharacterPlayerId] = useState<string | null>(null);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [characterError, setCharacterError] = useState('');
  const [characterMessage, setCharacterMessage] = useState('');

  const [form, setForm] = useState<CharacterForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingCharacter, setSavingCharacter] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (newSession) {
          setMode(getSavedMode(newSession.user.id));
          setModeReady(true);
        } else {
          setMode('choice');
          setModeReady(false);
        }
      }

      if (event === 'SIGNED_OUT') {
        setMode('choice');
        setModeReady(false);
        setIsAdmin(false);
        setRegistrationStatus(null);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error(error);
      setSession(data.session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Mémorise le dernier espace utilisé pour chaque compte.
  useEffect(() => {
    if (!session || !modeReady) return;

    try {
      localStorage.setItem(
        `sterling_app_mode_${session.user.id}`,
        mode
      );
    } catch (error) {
      console.error('Impossible de mémoriser la page.', error);
    }
  }, [session, mode, modeReady]);

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
    if (!isAdmin || mode !== 'admin') {
      setScoopNotificationCount(0);
      return;
    }

    let mounted = true;

    const loadScoopNotifications = async () => {
      const [submissionsResult, messagesResult] = await Promise.all([
        supabase
          .from('scoop_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('scoop_messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_type', 'character')
          .is('read_at', null),
      ]);

      if (!mounted) return;

      setScoopNotificationCount(
        (submissionsResult.count || 0) + (messagesResult.count || 0)
      );
    };

    loadScoopNotifications();
    const interval = window.setInterval(loadScoopNotifications, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [isAdmin, mode, adminScoopOpen]);

  const characterSelect =
    'id, player_id, name, first_name, age, character_type, course_position, extracurricular_activity, study_program, university_responsibility, staff_job, housing, avatar_url';

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
          .select(characterSelect)
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
    setForm((current) => {
      const updated = { ...current, [field]: value };

      if (field === 'character_type') {
        updated.extracurricular_activity = '';
        updated.study_program = '';
        updated.university_responsibility = '';
        updated.staff_job = '';
      }

      if (field === 'extracurricular_activity') {
        const oldActivity = current.extracurricular_activity;
        const oldResponsibility = oldActivity
          ? activityResponsibility(oldActivity)
          : '';

        if (current.university_responsibility === oldResponsibility) {
          updated.university_responsibility = '';
        }
      }

      return updated;
    });
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
      extracurricular_activity: character.extracurricular_activity || '',
      study_program: character.study_program || '',
      university_responsibility:
        character.university_responsibility || '',
      staff_job: character.staff_job || '',
      housing: character.housing || '',
    });

    setCharacterError('');
    setCharacterMessage('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveCharacter = async () => {
    if (!form.player_id || !form.name.trim() || !form.first_name.trim()) {
      setCharacterError(
        'Choisis un joueur et renseigne le nom et le prénom.'
      );
      return;
    }

    const age = form.age.trim() ? Number(form.age) : null;

    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
      setCharacterError('L’âge renseigné n’est pas valide.');
      return;
    }

    if (
      form.character_type === 'Étudiant(e)' &&
      !form.study_program
    ) {
      setCharacterError('Choisis un cours ou une filière.');
      return;
    }

    if (
      form.character_type === 'Membre du personnel' &&
      !form.staff_job
    ) {
      setCharacterError('Choisis le métier ou la fonction du personnel.');
      return;
    }

    setSavingCharacter(true);
    setCharacterError('');
    setCharacterMessage('');

    const student = form.character_type === 'Étudiant(e)';

    const extracurricular =
      student &&
      form.extracurricular_activity &&
      form.extracurricular_activity !== 'Aucune activité'
        ? form.extracurricular_activity
        : null;

    const responsibility =
      student &&
      form.university_responsibility &&
      form.university_responsibility !== 'Aucune responsabilité'
        ? form.university_responsibility
        : null;

    const studyProgram = student ? form.study_program || null : null;
    const staffJob = student ? null : form.staff_job || null;

    let saveError = null;

    if (editingId) {
      const { error } = await supabase.rpc('admin_update_character', {
        p_character_id: editingId,
        p_name: form.name.trim(),
        p_first_name: form.first_name.trim(),
        p_age: age,
        p_character_type: form.character_type,
        p_course_position: null,
        p_housing: form.housing || null,
        p_extracurricular_activity: extracurricular,
        p_study_program: studyProgram,
        p_university_responsibility: responsibility,
        p_staff_job: staffJob,
      });

      saveError = error;
    } else {
      const { error } = await supabase.from('characters').insert({
        player_id: form.player_id,
        name: form.name.trim(),
        first_name: form.first_name.trim(),
        age,
        character_type: form.character_type,
        course_position: null,
        extracurricular_activity: extracurricular,
        study_program: studyProgram,
        university_responsibility: responsibility,
        staff_job: staffJob,
        housing: form.housing || null,
      });

      saveError = error;
    }

    if (saveError) {
      console.error(saveError);

      if (saveError.code === '23505') {
        setCharacterError(
          'Cette responsabilité est déjà attribuée à un autre personnage.'
        );
      } else {
        setCharacterError(
          'Impossible d’enregistrer ce personnage. Vérifie les informations et réessaie.'
        );
      }

      setSavingCharacter(false);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('characters')
      .select(characterSelect)
      .order('name', { ascending: true });

    if (reloadError) {
      console.error(reloadError);
      setCharacterError(
        'Personnage enregistré, mais la liste n’a pas pu être actualisée.'
      );
    } else {
      setCharacters(data as Character[]);
      setCharacterMessage(
        editingId
          ? 'Personnage modifié avec succès.'
          : 'Personnage créé avec succès.'
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

    if (editingId === characterId) {
      resetCharacterForm();
    }

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

  const characterGroups = players
    .map((player) => ({
      player,
      characters: characters.filter((character) => character.player_id === player.id),
    }))
    .filter((group) => group.characters.length > 0)
    .sort((a, b) =>
      (a.player.discord_username || '').localeCompare(
        b.player.discord_username || '',
        'fr',
        { sensitivity: 'base' }
      )
    );

  const occupiedResponsibilities = characters
    .filter((character) => character.id !== editingId)
    .map((character) => character.university_responsibility)
    .filter((value): value is string => Boolean(value));

  const currentActivityResponsibility =
    form.extracurricular_activity &&
    form.extracurricular_activity !== 'Aucune activité'
      ? activityResponsibility(form.extracurricular_activity)
      : '';

  const responsibilityOptions = [
    ...houseResponsibilities,
    ...(currentActivityResponsibility
      ? [currentActivityResponsibility]
      : []),
  ].filter(
    (responsibility) =>
      !occupiedResponsibilities.includes(responsibility) ||
      responsibility === form.university_responsibility
  );

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
            Impossible de vérifier votre accès. Veuillez réessayer en vous
            reconnectant.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-8 text-gold-300 underline"
          >
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
            Elle sera examinée par l'administration. Vous pourrez accéder à
            votre espace personnel dès qu'elle sera acceptée.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-10 text-sm text-bone-400 underline"
          >
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
            Votre demande d'inscription n'a pas été acceptée. Vous ne pouvez
            pas accéder à Sterling Campus.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-10 text-sm text-bone-400 underline"
          >
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

          <button
            onClick={handleSignOut}
            className="mt-10 text-sm text-bone-400 underline"
          >
            Se déconnecter
          </button>
        </section>
      ) : mode === 'admin' && isAdmin && adminScoopOpen ? (
        <section className="flex flex-1 flex-col px-6 py-10">
          <div className="mx-auto w-full max-w-4xl">
            <button
              onClick={() => setAdminScoopOpen(false)}
              className="mb-6 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
            >
              ← Retour à l'administration
            </button>
            <SecretScoop characterId="" adminOnly />
          </div>
        </section>
      ) : mode === 'admin' && isAdmin ? (
        <section className="flex flex-1 flex-col px-6 py-10">
          <div className="mx-auto w-full max-w-4xl">
            <button
              onClick={() => setMode('choice')}
              className="mb-6 rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
            >
              ← Retour au choix des espaces
            </button>

            <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
              Sterling University
            </p>

            <h1 className="mt-4 text-3xl font-semibold text-bone-100">
              Administration
            </h1>

            <button
              onClick={() => setAdminScoopOpen(true)}
              className="mt-6 w-full rounded-xl border border-gold-500/40 bg-ink-900/70 px-5 py-4 text-left text-sm font-semibold text-gold-300 transition hover:border-gold-400 hover:bg-ink-800"
            >
              <span className="flex items-center justify-between gap-3">
                <span>✦ The Secret Scoop</span>
                {scoopNotificationCount > 0 && (
                  <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
                    {scoopNotificationCount}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs font-normal text-bone-400">
                Messages privés, propositions de secrets et publications.
              </span>
            </button>

            {activeAdminCategory === 'home' && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <button onClick={() => { setActiveAdminCategory('players'); setActivePlayerSection('pending'); }} className="rounded-xl border border-gold-500/30 bg-ink-900/70 p-5 text-left hover:border-gold-400">
                  <span className="flex items-center justify-between gap-2"><strong className="text-gold-300">Demandes et comptes joueurs</strong>{pendingPlayers.length > 0 && <span className="rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">{pendingPlayers.length}</span>}</span>
                  <span className="mt-2 block text-xs text-bone-400">Demandes en attente et comptes validés.</span>
                </button>
                <button onClick={() => setActiveAdminCategory('management')} className="rounded-xl border border-gold-500/30 bg-ink-900/70 p-5 text-left hover:border-gold-400">
                  <strong className="text-gold-300">Gestion des personnages</strong><span className="mt-2 block text-xs text-bone-400">Créer, modifier et attribuer les personnages.</span>
                </button>
                <button onClick={() => setActiveAdminCategory('registered')} className="rounded-xl border border-gold-500/30 bg-ink-900/70 p-5 text-left hover:border-gold-400">
                  <strong className="text-gold-300">Personnages enregistrés</strong><span className="mt-2 block text-xs text-bone-400">Dossiers des joueurs et leurs personnages.</span>
                </button>
              </div>
            )}

            {activeAdminCategory !== 'home' && (
              <button onClick={() => setActiveAdminCategory('home')} className="mt-8 rounded-lg border border-gold-500/30 px-4 py-2 text-sm text-gold-300">← Retour aux catégories</button>
            )}

            {activeAdminCategory === 'players' && (
              <>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button onClick={() => setActivePlayerSection('pending')} className={`rounded-lg px-4 py-3 text-sm ${activePlayerSection === 'pending' ? 'bg-gold-500 text-ink-950' : 'border border-gold-500/30 text-gold-300'}`}>Demandes en attente {pendingPlayers.length > 0 ? `(${pendingPlayers.length})` : ''}</button>
                  <button onClick={() => setActivePlayerSection('approved')} className={`rounded-lg px-4 py-3 text-sm ${activePlayerSection === 'approved' ? 'bg-gold-500 text-ink-950' : 'border border-gold-500/30 text-gold-300'}`}>Comptes joueurs validés</button>
                </div>
              </>
            )}

            {activeAdminCategory === 'players' && activePlayerSection === 'pending' && (
              <>
            <h2 className="mt-8 text-xl font-semibold text-gold-300">
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
                      {player.discord_username ||
                        `Membre ${player.id.slice(0, 8)}`}
                    </p>

                    <p className="mt-1 text-xs text-bone-400">
                      Inscription :{' '}
                      {new Date(player.created_at).toLocaleDateString('fr-FR')}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        disabled={updatingId === player.id}
                        onClick={() =>
                          handlePlayerStatus(player.id, 'approved')
                        }
                        className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 disabled:opacity-50"
                      >
                        Accepter
                      </button>

                      <button
                        disabled={updatingId === player.id}
                        onClick={() =>
                          handlePlayerStatus(player.id, 'rejected')
                        }
                        className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {playersError && (
              <p className="mt-4 text-sm text-red-300">{playersError}</p>
            )}
              </>
            )}

            {activeAdminCategory === 'players' && activePlayerSection === 'approved' && (
              <>
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
                      {player.discord_username ||
                        `Membre ${player.id.slice(0, 8)}`}
                    </p>
                    <p className="mt-1 text-xs text-bone-400">
                      {statusLabel(player.registration_status)}
                    </p>
                  </div>

                  {player.registration_status === 'approved' ? (
                    <button
                      disabled={updatingId === player.id}
                      onClick={() =>
                        handlePlayerStatus(player.id, 'rejected')
                      }
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-300 disabled:opacity-50"
                    >
                      Refuser l'accès
                    </button>
                  ) : (
                    <button
                      disabled={updatingId === player.id}
                      onClick={() =>
                        handlePlayerStatus(player.id, 'approved')
                      }
                      className="rounded-lg border border-gold-500/40 px-3 py-2 text-xs text-gold-300 disabled:opacity-50"
                    >
                      Accepter
                    </button>
                  )}
                </article>
              ))}
            </div>
              </>
            )}

            {activeAdminCategory === 'management' && (
              <>
            <h2 className="text-2xl font-semibold text-gold-300">
              Gestion des personnages
            </h2>

            <p className="mt-2 text-sm text-bone-300">
              Crée et attribue les personnages aux joueurs dont l'inscription
              est acceptée.
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
                    disabled={Boolean(editingId)}
                    onChange={(event) =>
                      handleFormChange('player_id', event.target.value)
                    }
                    className={selectClass + ' disabled:opacity-50'}
                  >
                    <option value="">Choisir un joueur</option>
                    {players
                      .filter(
                        (player) => player.registration_status === 'approved'
                      )
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.discord_username ||
                            `Membre ${player.id.slice(0, 8)}`}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="text-sm text-bone-300">
                  Statut
                  <select
                    value={form.character_type}
                    onChange={(event) =>
                      handleFormChange('character_type', event.target.value)
                    }
                    className={selectClass}
                  >
                    <option value="Étudiant(e)">Étudiant(e)</option>
                    <option value="Membre du personnel">
                      Membre du personnel
                    </option>
                  </select>
                </label>

                <label className="text-sm text-bone-300">
                  Nom
                  <input
                    value={form.name}
                    onChange={(event) =>
                      handleFormChange('name', event.target.value)
                    }
                    placeholder="Nom de famille"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Prénom
                  <input
                    value={form.first_name}
                    onChange={(event) =>
                      handleFormChange('first_name', event.target.value)
                    }
                    placeholder="Prénom"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm text-bone-300">
                  Âge
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={form.age}
                    onChange={(event) =>
                      handleFormChange('age', event.target.value)
                    }
                    placeholder="Âge"
                    className={inputClass}
                  />
                </label>

                {form.character_type === 'Étudiant(e)' ? (
                  <>
                    <label className="text-sm text-bone-300">
                      Activité extrascolaire
                      <select
                        value={form.extracurricular_activity}
                        onChange={(event) =>
                          handleFormChange(
                            'extracurricular_activity',
                            event.target.value
                          )
                        }
                        className={selectClass}
                      >
                        <option value="">Choisir une activité</option>
                        {activities.map((activity) => (
                          <option key={activity} value={activity}>
                            {activity}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm text-bone-300">
                      Cours / Filière
                      <select
                        value={form.study_program}
                        onChange={(event) =>
                          handleFormChange('study_program', event.target.value)
                        }
                        className={selectClass}
                      >
                        <option value="">Choisir un cours / une filière</option>
                        {studyPrograms.map((program) => (
                          <option key={program} value={program}>
                            {program}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm text-bone-300 sm:col-span-2">
                      Responsabilité universitaire
                      <select
                        value={form.university_responsibility}
                        onChange={(event) =>
                          handleFormChange(
                            'university_responsibility',
                            event.target.value
                          )
                        }
                        className={selectClass}
                      >
                        <option value="">Aucune responsabilité</option>

                        <optgroup label="Maisons universitaires">
                          {houseResponsibilities
                            .filter(
                              (responsibility) =>
                                !occupiedResponsibilities.includes(
                                  responsibility
                                ) ||
                                responsibility ===
                                  form.university_responsibility
                            )
                            .map((responsibility) => (
                              <option
                                key={responsibility}
                                value={responsibility}
                              >
                                {responsibility}
                              </option>
                            ))}
                        </optgroup>

                        {currentActivityResponsibility && (
                          <optgroup label="Activité extrascolaire">
                            {responsibilityOptions
                              .filter((responsibility) =>
                                responsibility.startsWith('Chef(fe) de ')
                              )
                              .map((responsibility) => (
                                <option
                                  key={responsibility}
                                  value={responsibility}
                                >
                                  {responsibility}
                                </option>
                              ))}
                          </optgroup>
                        )}
                      </select>
                    </label>
                  </>
                ) : (
                  <label className="text-sm text-bone-300 sm:col-span-2">
                    Métier / Fonction
                    <select
                      value={form.staff_job}
                      onChange={(event) =>
                        handleFormChange('staff_job', event.target.value)
                      }
                      className={selectClass}
                    >
                      <option value="">Choisir un métier / une fonction</option>
                      {staffJobs.map((group) => (
                        <optgroup key={group.category} label={group.category}>
                          {group.jobs.map((job) => (
                            <option key={job} value={job}>
                              {job}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                )}

                <label className="text-sm text-bone-300 sm:col-span-2">
                  Lieu de vie
                  <select
                    value={form.housing}
                    onChange={(event) =>
                      handleFormChange('housing', event.target.value)
                    }
                    className={selectClass}
                  >
                    <option value="">Choisir un lieu de vie</option>
                    {housingOptions.map((housing) => (
                      <option key={housing} value={housing}>
                        {housing}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {characterError && (
                <p className="mt-4 text-sm text-red-300">{characterError}</p>
              )}

              {characterMessage && (
                <p className="mt-4 text-sm text-green-300">
                  {characterMessage}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  disabled={savingCharacter}
                  onClick={handleSaveCharacter}
                  className="rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950 disabled:opacity-50"
                >
                  {savingCharacter
                    ? 'Enregistrement...'
                    : editingId
                      ? 'Enregistrer les modifications'
                      : 'Créer le personnage'}
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

              </>
            )}

            {activeAdminCategory === 'registered' && (
              <div>
            <h3 className="mt-10 text-xl font-semibold text-bone-100">
              Personnages enregistrés ({characters.length})
            </h3>

            {charactersLoading ? (
              <p className="mt-5 text-sm text-bone-300">
                Chargement des personnages...
              </p>
            ) : characterError && characters.length === 0 ? (
              <p className="mt-5 text-sm text-red-300">{characterError}</p>
            ) : characters.length === 0 ? (
              <p className="mt-5 rounded-xl border border-white/10 p-5 text-sm text-bone-300">
                Aucun personnage n'a encore été créé.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {characterGroups.map(({ player, characters: playerCharacters }) => (
                    <article
                      key={player.id}
                      className="overflow-hidden rounded-xl border border-gold-500/20 bg-ink-900/50"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCharacterPlayerId(expandedCharacterPlayerId === player.id ? null : player.id)
                        }
                        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-ink-800/60"
                      >
                        <span>
                          <span className="block font-semibold text-bone-100">
                            📁 {player.discord_username || `Membre ${player.id.slice(0, 8)}`}
                          </span>
                          <span className="mt-1 block text-xs text-bone-400">
                            {playerCharacters.length} personnage{playerCharacters.length > 1 ? 's' : ''} enregistré{playerCharacters.length > 1 ? 's' : ''}
                          </span>
                        </span>
                        <span className="text-lg text-gold-300">
                          {isExpanded ? '−' : '+'}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-white/10 p-4">
                          {playerCharacters.map((character) => (
                            <article
                              key={character.id}
                              className="rounded-lg border border-white/10 bg-ink-950/60 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <p className="font-semibold text-bone-100">
                                    {character.first_name} {character.name}
                                  </p>

                                  <p className="mt-1 text-xs text-gold-300">
                                    {character.character_type || 'Statut non renseigné'}
                                  </p>

                                  <p className="mt-2 text-xs text-bone-400">
                                    {character.age ? `${character.age} ans` : 'Âge non renseigné'}
                                  </p>

                                  {character.extracurricular_activity && (
                                    <p className="mt-1 text-xs text-bone-400">
                                      Activité : {character.extracurricular_activity}
                                    </p>
                                  )}

                                  {character.study_program && (
                                    <p className="mt-1 text-xs text-bone-400">
                                      Filière : {character.study_program}
                                    </p>
                                  )}

                                  {character.university_responsibility && (
                                    <p className="mt-1 text-xs text-gold-300">
                                      Responsabilité : {character.university_responsibility}
                                    </p>
                                  )}

                                  {character.staff_job && (
                                    <p className="mt-1 text-xs text-bone-400">
                                      Fonction : {character.staff_job}
                                    </p>
                                  )}

                                  {character.housing && (
                                    <p className="mt-1 text-xs text-bone-400">
                                      Logement : {character.housing}
                                    </p>
                                  )}
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
                    </article>
                ))}
              </div>
              </div>
            )}
          </div>
        </section>
      ) : mode === 'player' ? (
        <section className="flex flex-1 flex-col">
          {isAdmin && (
            <div className="px-6 pt-6">
              <button
                onClick={() => setMode('choice')}
                className="rounded-xl border border-gold-500/30 px-6 py-3 text-sm text-gold-300 transition hover:bg-gold-500/10"
              >
                Retour au choix des espaces
              </button>
            </div>
          )}

          <PlayerSpace playerId={session.user.id} />
        </section>
      ) : (
        <HomePage />
      )}
    </AppShell>
  );
}
