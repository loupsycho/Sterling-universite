
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ContactsApp from '@/components/ContactsApp';

type Character = {
  id: string;
  name: string;
  first_name: string | null;
  age: number | null;
  character_type: string | null;
  course_position: string | null;
  housing: string | null;
  avatar_url: string | null;
};

type Props = {
  playerId: string;
};

export default function PlayerSpace({ playerId }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] =
    useState<Character | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadCharacters = async () => {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('characters')
        .select(
          'id, name, first_name, age, character_type, course_position, housing, avatar_url'
        )
        .eq('player_id', playerId)
        .order('name', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error(error);
        setError('Impossible de charger tes personnages.');
      } else {
        setCharacters((data || []) as Character[]);
      }

      setLoading(false);
    };

    loadCharacters();

    return () => {
      mounted = false;
    };
  }, [playerId]);

  if (loading) {
    return (
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <p className="text-sm text-bone-300">
          Chargement de tes personnages...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <p className="rounded-xl border border-red-500/30 p-5 text-sm text-red-300">
          {error}
        </p>
      </section>
    );
  }

  if (characters.length === 0) {
    return (
      <section className="flex flex-1 flex-col px-6 py-10">
        <div className="mx-auto w-full max-w-5xl text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
            Sterling University
          </p>

          <h1 className="mt-4 text-3xl font-semibold text-bone-100">
            Mon espace joueur
          </h1>

          <div className="mt-10 rounded-2xl border border-gold-500/20 bg-ink-900/60 p-8">
            <span className="text-4xl">♙</span>
            <h2 className="mt-5 text-xl font-semibold text-bone-100">
              Aucun personnage pour le moment
            </h2>
            <p className="mt-3 text-sm text-bone-300">
              L'administration ajoutera tes personnages après validation de
              leurs fiches sur Discord.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (selectedCharacter && showContacts) {
    return (
      <section className="flex flex-1 flex-col px-4 py-6">
        <button
          onClick={() => setShowContacts(false)}
          className="mb-6 w-fit rounded-lg border border-gold-500/30 px-4 py-2 text-sm text-gold-300 transition hover:bg-gold-500/10"
        >
          ← Retour au téléphone
        </button>

        <ContactsApp characterId={selectedCharacter.id} />
      </section>
    );
  }

  if (selectedCharacter) {
    return (
      <section className="flex flex-1 flex-col px-6 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <button
            onClick={() => setSelectedCharacter(null)}
            className="mb-6 text-sm text-gold-300 hover:text-gold-200"
          >
            ← Retour à mes personnages
          </button>

          <div className="overflow-hidden rounded-3xl border border-gold-500/20 bg-ink-900/70">
            <div className="flex h-64 items-center justify-center bg-ink-950">
              {selectedCharacter.avatar_url ? (
                <img
                  src={selectedCharacter.avatar_url}
                  alt={`${selectedCharacter.first_name || ''} ${selectedCharacter.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-7xl text-gold-300/60">♙</span>
              )}
            </div>

            <div className="p-6 text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                {selectedCharacter.character_type || 'Personnage'}
              </p>

              <h1 className="mt-3 text-2xl font-semibold text-bone-100">
                {selectedCharacter.first_name} {selectedCharacter.name}
              </h1>

              <div className="mt-4 space-y-2 text-sm text-bone-300">
                {selectedCharacter.age !== null && (
                  <p>Âge : {selectedCharacter.age} ans</p>
                )}
                {selectedCharacter.course_position && (
                  <p>Poste ou cursus : {selectedCharacter.course_position}</p>
                )}
                {selectedCharacter.housing && (
                  <p>Logement : {selectedCharacter.housing}</p>
                )}
              </div>

              <div className="mt-8 border-t border-white/10 pt-6">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                  Téléphone personnel
                </p>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setShowContacts(true)}
                    className="rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    <span className="text-3xl">👥</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Contacts
                    </p>
                  </button>

                  <div className="rounded-2xl border border-gold-500/20 bg-ink-950/60 p-5 opacity-60">
                    <span className="text-3xl">✉️</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Messages
                    </p>
                    <p className="mt-1 text-xs text-bone-400">
                      À connecter
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
          Sterling University
        </p>

        <h1 className="mt-4 text-3xl font-semibold text-bone-100">
          Mon espace joueur
        </h1>

        <p className="mt-3 text-sm text-bone-300">
          Sélectionne un personnage pour accéder à son téléphone personnel.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((character) => (
            <button
              key={character.id}
              onClick={() => setSelectedCharacter(character)}
              className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/70 text-left transition hover:border-gold-400/60"
            >
              <div className="flex h-56 items-center justify-center bg-ink-950">
                {character.avatar_url ? (
                  <img
                    src={character.avatar_url}
                    alt={`${character.first_name || ''} ${character.name}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <span className="text-6xl text-gold-300/60">♙</span>
                    <p className="mt-3 text-xs uppercase tracking-widest text-bone-400">
                      Portrait à ajouter
                    </p>
                  </div>
                )}
              </div>

              <div className="p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-gold-300">
                  {character.character_type || 'Personnage'}
                </p>

                <h2 className="mt-2 text-xl font-semibold text-bone-100">
                  {character.first_name} {character.name}
                </h2>

                {character.age !== null && (
                  <p className="mt-3 text-sm text-bone-300">
                    {character.age} ans
                  </p>
                )}

                <p className="mt-5 border-t border-white/10 pt-4 text-center text-sm text-gold-300">
                  Ouvrir le téléphone →
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
