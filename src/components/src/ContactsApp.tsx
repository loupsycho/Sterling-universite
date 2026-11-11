
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Character = {
  id: string;
  name: string;
  first_name: string | null;
  age: number | null;
  character_type: string | null;
  course_position: string | null;
  housing: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Props = {
  characterId: string;
  onOpenMessages?: (character: Character) => void;
  onOpenInstagram?: (character: Character) => void;
};

type Category = 'Nouveaux' | 'Élèves' | 'Personnel';

export default function ContactsApp({
  characterId,
  onOpenMessages,
  onOpenInstagram,
}: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] =
    useState<Character | null>(null);
  const [category, setCategory] = useState<Category>('Nouveaux');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadCharacters() {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('characters')
        .select(
          'id, name, first_name, age, character_type, course_position, housing, avatar_url, created_at'
        )
        .neq('id', characterId)
        .order('created_at', { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error(error);
        setError('Impossible de charger les contacts.');
      } else {
        setCharacters((data || []) as Character[]);
      }

      setLoading(false);
    }

    loadCharacters();

    return () => {
      mounted = false;
    };
  }, [characterId]);

  const categorizedCharacters = useMemo(() => {
    const now = Date.now();

    return characters.filter((character) => {
      const isNew =
        now - new Date(character.created_at).getTime() <
        7 * 24 * 60 * 60 * 1000;

      const isStudent =
        character.character_type?.toLowerCase().includes('étudiant') ||
        character.character_type?.toLowerCase().includes('eleve') ||
        character.character_type?.toLowerCase().includes('élève');

      const matchesCategory =
        category === 'Nouveaux'
          ? isNew
          : category === 'Élèves'
            ? !isNew && isStudent
            : !isNew && !isStudent;

      const fullName =
        `${character.first_name || ''} ${character.name}`.toLowerCase();

      return matchesCategory && fullName.includes(search.toLowerCase());
    });
  }, [characters, category, search]);

  function getStatus(character: Character) {
    const value = character.character_type?.toLowerCase() || '';

    if (value.includes('étudiant') || value.includes('élève')) {
      return 'Étudiant(e)';
    }

    if (value.includes('personnel')) {
      return 'Membre du personnel';
    }

    return character.character_type || 'Non renseigné';
  }

  return (
    <section className="flex min-h-[600px] flex-1 flex-col px-4 py-6 text-bone-100 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
          Sterling University
        </p>

        <h1 className="mt-3 text-3xl font-semibold">Contacts</h1>
        <p className="mt-2 text-sm text-bone-300">
          Retrouvez les personnages de l'université.
        </p>

        {error && (
          <p className="mt-5 rounded-xl border border-red-500/30 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {selectedCharacter ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setSelectedCharacter(null)}
              className="mb-5 text-sm text-gold-300 hover:text-gold-200"
            >
              ← Retour aux contacts
            </button>

            <article className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/70">
              <div className="flex min-h-64 items-center justify-center bg-ink-950">
                {selectedCharacter.avatar_url ? (
                  <img
                    src={selectedCharacter.avatar_url}
                    alt={`${selectedCharacter.first_name || ''} ${selectedCharacter.name}`}
                    className="max-h-[420px] w-full object-cover"
                  />
                ) : (
                  <div className="py-16 text-center">
                    <span className="text-7xl text-gold-300/50">♙</span>
                    <p className="mt-3 text-xs uppercase tracking-widest text-bone-400">
                      Aucun portrait disponible
                    </p>
                  </div>
                )}
              </div>

              <div className="p-6 sm:p-8">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                  {getStatus(selectedCharacter)}
                </p>

                <h2 className="mt-3 text-3xl font-semibold">
                  {selectedCharacter.first_name} {selectedCharacter.name}
                </h2>

                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-ink-950/70 p-4">
                    <p className="text-xs uppercase tracking-wider text-bone-400">
                      Âge
                    </p>
                    <p className="mt-2 text-sm">
                      {selectedCharacter.age !== null
                        ? `${selectedCharacter.age} ans`
                        : 'Non renseigné'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-ink-950/70 p-4">
                    <p className="text-xs uppercase tracking-wider text-bone-400">
                      Statut
                    </p>
                    <p className="mt-2 text-sm">
                      {getStatus(selectedCharacter)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-ink-950/70 p-4">
                    <p className="text-xs uppercase tracking-wider text-bone-400">
                      Poste ou cursus
                    </p>
                    <p className="mt-2 text-sm">
                      {selectedCharacter.course_position || 'Non renseigné'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-ink-950/70 p-4">
                    <p className="text-xs uppercase tracking-wider text-bone-400">
                      Logement
                    </p>
                    <p className="mt-2 text-sm">
                      {selectedCharacter.housing || 'Non renseigné'}
                    </p>
                  </div>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onOpenMessages?.(selectedCharacter)}
                    className="rounded-xl bg-gold-500 px-5 py-3 font-semibold text-ink-950 transition hover:bg-gold-400"
                  >
                    ✉ Envoyer un message
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenInstagram?.(selectedCharacter)}
                    className="rounded-xl border border-gold-500/40 px-5 py-3 font-semibold text-gold-300 transition hover:bg-gold-500/10"
                  >
                    ◎ Voir Instagram
                  </button>
                </div>
              </div>
            </article>
          </div>
        ) : (
          <>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un personnage..."
              className="mt-7 w-full rounded-xl border border-gold-500/20 bg-ink-900 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400/50"
            />

            <div className="mt-5 grid grid-cols-3 gap-2">
              {(['Nouveaux', 'Élèves', 'Personnel'] as Category[]).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`rounded-xl border px-2 py-3 text-xs font-medium transition sm:text-sm ${
                      category === item
                        ? 'border-gold-400/50 bg-gold-500/15 text-gold-300'
                        : 'border-white/10 bg-ink-900 text-bone-300 hover:bg-white/5'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            </div>

            {loading ? (
              <p className="mt-10 text-center text-sm text-bone-300">
                Chargement des contacts...
              </p>
            ) : categorizedCharacters.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-gold-500/20 bg-ink-900/60 p-8 text-center">
                <span className="text-4xl text-gold-300/60">♙</span>
                <p className="mt-4 text-sm text-bone-300">
                  Aucun personnage dans cette catégorie pour le moment.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categorizedCharacters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => setSelectedCharacter(character)}
                    className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/70 text-left transition hover:border-gold-400/50"
                  >
                    <div className="flex h-48 items-center justify-center bg-ink-950">
                      {character.avatar_url ? (
                        <img
                          src={character.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-6xl text-gold-300/50">♙</span>
                      )}
                    </div>

                    <div className="p-4">
                      <p className="text-xs uppercase tracking-wider text-gold-300">
                        {getStatus(character)}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold">
                        {character.first_name} {character.name}
                      </h3>
                      <p className="mt-2 text-xs text-bone-400">
                        {character.age !== null
                          ? `${character.age} ans`
                          : 'Âge non renseigné'}
                      </p>
                      <p className="mt-4 text-xs text-gold-300">
                        Consulter la fiche →
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
