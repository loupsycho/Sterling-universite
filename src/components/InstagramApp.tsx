
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDiscordCompatibleImageUrl } from '@/lib/imageUrls';

type Character = {
  id: string;
  name: string;
  first_name: string | null;
  avatar_url: string | null;
  character_type: string | null;
};

type Post = {
  id: string;
  character_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  character_id: string;
  content: string;
  created_at: string;
};

type Props = {
  characterId: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
];

function getMediaPath(url: string) {
  const marker = '/storage/v1/object/public/instagram-posts/';
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

function formatDate(date: string) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function characterName(character: Character | undefined) {
  if (!character) return 'Personnage';
  return `${character.first_name || ''} ${character.name}`.trim();
}

function Avatar({
  character,
  size = 'h-11 w-11',
}: {
  character?: Character;
  size?: string;
}) {
  if (character?.avatar_url) {
    return (
      <img
        src={getDiscordCompatibleImageUrl(character.avatar_url)}
        alt=""
        className={`${size} shrink-0 rounded-full border border-gold-500/30 object-cover`}
      />
    );
  }

  return (
    <div
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-ink-950 text-xl text-gold-300`}
    >
      ♙
    </div>
  );
}

export default function InstagramApp({ characterId }: Props) {
  const [myCharacter, setMyCharacter] = useState<Character | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState('');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const activeProfile = characters.find(
    (character) => character.id === activeProfileId
  );

  async function loadInstagram() {
    setLoading(true);
    setError('');

    const { error: activeError } = await supabase.rpc(
      'set_active_character',
      { p_character_id: characterId }
    );

    if (activeError) {
      console.error(activeError);
      setError("Impossible d'ouvrir Instagram pour ce personnage.");
      setLoading(false);
      return;
    }

    const [
      { data: myData, error: myError },
      { data: characterData, error: characterError },
      { data: postData, error: postError },
      { data: likeData, error: likeError },
      { data: commentData, error: commentError },
    ] = await Promise.all([
      supabase
        .from('characters')
        .select('id, name, first_name, avatar_url, character_type')
        .eq('id', characterId)
        .maybeSingle(),
      supabase
        .from('characters')
        .select('id, name, first_name, avatar_url, character_type')
        .order('name', { ascending: true }),
      supabase
        .from('instagram_posts')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('instagram_likes')
        .select('post_id, character_id')
        .eq('character_id', characterId),
      supabase
        .from('instagram_comments')
        .select('*')
        .order('created_at', { ascending: true }),
    ]);

    if (myError || characterError || postError || likeError || commentError) {
      console.error(
        myError,
        characterError,
        postError,
        likeError,
        commentError
      );
      setError("Impossible de charger complètement Instagram.");
      setLoading(false);
      return;
    }

    setMyCharacter(myData as Character | null);
    setCharacters((characterData || []) as Character[]);
    setPosts((postData || []) as Post[]);
    setLikedPostIds((likeData || []).map((like) => like.post_id));
    setComments((commentData || []) as Comment[]);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      await loadInstagram();
    }

    if (mounted) load();

    return () => {
      mounted = false;
    };
  }, [characterId]);

  function chooseFile(file: File | undefined) {
    setError('');
    setMessage('');

    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Format non accepté. Choisis une image ou une vidéo.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Le fichier ne doit pas dépasser 50 Mo.');
      return;
    }

    if (filePreview) URL.revokeObjectURL(filePreview);

    setSelectedFile(file);
    setFilePreview(URL.createObjectURL(file));
  }

  function clearSelectedFile() {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview('');
  }

  async function publishPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile || publishing) {
      setError('Choisis une photo ou une vidéo avant de publier.');
      return;
    }

    setPublishing(true);
    setError('');
    setMessage('');

    try {
      const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'file';
      const filePath = `${characterId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('instagram-posts')
        .upload(filePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('instagram-posts')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from('instagram_posts')
        .insert({
          character_id: characterId,
          image_url: publicData.publicUrl,
          caption: caption.trim() || null,
        });

      if (insertError) {
        await supabase.storage.from('instagram-posts').remove([filePath]);
        throw insertError;
      }

      setCaption('');
      clearSelectedFile();
      setMessage('Publication ajoutée à votre fil !');
      await loadInstagram();
    } catch (uploadError) {
      console.error(uploadError);
      setError(
        "La publication n'a pas pu être envoyée. Vérifie ta connexion et réessaie."
      );
    } finally {
      setPublishing(false);
    }
  }

  async function toggleLike(post: Post) {
    const alreadyLiked = likedPostIds.includes(post.id);

    setError('');

    if (alreadyLiked) {
      const { error } = await supabase
        .from('instagram_likes')
        .delete()
        .eq('post_id', post.id)
        .eq('character_id', characterId);

      if (error) {
        console.error(error);
        setError("Impossible de retirer ce J'aime.");
        return;
      }

      setLikedPostIds((current) =>
        current.filter((id) => id !== post.id)
      );
    } else {
      const { error } = await supabase.from('instagram_likes').insert({
        post_id: post.id,
        character_id: characterId,
      });

      if (error) {
        console.error(error);
        setError("Impossible d'ajouter ce J'aime.");
        return;
      }

      setLikedPostIds((current) => [...current, post.id]);
    }
  }

  async function sendComment(postId: string) {
    const content = (commentInputs[postId] || '').trim();

    if (!content) return;

    const { error } = await supabase.from('instagram_comments').insert({
      post_id: postId,
      character_id: characterId,
      content,
    });

    if (error) {
      console.error(error);
      setError("Impossible d'envoyer le commentaire.");
      return;
    }

    setCommentInputs((current) => ({ ...current, [postId]: '' }));

    const { data, error: loadError } = await supabase
      .from('instagram_comments')
      .select('*')
      .order('created_at', { ascending: true });

    if (loadError) {
      console.error(loadError);
      setError('Commentaire envoyé, mais actualisation impossible.');
    } else {
      setComments((data || []) as Comment[]);
    }
  }

  async function deleteComment(comment: Comment) {
    if (!window.confirm('Supprimer ce commentaire ?')) return;

    const { error } = await supabase
      .from('instagram_comments')
      .delete()
      .eq('id', comment.id);

    if (error) {
      console.error(error);
      setError('Impossible de supprimer ce commentaire.');
      return;
    }

    setComments((current) =>
      current.filter((item) => item.id !== comment.id)
    );
  }

  async function deletePost(post: Post) {
    if (!window.confirm('Supprimer définitivement cette publication ?')) {
      return;
    }

    setError('');

    const { error } = await supabase
      .from('instagram_posts')
      .delete()
      .eq('id', post.id);

    if (error) {
      console.error(error);
      setError('Impossible de supprimer cette publication.');
      return;
    }

    const filePath = getMediaPath(post.image_url);

    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from('instagram-posts')
        .remove([filePath]);

      if (storageError) console.error(storageError);
    }

    setPosts((current) => current.filter((item) => item.id !== post.id));
    setComments((current) =>
      current.filter((item) => item.post_id !== post.id)
    );
    setMessage('Publication supprimée.');
  }

  function toggleComments(postId: string) {
    setExpandedComments((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId]
    );
  }

  function renderMedia(post: Post) {
    const isVideo = /\.(mp4|webm)(\?|$)/i.test(post.image_url);

    if (isVideo) {
      return (
        <video
          src={post.image_url}
          controls
          playsInline
          preload="metadata"
          className="max-h-[650px] w-full bg-black object-contain"
        />
      );
    }

    return (
      <img
        src={post.image_url}
        alt="Publication Instagram"
        loading="lazy"
        className="max-h-[650px] w-full bg-ink-950 object-contain"
      />
    );
  }

  function renderPost(post: Post) {
    const author = characters.find(
      (character) => character.id === post.character_id
    );
    const postComments = comments.filter(
      (comment) => comment.post_id === post.id
    );
    const isMine = post.character_id === characterId;
    const liked = likedPostIds.includes(post.id);

    return (
      <article
        key={post.id}
        className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/80"
      >
        <header className="flex items-center gap-3 p-4">
          <button
            type="button"
            onClick={() => setActiveProfileId(post.character_id)}
            className="flex min-w-0 items-center gap-3 text-left"
          >
            <Avatar character={author} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-bone-100">
                {characterName(author)}
              </span>
              <span className="block text-xs text-bone-400">
                {formatDate(post.created_at)}
              </span>
            </span>
          </button>

          {isMine && (
            <button
              type="button"
              onClick={() => deletePost(post)}
              className="ml-auto rounded-lg px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/10"
            >
              Supprimer
            </button>
          )}
        </header>

        {renderMedia(post)}

        <div className="p-4">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => toggleLike(post)}
              className={`text-sm transition ${
                liked ? 'text-red-400' : 'text-bone-200 hover:text-red-300'
              }`}
            >
              {liked ? '♥ J’aime' : '♡ J’aime'}
            </button>

            <button
              type="button"
              onClick={() => toggleComments(post.id)}
              className="text-sm text-bone-300 transition hover:text-gold-300"
            >
              ◯ Commentaires ({postComments.length})
            </button>
          </div>

          {post.caption && (
            <p className="mt-4 whitespace-pre-wrap break-words text-sm text-bone-100">
              <span className="font-semibold">
                {characterName(author)}
              </span>{' '}
              {post.caption}
            </p>
          )}

          {expandedComments.includes(post.id) && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="space-y-3">
                {postComments.length === 0 ? (
                  <p className="text-sm text-bone-500">
                    Aucun commentaire pour le moment.
                  </p>
                ) : (
                  postComments.map((comment) => {
                    const commenter = characters.find(
                      (character) => character.id === comment.character_id
                    );

                    return (
                      <div key={comment.id} className="flex gap-2">
                        <Avatar character={commenter} size="h-8 w-8" />
                        <div className="min-w-0 flex-1 rounded-xl bg-ink-950 p-3">
                          <p className="text-xs font-semibold text-gold-300">
                            {characterName(commenter)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-bone-200">
                            {comment.content}
                          </p>
                          {comment.character_id === characterId && (
                            <button
                              type="button"
                              onClick={() => deleteComment(comment)}
                              className="mt-2 text-xs text-red-300 hover:text-red-200"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  sendComment(post.id);
                }}
                className="mt-4 flex gap-2"
              >
                <input
                  type="text"
                  value={commentInputs[post.id] || ''}
                  onChange={(event) =>
                    setCommentInputs((current) => ({
                      ...current,
                      [post.id]: event.target.value,
                    }))
                  }
                  maxLength={1000}
                  placeholder="Ajouter un commentaire..."
                  className="min-w-0 flex-1 rounded-xl border border-gold-500/20 bg-ink-950 px-3 py-2 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400/50"
                />
                <button
                  type="submit"
                  disabled={!(commentInputs[post.id] || '').trim()}
                  className="rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-gold-400 disabled:opacity-40"
                >
                  Envoyer
                </button>
              </form>
            </div>
          )}
        </div>
      </article>
    );
  }

  const profilePosts = posts.filter(
    (post) => post.character_id === activeProfileId
  );

  return (
    <section className="flex min-h-[600px] flex-1 flex-col px-4 py-6 text-bone-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
              Sterling Campus
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Instagram</h1>
          </div>
          <span className="text-3xl">◎</span>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {message && (
          <p className="mt-4 rounded-xl border border-green-500/20 bg-green-950/20 p-3 text-sm text-green-300">
            {message}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-bone-300">
            Chargement d'Instagram...
          </p>
        ) : !myCharacter ? (
          <p className="mt-8 text-sm text-red-300">
            Personnage introuvable.
          </p>
        ) : (
          <>
            <div className="mt-6 flex gap-2 border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={() => setActiveProfileId(null)}
                className={`rounded-xl px-4 py-2 text-sm ${
                  activeProfileId === null
                    ? 'bg-gold-500 text-ink-950'
                    : 'border border-gold-500/20 text-bone-300 hover:bg-white/5'
                }`}
              >
                Fil d'actualité
              </button>

              <button
                type="button"
                onClick={() => setActiveProfileId(characterId)}
                className={`rounded-xl px-4 py-2 text-sm ${
                  activeProfileId === characterId
                    ? 'bg-gold-500 text-ink-950'
                    : 'border border-gold-500/20 text-bone-300 hover:bg-white/5'
                }`}
              >
                Mon profil
              </button>
            </div>

            {activeProfileId === null ? (
              <>
                <form
                  onSubmit={publishPost}
                  className="mt-6 rounded-2xl border border-gold-500/20 bg-ink-900/70 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar character={myCharacter} />
                    <div>
                      <p className="text-sm font-semibold">
                        {characterName(myCharacter)}
                      </p>
                      <p className="text-xs text-bone-400">
                        Nouvelle publication
                      </p>
                    </div>
                  </div>

                  <textarea
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    maxLength={2200}
                    rows={3}
                    placeholder="Exprime-toi..."
                    className="mt-4 w-full resize-y rounded-xl border border-gold-500/20 bg-ink-950 p-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400/50"
                  />

                  <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-gold-500/40 px-4 py-4 text-sm text-gold-300 transition hover:bg-gold-500/10">
                    <span>＋ Ajouter une photo ou une vidéo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                      className="hidden"
                      disabled={publishing}
                      onChange={(event) => {
                        chooseFile(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>

                  {selectedFile && filePreview && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black">
                      {selectedFile.type.startsWith('video/') ? (
                        <video
                          src={filePreview}
                          controls
                          playsInline
                          className="max-h-80 w-full object-contain"
                        />
                      ) : (
                        <img
                          src={filePreview}
                          alt="Aperçu de la publication"
                          className="max-h-80 w-full object-contain"
                        />
                      )}
                      <div className="flex items-center justify-between gap-3 p-3">
                        <span className="truncate text-xs text-bone-400">
                          {selectedFile.name}
                        </span>
                        <button
                          type="button"
                          onClick={clearSelectedFile}
                          className="shrink-0 text-xs text-red-300"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-bone-500">
                      Photo ou vidéo · 50 Mo maximum
                    </p>
                    <button
                      type="submit"
                      disabled={!selectedFile || publishing}
                      className="rounded-xl bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {publishing ? 'Publication...' : 'Publier'}
                    </button>
                  </div>
                </form>

                <div className="mt-6 space-y-6">
                  {posts.length === 0 ? (
                    <div className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-8 text-center">
                      <span className="text-5xl text-gold-300/60">◎</span>
                      <h2 className="mt-4 text-lg font-semibold">
                        Votre fil est encore vide
                      </h2>
                      <p className="mt-2 text-sm text-bone-400">
                        Les publications des personnages apparaîtront ici.
                      </p>
                    </div>
                  ) : (
                    posts.map(renderPost)
                  )}
                </div>
              </>
            ) : (
              <div className="mt-6">
                {activeProfile && (
                  <div className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-5">
                    <div className="flex items-center gap-4">
                      <Avatar character={activeProfile} size="h-20 w-20" />
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold">
                          {characterName(activeProfile)}
                        </h2>
                        <p className="mt-1 text-sm text-bone-400">
                          {activeProfile.character_type || 'Personnage'}
                        </p>
                        <p className="mt-2 text-xs text-gold-300">
                          {profilePosts.length}{' '}
                          {profilePosts.length > 1
                            ? 'publications'
                            : 'publication'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-2">
                  {characters
                    .filter((character) => character.id !== activeProfileId)
                    .map((character) => (
                      <button
                        key={character.id}
                        type="button"
                        onClick={() => setActiveProfileId(character.id)}
                        className="flex items-center gap-2 rounded-xl border border-gold-500/20 bg-ink-900/70 px-3 py-2 text-xs text-bone-300 hover:bg-gold-500/10"
                      >
                        <Avatar character={character} size="h-7 w-7" />
                        {characterName(character)}
                      </button>
                    ))}
                </div>

                <div className="mt-6 space-y-6">
                  {profilePosts.length === 0 ? (
                    <p className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-8 text-center text-sm text-bone-400">
                      Aucune publication sur ce profil.
                    </p>
                  ) : (
                    profilePosts.map(renderPost)
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
