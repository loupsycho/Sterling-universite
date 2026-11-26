
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { getDiscordCompatibleImageUrl } from '@/lib/imageUrls';

type ScoopPost = {
  id: string;
  post_type: 'verified' | 'rumor';
  target_character_id: string | null;
  target_character_ids?: string[] | null;
  categories?: string[] | null;
  content: string;
  image_url: string | null;
  created_at: string;
};

type ScoopReaction = {
  id: string;
  post_id: string;
  character_id: string;
  reaction_type: 'like' | 'dislike';
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
  avatar_url?: string | null;
  player_id?: string;
};

type ScoopSubmission = {
  id: string;
  character_id: string;
  content: string;
  image_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submission_source?: 'character' | 'player';
  created_at: string;
};

type Tab = 'feed' | 'messages' | 'submit' | 'admin';

interface SecretScoopProps {
  characterId: string;
  adminOnly?: boolean;
}

const SIGNATURE = "Don't hide. I see you.\nTHE SECRET SCOOP\nYour secrets. Our business.";

const SCOOP_CATEGORIES = [
  { id: 'HOT', label: '♥ HOT' },
  { id: 'RIVALITÉ', label: '⚔ RIVALITÉ' },
  { id: 'ÉTUDES', label: '✎ ÉTUDES' },
  { id: 'CAMPUS', label: '♛ CAMPUS' },
  { id: 'SECRETS', label: '◈ SECRETS' },
  { id: 'SOCIAL', label: '♡ SOCIAL' },
  { id: 'AUTRE', label: '✧ AUTRE' },
] as const;

export default function SecretScoop({ characterId, adminOnly = false }: SecretScoopProps) {
  const [tab, setTab] = useState<Tab>(adminOnly ? 'admin' : 'feed');
  const [posts, setPosts] = useState<ScoopPost[]>([]);
  const [reactions, setReactions] = useState<ScoopReaction[]>([]);
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
  const [postTargets, setPostTargets] = useState<string[]>([]);
  const [postCategories, setPostCategories] = useState<string[]>([]);
  const [postContent, setPostContent] = useState('');
  const [submissionMode, setSubmissionMode] = useState<'character' | 'player'>('character');
  const [submissionCharacterId, setSubmissionCharacterId] = useState(characterId);
  const [submissionContent, setSubmissionContent] = useState('');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostType, setEditPostType] = useState<'verified' | 'rumor'>('rumor');
  const [editTargets, setEditTargets] = useState<string[]>([]);
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editContent, setEditContent] = useState('');
  const [editPostImage, setEditPostImage] = useState<File | null>(null);
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
        reactionsResult,
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
          .select('id, name, first_name, status, avatar_url, player_id'),

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

        supabase
          .from('scoop_post_reactions')
          .select('*'),
      ]);

      if (postsResult.error) throw postsResult.error;
      if (settingsResult.error) throw settingsResult.error;
      if (charactersResult.error) throw charactersResult.error;
      if (messagesResult.error) throw messagesResult.error;
      if (submissionsResult.error) throw submissionsResult.error;
      if (reactionsResult.error) throw reactionsResult.error;

      setPosts((postsResult.data || []) as ScoopPost[]);
      setReactions((reactionsResult.data || []) as ScoopReaction[]);
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
    if (postCategories.length === 0) {
      setError('Sélectionne au moins une catégorie.');
      return;
    }

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
          target_character_id: postTargets[0] || null,
          target_character_ids: postTargets,
          categories: postCategories,
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
      setPostTargets([]);
      setPostCategories([]);
      await loadData();
      notify('Publication mise en ligne.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication impossible.');
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (postId: string, reactionType: 'like' | 'dislike') => {
    if (!characterId || adminOnly) return;
    const current = reactions.find(
      (reaction) => reaction.post_id === postId && reaction.character_id === characterId
    );

    setError('');
    try {
      if (current?.reaction_type === reactionType) {
        const { error: deleteError } = await supabase
          .from('scoop_post_reactions')
          .delete()
          .eq('id', current.id);
        if (deleteError) throw deleteError;
        setReactions((previous) => previous.filter((reaction) => reaction.id !== current.id));
      } else if (current) {
        const { data, error: updateError } = await supabase
          .from('scoop_post_reactions')
          .update({ reaction_type: reactionType })
          .eq('id', current.id)
          .select()
          .single();
        if (updateError) throw updateError;
        setReactions((previous) => previous.map((reaction) => reaction.id === current.id ? data as ScoopReaction : reaction));
      } else {
        const { data, error: insertError } = await supabase
          .from('scoop_post_reactions')
          .insert({ post_id: postId, character_id: characterId, reaction_type: reactionType })
          .select()
          .single();
        if (insertError) throw insertError;
        setReactions((previous) => [...previous, data as ScoopReaction]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer ta réaction.');
    }
  };

  const submitSecret = async (event: FormEvent) => {
    event.preventDefault();
    const selectedCharacterId = submissionMode === 'player' ? submissionCharacterId : characterId;
    if (!submissionContent.trim() || !selectedCharacterId) return;

    setSending(true);
    setError('');

    try {
      let imagePath: string | null = null;

      if (submissionImage) {
        imagePath = await uploadPrivateImage(
          submissionImage,
          selectedCharacterId
        );
      }

      const { error: insertError } = await supabase
        .from('scoop_submissions')
        .insert({
          character_id: selectedCharacterId,
          submission_source: submissionMode,
          content: submissionContent.trim(),
          image_url: imagePath,
          status: 'pending',
        });

      if (insertError) throw insertError;

      setSubmissionContent('');
      setSubmissionImage(null);
      setSubmissionMode('character');
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
        target_character_id: submission.submission_source === 'player' ? submission.character_id : null,
        target_character_ids: submission.submission_source === 'player' ? [submission.character_id] : [],
        categories: ['AUTRE'],
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
                    {post.post_type === 'verified' ? '✦ Vérifié' : 'Rumeur'}
                  </span>

                  <span className="text-[10px] text-bone-500">
                    {new Date(post.created_at).toLocaleString('fr-FR')}
                  </span>
                </div>

                {(() => {
                  const targetIds = post.target_character_ids?.length
                    ? post.target_character_ids
                    : post.target_character_id ? [post.target_character_id] : [];
                  const targets = targetIds
                    .map((id) => characters.find((character) => character.id === id))
                    .filter((character): character is ScoopCharacter => Boolean(character));
                  return targets.length > 0 ? (
                    <div className="flex flex-wrap gap-3 border-y border-gold-500/10 py-3">
                      {targets.map((target) => (
                        <div key={target.id} className="flex w-16 flex-col items-center gap-1 text-center">
                          <div className="h-12 w-12 overflow-hidden rounded-full border border-gold-400/50 bg-ink-800">
                            {target.avatar_url ? (
                              <img src={getDiscordCompatibleImageUrl(target.avatar_url)} alt={displayName(target.id)} className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-gold-400">✦</span>
                            )}
                          </div>
                          <span className="text-[10px] leading-tight text-gold-300">{displayName(target.id)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}

                {post.categories?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {post.categories.map((category) => (
                      <span key={category} className="rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 py-1 text-[9px] uppercase tracking-wider text-gold-300">
                        {SCOOP_CATEGORIES.find((item) => item.id === category)?.label || category}
                      </span>
                    ))}
                  </div>
                ) : null}

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

                {!adminOnly && characterId && (
                  <div className="flex items-center gap-3 border-t border-gold-500/10 pt-3">
                    {(['like', 'dislike'] as const).map((reactionType) => {
                      const count = reactions.filter(
                        (reaction) => reaction.post_id === post.id && reaction.reaction_type === reactionType
                      ).length;
                      const selected = reactions.some(
                        (reaction) => reaction.post_id === post.id &&
                          reaction.character_id === characterId &&
                          reaction.reaction_type === reactionType
                      );
                      return (
                        <button
                          key={reactionType}
                          type="button"
                          onClick={() => void toggleReaction(post.id, reactionType)}
                          aria-pressed={selected}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${selected
                            ? reactionType === 'like'
                              ? 'border-pink-400/60 bg-pink-500/15 text-pink-300'
                              : 'border-red-400/60 bg-red-500/15 text-red-300'
                            : 'border-gold-500/20 text-bone-400 hover:border-gold-400/50 hover:text-bone-200'}`}
                        >
                          <span>{reactionType === 'like' ? '❤️' : '👎'}</span>
                          <span>{count}</span>
                        </button>
                      );
                    })}
                  </div>
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

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSubmissionMode('character')} className={`rounded-lg border px-2 py-3 text-xs uppercase tracking-wider ${submissionMode === 'character' ? 'border-gold-400 bg-gold-500/15 text-gold-300' : 'border-gold-500/20 text-bone-500'}`}>
                En tant que personnage
              </button>
              <button type="button" onClick={() => setSubmissionMode('player')} className={`rounded-lg border px-2 py-3 text-xs uppercase tracking-wider ${submissionMode === 'player' ? 'border-gold-400 bg-gold-500/15 text-gold-300' : 'border-gold-500/20 text-bone-500'}`}>
                En tant que joueur
              </button>
            </div>

            {submissionMode === 'player' && (
              <div className="space-y-2 rounded-lg border border-gold-500/20 bg-ink-900 p-3">
                <label className="block text-xs text-gold-400">Personnage concerné par ton idée</label>
                <select value={submissionCharacterId} onChange={(event) => setSubmissionCharacterId(event.target.value)} className="w-full rounded-lg border border-gold-500/30 bg-ink-950 p-3 text-sm text-bone-100">
                  {characters.filter((item) => item.player_id === characters.find((character) => character.id === characterId)?.player_id).map((item) => (
                    <option key={item.id} value={item.id}>{item.first_name} {item.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-bone-500">Cette suggestion est envoyée hors RP à l'administration et ne sera pas publiée automatiquement.</p>
              </div>
            )}

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

                <div className="space-y-2 rounded-lg border border-gold-500/20 bg-ink-900 p-3">
                  <p className="text-xs uppercase tracking-wider text-gold-400">Personnages ciblés (plusieurs choix possibles)</p>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {characters.map((character) => (
                      <label key={character.id} className="flex items-center gap-2 text-sm text-bone-200">
                        <input type="checkbox" checked={postTargets.includes(character.id)} onChange={(event) => setPostTargets((current) => event.target.checked ? [...current, character.id] : current.filter((id) => id !== character.id))} className="accent-yellow-500" />
                        {character.first_name} {character.name}
                      </label>
                    ))}
                  </div>
                  {postTargets.length > 0 && <p className="text-[10px] text-gold-300">{postTargets.length} personnage(s) sélectionné(s)</p>}
                </div>

                <div className="space-y-2 rounded-lg border border-gold-500/20 bg-ink-900 p-3">
                  <p className="text-xs uppercase tracking-wider text-gold-400">Catégories (plusieurs choix possibles)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SCOOP_CATEGORIES.map((category) => (
                      <label key={category.id} className="flex items-center gap-2 text-xs text-bone-200">
                        <input type="checkbox" checked={postCategories.includes(category.id)} onChange={(event) => setPostCategories((current) => event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id))} className="accent-yellow-500" />
                        {category.label}
                      </label>
                    ))}
                  </div>
                </div>

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
                    {submission.submission_source === 'player' ? 'Suggestion du joueur · ' : 'Secret envoyé en personnage · '}
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
              <h2 className="font-serif text-lg text-gold-400 mb-3">Archives des publications</h2>
              <div className="space-y-2">
                {Object.entries(posts.reduce<Record<string, ScoopPost[]>>((groups, post) => {
                  const date = new Date(post.created_at).toLocaleDateString('fr-FR');
                  (groups[date] ||= []).push(post);
                  return groups;
                }, {})).map(([date, datedPosts]) => (
                  <details key={date} className="rounded-lg border border-gold-500/20 bg-ink-900 p-3">
                    <summary className="cursor-pointer text-sm text-gold-300">{date} · {datedPosts.length} publication(s)</summary>
                    <div className="mt-3 space-y-3">
                      {datedPosts.map((post) => (
                        <div key={post.id} className="rounded-lg border border-white/10 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-bone-300">{post.content.replace(SIGNATURE, '').trim().slice(0, 130)}{post.content.replace(SIGNATURE, '').trim().length > 130 ? '…' : ''}</p>
                              <p className="mt-1 text-[10px] text-bone-500">{post.post_type === 'verified' ? 'Vérifié' : 'Rumeur'} · {(post.target_character_ids?.length ? post.target_character_ids : post.target_character_id ? [post.target_character_id] : []).map(displayName).join(', ') || 'Sans cible'}</p>
                            </div>
                            <button type="button" onClick={() => {
                              setEditingPostId(post.id);
                              setEditPostType(post.post_type);
                              setEditTargets(post.target_character_ids?.length ? post.target_character_ids : post.target_character_id ? [post.target_character_id] : []);
                              setEditCategories(post.categories || []);
                              setEditContent(post.content.replace(SIGNATURE, '').trim());
                              setEditPostImage(null);
                            }} className="shrink-0 rounded-lg border border-gold-500/30 px-3 py-2 text-xs text-gold-300">Modifier</button>
                          </div>
                          {editingPostId === post.id && (
                            <form onSubmit={async (event) => {
                              event.preventDefault();
                              if (!editCategories.length) {
                                setError('Sélectionne au moins une catégorie.');
                                return;
                              }
                              setSending(true);
                              setError('');
                              try {
                                let imageUrl = post.image_url;
                                if (editPostImage) imageUrl = await uploadPublicImage(editPostImage, 'posts');
                                const { error: updateError } = await supabase.from('scoop_posts').update({
                                  post_type: editPostType,
                                  target_character_id: editTargets[0] || null,
                                  target_character_ids: editTargets,
                                  categories: editCategories,
                                  content: editContent.trim() + '\n\n' + SIGNATURE,
                                  image_url: imageUrl,
                                }).eq('id', post.id);
                                if (updateError) throw updateError;
                                setEditingPostId(null);
                                await loadData();
                                notify('Publication modifiée.');
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Modification impossible.');
                              } finally {
                                setSending(false);
                              }
                            }} className="mt-3 space-y-3 border-t border-gold-500/10 pt-3">
                              <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setEditPostType('verified')} className={`rounded-lg border py-2 text-xs ${editPostType === 'verified' ? 'border-gold-400 text-gold-300' : 'border-white/10 text-bone-500'}`}>✦ Vérifié</button>
                                <button type="button" onClick={() => setEditPostType('rumor')} className={`rounded-lg border py-2 text-xs ${editPostType === 'rumor' ? 'border-red-400 text-red-300' : 'border-white/10 text-bone-500'}`}>Rumeur</button>
                              </div>
                              <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={5} required className="w-full rounded-lg border border-gold-500/30 bg-ink-950 p-3 text-sm text-bone-100" />
                              <p className="text-xs text-gold-400">Personnages ciblés</p>
                              <div className="grid grid-cols-2 gap-2">
                                {characters.map((character) => <label key={character.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editTargets.includes(character.id)} onChange={(event) => setEditTargets((current) => event.target.checked ? [...current, character.id] : current.filter((id) => id !== character.id))} />{character.first_name} {character.name}</label>)}
                              </div>
                              <p className="text-xs text-gold-400">Catégories</p>
                              <div className="grid grid-cols-2 gap-2">
                                {SCOOP_CATEGORIES.map((category) => <label key={category.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editCategories.includes(category.id)} onChange={(event) => setEditCategories((current) => event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id))} />{category.label}</label>)}
                              </div>
                              <label className="block text-xs text-bone-400">Remplacer l'image (facultatif)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setEditPostImage(event.target.files?.[0] || null)} className="mt-2 block text-xs" /></label>
                              <div className="grid grid-cols-2 gap-2">
                                <button type="submit" disabled={sending} className="rounded-lg bg-gold-500 py-2 text-xs font-semibold text-ink-950">Enregistrer</button>
                                <button type="button" onClick={() => setEditingPostId(null)} className="rounded-lg border border-white/15 py-2 text-xs text-bone-300">Annuler</button>
                              </div>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
                {posts.length === 0 && <p className="text-sm text-bone-500">Aucune publication archivée.</p>}
              </div>
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
