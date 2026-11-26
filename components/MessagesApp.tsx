
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDiscordCompatibleImageUrl } from '@/lib/imageUrls';

type Character = {
  id: string;
  name: string;
  first_name: string | null;
  avatar_url: string | null;
  character_type?: string | null;
};

type Message = {
  id: string;
  sender_character_id: string;
  recipient_character_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type GroupConversation = { id: string; name: string; created_at: string };
type GroupMessage = { id: string; group_id: string; sender_character_id: string; content: string; created_at: string };

type Props = {
  characterId: string;
  initialContactId?: string | null;
};

const IMAGE_PREFIX = '__PRIVATE_IMAGE__:';

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Impossible de lire cette photo.'));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('Cette image est invalide.'));

      image.onload = () => {
        const maxSize = 1200;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');

        if (!context) {
          reject(new Error('Impossible de préparer la photo.'));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(IMAGE_PREFIX + canvas.toDataURL('image/jpeg', 0.75));
      };

      image.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

export default function MessagesApp({
  characterId,
  initialContactId,
}: Props) {
  const [contacts, setContacts] = useState<Character[]>([]);
  const [conversations, setConversations] = useState<Character[]>([]);
  const [choosingNewContact, setChoosingNewContact] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'private' | 'groups'>('private');
  const [groupConversations, setGroupConversations] = useState<GroupConversation[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupConversation | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [choosingNewGroup, setChoosingNewGroup] = useState(false);
  const [selectedGroupContactIds, setSelectedGroupContactIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadContacts() {
      setLoading(true);
      setError('');

      const { error: activeError } = await supabase.rpc(
        'set_active_character',
        { p_character_id: characterId }
      );

      if (activeError) {
        console.error(activeError);
      }

      const { data, error: contactsError } = await supabase
        .from('characters')
        .select('id, name, first_name, avatar_url, character_type')
        .neq('id', characterId)
        .order('first_name', { ascending: true });

      if (!mounted) return;

      if (contactsError) {
        console.error(contactsError);
        setError('Impossible de charger les contacts.');
      } else {
        const loaded = (data || []) as Character[];
        setContacts(loaded);

        const { data: messageRows, error: conversationError } = await supabase
          .from('messages')
          .select('sender_character_id, recipient_character_id')
          .or(
            `sender_character_id.eq.${characterId},recipient_character_id.eq.${characterId}`
          );

        if (!mounted) return;

        if (conversationError) {
          console.error(conversationError);
          setError('Impossible de charger les conversations.');
        } else {
          const conversationIds = new Set<string>();

          (messageRows || []).forEach((message: {
            sender_character_id: string;
            recipient_character_id: string;
          }) => {
            const otherId =
              message.sender_character_id === characterId
                ? message.recipient_character_id
                : message.sender_character_id;

            if (otherId) conversationIds.add(otherId);
          });

          setConversations(
            loaded.filter((contact) => conversationIds.has(contact.id))
          );
        }

        if (initialContactId) {
          const contact = loaded.find((item) => item.id === initialContactId);
          if (contact) setSelectedContact(contact);
        }

        const { data: groupRows, error: groupsError } = await supabase
          .from('group_conversation_members')
          .select('group_id, group_conversations(id, name, created_at)')
          .eq('character_id', characterId);
        if (!mounted) return;
        if (groupsError) {
          console.error(groupsError);
          setError('Impossible de charger les groupes.');
        } else {
          const groups = (groupRows || []).map((row: any) => row.group_conversations).filter((group: any) => group && group.id) as GroupConversation[];
          setGroupConversations(groups);
        }
      }

      setLoading(false);
    }

    loadContacts();

    return () => {
      mounted = false;
    };
  }, [characterId, initialContactId]);

  async function loadMessages(contact: Character) {
    setSelectedContact(contact);
    setChoosingNewContact(false);
    setMessages([]);
    setError('');

    const { data, error: messagesError } = await supabase
      .from('messages')
      .select(
        'id, sender_character_id, recipient_character_id, content, created_at, read_at'
      )
      .or(
        `and(sender_character_id.eq.${characterId},recipient_character_id.eq.${contact.id}),and(sender_character_id.eq.${contact.id},recipient_character_id.eq.${characterId})`
      )
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error(messagesError);
      setError('Impossible de charger cette conversation.');
      return;
    }

    setMessages((data || []) as Message[]);

    const unreadIds = (data || [])
      .filter(
        (message: Message) =>
          message.recipient_character_id === characterId && !message.read_at
      )
      .map((message: Message) => message.id);

    if (unreadIds.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    }
  }


  async function loadGroupMessages(group: GroupConversation) {
    setSelectedGroup(group);
    setSelectedContact(null);
    setChoosingNewGroup(false);
    setGroupMessages([]);
    setError('');
    const { data, error: messagesError } = await supabase
      .from('group_messages')
      .select('id, group_id, sender_character_id, content, created_at')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true });
    if (messagesError) {
      console.error(messagesError);
      setError('Impossible de charger cette conversation de groupe.');
      return;
    }
    setGroupMessages((data || []) as GroupMessage[]);
  }

  async function createGroup() {
    const participantIds = Array.from(new Set([characterId, ...selectedGroupContactIds]));
    if (participantIds.length < 3) {
      setError('Sélectionne au moins deux autres personnages pour créer un groupe.');
      return;
    }
    setSending(true);
    setError('');
    const groupId = crypto.randomUUID();
    const selectedNames = contacts.filter((contact) => selectedGroupContactIds.includes(contact.id)).map((contact) => contact.first_name || contact.name);
    const finalName = groupName.trim() || selectedNames.join(', ');
    const { error: createError } = await supabase.from('group_conversations').insert({
      id: groupId,
      name: finalName,
      created_by_character_id: characterId,
    });
    if (createError) {
      console.error(createError);
      setError("Le groupe n'a pas pu être créé : " + createError.message);
      setSending(false);
      return;
    }
    const { error: membersError } = await supabase.from('group_conversation_members').insert(
      participantIds.map((id) => ({ group_id: groupId, character_id: id }))
    );
    if (membersError) {
      console.error(membersError);
      setError("Le groupe a été créé, mais ses participants n'ont pas pu être ajoutés : " + membersError.message);
      setSending(false);
      return;
    }
    const newGroup: GroupConversation = { id: groupId, name: finalName, created_at: new Date().toISOString() };
    setGroupConversations((current) => [newGroup, ...current]);
    setSelectedGroupContactIds([]);
    setGroupName('');
    setChoosingNewGroup(false);
    setSearch('');
    setSending(false);
    await loadGroupMessages(newGroup);
  }

  async function sendGroupMessage(messageContent: string) {
    if (!selectedGroup || !messageContent.trim() || sending) return;
    setSending(true);
    setError('');
    const { data, error: sendError } = await supabase.from('group_messages').insert({
      group_id: selectedGroup.id,
      sender_character_id: characterId,
      content: messageContent,
    }).select('id, group_id, sender_character_id, content, created_at').single();
    if (sendError) {
      console.error(sendError);
      setError("Le message n'a pas pu être envoyé.");
    } else if (data) {
      setGroupMessages((current) => [...current, data as GroupMessage]);
      setContent('');

      // Utilise le système de notifications déjà présent sur l'icône Messages.
      // Chaque autre membre du groupe reçoit une notification non lue.
      const { data: members, error: membersError } = await supabase
        .from('group_conversation_members')
        .select('character_id')
        .eq('group_id', selectedGroup.id)
        .neq('character_id', characterId);

      if (membersError) {
        console.error(
          "Impossible de récupérer les membres à notifier :",
          membersError
        );
      } else if (members?.length) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(
            members.map((member) => ({
              recipient_character_id: member.character_id,
              source_app: 'messages',
              is_read: false,
            }))
          );

        if (notificationError) {
          console.error(
            "Impossible de créer les notifications du groupe :",
            notificationError
          );
        }
      }
    }
    setSending(false);
  }

  async function handleGroupPhotoSelection(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choisis un fichier image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('La photo ne doit pas dépasser 10 Mo.');
      return;
    }
    try {
      setError('');
      const imageContent = await compressImage(file);
      await sendGroupMessage(imageContent);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Impossible d'envoyer la photo.");
      setSending(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, groupMessages]);

  async function sendMessage(messageContent: string) {
    if (!selectedContact || !messageContent.trim() || sending) return;

    setSending(true);
    setError('');

    const { data, error: sendError } = await supabase
      .from('messages')
      .insert({
        sender_character_id: characterId,
        recipient_character_id: selectedContact.id,
        content: messageContent,
      })
      .select(
        'id, sender_character_id, recipient_character_id, content, created_at, read_at'
      )
      .single();

    if (sendError) {
      console.error(sendError);
      setError("Le message n'a pas pu être envoyé.");
    } else if (data) {
      setMessages((current) => [...current, data as Message]);
      setConversations((current) =>
        current.some((contact) => contact.id === selectedContact.id)
          ? current
          : [...current, selectedContact]
      );
      setContent('');
    }

    setSending(false);
  }

  async function handleSendText() {
    await sendMessage(content);
  }

  async function handlePhotoSelection(file?: File) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Choisis un fichier image.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('La photo ne doit pas dépasser 10 Mo.');
      return;
    }

    try {
      setError('');
      setSending(true);
      const imageContent = await compressImage(file);
      await sendMessage(imageContent);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Impossible d'envoyer la photo."
      );
      setSending(false);
    }
  }

  function getMessageImage(messageContent: string) {
    return messageContent.startsWith(IMAGE_PREFIX)
      ? messageContent.slice(IMAGE_PREFIX.length)
      : null;
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const visibleContacts = choosingNewContact ? contacts : conversations;
  const filteredContacts = visibleContacts.filter((contact) =>
    `${contact.first_name || ''} ${contact.name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-bone-300">
        Chargement des conversations...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/80">
      <div className="border-b border-gold-500/20 p-5">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-300">
          Sterling Campus
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-bone-100">
          Messages
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setActiveTab('private'); setSelectedGroup(null); setError(''); }} className={activeTab === 'private' ? 'rounded-xl bg-gold-500 px-3 py-2 text-sm font-semibold text-ink-950' : 'rounded-xl border border-gold-500/20 px-3 py-2 text-sm font-semibold text-bone-300'}>
            Messages privés
          </button>
          <button type="button" onClick={() => { setActiveTab('groups'); setSelectedContact(null); setChoosingNewContact(false); setError(''); }} className={activeTab === 'groups' ? 'rounded-xl bg-gold-500 px-3 py-2 text-sm font-semibold text-ink-950' : 'rounded-xl border border-gold-500/20 px-3 py-2 text-sm font-semibold text-bone-300'}>
            Messages de groupe
          </button>
        </div>
      </div>

      {activeTab === 'private' ? (!selectedContact ? (
        <div className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                choosingNewContact
                  ? 'Rechercher un personnage...'
                  : 'Rechercher une conversation...'
              }
              className="w-full flex-1 rounded-xl border border-gold-500/20 bg-ink-950 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400"
            />

            <button
              type="button"
              onClick={() => {
                setChoosingNewContact((current) => !current);
                setSearch('');
              }}
              className="shrink-0 rounded-xl bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-gold-400"
            >
              {choosingNewContact ? 'Annuler' : '＋ Nouveau message'}
            </button>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-300">{error}</p>
          )}

          {choosingNewContact && (
            <p className="mt-4 text-xs text-bone-400">
              Choisis un personnage pour commencer une nouvelle conversation.
            </p>
          )}

          <div className="mt-5 space-y-2">
            {filteredContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => loadMessages(contact)}
                className="flex w-full items-center gap-4 rounded-xl border border-white/5 bg-ink-950 p-3 text-left transition hover:border-gold-500/40"
              >
                {contact.avatar_url ? (
                  <img
                    src={getDiscordCompatibleImageUrl(contact.avatar_url)}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/10 text-xl text-gold-300">
                    ♙
                  </div>
                )}

                <div>
                  <p className="font-medium text-bone-100">
                    {contact.first_name} {contact.name}
                  </p>
                  <p className="mt-1 text-xs text-bone-400">
                    {contact.character_type || 'Personnage'}
                  </p>
                </div>

                <span className="ml-auto text-gold-300">›</span>
              </button>
            ))}

            {filteredContacts.length === 0 && (
              <p className="py-8 text-center text-sm text-bone-400">
                {choosingNewContact
                  ? 'Aucun personnage trouvé.'
                  : search
                    ? 'Aucune conversation trouvée.'
                    : 'Aucune conversation pour le moment. Utilise « Nouveau message » pour commencer à écrire.'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-gold-500/20 p-4">
            <button
              type="button"
              onClick={() => setSelectedContact(null)}
              className="text-xl text-gold-300"
              aria-label="Retour aux contacts"
            >
              ←
            </button>

            {selectedContact.avatar_url ? (
              <img
                src={getDiscordCompatibleImageUrl(selectedContact.avatar_url)}
                alt=""
                className="h-11 w-11 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-500/10 text-gold-300">
                ♙
              </div>
            )}

            <div>
              <p className="font-semibold text-bone-100">
                {selectedContact.first_name} {selectedContact.name}
              </p>
              <p className="text-xs text-bone-400">Conversation privée</p>
            </div>
          </div>

          <div className="flex min-h-[350px] max-h-[550px] flex-col gap-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="m-auto text-center text-sm text-bone-400">
                Aucun message. Commence la conversation !
              </p>
            )}

            {messages.map((message) => {
              const ownMessage =
                message.sender_character_id === characterId;
              const image = getMessageImage(message.content);

              return (
                <div
                  key={message.id}
                  className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      ownMessage
                        ? 'rounded-br-sm bg-gold-500/20 text-bone-100'
                        : 'rounded-bl-sm border border-white/10 bg-ink-950 text-bone-100'
                    }`}
                  >
                    {image ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(image)}
                        className="block"
                      >
                        <img
                          src={image}
                          alt="Photo envoyée"
                          className="max-h-64 max-w-full rounded-lg object-contain"
                        />
                      </button>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {message.content}
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-bone-400">
                        {formatDate(message.created_at)}
                      </span>

                      {ownMessage && message.read_at && (
                        <span className="text-[10px] text-gold-300">
                          Vu
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>

          {error && (
            <p className="px-4 pb-2 text-sm text-red-300">{error}</p>
          )}

          <div className="flex items-end gap-2 border-t border-gold-500/20 p-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="Envoyer une photo"
              title="Envoyer une photo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-500/30 text-xl text-gold-300 transition hover:bg-gold-500/10 disabled:opacity-40"
            >
              📷
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handlePhotoSelection(file);
                event.target.value = '';
              }}
            />

            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSendText();
                }
              }}
              placeholder="Écrire un message..."
              rows={1}
              className="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-gold-500/20 bg-ink-950 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400"
            />

            <button
              type="button"
              onClick={handleSendText}
              disabled={sending || !content.trim()}
              className="h-11 rounded-xl bg-gold-500 px-4 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 disabled:opacity-40"
            >
              {sending ? '...' : 'Envoyer'}
            </button>
          </div>
        </>
      )) : (
        <>
          {!selectedGroup ? (
            <div className="p-5">
              {!choosingNewGroup ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un groupe..." className="w-full flex-1 rounded-xl border border-gold-500/20 bg-ink-950 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400" />
                    <button type="button" onClick={() => { setChoosingNewGroup(true); setSearch(''); setError(''); }} className="shrink-0 rounded-xl bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950">＋ Créer un groupe</button>
                  </div>
                  {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
                  <div className="mt-5 space-y-2">
                    {groupConversations.filter((group) => group.name.toLowerCase().includes(search.toLowerCase())).map((group) => (
                      <button key={group.id} type="button" onClick={() => loadGroupMessages(group)} className="flex w-full items-center gap-4 rounded-xl border border-white/5 bg-ink-950 p-3 text-left">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/10 text-xl text-gold-300">♧</div>
                        <div><p className="font-medium text-bone-100">{group.name}</p><p className="mt-1 text-xs text-bone-400">Conversation de groupe</p></div>
                        <span className="ml-auto text-gold-300">›</span>
                      </button>
                    ))}
                    {groupConversations.length === 0 && <p className="py-8 text-center text-sm text-bone-400">Aucun groupe pour le moment. Crée ton premier groupe !</p>}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-bone-100">Nouveau groupe</h3>
                    <button type="button" onClick={() => { setChoosingNewGroup(false); setSelectedGroupContactIds([]); setGroupName(''); setError(''); }} className="text-sm text-gold-300">Annuler</button>
                  </div>
                  <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Nom du groupe (facultatif)" className="mt-4 w-full rounded-xl border border-gold-500/20 bg-ink-950 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher des personnages..." className="mt-3 w-full rounded-xl border border-gold-500/20 bg-ink-950 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400" />
                  <p className="mt-3 text-xs text-bone-400">Sélectionne au moins deux personnages. Ton personnage sera ajouté automatiquement.</p>
                  {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                    {contacts.filter((contact) => (String(contact.first_name || '') + ' ' + contact.name).toLowerCase().includes(search.toLowerCase())).map((contact) => {
                      const checked = selectedGroupContactIds.includes(contact.id);
                      return <button key={contact.id} type="button" onClick={() => setSelectedGroupContactIds((current) => checked ? current.filter((id) => id !== contact.id) : [...current, contact.id])} className={checked ? 'flex w-full items-center gap-3 rounded-xl border border-gold-400 bg-gold-500/10 p-3 text-left' : 'flex w-full items-center gap-3 rounded-xl border border-white/5 bg-ink-950 p-3 text-left'}>
                        {contact.avatar_url ? <img src={getDiscordCompatibleImageUrl(contact.avatar_url)} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-500/10 text-gold-300">♙</div>}
                        <span className="flex-1 text-sm text-bone-100">{contact.first_name} {contact.name}</span>
                        <span className="text-gold-300">{checked ? '✓' : '＋'}</span>
                      </button>;
                    })}
                  </div>
                  <button type="button" disabled={sending || selectedGroupContactIds.length < 2} onClick={createGroup} className="mt-5 w-full rounded-xl bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-950 disabled:opacity-40">{sending ? 'Création...' : 'Créer le groupe (' + (selectedGroupContactIds.length + 1) + ' membres)'}</button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-gold-500/20 p-4">
                <button type="button" onClick={() => setSelectedGroup(null)} className="text-xl text-gold-300" aria-label="Retour aux groupes">←</button>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-500/10 text-xl text-gold-300">♧</div>
                <div><p className="font-semibold text-bone-100">{selectedGroup.name}</p><p className="text-xs text-bone-400">Conversation de groupe</p></div>
              </div>
              <div className="flex min-h-[350px] max-h-[550px] flex-col gap-3 overflow-y-auto p-4">
                {groupMessages.length === 0 && <p className="m-auto text-center text-sm text-bone-400">Aucun message. Lance la conversation !</p>}
                {groupMessages.map((message) => {
                  const ownMessage = message.sender_character_id === characterId;
                  const sender = contacts.find((contact) => contact.id === message.sender_character_id);
                  const image = getMessageImage(message.content);
                  return <div key={message.id} className={ownMessage ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={ownMessage ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-gold-500/20 px-4 py-3 text-bone-100' : 'max-w-[80%] rounded-2xl rounded-bl-sm border border-white/10 bg-ink-950 px-4 py-3 text-bone-100'}>
                      {!ownMessage && <p className="mb-1 text-xs font-semibold text-gold-300">{sender ? (sender.first_name || '') + ' ' + sender.name : 'Participant'}</p>}
                      {image ? <button type="button" onClick={() => setPreviewImage(image)} className="block"><img src={image} alt="Photo envoyée" className="max-h-64 max-w-full rounded-lg object-contain" /></button> : <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
                      <div className="mt-2 flex items-center justify-end"><span className="text-[10px] text-bone-400">{formatDate(message.created_at)}</span></div>
                    </div>
                  </div>;
                })}
                <div ref={bottomRef} />
              </div>
              {error && <p className="px-4 pb-2 text-sm text-red-300">{error}</p>}
              <div className="flex items-end gap-2 border-t border-gold-500/20 p-3">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} aria-label="Envoyer une photo" title="Envoyer une photo" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-500/30 text-xl text-gold-300 disabled:opacity-40">📷</button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleGroupPhotoSelection(file); event.target.value = ''; }} />
                <textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendGroupMessage(content); } }} placeholder="Écrire un message..." rows={1} className="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-gold-500/20 bg-ink-950 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400" />
                <button type="button" onClick={() => sendGroupMessage(content)} disabled={sending || !content.trim()} className="h-11 rounded-xl bg-gold-500 px-4 text-sm font-semibold text-ink-950 disabled:opacity-40">{sending ? '...' : 'Envoyer'}</button>
              </div>
            </>
          )}
        </>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-5 top-5 text-3xl text-white"
            aria-label="Fermer la photo"
          >
            ×
          </button>

          <img
            src={previewImage}
            alt="Photo agrandie"
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
