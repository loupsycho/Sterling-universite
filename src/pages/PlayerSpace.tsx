
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ContactsApp from '@/composant/ContactsApp';
import MessagesApp from '@/composant/MessagesApp';

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

type PhoneScreen = 'home' | 'contacts' | 'messages' | 'instagram';

export default function PlayerSpace({ playerId }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [screen, setScreen] = useState<PhoneScreen>('home');

  const [loading, setLoading] = useState(true);
  const [openingPhone, setOpeningPhone] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');

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
        setCharacters(data as Character[]);
      }

      setLoading(false);
    };

    loadCharacters();

    return () => {
      mounted = false;
    };
  }, [playerId]);

  const openPhone = async (character: Character) => {
    setOpeningPhone(true);
    setPhoneError('');

    const { error } = await supabase.rpc('set_active_character', {
      p_character_id: character.id,
    });

    if (error) {
      console.error(error);
      setPhoneError("Impossible d'ouvrir le téléphone de ce personnage.");
      setOpeningPhone(false);
      return;
    }

    setSelectedCharacter(character);
    setScreen('home');
    setOpeningPhone(false);
  };

  const returnToCharacters = () => {
    setSelectedCharacter(null);
    setScreen('home');
    setPhoneError('');
  };

  const openMessages = () => {
    setScreen('messages');
  };

  const openInstagram = () => {
    setScreen('instagram');
  };

  return (
    <section className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
          Sterling University
        </p>

        {!selectedCharacter ? (
          <>
            <h1 className="mt-4 text-3xl font-semibold text-bone-100">
              Mon espace joueur
            </h1>

            <p className="mt-3 text-sm text-bone-300">
              Retrouvez ici tous vos personnages et accédez à leur univers personnel.
            </p>

            {loading ? (
              <p className="mt-10 text-sm text-bone-300">
                Chargement de vos personnages...
              </p>
            ) : error ? (
              <p className="mt-10 rounded-xl border border-red-500/30 p-5 text-sm text-red-300">
                {error}
              </p>
            ) : characters.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-gold-500/20 bg-ink-900/60 p-8 text-center">
                <span className="text-4xl">♙</span>
                <h2 className="mt-5 text-xl font-semibold text-bone-100">
                  Aucun personnage pour le moment
                </h2>
                <p className="mt-3 text-sm text-bone-300">
                  L'administration ajoutera vos personnages après validation de vos fiches sur Discord.
                </p>
              </div>
            ) : (
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {characters.map((character) => (
                  <article
                    key={character.id}
                    className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/70"
                  >
                    <div className="relative flex h-56 items-center justify-center bg-ink-950">
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

                      <div className="mt-5 space-y-2 text-sm text-bone-300">
                        {character.age !== null && (
                          <p>Âge : {character.age} ans</p>
                        )}
                        {character.course_position && (
                          <p>Poste ou cursus : {character.course_position}</p>
                        )}
                        {character.housing && (
                          <p>Logement : {character.housing}</p>
                        )}
                      </div>

                      <button
                        onClick={() => openPhone(character)}
                        disabled={openingPhone}
                        className="mt-6 w-full rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-3 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20 disabled:opacity-50"
                      >
                        {openingPhone ? 'Ouverture...' : 'Ouvrir son téléphone'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {phoneError && (
              <p className="mt-5 rounded-xl border border-red-500/30 p-4 text-sm text-red-300">
                {phoneError}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-bone-100">
                  {selectedCharacter.first_name} {selectedCharacter.name}
                </h1>
                <p className="mt-1 text-sm text-bone-300">
                  Téléphone personnel
                </p>
              </div>

              <button
                onClick={returnToCharacters}
                className="rounded-xl border border-gold-500/30 px-4 py-2 text-sm text-gold-300 transition hover:bg-gold-500/10"
              >
                ← Mes personnages
              </button>
            </div>

            {screen === 'home' && (
              <div className="mx-auto mt-10 w-full max-w-md overflow-hidden rounded-[2rem] border border-gold-500/30 bg-ink-950 p-6 shadow-2xl">
                <div className="mb-8 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.25em] text-gold-300">
                    Sterling Phone
                  </span>
                  <span className="text-xs text-bone-400">
                    {selectedCharacter.first_name}
                  </span>
                </div>

                <div className="mb-10 text-center">
                  {selectedCharacter.avatar_url ? (
                    <img
                      src={selectedCharacter.avatar_url}
                      alt={selectedCharacter.first_name || 'Portrait'}
                      className="mx-auto h-24 w-24 rounded-full border-2 border-gold-500/40 object-cover"
                    />
                  ) : (
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-gold-500/30 bg-ink-900 text-4xl text-gold-300">
                      ♙
                    </div>
                  )}

                  <h2 className="mt-4 text-xl font-semibold text-bone-100">
                    {selectedCharacter.first_name} {selectedCharacter.name}
                  </h2>
                  <p className="mt-1 text-xs text-bone-400">
                    {selectedCharacter.character_type}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <button
                    onClick={() => setScreen('contacts')}
                    className="rounded-2xl border border-gold-500/20 bg-ink-900 p-5 text-center transition hover:border-gold-400/60 hover:bg-ink-800"
                  >
                    <span className="text-3xl">♧</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Contacts
                    </p>
                  </button>

                  <button
                    onClick={openMessages}
                    className="rounded-2xl border border-gold-500/20 bg-ink-900 p-5 text-center transition hover:border-gold-400/60 hover:bg-ink-800"
                  >
                    <span className="text-3xl">✉</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Messages
                    </p>
                  </button>

                  <button
                    onClick={openInstagram}
                    className="rounded-2xl border border-gold-500/20 bg-ink-900 p-5 text-center transition hover:border-gold-400/60 hover:bg-ink-800"
                  >
                    <span className="text-3xl">◎</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Instagram
                    </p>
                  </button>

                  <div className="rounded-2xl border border-gold-500/20 bg-ink-900 p-5 text-center opacity-60">
                    <span className="text-3xl">♧</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      The Secret Scoop
                    </p>
                    <p className="mt-1 text-xs text-gold-300">
                      À venir
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gold-500/20 bg-ink-900 p-5 text-center opacity-60">
                    <span className="text-3xl">▦</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Agenda
                    </p>
                    <p className="mt-1 text-xs text-gold-300">
                      À venir
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gold-500/20 bg-ink-900 p-5 text-center opacity-60">
                    <span className="text-3xl">♡</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Liens
                    </p>
                    <p className="mt-1 text-xs text-gold-300">
                      À venir
                    </p>
                  </div>
                </div>
              </div>
            )}

            {screen === 'contacts' && (
              <div className="mt-8">
                <button
                  onClick={() => setScreen('home')}
                  className="mb-5 text-sm text-gold-300 hover:text-gold-200"
                >
                  ← Retour au téléphone
                </button>

                <ContactsApp
                  characterId={selectedCharacter.id}
                  onOpenMessages={openMessages}
                  onOpenInstagram={openInstagram}
                />
              </div>
            )}

            {screen === 'messages' && (
              <div className="mt-8">
                <button
                  onClick={() => setScreen('home')}
                  className="mb-5 text-sm text-gold-300 hover:text-gold-200"
                >
                  ← Retour au téléphone
                </button>

                <MessagesApp characterId={selectedCharacter.id} />
              </div>
            )}

            {screen === 'instagram' && (
              <div className="mt-8">
                <button
                  onClick={() => setScreen('home')}
                  className="mb-5 text-sm text-gold-300 hover:text-gold-200"
                >
                  ← Retour au téléphone
                </button>

                <div className="rounded-2xl border border-gold-500/20 bg-ink-900/60 p-8 text-center">
                  <span className="text-4xl text-gold-300">◎</span>
                  <h2 className="mt-4 text-xl font-semibold text-bone-100">
                    Instagram
                  </h2>
                  <p className="mt-3 text-sm text-bone-300">
                    Cette application sera bientôt disponible.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
