import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Heart, Home, ImagePlus, MessageCircle,
  MoreHorizontal, PlusSquare, Search, Trash2, UserRound, Video, X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDiscordCompatibleImageUrl } from '@/lib/imageUrls';

type Character = {
  id: string;
  name: string;
  first_name: string | null;
  avatar_url: string | null;
  character_type: string | null;
};
type Media = { id?: string; media_url: string; media_type: 'image' | 'video'; thumbnail_url?: string | null; sort_order?: number };
type Post = { id: string; character_id: string; image_url: string; caption: string | null; created_at: string; media: Media[]; tags: string[] };
type Comment = { id: string; post_id: string; character_id: string; content: string; created_at: string; parent_comment_id: string | null };
type Notification = { id: string; notification_type: string; title: string; body: string | null; related_id: string | null; actor_character_id: string | null; is_read: boolean; created_at: string };

type Props = { characterId: string };
type Tab = 'home' | 'search' | 'create' | 'profile';
const BUCKET = 'instagram-posts';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];

const fullName = (c?: Character | null) => c ? [c.first_name, c.name].filter(Boolean).join(' ') : 'Personnage';
const dateLabel = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const mediaType = (file: File): 'image' | 'video' => file.type.startsWith('video/') ? 'video' : 'image';

function Avatar({ character, size = 'h-10 w-10' }: { character?: Character | null; size?: string }) {
  return character?.avatar_url
    ? <img src={getDiscordCompatibleImageUrl(character.avatar_url)} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
    : <div className={`${size} shrink-0 rounded-full border border-gold-500/30 bg-ink-800 text-gold-300 flex items-center justify-center`}><UserRound size={20} /></div>;
}

export default function InstagramApp({ characterId }: Props) {
  const [me, setMe] = useState<Character | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [postAuthors, setPostAuthors] = useState<Character[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [likes, setLikes] = useState<Record<string, string[]>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentLikes, setCommentLikes] = useState<Record<string, string[]>>({});
  const [follows, setFollows] = useState<{ follower_character_id: string; followed_character_id: string }[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [profileId, setProfileId] = useState(characterId);
  const [search, setSearch] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activePost, setActivePost] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [showLikes, setShowLikes] = useState<string | null>(null);
  const [showFollowers, setShowFollowers] = useState<'followers' | 'following' | null>(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState('');
  const [bios, setBios] = useState<Record<string, string>>({});
  const [carousel, setCarousel] = useState<Record<string, number>>({});
  const [showNotifications, setShowNotifications] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Post | null>(null);
  const [expandedMedia, setExpandedMedia] = useState<Media | null>(null);

  const characterMap = useMemo(() => new Map([...postAuthors, ...characters].map(c => [c.id, c])), [characters, postAuthors]);
  const profile = characterMap.get(profileId) || (profileId === characterId ? me : null);
  const myPosts = posts.filter(p => p.character_id === profileId);
  const followers = follows.filter(f => f.followed_character_id === profileId);
  const following = follows.filter(f => f.follower_character_id === profileId);
  const isFollowing = follows.some(f => f.follower_character_id === characterId && f.followed_character_id === profileId);
  const unread = notifications.filter(n => !n.is_read).length;

  const loadAll = useCallback(async () => {
    const [chars, postRows, likeRows, commentRows, followRows, notifRows, profileRow] = await Promise.all([
      supabase.from('characters').select('id,name,first_name,avatar_url,character_type').eq('status', 'approved').order('name'),
      supabase.from('instagram_posts').select('id,character_id,image_url,caption,created_at').order('created_at', { ascending: false }),
      supabase.from('instagram_likes').select('post_id,character_id'),
      supabase.from('instagram_comments').select('id,post_id,character_id,content,created_at,parent_comment_id').order('created_at'),
      supabase.from('instagram_follows').select('follower_character_id,followed_character_id'),
      supabase.from('notifications').select('id,notification_type,title,body,related_id,actor_character_id,is_read,created_at').eq('recipient_character_id', characterId).eq('source_app', 'instagram').order('created_at', { ascending: false }).limit(100),
      supabase.from('instagram_profiles').select('character_id,bio')
    ]);
    if (chars.data) {
      setCharacters(chars.data as Character[]);
      setMe((chars.data as Character[]).find(c => c.id === characterId) || null);
    }
    if (postRows.data) {
      const rows = postRows.data as Omit<Post, 'media' | 'tags'>[];
      const authorIds = [...new Set(rows.map(p => p.character_id))];
      if (authorIds.length) {
        const { data: authors } = await supabase.from('characters').select('id,name,first_name,avatar_url,character_type').in('id', authorIds);
        if (authors) setPostAuthors(authors as Character[]);
      } else setPostAuthors([]);
      const ids = rows.map(p => p.id);
      const [mediaRows, tagRows] = ids.length ? await Promise.all([
        supabase.from('instagram_post_media').select('id,post_id,media_url,media_type,thumbnail_url,sort_order').in('post_id', ids).order('sort_order'),
        supabase.from('instagram_post_tags').select('post_id,tagged_character_id').in('post_id', ids)
      ]) : [{ data: [] }, { data: [] }];
      setPosts(rows.map(p => {
        const media = ((mediaRows.data || []) as (Media & { post_id: string })[]).filter(m => m.post_id === p.id).map(({ post_id: _p, ...m }) => m);
        return { ...p, media: media.length ? media : [{ media_url: p.image_url, media_type: p.image_url.match(/\.(mp4|webm)(\?|$)/i) ? 'video' : 'image' }], tags: ((tagRows.data || []) as { post_id: string; tagged_character_id: string }[]).filter(t => t.post_id === p.id).map(t => t.tagged_character_id) };
      }));
    }
    if (likeRows.data) {
      const grouped: Record<string, string[]> = {};
      likeRows.data.forEach((l: { post_id: string; character_id: string }) => { (grouped[l.post_id] ||= []).push(l.character_id); });
      setLikes(grouped);
    }
    if (commentRows.data) setComments(commentRows.data as Comment[]);
    if (followRows.data) setFollows(followRows.data as { follower_character_id: string; followed_character_id: string }[]);
    if (notifRows.data) setNotifications(notifRows.data as Notification[]);
    if (profileRow.data) { const map: Record<string, string> = {}; profileRow.data.forEach((row: { character_id: string; bio: string | null }) => { map[row.character_id] = row.bio || ''; }); setBios(map); setBio(map[characterId] || ''); }
  }, [characterId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    let alive = true;
    const loadCommentLikes = async () => {
      const ids = comments.map(c => c.id);
      if (!ids.length) { if (alive) setCommentLikes({}); return; }
      const { data } = await supabase.from('instagram_comment_likes').select('comment_id,character_id').in('comment_id', ids);
      if (!alive || !data) return;
      const grouped: Record<string, string[]> = {};
      data.forEach((l: { comment_id: string; character_id: string }) => { (grouped[l.comment_id] ||= []).push(l.character_id); });
      setCommentLikes(grouped);
    };
    void loadCommentLikes();
    return () => { alive = false; };
  }, [comments]);

  const goProfile = (id: string) => { setProfileId(id); setTab('profile'); setShowFollowers(null); setShowLikes(null); };
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };

  const toggleFollow = async (targetId: string) => {
    if (targetId === characterId || busy) return;
    setBusy(true);
    const existing = follows.some(f => f.follower_character_id === characterId && f.followed_character_id === targetId);
    const result = existing
      ? await supabase.from('instagram_follows').delete().eq('follower_character_id', characterId).eq('followed_character_id', targetId)
      : await supabase.from('instagram_follows').insert({ follower_character_id: characterId, followed_character_id: targetId });
    setBusy(false);
    if (result.error) { notify("Impossible de modifier l'abonnement."); return; }
    await loadAll();
  };

  const togglePostLike = async (postId: string) => {
    const mine = (likes[postId] || []).includes(characterId);
    const result = mine
      ? await supabase.from('instagram_likes').delete().eq('post_id', postId).eq('character_id', characterId)
      : await supabase.from('instagram_likes').insert({ post_id: postId, character_id: characterId });
    if (result.error) { notify("Impossible d'enregistrer le J'aime."); return; }
    await loadAll();
  };

  const toggleCommentLike = async (commentId: string) => {
    const mine = (commentLikes[commentId] || []).includes(characterId);
    const result = mine
      ? await supabase.from('instagram_comment_likes').delete().eq('comment_id', commentId).eq('character_id', characterId)
      : await supabase.from('instagram_comment_likes').insert({ comment_id: commentId, character_id: characterId });
    if (result.error) { notify("Impossible d'aimer ce commentaire."); return; }
    const { data } = await supabase.from('instagram_comment_likes').select('comment_id,character_id').in('comment_id', comments.map(c => c.id));
    const grouped: Record<string, string[]> = {};
    (data || []).forEach((l: { comment_id: string; character_id: string }) => { (grouped[l.comment_id] ||= []).push(l.character_id); });
    setCommentLikes(grouped);
  };

  const submitComment = async (postId: string) => {
    const value = commentText.trim();
    if (!value) return;
    const { error } = await supabase.from('instagram_comments').insert({ post_id: postId, character_id: characterId, content: value, parent_comment_id: replyTo?.id || null });
    if (error) { notify("Impossible de publier le commentaire."); return; }
    setCommentText(''); setReplyTo(null); await loadAll();
  };

  const deleteComment = async (comment: Comment) => {
    if (comment.character_id !== characterId) return;
    const { error } = await supabase.from('instagram_comments').delete().eq('id', comment.id).eq('character_id', characterId);
    if (error) { notify("Impossible de supprimer ce commentaire."); return; }
    await loadAll();
  };

  const deletePost = async (post: Post) => {
    if (post.character_id !== characterId) return;
    setBusy(true);
    const media = post.media.map(m => m.media_url);
    const paths = media.map(url => {
      const marker = '/storage/v1/object/public/' + BUCKET + '/';
      const i = url.indexOf(marker);
      return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null;
    }).filter(Boolean) as string[];
    const { data: deleted, error } = await supabase.from('instagram_posts').delete().eq('id', post.id).eq('character_id', characterId).select('id').maybeSingle();
    if (error || !deleted) { setBusy(false); notify(error ? "La publication n'a pas pu être supprimée. Vérifie les autorisations." : "La suppression a été refusée : vérifie que ce personnage est bien celui sélectionné."); return; }
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
      if (storageError) console.error('Instagram media cleanup:', storageError);
    }
    setBusy(false); setActivePost(null); setDeleteCandidate(null); await loadAll(); notify('Publication supprimée.');
  };

  const createPost = async () => {
    if (!selectedFiles.length || uploading) return;
    const videoCount = selectedFiles.filter(f => mediaType(f) === 'video').length;
    if (videoCount > 1 || (videoCount && selectedFiles.length > 1)) { notify('Choisis plusieurs photos ou une seule vidéo.'); return; }
    if (selectedFiles.some(f => !ACCEPTED.includes(f.type) || f.size > MAX_FILE_SIZE)) { notify('Format non accepté ou fichier supérieur à 50 Mo.'); return; }
    setUploading(true);
    const uploaded: Media[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${characterId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) { notify("Échec de l'envoi du média."); setUploading(false); return; }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push({ media_url: data.publicUrl, media_type: mediaType(file), sort_order: i });
    }
    const { data: post, error } = await supabase.from('instagram_posts').insert({ character_id: characterId, image_url: uploaded[0].media_url, caption: caption.trim() || null }).select('id').single();
    if (error || !post) { notify("Impossible de créer la publication."); setUploading(false); return; }
    const mediaInsert = await supabase.from('instagram_post_media').insert(uploaded.map(m => ({ post_id: post.id, media_url: m.media_url, media_type: m.media_type, thumbnail_url: m.media_type === 'video' ? m.media_url : null, sort_order: m.sort_order })));
    if (mediaInsert.error) console.error('Instagram media rows:', mediaInsert.error);
    if (taggedIds.length) {
      const tagInsert = await supabase.from('instagram_post_tags').insert(taggedIds.map(id => ({ post_id: post.id, tagged_character_id: id })));
      if (tagInsert.error) console.error('Instagram tags:', tagInsert.error);
    }
    setSelectedFiles([]); setCaption(''); setTaggedIds([]); setUploading(false); setTab('home'); await loadAll(); notify('Publication ajoutée.');
  };

  const saveBio = async () => {
    const { error } = await supabase.from('instagram_profiles').upsert({ character_id: characterId, bio: bio.trim(), updated_at: new Date().toISOString() }, { onConflict: 'character_id' });
    if (error) { notify("Impossible d'enregistrer la biographie."); return; }
    setBios(old => ({ ...old, [characterId]: bio.trim() })); setEditingBio(false);
  };

  const openNotifications = async () => {
    setShowNotifications(true);
    if (unread) {
      const ids = notifications.filter(n => !n.is_read).map(n => n.id);
      await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', ids);
      setNotifications(old => old.map(n => ({ ...n, is_read: true })));
    }
  };


  const profilePost = (post: Post) => { setActivePost(post.id); setShowLikes(null); };
  const orderedComments = (postId: string) => comments.filter(c => c.post_id === postId && !c.parent_comment_id);
  const repliesFor = (id: string) => comments.filter(c => c.parent_comment_id === id);
  const renderComment = (comment: Comment) => {
    const owner = characterMap.get(comment.character_id);
    const mine = comment.character_id === characterId;
    return <div key={comment.id} className="py-2">
      <div className="flex items-start gap-2">
        <button onClick={() => goProfile(comment.character_id)}><Avatar character={owner} size="h-8 w-8" /></button>
        <div className="min-w-0 flex-1 text-sm"><p><button className="font-semibold text-bone-100" onClick={() => goProfile(comment.character_id)}>{fullName(owner)}</button> <span className="text-bone-300">{comment.content}</span></p>
          <div className="mt-1 flex items-center gap-3 text-xs text-bone-400"><span>{dateLabel(comment.created_at)}</span><button onClick={() => setReplyTo(comment)} className="font-semibold">Répondre</button>{mine && <button onClick={() => void deleteComment(comment)}><Trash2 size={12} /></button>}</div>
        </div>
        <button onClick={() => void toggleCommentLike(comment.id)} className="flex flex-col items-center text-xs text-bone-400"><Heart size={15} fill={(commentLikes[comment.id] || []).includes(characterId) ? '#d9465f' : 'none'} color={(commentLikes[comment.id] || []).includes(characterId) ? '#d9465f' : 'currentColor'} />{(commentLikes[comment.id] || []).length || ''}</button>
      </div>
      {repliesFor(comment.id).map(reply => <div key={reply.id} className="ml-10 mt-2">{renderComment(reply)}</div>)}
    </div>;
  };

  const PostCard = ({ post }: { post: Post }) => {
    const owner = characterMap.get(post.character_id);
    const current = carousel[post.id] || 0;
    const item = post.media[current] || post.media[0];
    const mine = post.character_id === characterId;
    return <article className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/90 shadow-lg shadow-black/20">
      <div className="flex items-center gap-3 px-3 py-3">
        <button onClick={() => goProfile(post.character_id)}><Avatar character={owner} /></button>
        <button onClick={() => goProfile(post.character_id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold text-bone-100">{fullName(owner)}</span><span className="text-xs text-bone-400">{dateLabel(post.created_at)}</span></button>
        {mine && <button onClick={() => setDeleteCandidate(post)} disabled={busy} aria-label="Options de la publication" className="rounded-full p-2 text-gold-300 hover:bg-ink-900/10"><MoreHorizontal /></button>}
      </div>
      <div className="relative bg-black">
        {item?.media_type === 'video'
          ? <video src={item.media_url} poster={item.thumbnail_url || undefined} controls playsInline preload="metadata" className="max-h-[560px] w-full object-contain" />
          : <button type="button" onClick={() => item && setExpandedMedia(item)} className="block w-full cursor-zoom-in"><img src={item?.media_url || post.image_url} alt="Ouvrir la photo en grand" onError={e => { e.currentTarget.style.display = 'none'; }} className="mx-auto max-h-[560px] w-full object-contain" /></button>}
        {post.media.length > 1 && <><button onClick={() => setCarousel(s => ({ ...s, [post.id]: Math.max(0, current - 1) }))} disabled={current === 0} className="absolute left-2 top-1/2 rounded-full bg-ink-900/80 p-2 disabled:opacity-30"><ChevronLeft size={18} /></button><button onClick={() => setCarousel(s => ({ ...s, [post.id]: Math.min(post.media.length - 1, current + 1) }))} disabled={current === post.media.length - 1} className="absolute right-2 top-1/2 rounded-full bg-ink-900/80 p-2 disabled:opacity-30"><ChevronRight size={18} /></button><span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs text-bone-100">{current + 1}/{post.media.length}</span></>}
      </div>
      <div className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-4"><button onClick={() => void togglePostLike(post.id)} aria-label="J'aime"><Heart size={25} color={(likes[post.id] || []).includes(characterId) ? '#e0445e' : '#292524'} fill={(likes[post.id] || []).includes(characterId) ? '#e0445e' : 'none'} /></button><button onClick={() => setActivePost(post.id)} aria-label="Commentaires"><MessageCircle size={24} /></button></div>
        <button onClick={() => setShowLikes(post.id)} className="mt-2 text-sm font-semibold text-gold-300">{(likes[post.id] || []).length} J’aime</button>
        {post.caption && <p className="mt-1 text-sm text-bone-200"><button onClick={() => goProfile(post.character_id)} className="mr-1 font-semibold">{fullName(owner)}</button>{post.caption}</p>}
        {post.tags.length > 0 && <p className="mt-1 text-xs text-bone-400">Avec {post.tags.map(id => fullName(characterMap.get(id))).join(', ')}</p>}
        <button onClick={() => setActivePost(post.id)} className="mt-1 text-sm text-bone-400">Voir les {comments.filter(c => c.post_id === post.id).length} commentaires</button>
      </div>
    </article>;
  };

  return <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-950 text-bone-100 shadow-2xl">
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gold-500/20 bg-ink-900/95 px-4 py-4 backdrop-blur">
      <div className="font-serif text-2xl italic tracking-tight text-gold-300">Instagram <span className="ml-2 font-sans text-[10px] not-italic uppercase tracking-[0.3em] text-bone-500">Sterling</span></div>
      <div className="flex items-center gap-4"><button onClick={() => setTab('create')} aria-label="Créer une publication"><PlusSquare size={24} /></button><button onClick={() => void openNotifications()} className="relative" aria-label="Notifications"><Heart size={25} />{unread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-gold-500/20 bg-red-500" />}</button></div>
    </header>

    {tab === 'home' && <main className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-ink-950 p-3">
      {posts.length ? posts.map(post => <PostCard key={post.id} post={post} />) : <div className="p-10 text-center text-sm text-bone-400">Aucune publication pour le moment.</div>}
    </main>}

    {tab === 'search' && <main className="min-h-0 flex-1 overflow-y-auto bg-ink-950 p-4">
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-gold-500/20 bg-ink-900 px-3 py-3"><Search size={18} className="text-bone-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un personnage" className="w-full bg-transparent text-sm text-bone-100 outline-none placeholder:text-bone-500" /></div>
      {characters.filter(c => c.id !== characterId && fullName(c).toLowerCase().includes(search.toLowerCase())).map(c => <div key={c.id} className="flex items-center gap-3 border-b border-gold-500/15 py-3"><button onClick={() => goProfile(c.id)}><Avatar character={c} /></button><button onClick={() => goProfile(c.id)} className="min-w-0 flex-1 text-left"><span className="block font-semibold">{fullName(c)}</span><span className="text-xs text-bone-400">Voir le profil</span></button><button onClick={() => void toggleFollow(c.id)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${follows.some(f => f.follower_character_id === characterId && f.followed_character_id === c.id) ? 'bg-ink-800 text-bone-200' : 'bg-ink-800 text-bone-100'}`}>{follows.some(f => f.follower_character_id === characterId && f.followed_character_id === c.id) ? 'Abonné(e)' : 'Suivre'}</button></div>)}
    </main>}

    {tab === 'profile' && <main className="min-h-0 flex-1 overflow-y-auto bg-ink-950">
      <div className="flex items-center gap-3 border-b border-gold-500/20 px-4 py-3">{profileId !== characterId && <button onClick={() => { setProfileId(characterId); }}><ArrowLeft /></button>}<span className="font-semibold">{profile ? fullName(profile) : 'Profil'}</span></div>
      <div className="flex items-center gap-6 px-4 py-4 text-bone-100"><Avatar character={profile} size="h-20 w-20" /><div className="grid flex-1 grid-cols-3 text-center text-sm"><div><strong className="block text-lg">{myPosts.length}</strong>publications</div><button onClick={() => setShowFollowers('followers')}><strong className="block text-lg">{followers.length}</strong>abonnés</button><button onClick={() => setShowFollowers('following')}><strong className="block text-lg">{following.length}</strong>abonnements</button></div></div>
      <div className="px-4 pb-4 text-sm text-bone-200">{profileId === characterId ? <>{editingBio ? <div className="flex gap-2"><textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={150} className="min-w-0 flex-1 rounded-lg border p-2" placeholder="Ajouter une biographie" /><button onClick={() => void saveBio()} className="font-semibold">Enregistrer</button></div> : <div className="flex items-start justify-between"><p className="whitespace-pre-wrap">{bios[characterId] || 'Ajouter une biographie…'}</p><button onClick={() => setEditingBio(true)} className="text-xs font-semibold text-bone-400">Modifier</button></div>}</> : <p>{bios[profileId] || ''}</p>}</div>
      {profileId !== characterId && <div className="flex gap-2 px-4 pb-4"><button onClick={() => void toggleFollow(profileId)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${isFollowing ? 'bg-ink-800' : 'bg-ink-800 text-bone-100'}`}>{isFollowing ? 'Abonné(e)' : 'Suivre'}</button><button onClick={() => setShowFollowers('followers')} className="rounded-lg bg-ink-800 px-4 py-2 text-sm">Abonnés</button></div>}
      <div className="grid grid-cols-3 gap-px border-t border-gold-500/20">{myPosts.map(post => <button key={post.id} onClick={() => profilePost(post)} className="aspect-square bg-ink-800">{post.media[0]?.media_type === 'video' ? <div className="relative h-full w-full"><video src={post.media[0].media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" /><Video className="absolute right-2 top-2 text-bone-100 drop-shadow" size={18} /></div> : <img src={post.media[0]?.media_url || post.image_url} alt="" className="h-full w-full object-cover" />}</button>)}</div>
    </main>}

    {tab === 'create' && <main className="min-h-0 flex-1 overflow-y-auto bg-ink-950 p-4">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Nouvelle publication</h2><button onClick={() => { setSelectedFiles([]); setCaption(''); setTaggedIds([]); setTab('home'); }}><X /></button></div>
      <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-ink-900 p-5 text-center"><ImagePlus size={34} className="mb-2 text-bone-400" /><span className="font-semibold">Choisir des photos ou une vidéo</span><span className="mt-1 text-xs text-bone-400">Plusieurs photos ou une seule vidéo (50 Mo maximum par fichier)</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple className="hidden" onChange={e => { const files = Array.from(e.target.files || []); const videos = files.filter(f => mediaType(f) === 'video'); if (videos.length > 1 || (videos.length && files.length > 1)) { notify('Choisis plusieurs photos ou une seule vidéo.'); return; } setSelectedFiles(files); }} /></label>
      {selectedFiles.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{selectedFiles.map((f,i) => <div key={i} className="truncate rounded-lg bg-ink-800 p-2 text-xs">{f.name}</div>)}</div>}
      <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Écrire une légende…" className="mt-4 min-h-24 w-full rounded-xl border border-gold-500/20 p-3 text-sm outline-none focus:border-stone-500" />
      <div className="mt-4"><p className="mb-2 text-sm font-semibold">Identifier des personnages</p><div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-gold-500/20 p-3">{characters.filter(c => c.id !== characterId).map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taggedIds.includes(c.id)} onChange={e => setTaggedIds(old => e.target.checked ? [...old,c.id] : old.filter(id => id !== c.id))} />{fullName(c)}</label>)}</div></div>
      <button onClick={() => void createPost()} disabled={!selectedFiles.length || uploading} className="mt-5 w-full rounded-xl bg-ink-800 py-3 font-semibold text-bone-100 disabled:opacity-40">{uploading ? 'Publication en cours…' : 'Partager'}</button>
    </main>}

    <nav className="grid shrink-0 grid-cols-4 border-t border-gold-500/20 bg-ink-900 py-3">
      <button onClick={() => setTab('home')} className={`flex flex-col items-center gap-1 py-1 text-xs ${tab === 'home' ? 'text-gold-300' : 'text-bone-500'}`}><Home size={23} />Accueil</button>
      <button onClick={() => setTab('search')} className={`flex flex-col items-center gap-1 py-1 text-xs ${tab === 'search' ? 'text-gold-300' : 'text-bone-500'}`}><Search size={23} />Recherche</button>
      <button onClick={() => setTab('create')} className={`flex flex-col items-center gap-1 py-1 text-xs ${tab === 'create' ? 'text-gold-300' : 'text-bone-500'}`}><PlusSquare size={23} />Publier</button>
      <button onClick={() => { setProfileId(characterId); setTab('profile'); }} className={`flex flex-col items-center gap-1 py-1 text-xs ${tab === 'profile' ? 'text-gold-300' : 'text-bone-500'}`}><UserRound size={23} />Profil</button>
    </nav>

    {notice && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink-800 px-4 py-2 text-sm text-bone-100 shadow-lg">{notice}</div>}

    {showNotifications && <div className="fixed inset-0 z-40 flex flex-col bg-ink-900"><div className="flex items-center gap-3 border-b p-4"><button onClick={() => setShowNotifications(false)}><ArrowLeft /></button><h2 className="font-semibold">Notifications</h2></div><div className="min-h-0 flex-1 overflow-y-auto">{notifications.length ? notifications.map(n => <div key={n.id} className={`flex items-center gap-3 border-b px-4 py-3 ${n.is_read ? 'bg-ink-900' : 'bg-ink-900'}`}><button onClick={() => n.actor_character_id && goProfile(n.actor_character_id)}><Avatar character={characterMap.get(n.actor_character_id || '')} /></button><button onClick={() => { setShowNotifications(false); if (n.related_id) { const p = posts.find(x => x.id === n.related_id); if (p) setActivePost(p.id); } }} className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold">{n.title}</span><span className="block text-sm text-bone-300">{n.body}</span><span className="text-xs text-bone-500">{dateLabel(n.created_at)}</span></button></div>) : <p className="p-8 text-center text-sm text-bone-400">Aucune notification.</p>}</div></div>}

    {activePost && <div className="fixed inset-0 z-40 flex flex-col bg-ink-900"><div className="flex items-center gap-3 border-b p-4"><button onClick={() => setActivePost(null)}><ArrowLeft /></button><h2 className="font-semibold">Publication</h2></div><div className="min-h-0 flex-1 overflow-y-auto">{posts.filter(p => p.id === activePost).map(p => <div key={p.id}><PostCard post={p} /><div className="px-4 pb-6">{orderedComments(p.id).map(renderComment)}{replyTo && <div className="mb-2 flex items-center justify-between rounded-lg bg-ink-800 px-3 py-2 text-xs">Réponse à {fullName(characterMap.get(replyTo.character_id))}<button onClick={() => setReplyTo(null)}><X size={14} /></button></div>}<form onSubmit={e => { e.preventDefault(); void submitComment(p.id); }} className="sticky bottom-0 flex gap-2 border-t bg-ink-900 py-3"><input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Ajouter un commentaire…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><button type="submit" disabled={!commentText.trim()} className="font-semibold text-gold-300 disabled:opacity-40">Publier</button></form></div></div>)}</div></div>}

    {showLikes && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowLikes(null)}><div className="max-h-[70%] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-ink-900 p-4" onClick={e => e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">J’aime</h3><button onClick={() => setShowLikes(null)}><X /></button></div>{(likes[showLikes] || []).map(id => <button key={id} onClick={() => { setShowLikes(null); goProfile(id); }} className="flex w-full items-center gap-3 py-2"><Avatar character={characterMap.get(id)} /><span className="font-semibold">{fullName(characterMap.get(id))}</span></button>)}</div></div>}

    {deleteCandidate && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-5"><div className="w-full max-w-sm rounded-2xl border border-gold-500/30 bg-ink-900 p-5 shadow-2xl"><h3 className="text-lg font-semibold text-bone-100">Supprimer la publication ?</h3><p className="mt-2 text-sm text-bone-400">Cette publication et ses médias seront retirés du fil et de ton profil.</p><div className="mt-5 flex gap-3"><button onClick={() => setDeleteCandidate(null)} className="flex-1 rounded-xl border border-gold-500/30 px-4 py-3 text-sm text-bone-200">Annuler</button><button onClick={() => void deletePost(deleteCandidate)} disabled={busy} className="flex-1 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Suppression…' : 'Supprimer'}</button></div></div></div>}

    {expandedMedia && <div className="fixed inset-0 z-[80] flex flex-col bg-black"><div className="flex shrink-0 items-center justify-between border-b border-gold-500/20 bg-ink-950 px-4 py-3"><button onClick={() => setExpandedMedia(null)} className="flex items-center gap-2 py-2 text-sm font-semibold text-gold-300"><ArrowLeft size={20} /> Retour à Instagram</button><button onClick={() => setExpandedMedia(null)} aria-label="Fermer la photo" className="rounded-full p-2 text-bone-200 hover:bg-white/10"><X /></button></div><div className="flex min-h-0 flex-1 items-center justify-center p-2"><img src={expandedMedia.media_url} alt="Photo agrandie" className="max-h-full max-w-full object-contain" /></div></div>}

    {showFollowers && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowFollowers(null)}><div className="max-h-[70%] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-ink-900 p-4" onClick={e => e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{showFollowers === 'followers' ? 'Abonnés' : 'Abonnements'}</h3><button onClick={() => setShowFollowers(null)}><X /></button></div>{(showFollowers === 'followers' ? followers.map(f => f.follower_character_id) : following.map(f => f.followed_character_id)).map(id => <button key={id} onClick={() => { setShowFollowers(null); goProfile(id); }} className="flex w-full items-center gap-3 py-2"><Avatar character={characterMap.get(id)} /><span className="font-semibold">{fullName(characterMap.get(id))}</span></button>)}</div></div>}
  </div>;
}
