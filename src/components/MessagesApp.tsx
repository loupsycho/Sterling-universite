
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Character = {
  id: string;
  name: string;
  first_name: string | null;
  avatar_url: string | null;
  character_type: string | null;
};

type Message = {
  id: string;
  sender_character_id: string;
  recipient_character_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type Props = {
  characterId: string;
  initialContactId?: string | null;
};

export default function MessagesApp({
  characterId,
  initialContactId = null,
}: Props) {
  const [contacts, setContacts] = useState<Character[]>([]);
  const [selectedContact, setSelectedContact] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function activateCharacter() {
      setLoading(true);
      setSessionReady(false);
      setError('');
      setSelectedContact(null);
      setMessages([]);

      const { error } = await supabase.rpc('set_active_character', {
        p_character_id: characterId,
      });

      if (!mounted) return;

      if (error) {
        console.error(error);
        setError("Impossible d'ouvrir le téléphone de ce personnage.");
        setLoading(false);
        return;
      }

      setSessionReady(true);
    }

    activateCharacter();

    return () => {
      mounted = false;
    };
  }, [characterId]);

  useEffect(() => {
    let mounted = true;

    async function loadContacts() {
      if (!sessionReady) return;

      const { data, error } = await supabase
        .from('characters')
        .select('id, name, first_name, avatar_url, character_type')
        .neq('id', characterId)
        .order('name', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error(error);
        setError('Impossible de charger les contacts.');
      } else {
        setContacts((data || []) as Character[]);
      }

      setLoading(false);
    }

    loadContacts();

    return () => {
      mounted = false;
    };
  }, [characterId, sessionReady]);

  // Ouvrir directement le contact choisi depuis Contacts
  useEffect(() => {
    if (!initialContactId || !sessionReady) return;

    const contact = contacts.find(
      (item) => item.id === initialContactId
    );

    if (contact) {
      setSelectedContact(contact);
    }
  }, [initialContactId, contacts, sessionReady]);

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      if (!sessionReady || !selectedContact) {
        setMessages([]);
        return;
      }

      setError('');

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_character_id.eq.${characterId},recipient_character_id.eq.${selectedContact.id}),and(sender_character_id.eq.${selectedContact.id},recipient_character_id.eq.${characterId})`
        )
        .order('created_at', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error(error);
        setError('Impossible de charger cette conversation.');
        return;
      }

      const conversation = (data || []) as Message[];
      setMessages(conversation);

      const unreadIds = conversation
        .filter(
          (message) =>
            message.recipient_character_id === characterId &&
            message.read_at === null
        )
        .map((message) => message.id);

      if (unreadIds.length > 0) {
        const { error: readError } = await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds);

        if (readError) console.error(readError);
      }
    }

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [characterId, selectedContact, sessionReady]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedContact || !content.trim() || sending || !sessionReady) {
      return;
    }

    setSending(true);
    setError('');

    const { error } = await supabase.from('messages').insert({
      sender_character_id: characterId,
      recipient_character_id: selectedContact.id,
      content: content.trim(),
    });

    if (error) {
      console.error(error);
      setError("Le message n'a pas pu être envoyé.");
    } else {
      setContent('');

      const { data, error: loadError } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_character_id.eq.${characterId},recipient_character_id.eq.${selectedContact.id}),and(sender_character_id.eq.${selectedContact.id},recipient_character_id.eq.${characterId})`
        )
        .order('created_at', { ascending: true });

      if (loadError) {
        console.error(loadError);
        setError('Message envoyé, mais actualisation impossible.');
      } else {
        setMessages((data || []) as Message[]);
      }
    }

    setSending(false);
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <section className="flex min-h-[600px] flex-1 flex-col px-4 py-6 text-bone-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <p className="text-xs uppercase tracking-[0.35em] text-gold-300">
          Sterling University
        </p>

        <h1 className="mt-3 text-3xl font-semibold">Messages</h1>
        <p className="mt-2 text-sm text-bone-300">
          Vos conversations privées.
        </p>

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-bone-300">
            Chargement des contacts...
          </p>
        ) : (
          <div className="mt-6 grid min-h-[480px] flex-1 gap-4 md:grid-cols-[260px_1fr]">
            <aside className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-4">
              <h2 className="mb-4 text-xs uppercase tracking-[0.2em] text-gold-300">
                Contacts
              </h2>

              {contacts.length === 0 ? (
                <p className="text-sm text-bone-400">
                  Aucun autre personnage disponible.
                </p>
              ) : (
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setSelectedContact(contact)}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                        selectedContact?.id === contact.id
                          ? 'border border-gold-400/40 bg-gold-500/10'
                          : 'border border-transparent hover:bg-white/5'
                      }`}
                    >
                      {contact.avatar_url ? (
                        <img
                          src={contact.avatar_url}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 text-lg text-gold-300">
                          ♙
                        </div>
                      )}

                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {contact.first_name} {contact.name}
                        </span>
                        <span className="block text-xs text-bone-400">
                          {contact.character_type || 'Personnage'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <div className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/70">
              {selectedContact ? (
                <>
                  <header className="flex items-center gap-3 border-b border-white/10 p-4">
                    {selectedContact.avatar_url ? (
                      <img
                        src={selectedContact.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 text-gold-300">
                        ♙
                      </div>
                    )}

                    <div>
                      <h2 className="font-medium">
                        {selectedContact.first_name} {selectedContact.name}
                      </h2>
                      <p className="text-xs text-bone-400">
                        Conversation privée
                      </p>
                    </div>
                  </header>

                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                    {messages.length === 0 ? (
                      <p className="m-auto text-center text-sm text-bone-400">
                        Aucun message pour le moment.
                        <br />
                        Commencez la conversation !
                      </p>
                    ) : (
                      messages.map((message) => {
                        const isMine =
                          message.sender_character_id === characterId;

                        return (
                          <div
                            key={message.id}
                            className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                              isMine
                                ? 'ml-auto bg-gold-500/15 text-bone-100'
                                : 'mr-auto bg-ink-950 text-bone-100'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {message.content}
                            </p>
                            <p className="mt-2 text-right text-[10px] text-bone-400">
                              {formatDate(message.created_at)}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form
                    onSubmit={sendMessage}
                    className="flex gap-2 border-t border-white/10 p-3"
                  >
                    <input
                      type="text"
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      placeholder="Écrire un message..."
                      maxLength={5000}
                      className="min-w-0 flex-1 rounded-xl border border-gold-500/20 bg-ink-950 px-4 py-3 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400/50"
                    />

                    <button
                      type="submit"
                      disabled={!content.trim() || sending}
                      className="rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sending ? '...' : 'Envoyer'}
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                  <span className="text-5xl text-gold-300/60">✉</span>
                  <h2 className="mt-5 text-lg font-semibold">
                    Vos conversations
                  </h2>
                  <p className="mt-2 max-w-xs text-sm text-bone-400">
                    Sélectionnez un personnage dans vos contacts pour lui envoyer un message.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
