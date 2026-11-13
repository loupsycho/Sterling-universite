
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { getDiscordCompatibleImageUrl } from '@/lib/imageUrls';

type ScoopPost = {
  id: string;
  post_type: 'verified' | 'rumor';
  target_character_id: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
};

type ScoopMessage = {
  id: string;
  character_id: string;
  sender_type: 'character' | 'admin';
  sender_user_id: string | null;
  content: string | null;
  image_url: string | null;
  created_at: string;
  read_at: string | null;
};

type ScoopCharacter = {
  id: string;
  name: string;
  first_name: string | null;
  status?: string;
};

type ScoopSubmission = {
  id: string;
  character_id: string;
  content: string;
  image_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

type Tab = 'feed' | 'messages' | 'submit' | 'admin';

interface SecretScoopProps {
  characterId: string;
  adminOnly?: boolean;
}

const SIGNATURE = "Don't hide. I see you.\nTHE SECRET SCOOP\nYour secrets. Our business.";

export default function SecretScoop({ characterId, adminOnly = false }: SecretScoopProps) {
  const [tab, setTab] = useState<Tab>(adminOnly ? 'admin' : 'feed');
  const [posts, setPosts] = useState<ScoopPost[]>([]);
  const [messages, setMessages] = useState<ScoopMessage[]>([]);
  const [characters, setCharacters] = useState<ScoopCharacter[]>([]);
  const [submissions, setSubmissions] = useState<ScoopSubmission[]>([]);
  const [settings, setSettings] = useState<{ avatar_url: string | null }>({
    avatar_url: null,
  });

  const [isAdmin, setIsAdmin] = useState(false);
  const [activeConversation, setActiveConversation] = useState(adminOnly ? '' : characterId);
  const [newMessageSearch, setNewMessageSearch] = useState('');
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [postType, setPostType] = useState<'verified' | 'rumor'>('rumor');
  const [postTarget, setPostTarget] = useState('');
  const [postContent, setPostContent] = useState('');
  const [submissionContent, setSubmissionContent] = useState('');
  const [messageContent, setMessageContent] = useState('');

  const [postImage, setPostImage] = useState<File | null>(null);
  const [submissionImage, setSubmissionImage] = useState<File | null>(null);
  const [messageImage, setMessageImage] = useState<File | null>(null);

  const [signedImages, setSignedImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const displayName = (id: string) => {
    const character = characters.find((item) => item.id === id);
    if (!character) return 'Personnage';
    return `${character.first_name || ''} ${character.name}`.trim();
  };

  const notify = (message: string) => {
    setSuccess(message);
    setError('');
    window.setTimeout(() => setSuccess(''), 3500);
  };

  const uploadPublicImage = async (file: File, folder: string) => {
    const extension = file.name.split('.').pop() || 'jpg';
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('secret-scoop')
      .upload(path, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('secret-scoop')
      .getPublicUrl(path);

    return data.publicUrl;
  };

  const uploadPrivateImage = async (file: File, folder: string) => {
    const extension = file.name.split('.').pop() || 'jpg';
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('secret-scoop-private')
      .upload(path, file, { upsert: false });

    if (uploadError) throw uploadError;
    return path;
  };

  const loadPrivateImage = async (path: string) => {
    if (!path || signedImages[path]) return;

    const { data, error: imageError } = await supabase.storage
      .from('secret-scoop-private')
      .createSignedUrl(path, 3600);

    if (!imageError && data?.signedUrl) {
      setSignedImages((previous) => ({
        ...previous,
        [path]: data.signedUrl,
      }));
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: adminResult } = await supabase.rpc('is_scoop_admin');
      const admin = adminResult === true;
      setIsAdmin(admin);

      const [
        postsResult,
        settingsResult,
        charactersResult,
        submissionsResult,
        messagesResult,
      ] = await Promise.all([
        supabase
          .from('scoop_posts')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('scoop_settings')
          .select('avatar_url')
          .eq('id', true)
          .maybeSingle(),

        supabase
          .from('characters')
          .select('id, name, first_name, status'),

        admin
          ? supabase
              .from('scoop_submissions')
              .select('*')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as ScoopSubmission[], error: null }),

        supabase
          .from('scoop_messages')
          .select('*')
          .order('created_at', { ascending: true }),
      ]);

      if (postsResult.error) throw postsResult.error;
      if (settingsResult.error) throw settingsResult.error;
      if (charactersResult.error) throw charactersResult.error;
      if (messagesResult.error) throw messagesResult.error;
      if (submissionsResult.error) throw submissionsResult.error;

      setPosts((postsResult.data || []) as ScoopPost[]);
      setSettings(settingsResult.data || { avatar_url: null });
      setCharacters((charactersResult.data || []) as ScoopCharacter[]);
      setSubmissions((submissionsResult.data || []) as ScoopSubmission[]);
      setMessages((messagesResult.data || []) as ScoopMessage[]);

      if (!admin && characterId) {
        const { data: notifications } = await supabase
          .from('scoop_notifications')
          .select('id')
          .eq('character_id', characterId)
          .is('read_at', null);

        if (notifications?.length) {
          await supabase
            .from('scoop_notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('character_id', characterId)
            .is('read_at', null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger The Secret Scoop.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [characterId]);

  useEffect(() => {
    messages.forEach((message) => {
      if (message.image_url) loadPrivateImage(message.image_url);
    });
  }, [messages]);

  const sendPost = async (event: FormEvent) => {
    event.preventDefault();
    if (!postContent.trim()) return;

    setSending(true);
    setError('');

    try {
      let imageUrl: string | null = null;

      if (postImage) {
        imageUrl = await uploadPublicImage(postImage, 'posts');
      }

      const { error: insertError } = await supabase
        .from('scoop_posts')
        .insert({
          post_type: postType,
          target_character_id: postTarget || null,
          content: `${postContent.trim()}\n\n${SIGNATURE}`,
          image_url: imageUrl,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        });

      if (insertError) throw insertError;

      const { data: allCharacters, error: characterError } = await supabase
        .from('characters')
        .select('id');

      if (characterError) throw characterError;

      if (allCharacters?.length) {
        const { error: notificationError } = await supabase
          .from('scoop_notifications')
          .insert(
            allCharacters.map((character) => ({
              character_id: character.id,
              notification_type: 'new_post',
            }))
          );

        if (notificationError) throw notificationError;
      }

      setPostContent('');
      setPostImage(null);
      setPostTarget('');
      await loadData();
      notify('Publication mise en ligne.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication impossible.');
    } finally {
      setSending(false);
    }
  };

  const submitSecret = async (event: FormEvent) => {
    event.preventDefault();
    if (!submissionContent.trim() || !characterId) return;

    setSending(true);
    setError('');

    try {
      let imagePath: string | null = null;

      if (submissionImage) {
        imagePath = await uploadPrivateImage(
          submissionImage,
          characterId
        );
      }

      const { error: insertError } = await supabase
        .from('scoop_submissions')
        .insert({
          character_id: characterId,
          content: submissionContent.trim(),
          image_url: imagePath,
          status: 'pending',
        });

      if (insertError) throw insertError;

      setSubmissionContent('');
      setSubmissionImage(null);
      notify('Ta proposition a été envoyée à l’administration.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!messageContent.trim() && !messageImage) return;

    const adminMessage = adminOnly && isAdmin;
    const targetId = adminMessage ? activeConversation : characterId;
    if (!targetId) return;

    setSending(true);
    setError('');

    try {
      let imagePath: string | null = null;

      if (messageImage) {
        imagePath = await uploadPrivateImage(
          messageImage,
          targetId
        );
      }

      const user = (await supabase.auth.getUser()).data.user;

      const { data: insertedMessage, error: insertError } = await supabase
        .from('scoop_messages')
        .insert({
          character_id: targetId,
          sender_type: adminOnly && isAdmin ? 'admin' : 'character',
          sender_user_id: user?.id,
          content: messageContent.trim() || null,
          image_url: imagePath,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (adminOnly && isAdmin && insertedMessage) {
        const { error: notificationError } = await supabase
          .from('scoop_notifications')
          .insert({
            character_id: targetId,
            notification_type: 'new_message',
            message_id: insertedMessage.id,
          });

        if (notificationError) throw notificationError;
      }

      setMessageContent('');
      setMessageImage(null);
      await loadData();
      notify('Message envoyé.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi du message impossible.');
    } finally {
      setSending(false);
    }
  };

  const reviewSubmission = async (
    submission: ScoopSubmission,
    status: 'approved' | 'rejected'
  ) => {
    const { error: updateError } = await supabase
      .from('scoop_submissions')
      .update({
        status,
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', submission.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData();
    notify(status === 'approved' ? 'Proposition acceptée.' : 'Proposition refusée.');
  };

  const deletePost = async (postId: string) => {
    if (!window.confirm('Supprimer cette publication ?')) return;

    const { error: deleteError } = await supabase
      .from('scoop_posts')
      .delete()
      .eq('id', postId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadData();
    notify('Publication supprimée.');
  };

  const changeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isAdmin) return;

    try {
      const avatarUrl = await uploadPublicImage(file, 'profile');

      const { error: updateError } = await supabase
        .from('scoop_settings')
        .update({ avatar_url: avatarUrl })
        .eq('id', true);

      if (updateError) throw updateError;

      setSettings({ avatar_url: avatarUrl });
      notify('Photo de profil modifiée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modification impossible.');
    }
  };

  const publishSubmission = async (submission: ScoopSubmission) => {
    const { error: insertError } = await supabase
      .from('scoop_posts')
      .insert({
        post_type: 'rumor',
        content: `${submission.content}\n\n${SIGNATURE}`,
        target_character_id: null,
        image_url: null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const { data: allCharacters } = await supabase
      .from('characters')
      .select('id');

    if (allCharacters?.length) {
      await supabase.from('scoop_notifications').insert(
        allCharacters.map((character) => ({
          character_id: character.id,
          notification_type: 'new_post',
        }))
      );
    }

    await reviewSubmission(submission, 'approved');
  };

  const conversationMessages = messages.filter(
    (message) =>
      message.character_id === (adminOnly ? activeConversation : characterId)
  );

  const pendingSubmissions = submissions.filter(
    (submission) => submission.status === 'pending'
  );

  if (loading) {
    return (
      <div className="min-h-full bg-ink-950 text-bone-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gold-400 text-3xl mb-3">✦</div>
          <p className="text-sm tracking-widest uppercase">The Secret Scoop</p>
          <p className="text-xs text-bone-500 mt-2">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-ink-950 text-bone-100 flex flex-col">
      <header className="border-b border-gold-500/20 px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 rounded-full overflow-hidden border border-gold-500/50 bg-ink-800 flex items-center justify-center shrink-0">
            {settings.avatar_url ? (
              <img
                src={getDiscordCompatibleImageUrl(settings.avatar_url)}
                alt="The Secret Scoop"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gold-400 text-2xl">✦</span>
            )}
          </div>

          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-400">
              Sterling Campus
            </p>
            <h1 className="text-xl font-serif tracking-wider">
              THE SECRET SCOOP
            </h1>
            {adminOnly && (
              <p className="text-[10px] uppercase tracking-widest text-gold-400 mt-1">
                Administration · {pendingSubmissions.length + messages.filter((message) => message.sender_type === 'character' && !message.read_at).length} notification(s)
              </p>
            )}
            <p className="text-xs text-bone-500 italic">
              Don't hide. I see you.
            </p>
          </div>

          {isAdmin && adminOnly && (
            <label className="cursor-pointer text-xs text-gold-400 border border-gold-500/30 rounded-lg px-2 py-2">
              Photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={changeAvatar}
              />
            </label>
          )}
        </div>
      </header>

      {!adminOnly && <nav className="grid grid-cols-3 border-b border-gold-500/20">
        {[
          { id: 'feed' as Tab, label: 'Fil public' },
          { id: 'messages' as Tab, label: 'Messages' },
          { id: 'submit' as Tab, label: 'Envoyer un secret' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`py-3 text-[11px] uppercase tracking-wider transition ${
              tab === item.id
                ? 'text-gold-400 border-b-2 border-gold-400'
                : 'text-bone-500 hover:text-bone-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>}

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mx-4 mt-3 rounded-lg border border-gold-500/30 bg-gold-500/10 p-3 text-sm text-gold-300">
          {success}
        </div>
      )}

      <main className="flex-1 p-4 space-y-4">
        {tab === 'feed' && (
          <>
            {posts.length === 0 && (
              <div className="text-center py-16">
                <div className="text-4xl text-gold-400 mb-4">✦</div>
                <p className="font-serif text-lg">Rien à signaler...</p>
                <p className="text-xs text-bone-500 mt-2">
                  Pour le moment.
                </p>
              </div>
            )}

            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-xl border border-gold-500/20 bg-ink-900 p-4 space-y-3"
              >
                <div className="flex justify-between items-center gap-2">
                  <span
                    className={`text-[10px] tracking-[0.2em] uppercase px-3 py-1 rounded-full border ${
                      post.post_type === 'verified'
                        ? 'text-gold-300 border-gold-400/40 bg-gold-500/10'
                        : 'text-red-300 border-red-400/30 bg-red-500/10'
                    }`}
                  >
                    {post.post_type === 'verified' ? '✦ Vérifié' : 'Rum eur'}
                  </span>

                  <span className="text-[10px] text-bone-500">
                    {new Date(post.created_at).toLocaleString('fr-FR')}
                  </span>
                </div>

                {post.target_character_id && (
                  <p className="text-xs text-gold-400">
                    Cible : {displayName(post.target_character_id)}
                  </p>
                )}

                <p className="text-sm leading-7 whitespace-pre-wrap text-bone-200">
                  {post.content}
                </p>

                {post.image_url && (
                  <img
                    src={getDiscordCompatibleImageUrl(post.image_url)}
                    alt="Publication"
                    className="w-full max-h-80 object-cover rounded-lg border border-gold-500/20"
                  />
                )}

                <div className="border-t border-gold-500/10 pt-3 text-center">
                  <p className="text-[10px] tracking-[0.2em] text-gold-400">
                    THE SECRET SCOOP
                  </p>
                  <p className="text-[10px] text-bone-500 italic">
                    Your secrets. Our business.
                  </p>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => deletePost(post.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Supprimer la publication
                  </button>
                )}
              </article>
            ))}
          </>
        )}

        {tab === 'messages' && (
          <section className="space-y-4">
            {adminOnly && isAdmin && (
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => setTab('admin')} className="text-xs text-gold-400">← Retour aux conversations</button>
                <span className="text-xs text-bone-400">{displayName(activeConversation)}</span>
              </div>
            )}
            <div className="space-y-3 min-h-48">
              {conversationMessages.length === 0 && (
                <p className="text-center text-sm text-bone-500 py-10">
                  Aucun message pour le moment.
                </p>
              )}

              {conversationMessages.map((message) => {
                const ownMessage = adminOnly
                  ? message.sender_type === 'admin'
                  : message.sender_type === 'character';

                return (
                  <div
                    key={message.id}
                    className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl p-3 ${
                        ownMessage
                          ? 'bg-gold-500/15 border border-gold-500/30'
                          : 'bg-ink-800 border border-bone-500/10'
                      }`}
                    >
                      <p className="text-[10px] text-gold-400 mb-1">
                        {message.sender_type === 'admin'
                          ? 'THE SECRET SCOOP'
                          : displayName(message.character_id)}
                      </p>

                      {message.content && (
                        <p className="text-sm whitespace-pre-wrap leading-6">
                          {message.content}
                        </p>
                      )}

                      {message.image_url && signedImages[message.image_url] && (
                        <img
                          src={signedImages[message.image_url]}
                          alt="Pièce jointe"
                          className="mt-2 max-w-full max-h-64 rounded-lg"
                        />
                      )}

                      <p className="text-[9px] text-bone-500 text-right mt-2">
                        {new Date(message.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={sendMessage} className="space-y-3 border-t border-gold-500/20 pt-4">
              <textarea
                value={messageContent}
                onChange={(event) => setMessageContent(event.target.value)}
                placeholder="Écrire un message..."
                rows={3}
                className="w-full bg-ink-900 border border-gold-500/30 rounded-lg p-3 text-sm text-bone-100 placeholder:text-bone-600"
              />

              <label className="block text-xs text-bone-400">
                Ajouter une photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    setMessageImage(event.target.files?.[0] || null)
                  }
                  className="block mt-2 text-xs"
                />
              </label>

              <button
                type="submit"
                disabled={sending || (isAdmin && !activeConversation)}
                className="w-full rounded-lg bg-gold-500 text-ink-950 font-semibold text-xs uppercase tracking-widest py-3 disabled:opacity-40"
              >
                {sending ? 'Envoi...' : 'Envoyer'}
              </button>
            </form>
          </section>
        )}

        {tab === 'submit' && (
          <section className="space-y-4">
            <div className="text-center py-3">
              <p className="text-gold-400 font-serif text-xl">
                Tu sais quelque chose ?
              </p>
              <p className="text-xs text-bone-500 mt-2">
                Envoie ton secret à l'administration. Rien ne sera publié sans vérification.
              </p>
            </div>

            <form onSubmit={submitSecret} className="space-y-4">
              <textarea
                value={submissionContent}
                onChange={(event) => setSubmissionContent(event.target.value)}
                placeholder="Raconte-nous tout..."
                rows={7}
                required
                className="w-full bg-ink-900 border border-gold-500/30 rounded-lg p-3 text-sm text-bone-100 placeholder:text-bone-600"
              />

              <label className="block text-xs text-bone-400">
                Ajouter une photo (facultatif)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    setSubmissionImage(event.target.files?.[0] || null)
                  }
                  className="block mt-2 text-xs"
                />
              </label>

              <button
                type="submit"
                disabled={sending || !characterId}
                className="w-full rounded-lg bg-gold-500 text-ink-950 font-semibold text-xs uppercase tracking-widest py-3 disabled:opacity-40"
              >
                {sending ? 'Envoi...' : 'Envoyer à The Secret Scoop'}
              </button>
            </form>
          </section>
        )}

        {tab === 'admin' && isAdmin && (
          <section className="space-y-6">
            <div>
              <h2 className="font-serif text-lg text-gold-400 mb-3">
                Nouvelle publication
              </h2>

              <form onSubmit={sendPost} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPostType('verified')}
                    className={`rounded-lg border py-3 text-xs uppercase tracking-widest ${
                      postType === 'verified'
                        ? 'border-gold-400 bg-gold-500/15 text-gold-300'
                        : 'border-gold-500/20 text-bone-500'
                    }`}
                  >
                    ✦ Vérifié
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostType('rumor')}
                    className={`rounded-lg border py-3 text-xs uppercase tracking-widest ${
                      postType === 'rumor'
                        ? 'border-red-400 bg-red-500/10 text-red-300'
                        : 'border-gold-500/20 text-bone-500'
                    }`}
                  >
                    Rumeur
                  </button>
                </div>

                <select
                  value={postTarget}
                  onChange={(event) => setPostTarget(event.target.value)}
                  className="w-full bg-ink-900 border border-gold-500/30 rounded-lg p-3 text-sm"
                >
                  <option value="">Aucune cible particulière</option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.first_name} {character.name}
                    </option>
                  ))}
                </select>

                <textarea
                  value={postContent}
                  onChange={(event) => setPostContent(event.target.value)}
                  placeholder="Rédiger la publication..."
                  rows={6}
                  required
                  className="w-full bg-ink-900 border border-gold-500/30 rounded-lg p-3 text-sm"
                />

                <label className="block text-xs text-bone-400">
                  Image de la publication
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) =>
                      setPostImage(event.target.files?.[0] || null)
                    }
                    className="block mt-2 text-xs"
                  />
                </label>

                <button
                  type="submit"
                  disabled={sending}
                  className="w-full rounded-lg bg-gold-500 text-ink-950 font-semibold text-xs uppercase tracking-widest py-3 disabled:opacity-40"
                >
                  {sending ? 'Publication...' : 'Publier'}
                </button>
              </form>
            </div>

            <div className="border-t border-gold-500/20 pt-5">
              <h2 className="font-serif text-lg text-gold-400 mb-3">
                Propositions des joueurs
              </h2>

              {pendingSubmissions.length === 0 && (
                <p className="text-sm text-bone-500">
                  Aucune proposition en attente.
                </p>
              )}

              {pendingSubmissions.map((submission) => (
                <article
                  key={submission.id}
                  className="rounded-lg border border-gold-500/20 bg-ink-900 p-3 mb-3 space-y-3"
                >
                  <p className="text-xs text-gold-400">
                    {displayName(submission.character_id)}
                  </p>

                  <p className="text-sm whitespace-pre-wrap">
                    {submission.content}
                  </p>

                  {submission.image_url && (
                    <button
                      type="button"
                      onClick={() => loadPrivateImage(submission.image_url!)}
                      className="text-xs text-gold-400 underline"
                    >
                      Charger la photo jointe
                    </button>
                  )}

                  {submission.image_url && signedImages[submission.image_url] && (
                    <img
                      src={signedImages[submission.image_url]}
                      alt="Pièce jointe"
                      className="w-full max-h-64 object-contain rounded-lg"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => publishSubmission(submission)}
                      className="rounded-lg bg-gold-500 text-ink-950 py-2 text-xs font-semibold"
                    >
                      Publier
                    </button>

                    <button
                      onClick={() => reviewSubmission(submission, 'rejected')}
                      className="rounded-lg border border-red-400/40 text-red-300 py-2 text-xs"
                    >
                      Refuser
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="border-t border-gold-500/20 pt-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-serif text-lg text-gold-400">Conversations</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMessage((value) => !value);
                    setNewMessageSearch('');
                  }}
                  className="rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-ink-950"
                >
                  + Nouveau message
                </button>
              </div>

              {showNewMessage && (
                <div className="mb-4 rounded-xl border border-gold-500/30 bg-ink-900 p-3 space-y-3">
                  <label className="block text-xs uppercase tracking-widest text-gold-400">
                    Rechercher un personnage
                  </label>
                  <input
                    type="search"
                    value={newMessageSearch}
                    onChange={(event) => setNewMessageSearch(event.target.value)}
                    placeholder="Écrire le prénom ou le nom..."
                    className="w-full rounded-lg border border-gold-500/30 bg-ink-950 p-3 text-sm text-bone-100 placeholder:text-bone-600"
                  />
                  <div className="max-h-56 overflow-y-auto space-y-2">
                    {characters
                      .filter((character) =>
                        `${character.first_name || ''} ${character.name}`
                          .toLowerCase()
                          .includes(newMessageSearch.trim().toLowerCase())
                      )
                      .map((character) => (
                        <button
                          key={character.id}
                          type="button"
                          onClick={() => {
                            setActiveConversation(character.id);
                            setShowNewMessage(false);
                            setTab('messages');
                          }}
                          className="w-full rounded-lg border border-white/10 bg-ink-950 p-3 text-left text-sm hover:border-gold-500/40"
                        >
                          {character.first_name} {character.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {characters
                .filter((character) =>
                  messages.some((message) => message.character_id === character.id)
                )
                .sort((a, b) => {
                  const latest = (id: string) =>
                    messages
                      .filter((message) => message.character_id === id)
                      .reduce((time, message) => Math.max(time, new Date(message.created_at).getTime()), 0);
                  return latest(b.id) - latest(a.id);
                })
                .map((character) => {
                  const characterMessages = messages.filter(
                    (message) => message.character_id === character.id
                  );
                  const lastMessage = characterMessages[characterMessages.length - 1];
                  const unreadCount = characterMessages.filter(
                    (message) => message.sender_type === 'character' && !message.read_at
                  ).length;

                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={async () => {
                        setActiveConversation(character.id);
                        setTab('messages');
                        const { error: readError } = await supabase
                          .from('scoop_messages')
                          .update({ read_at: new Date().toISOString() })
                          .eq('character_id', character.id)
                          .eq('sender_type', 'character')
                          .is('read_at', null);
                        if (!readError) await loadData();
                      }}
                      className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-gold-500/20 bg-ink-900 p-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-bone-100">
                          {character.first_name} {character.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-bone-500">
                          {lastMessage?.sender_type === 'admin' ? 'The Secret Scoop : ' : ''}
                          {lastMessage?.content || (lastMessage?.image_url ? 'Photo jointe' : 'Conversation')}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {unreadCount > 0 && (
                          <span className="rounded-full bg-gold-500 px-2 py-1 text-[10px] font-semibold text-ink-950">
                            {unreadCount}
                          </span>
                        )}
                        <span className="text-[10px] text-bone-500">
                          {lastMessage ? new Date(lastMessage.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              {messages.length === 0 && (
                <p className="text-sm text-bone-500">Aucune conversation pour le moment.</p>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-gold-500/20 text-center py-4">
        <p className="text-[9px] tracking-[0.3em] text-gold-500/70">
          YOUR SECRETS. OUR BUSINESS.
        </p>
      </footer>
    </div>
  );
}
