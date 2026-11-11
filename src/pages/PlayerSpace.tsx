
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ContactsApp from '@/components/ContactsApp';
import MessagesApp from '@/components/MessagesApp';
import InstagramApp from '@/components/InstagramApp';
import SecretScoop from '@/components/SecretScoop';
import AgendaApp from '@/components/AgendaApp';
import LinksApp from '@/components/LinksApp';

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

type PhoneApp =
  | 'home'
  | 'contacts'
  | 'messages'
  | 'instagram'
  | 'scoop'
  | 'agenda'
  | 'links';

type NotificationApp =
  | 'messages'
  | 'instagram'
  | 'scoop'
  | 'agenda'
  | 'links';

type NotificationCounts = Record<NotificationApp, number>;

type SavedSession = {
  characterId: string | null;
  activeApp: PhoneApp;
  messageContactId: string | null;
};

type CropPosition = {
  x: number;
  y: number;
};

const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  messages: 0,
  instagram: 0,
  scoop: 0,
  agenda: 0,
  links: 0,
};

function getSavedSession(playerId: string): SavedSession {
  const emptySession: SavedSession = {
    characterId: null,
    activeApp: 'home',
    messageContactId: null,
  };

  try {
    const saved = localStorage.getItem(
      `sterling_player_session_${playerId}`
    );

    if (!saved) return emptySession;

    const parsed = JSON.parse(saved);

    return {
      characterId: parsed.characterId || null,
      activeApp:
        parsed.activeApp === 'contacts' ||
        parsed.activeApp === 'messages' ||
        parsed.activeApp === 'instagram' ||
        parsed.activeApp === 'scoop' ||
        parsed.activeApp === 'agenda' ||
        parsed.activeApp === 'links'
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

  const marker =
    '/storage/v1/object/public/character-avatars/';

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

const CROP_SIZE = 300;
const CROP_STEP = 20;

export default function PlayerSpace({ playerId }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);

  const [selectedCharacterId, setSelectedCharacterId] =
    useState<string | null>(
      () => getSavedSession(playerId).characterId
    );

  const [activeApp, setActiveApp] = useState<PhoneApp>(
    () => getSavedSession(playerId).activeApp
  );

  const [messageContactId, setMessageContactId] =
    useState<string | null>(
      () => getSavedSession(playerId).messageContactId
    );

  const [sessionRestored, setSessionRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarMessage, setAvatarMessage] = useState('');

  const [notificationCounts, setNotificationCounts] =
    useState<NotificationCounts>(EMPTY_NOTIFICATION_COUNTS);

  // Compteur individuel pour chaque personnage
  const [characterNotificationCounts, setCharacterNotificationCounts] =
    useState<Record<string, number>>({});

  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropUrl, setCropUrl] = useState('');
  const [cropZoom, setCropZoom] = useState(1);

  const [cropPosition, setCropPosition] =
    useState<CropPosition>({
      x: 0,
      y: 0,
    });

  const [cropImageSize, setCropImageSize] = useState({
    width: 0,
    height: 0,
  });

  const cropImageRef = useRef<HTMLImageElement>(null);

  const selectedCharacter =
    characters.find(
      (character) => character.id === selectedCharacterId
    ) || null;

  const totalUnreadNotifications = Object.values(
    notificationCounts
  ).reduce((total, count) => total + count, 0);

  const baseScale =
    cropImageSize.width && cropImageSize.height
      ? Math.max(
          CROP_SIZE / cropImageSize.width,
          CROP_SIZE / cropImageSize.height
        )
      : 1;

  const renderedWidth =
    cropImageSize.width * baseScale * cropZoom;

  const renderedHeight =
    cropImageSize.height * baseScale * cropZoom;

  function clampPosition(x: number, y: number): CropPosition {
    return {
      x: Math.min(0, Math.max(CROP_SIZE - renderedWidth, x)),
      y: Math.min(0, Math.max(CROP_SIZE - renderedHeight, y)),
    };
  }

  function moveCrop(
    direction: 'up' | 'down' | 'left' | 'right'
  ) {
    setCropPosition((current) => {
      let x = current.x;
      let y = current.y;

      if (direction === 'up') y += CROP_STEP;
      if (direction === 'down') y -= CROP_STEP;
      if (direction === 'left') x += CROP_STEP;
      if (direction === 'right') x -= CROP_STEP;

      return clampPosition(x, y);
    });
  }

  function handleZoomChange(value: number) {
    const newZoom = Math.min(3, Math.max(1, value));

    const newWidth =
      cropImageSize.width * baseScale * newZoom;

    const newHeight =
      cropImageSize.height * baseScale * newZoom;

    setCropZoom(newZoom);

    setCropPosition({
      x: (CROP_SIZE - newWidth) / 2,
      y: (CROP_SIZE - newHeight) / 2,
    });
  }

  function closeCrop() {
    if (cropUrl) URL.revokeObjectURL(cropUrl);

    setCropFile(null);
    setCropUrl('');
    setCropZoom(1);
    setCropImageSize({ width: 0, height: 0 });
    setCropPosition({ x: 0, y: 0 });
  }

  function handleCropImageLoad() {
    const image = cropImageRef.current;

    if (!image) return;

    const width = image.naturalWidth;
    const height = image.naturalHeight;

    const scale = Math.max(
      CROP_SIZE / width,
      CROP_SIZE / height
    );

    setCropImageSize({ width, height });

    setCropPosition({
      x: (CROP_SIZE - width * scale) / 2,
      y: (CROP_SIZE - height * scale) / 2,
    });
  }

  // Chargement des personnages
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
        const loadedCharacters =
          (data || []) as Character[];

        setCharacters(loadedCharacters);

        const saved = getSavedSession(playerId);

        if (
          saved.characterId &&
          loadedCharacters.some(
            (character) =>
              character.id === saved.characterId
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

  // Sauvegarde de la session
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

  // Notifications individuelles sur les cartes des personnages
  useEffect(() => {
    if (selectedCharacterId || characters.length === 0) {
      return;
    }

    let mounted = true;

    const characterIds = characters.map(
      (character) => character.id
    );

    async function loadCharacterNotifications() {
      const { data, error } = await supabase
        .from('notifications')
        .select('recipient_character_id')
        .in('recipient_character_id', characterIds)
        .eq('is_read', false);

      if (error) {
        console.error(
          'Erreur de chargement des notifications des personnages :',
          error
        );
        return;
      }

      if (!mounted) return;

      const counts: Record<string, number> = {};

      characterIds.forEach((id) => {
        counts[id] = 0;
      });

      (data || []).forEach((notification) => {
        const characterId = notification.recipient_character_id;

        counts[characterId] = (counts[characterId] || 0) + 1;
      });

      setCharacterNotificationCounts(counts);
    }

    loadCharacterNotifications();

    // Actualisation lorsque de nouvelles notifications arrivent
    const channel = supabase
      .channel(`character-notifications-${playerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          loadCharacterNotifications();
        }
      )
      .subscribe();

    const handleFocus = () => {
      loadCharacterNotifications();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [characters, selectedCharacterId, playerId]);

  // Chargement et actualisation des notifications du personnage sélectionné
  useEffect(() => {
    if (!selectedCharacterId) {
      setNotificationCounts(EMPTY_NOTIFICATION_COUNTS);
      return;
    }

    let mounted = true;

    async function loadNotifications() {
      const { data, error } = await supabase
        .from('notifications')
        .select('source_app')
        .eq('recipient_character_id', selectedCharacterId)
        .eq('is_read', false);

      if (error) {
        console.error(
          'Erreur lors du chargement des notifications :',
          error
        );
        return;
      }

      if (!mounted) return;

      const counts: NotificationCounts = {
        messages: 0,
        instagram: 0,
        scoop: 0,
        agenda: 0,
        links: 0,
      };

      (data || []).forEach((notification) => {
        const app = notification.source_app as NotificationApp;

        if (app in counts) {
          counts[app]++;
        }
      });

      setNotificationCounts(counts);
    }

    loadNotifications();

    const channel = supabase
      .channel(`notifications-${selectedCharacterId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_character_id=eq.${selectedCharacterId}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    const handleFocus = () => {
      loadNotifications();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [selectedCharacterId]);

  // Ouvre une application et marque ses notifications comme lues
  async function openNotifiedApp(app: NotificationApp) {
    if (selectedCharacter) {
      const { error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('recipient_character_id', selectedCharacter.id)
        .eq('source_app', app)
        .eq('is_read', false);

      if (error) {
        console.error(
          'Erreur lors de la lecture des notifications :',
          error
        );
      } else {
        setNotificationCounts((current) => ({
          ...current,
          [app]: 0,
        }));
      }
    }

    setActiveApp(app);
  }

  // Gestion de la photo de profil
  async function handleAvatarUpload(file: File) {
    if (!selectedCharacter) return;

    setAvatarError('');
    setAvatarMessage('');

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      setAvatarError(
        'Choisis une image au format JPG, PNG ou WebP.'
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError(
        'La photo ne doit pas dépasser 5 Mo.'
      );
      return;
    }

    setAvatarLoading(true);

    try {
      const image = cropImageRef.current;

      if (
        !image ||
        !cropImageSize.width ||
        !cropImageSize.height
      ) {
        throw new Error("L'image n'est pas encore prête.");
      }

      const canvas = document.createElement('canvas');

      canvas.width = 600;
      canvas.height = 600;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error(
          'Impossible de préparer le recadrage.'
        );
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.drawImage(
        image,
        cropPosition.x * 2,
        cropPosition.y * 2,
        renderedWidth * 2,
        renderedHeight * 2
      );

      const croppedBlob = await new Promise<Blob>(
        (resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else
                reject(
                  new Error(
                    "Impossible de créer l'image recadrée."
                  )
                );
            },
            'image/jpeg',
            0.92
          );
        }
      );

      const croppedFile = new File(
        [croppedBlob],
        'portrait.jpg',
        { type: 'image/jpeg' }
      );

      if (croppedFile.size > 5 * 1024 * 1024) {
        throw new Error(
          'La photo recadrée dépasse 5 Mo.'
        );
      }

      const oldAvatarPath = getAvatarStoragePath(
        selectedCharacter.avatar_url
      );

      const filePath = `${selectedCharacter.id}/${crypto.randomUUID()}-portrait.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('character-avatars')
        .upload(filePath, croppedFile, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error(uploadError);
        throw new Error(uploadError.message);
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

        throw new Error(
          "La photo a été envoyée, mais n'a pas pu être enregistrée."
        );
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
      closeCrop();
    } catch (error) {
      console.error(error);

      setAvatarError(
        `Erreur : ${
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer la photo."
        }`
      );
    } finally {
      setAvatarLoading(false);
    }
  }

  function handleFileSelection(file: File) {
    setAvatarError('');
    setAvatarMessage('');

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      setAvatarError(
        'Choisis une image au format JPG, PNG ou WebP.'
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError(
        'La photo ne doit pas dépasser 5 Mo.'
      );
      return;
    }

    const url = URL.createObjectURL(file);

    setCropFile(file);
    setCropUrl(url);
    setCropZoom(1);
    setCropImageSize({ width: 0, height: 0 });
    setCropPosition({ x: 0, y: 0 });
  }

  async function handleAvatarDelete() {
    if (!selectedCharacter?.avatar_url) return;

    if (
      !window.confirm(
        'Veux-tu vraiment supprimer cette photo ?'
      )
    ) {
      return;
    }

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
    void openNotifiedApp('messages');
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

  // Chargement
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
            {characters.map((character) => {
              const unreadCount =
                characterNotificationCounts[character.id] || 0;

              return (
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
                  className="relative overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/70 text-left transition hover:border-gold-400/60"
                >
                  {unreadCount > 0 && (
                    <span className="absolute right-3 top-3 z-10 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
                      {unreadCount} notification
                      {unreadCount > 1 ? 's' : ''}
                    </span>
                  )}

                  <div className="flex h-56 items-center justify-center bg-ink-950">
                    {character.avatar_url ? (
                      <img
                        src={character.avatar_url}
                        alt={`${character.first_name || ''} ${character.name}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-center">
                        <span className="text-6xl text-gold-300/60">
                          ♙
                        </span>

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
              );
            })}
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
          ←{' '}
          {activeApp === 'home'
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
                <span className="text-7xl text-gold-300/60">
                  ♙
                </span>
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
                  <p>
                    Poste ou cursus : {selectedCharacter.course_position}
                  </p>
                )}

                {selectedCharacter.housing && (
                  <p>Logement : {selectedCharacter.housing}</p>
                )}
              </div>

              {totalUnreadNotifications > 0 && (
                <div className="mb-7 mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-left">
                  <p className="text-sm font-semibold text-red-300">
                    🔔 {totalUnreadNotifications} notification
                    {totalUnreadNotifications > 1 ? 's' : ''} non lue
                    {totalUnreadNotifications > 1 ? 's' : ''}
                  </p>

                  <p className="mt-1 text-xs text-bone-300">
                    Tu as de nouvelles notifications sur ton téléphone.
                  </p>
                </div>
              )}

              <div className="mt-8 border-t border-white/10 pt-6">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300">
                  Photo de profil
                </p>

                <p className="mt-2 text-sm text-bone-400">
                  Choisis une photo depuis ton appareil. Tu pourras la recadrer
                  avant de l'enregistrer.
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

                      if (file) handleFileSelection(file);

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
                  <p className="mt-4 text-sm text-red-300">
                    {avatarError}
                  </p>
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
                    className="relative rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    <span className="text-3xl">👥</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Contacts
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => openMessages()}
                    className="relative rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    {notificationCounts.messages > 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
                        {notificationCounts.messages}
                      </span>
                    )}
                    <span className="text-3xl">✉️</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Messages
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => void openNotifiedApp('instagram')}
                    className="relative rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    {notificationCounts.instagram > 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
                        {notificationCounts.instagram}
                      </span>
                    )}
                    <span className="text-3xl">📸</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Instagram
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => void openNotifiedApp('scoop')}
                    className="relative rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    {notificationCounts.scoop > 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
                        {notificationCounts.scoop}
                      </span>
                    )}
                    <span className="text-3xl">📰</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      The Secret Scoop
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => void openNotifiedApp('agenda')}
                    className="relative rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    {notificationCounts.agenda > 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
                        {notificationCounts.agenda}
                      </span>
                    )}
                    <span className="text-3xl">📅</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Agenda
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => void openNotifiedApp('links')}
                    className="relative rounded-2xl border border-gold-500/30 bg-ink-950 p-5 transition hover:bg-gold-500/10"
                  >
                    {notificationCounts.links > 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
                        {notificationCounts.links}
                      </span>
                    )}
                    <span className="text-3xl">💛</span>
                    <p className="mt-3 text-sm font-medium text-bone-100">
                      Liens
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

        {activeApp === 'instagram' && (
          <InstagramApp
            key={selectedCharacter.id}
            characterId={selectedCharacter.id}
          />
        )}

        {activeApp === 'scoop' && (
          <SecretScoop
            key={selectedCharacter.id}
            characterId={selectedCharacter.id}
          />
        )}

        {activeApp === 'agenda' && (
          <AgendaApp
            key={selectedCharacter.id}
            characterId={selectedCharacter.id}
          />
        )}

        {activeApp === 'links' && (
          <LinksApp
            key={selectedCharacter.id}
            characterId={selectedCharacter.id}
          />
        )}
      </div>

      {cropFile && cropUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4">
          <div className="my-auto w-full max-w-lg rounded-3xl border border-gold-500/30 bg-ink-900 p-6 shadow-2xl">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-gold-300">
                Sterling Campus
              </p>

              <h2 className="mt-3 text-2xl font-semibold text-bone-100">
                Recadrer la photo
              </h2>

              <p className="mt-2 text-sm text-bone-400">
                Utilise les flèches pour déplacer la photo et les boutons pour
                zoomer.
              </p>
            </div>

            <div className="mt-6 flex justify-center">
              <div
                className="relative overflow-hidden rounded-xl border-2 border-gold-400 bg-black"
                style={{
                  width: CROP_SIZE,
                  height: CROP_SIZE,
                  flexShrink: 0,
                }}
              >
                <img
                  ref={cropImageRef}
                  src={cropUrl}
                  alt="Aperçu du recadrage"
                  onLoad={handleCropImageLoad}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    width: renderedWidth,
                    height: renderedHeight,
                    maxWidth: 'none',
                    left: cropPosition.x,
                    top: cropPosition.y,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                />

                <div className="pointer-events-none absolute inset-0 border border-white/40" />
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-4">
              <p className="text-sm font-medium text-bone-300">
                Position de la photo
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div />

                <button
                  type="button"
                  onClick={() => moveCrop('up')}
                  disabled={!cropImageSize.width || cropPosition.y >= 0}
                  aria-label="Déplacer vers le haut"
                  className="h-12 w-14 rounded-xl border border-gold-500/40 bg-ink-950 text-xl text-gold-300 hover:bg-gold-500/20 disabled:opacity-30"
                >
                  ↑
                </button>

                <div />

                <button
                  type="button"
                  onClick={() => moveCrop('left')}
                  disabled={!cropImageSize.width || cropPosition.x >= 0}
                  aria-label="Déplacer vers la gauche"
                  className="h-12 w-14 rounded-xl border border-gold-500/40 bg-ink-950 text-xl text-gold-300 hover:bg-gold-500/20 disabled:opacity-30"
                >
                  ←
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCropPosition({
                      x: (CROP_SIZE - renderedWidth) / 2,
                      y: (CROP_SIZE - renderedHeight) / 2,
                    });
                  }}
                  className="h-12 w-14 rounded-xl border border-white/20 bg-ink-950 text-xs text-bone-300 hover:bg-white/10"
                >
                  Centrer
                </button>

                <button
                  type="button"
                  onClick={() => moveCrop('right')}
                  disabled={
                    !cropImageSize.width ||
                    cropPosition.x <= CROP_SIZE - renderedWidth
                  }
                  aria-label="Déplacer vers la droite"
                  className="h-12 w-14 rounded-xl border border-gold-500/40 bg-ink-950 text-xl text-gold-300 hover:bg-gold-500/20 disabled:opacity-30"
                >
                  →
                </button>

                <div />

                <button
                  type="button"
                  onClick={() => moveCrop('down')}
                  disabled={
                    !cropImageSize.height ||
                    cropPosition.y <= CROP_SIZE - renderedHeight
                  }
                  aria-label="Déplacer vers le bas"
                  className="h-12 w-14 rounded-xl border border-gold-500/40 bg-ink-950 text-xl text-gold-300 hover:bg-gold-500/20 disabled:opacity-30"
                >
                  ↓
                </button>

                <div />
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between text-sm text-bone-300">
                <span>Zoom</span>
                <span>{Math.round(cropZoom * 100)} %</span>
              </div>

              <div className="mt-3 flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={() => handleZoomChange(cropZoom - 0.1)}
                  disabled={!cropImageSize.width || cropZoom <= 1}
                  className="h-11 w-11 rounded-full border border-gold-500/40 bg-ink-950 text-2xl text-gold-300 hover:bg-gold-500/20 disabled:opacity-30"
                  aria-label="Dézoomer"
                >
                  −
                </button>

                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={cropZoom}
                  onChange={(event) =>
                    handleZoomChange(Number(event.target.value))
                  }
                  disabled={!cropImageSize.width}
                  className="w-full accent-yellow-500"
                />

                <button
                  type="button"
                  onClick={() => handleZoomChange(cropZoom + 0.1)}
                  disabled={!cropImageSize.width || cropZoom >= 3}
                  className="h-11 w-11 rounded-full border border-gold-500/40 bg-ink-950 text-2xl text-gold-300 hover:bg-gold-500/20 disabled:opacity-30"
                  aria-label="Zoomer"
                >
                  +
                </button>
              </div>

              <p className="mt-3 text-center text-xs text-bone-500">
                Les flèches déplacent la photo par petits pas.
              </p>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={avatarLoading}
                onClick={closeCrop}
                className="flex-1 rounded-xl border border-white/20 px-5 py-3 text-sm text-bone-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                disabled={avatarLoading || !cropImageSize.width}
                onClick={() => handleAvatarUpload(cropFile)}
                className="flex-1 rounded-xl bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 disabled:opacity-50"
              >
                {avatarLoading
                  ? 'Enregistrement...'
                  : 'Valider la photo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
