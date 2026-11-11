
import { useEffect, useState } from 'react';
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
};

type Props = {
  playerId: string;
};

export default function PlayerSpace({ playerId }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
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
        setCharacters(data as Character[]);
      }

      setLoading(false);
    };

    loadCharacters();

    return () => {
      mounted = false;
    };
  }, [playerId]);

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

                  <div className="mt-6 border-t border-white/10 pt-4">
                    <p className="text-center text-xs uppercase tracking-widest text-bone-400">
                      Téléphone personnel
                    </p>
                    <p className="mt-2 text-center text-sm text-gold-300">
                      Bientôt disponible
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
