
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ContactsApp from '@/components/ContactsApp';
import MessagesApp from '@/components/MessagesApp';

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

type PhoneApp = 'home' | 'contacts' | 'messages';

type SavedSession = {
  characterId: string | null;
  activeApp: PhoneApp;
  messageContactId: string | null;
};

function getSavedSession(playerId: string): SavedSession {
  const emptySession: SavedSession = {
    characterId: null,
    activeApp: 'home',
    messageContactId: null,
  };

  try {
    const saved = localStorage.getItem(`sterling_player_session_${playerId}`);

    if (!saved) return emptySession;

    const parsed = JSON.parse(saved);

    return {
      characterId: parsed.characterId || null,
      activeApp:
        parsed.activeApp === 'contacts' || parsed.activeApp === 'messages'
          ? parsed.activeApp
          : 'home',
      messageContactId: parsed.messageContactId || null,
    };
  } catch {
    return emptySession;
  }
}

function getAvatarStoragePath(url: string | null) {
  if (!url) return null;

  const marker = '/storage/v1/object/public/character-avatars/';
  const index = url.indexOf(marker);

  if (index === -1) return null;

  try {
    return decodeURIComponent(
      url.slice(index + marker.length).split('?')[0]
    );
  } catch {
    return null;
  }
}

export default function PlayerSpace({ playerId }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    () => getSavedSession(playerId).characterId
  );
  const [activeApp, setActiveApp] = useState<PhoneApp>(
    () => getSavedSession(playerId).activeApp
  );
  const [messageContactId, setMessageContactId] = useState<string | null>(
    () => getSavedSession(playerId).messageContactId
  );
  const [sessionRestored, setSessionRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarMessage, setAvatarMessage] = useState('');

  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ||
    null;

  useEffect(() => {
    let mounted = true;

    async function loadCharacters() {
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
        const loadedCharacters = (data || []) as Character[];
        setCharacters(loadedCharacters);

        const saved = getSavedSession(playerId);

        if (
          saved.characterId &&
          loadedCharacters.some(
            (character) => character.id === saved.characterId
          )
        ) {
          setSelectedCharacterId(saved.characterId);
          setActiveApp(saved.activeApp);
          setMessageContactId(saved.messageContactId);
        } else {
          setSelectedCharacterId(null);
          setActiveApp('home');
          setMessageContactId(null);
        }
      }

      setLoading(false);
      setSessionRestored(true);
    }

    loadCharacters();

    return () => {
      mounted = false;
    };
  }, [playerId]);

  useEffect(() => {
    if (!sessionRestored) return;

    const session: SavedSession = {
      characterId: selectedCharacterId,
      activeApp,
      messageContactId,
    };

    localStorage.setItem(
      `sterling_player_session_${playerId}`,
      JSON.stringify(session)
    );
  }, [
    playerId,
    selectedCharacterId,
    activeApp,
    messageContactId,
    sessionRestored,
  ]);

  async function handleAvatarUpload(file: File) {
    if (!selectedCharacter) return;

    setAvatarError('');
    setAvatarMessage('');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Choisis une image au format JPG, PNG ou WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('La photo ne doit pas dépasser 5 Mo.');
      return;
    }

    setAvatarLoading(true);

    const oldAvatarPath = getAvatarStoragePath(
      selectedCharacter.avatar_url
    );

    const safeFileName = file.name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9.-]/g, '_');

    const filePath = `${selectedCharacter.id}/${crypto.randomUUID()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('character-avatars')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error(uploadError);
      setAvatarError(`Erreur d'envoi : ${uploadError.message}`);
      setAvatarLoading(false);
      return;
    }

    const { data } = supabase.storage
      .from('character-avatars')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('characters')
      .update({ avatar_url: data.publicUrl })
      .eq('id', selectedCharacter.id)
      .eq('player_id', playerId);

    if (updateError) {
      console.error(updateError);

      await supabase.storage
        .from('character-avatars')
        .remove([filePath]);

      setAvatarError("La photo a été envoyée, mais n'a pas pu être enregistrée.");
      setAvatarLoading(false);
      return;
    }

    setCharacters((current) =>
      current.map((character) =>
        character.id === selectedCharacter.id
          ? { ...character, avatar_url: data.publicUrl }
          : character
      )
    );

    if (oldAvatarPath) {
      const { error: deleteError } = await supabase.storage
        .from('character-avatars')
        .remove([oldAvatarPath]);

      if (deleteError) console.error(deleteError);
    }

    setAvatarMessage('Photo de profil mise à jour !');
    setAvatarLoading(false);
  }

  async function handleAvatarDelete() {
    if (!selectedCharacter?.avatar_url) return;

    if (!window.confirm('Veux-tu vraiment supprimer cette photo ?')) return;

    setAvatarLoading(true);
    setAvatarError('');
    setAvatarMessage('');

    const oldAvatarPath = getAvatarStoragePath(
      selectedCharacter.avatar_url
    );

    const { error } = await supabase
      .from('characters')
      .update({ avatar_url: null })
      .eq('id', selectedCharacter.id)
      .eq('player_id', playerId);

    if (error) {
      console.error(error);
      setAvatarError('Impossible de supprimer la photo.');
      setAvatarLoading(false);
      return;
    }

    setCharacters((current) =>
      current.map((character) =>
        character.id === selectedCharacter.id
          ? { ...character, avatar_url: null }
          : character
      )
    );

    if (oldAvatarPath) {
      const { error: deleteError } = await supabase.storage
        .from('character-avatars')
        .remove([oldAvatarPath]);

      if (deleteError) console.error(deleteError);
    }

    setAvatarMessage('Photo supprimée.');
    setAvatarLoading(false);
  }

  function openMessages(contactId?: string) {
    setMessageContactId(contactId || null);
    setActiveApp('messages');
  }

  function backToPhone() {
    setActiveApp('home');
    setMessageContactId(null);
  }

  function backToCharacters() {
    setSelectedCharacterId(null);
    setActiveApp('home');
    setMessageContactId(null);
    setAvatarError('');
    setAvatarMessage('');
  }

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

  if (!selectedCharacter) {
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
                type="button"
                onClick={() => {
                  setSelectedCharacterId(character.id);
                  setActiveApp('home');
                  setMessageContactId(null);
                  setAvatarError('');
                  setAvatarMessage('');
                }}
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

  return (
    <section className="flex flex-1 flex-col px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <button
          type="button"
          onClick={() => {
            if (activeApp !== 'home') {
              backToPhone();
            } else {
              backToCharacters();
            }
          }}
          className="mb-6 rounded-lg border border-gold-500/30 px-4 py-2 text-sm text-gold-300 transition hover:bg-gold-500/10 hover:text-gold-200"
        >
          ← {activeApp === 'home'
            ? 'Retour à mes personnages'
            : 'Retour au téléphone'}
        </button>

        {activeApp === 'home' && (
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
                  Photo de profil
                </p>

                <p className="mt-2 text-sm text-bone-400">
                  Choisis une photo depuis ton appareil. Elle sera également
                  utilisée dans tes Contacts et tes Messages.
                </p>

                <label className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-xl bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-gold-400">
                  {avatarLoading
                    ? 'Enregistrement...'
                    : selectedCharacter.avatar_url
                      ? '📷 Changer la photo'
                      : '📷 Ajouter une photo'}

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={avatarLoading}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                      event.target.value = '';
                    }}
                  />
                </label>

                {selectedCharacter.avatar_url && (
                  <button
                    type="button"
                    disabled={avatarLoading}
                    onClick={handleAvatarDelete}
                    className="ml-3 mt-5 rounded-xl border border-red-500/40 px-5 py-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Supprimer la photo
                  </button>
                )}

                {avatarError && (
                  <p className="mt-4 text-sm text-red-300">{avatarError}</p>
                )}

                {avatarMessage && (
                  <p className="mt-4 text-sm text-green-300">
                    {avatarMessage}
                  </p>
                )}

                <p className="mt-3 text-xs text-bone-500">
                  Formats acceptés : JPG, PNG et WebP. Taille maximale : 5 Mo.
                </p>
              </div>

              <div className="mt-8 border-t border-white/10 pt-6">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                  Téléphone personnel
                </p>

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setActiveApp('contacts')}
                    className="rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    <span className="text-3xl">👥</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Contacts
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => openMessages()}
                    className="rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    <span className="text-3xl">✉️</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Messages
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeApp === 'contacts' && (
          <ContactsApp
            characterId={selectedCharacter.id}
            onOpenMessages={(contact) => openMessages(contact.id)}
          />
        )}

        {activeApp === 'messages' && (
          <MessagesApp
            key={`${selectedCharacter.id}-${messageContactId || 'all'}`}
            characterId={selectedCharacter.id}
            initialContactId={messageContactId}
          />
        )}
      </div>
    </section>
  );
}
