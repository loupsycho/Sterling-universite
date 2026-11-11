
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

type Character = {
  id: string;
  name: string;
  first_name: string | null;
  housing: string | null;
  extracurricular_activity: string | null;
  study_program: string | null;
  university_responsibility: string | null;
  course_position: string | null;
  staff_job: string | null;
};

type AgendaEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: 'house' | 'activity' | 'course';
  scope_name: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  created_by_character_id: string;
};

type Proposal = {
  id: string;
  character_id: string;
  activity: string;
  proposed_at: string;
  description: string | null;
  created_at: string;
  proposer?: string;
};

type ProposalResponse = {
  id: string;
  proposal_id: string;
  character_id: string;
  response: 'accepted' | 'refused';
};

type ScopeOption = {
  type: 'house' | 'activity' | 'course';
  name: string;
};

type Props = {
  characterId: string;
};

type AgendaItem = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  kind: 'event' | 'proposal';
  event?: AgendaEvent;
  proposal?: Proposal;
};

const HOUSES = ['Alpha King', 'Kappa Gold', 'Omega Crow'];

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseDate(value: Date | string | number | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(value: Date | string | number) {
  const date = parseDate(value);
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toLocalInput(value?: string | null) {
  const date = value ? parseDate(value) : new Date();
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDate(value: string | Date) {
  const date = parseDate(value);
  if (!date) return 'Date invalide';

  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value: string | Date) {
  const date = parseDate(value);
  if (!date) return '--:--';

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function characterName(character: Character) {
  return `${character.first_name || ''} ${character.name || ''}`.trim();
}

function getScopes(character: Character): ScopeOption[] {
  const scopes: ScopeOption[] = [];
  const responsibility = normalize(character.university_responsibility);
  const coursePosition = normalize(character.course_position);

  for (const house of HOUSES) {
    const houseName = normalize(house);
    const isResponsible =
      (responsibility.includes('chef') ||
        responsibility.includes('sous-chef')) &&
      (responsibility.includes(houseName) ||
        normalize(character.housing).includes(houseName));

    if (isResponsible) {
      scopes.push({ type: 'house', name: house });
    }
  }

  if (
    responsibility.includes('chef') &&
    character.extracurricular_activity
  ) {
    scopes.push({
      type: 'activity',
      name: character.extracurricular_activity,
    });
  }

  if (
    (coursePosition.includes('professeur') ||
      coursePosition.includes('enseignant')) &&
    character.study_program
  ) {
    scopes.push({
      type: 'course',
      name: character.study_program,
    });
  }

  return scopes;
}

export default function AgendaApp({ characterId }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [responses, setResponses] = useState<ProposalResponse[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const [today, setToday] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [month, setMonth] = useState(() => new Date());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventType, setEventType] = useState<AgendaEvent['event_type']>('house');
  const [eventScope, setEventScope] = useState('');
  const [eventStart, setEventStart] = useState(toLocalInput());
  const [eventEnd, setEventEnd] = useState('');
  const [eventLocation, setEventLocation] = useState('');

  const [proposalActivity, setProposalActivity] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalDate, setProposalDate] = useState(toLocalInput());

  const scopes = useMemo(
    () => (character ? getScopes(character) : []),
    [character]
  );

  // Les propositions du personnage et celles qu'il a acceptées
  // apparaissent dans son agenda personnel.
  const personalProposals = useMemo(() => {
    return proposals.filter(proposal => {
      if (proposal.character_id === characterId) return true;

      const response = responses.find(
        item =>
          item.proposal_id === proposal.id &&
          item.character_id === characterId
      );

      return response?.response === 'accepted';
    });
  }, [proposals, responses, characterId]);

  const agendaItems = useMemo<AgendaItem[]>(() => {
    const normalEvents: AgendaItem[] = events.map(event => ({
      id: `event-${event.id}`,
      title: event.title,
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      location: event.location,
      kind: 'event',
      event,
    }));

    const personalProposalItems: AgendaItem[] = personalProposals.map(proposal => ({
      id: `proposal-${proposal.id}`,
      title: proposal.activity,
      description: proposal.description,
      starts_at: proposal.proposed_at,
      ends_at: null,
      location: null,
      kind: 'proposal',
      proposal,
    }));

    return [...normalEvents, ...personalProposalItems].sort(
      (a, b) =>
        (parseDate(a.starts_at)?.getTime() || 0) -
        (parseDate(b.starts_at)?.getTime() || 0)
    );
  }, [events, personalProposals]);

  const selectedEvents = useMemo(
    () =>
      agendaItems.filter(
        item => localDateKey(item.starts_at) === selectedDate
      ),
    [agendaItems, selectedDate]
  );

  const daysInMonth = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const count = new Date(year, monthIndex + 1, 0).getDate();

    return [
      ...Array(offset).fill(null),
      ...Array.from({ length: count }, (_, index) => index + 1),
    ];
  }, [month]);

  async function loadAgenda() {
    setLoading(true);
    setError('');

    try {
      const { data: characterData, error: characterError } = await supabase
        .from('characters')
        .select(
          'id,name,first_name,housing,extracurricular_activity,study_program,university_responsibility,course_position,staff_job'
        )
        .eq('id', characterId)
        .single();

      if (characterError) throw characterError;
      setCharacter(characterData as Character);

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const userId = authData.user?.id;

      if (userId) {
        const { data: adminData, error: adminError } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (adminError) throw adminError;
        setIsAdmin(Boolean(adminData));
      } else {
        setIsAdmin(false);
      }

      const [
        { data: eventData, error: eventError },
        { data: proposalData, error: proposalError },
        { data: responseData, error: responseError },
      ] = await Promise.all([
        supabase.from('agenda_events').select('*').order('starts_at'),
        supabase.from('agenda_proposals').select('*').order('created_at', {
          ascending: false,
        }),
        supabase
          .from('agenda_proposal_responses')
          .select('*')
          .eq('character_id', characterId),
      ]);

      if (eventError) throw eventError;
      if (proposalError) throw proposalError;
      if (responseError) throw responseError;

      const rawProposals = (proposalData || []) as Proposal[];
      const proposerIds = [...new Set(rawProposals.map(item => item.character_id))];

      let proposerNames: Record<string, string> = {};

      if (proposerIds.length > 0) {
        const { data: proposerData, error: proposerError } = await supabase
          .from('characters')
          .select('id,name,first_name')
          .in('id', proposerIds);

        if (proposerError) throw proposerError;

        proposerNames = Object.fromEntries(
          (proposerData || []).map(item => [
            item.id,
            `${item.first_name || ''} ${item.name || ''}`.trim(),
          ])
        );
      }

      setEvents((eventData || []) as AgendaEvent[]);
      setProposals(
        rawProposals.map(item => ({
          ...item,
          proposer: proposerNames[item.character_id] || 'Personnage inconnu',
        }))
      );
      setResponses((responseData || []) as ProposalResponse[]);
    } catch (err) {
      console.error('Erreur de chargement de l’agenda :', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger les données de l’agenda.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAgenda();
  }, [characterId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = new Date();
      const previousDay = localDateKey(today);
      const currentDay = localDateKey(current);

      setToday(current);

      if (previousDay !== currentDay) {
        setSelectedDate(currentDay);
      }

      setMonth(previous => {
        if (
          previous.getFullYear() !== current.getFullYear() ||
          previous.getMonth() !== current.getMonth()
        ) {
          return new Date(current.getFullYear(), current.getMonth(), 1);
        }
        return previous;
      });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [today]);

  function resetEventForm() {
    setEditingEvent(null);
    setEventTitle('');
    setEventDescription('');
    setEventType('house');
    setEventScope('');
    setEventStart(toLocalInput());
    setEventEnd('');
    setEventLocation('');
    setShowEventForm(false);
  }

  function openNewEventForm() {
    resetEventForm();
    setEventType(scopes[0]?.type || 'house');
    setEventScope(scopes[0]?.name || '');
    setShowEventForm(true);
  }

  function openEditEventForm(event: AgendaEvent) {
    setEditingEvent(event.id);
    setEventTitle(event.title);
    setEventDescription(event.description || '');
    setEventType(event.event_type);
    setEventScope(event.scope_name);
    setEventStart(toLocalInput(event.starts_at));
    setEventEnd(event.ends_at ? toLocalInput(event.ends_at) : '');
    setEventLocation(event.location || '');
    setShowEventForm(true);
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!character) return;

    const start = new Date(eventStart);
    const end = eventEnd ? new Date(eventEnd) : null;

    if (!eventTitle.trim() || !eventScope || Number.isNaN(start.getTime())) {
      setError('Merci de remplir le titre, le domaine et la date.');
      return;
    }

    if (end && (Number.isNaN(end.getTime()) || end < start)) {
      setError('La date de fin doit être postérieure à la date de début.');
      return;
    }

    const canManage = scopes.some(
      scope => scope.type === eventType && scope.name === eventScope
    );

    if (!canManage) {
      setError('Tu ne peux pas gérer les événements de ce domaine.');
      return;
    }

    const payload = {
      title: eventTitle.trim(),
      description: eventDescription.trim() || null,
      event_type: eventType,
      scope_name: eventScope,
      starts_at: start.toISOString(),
      ends_at: end ? end.toISOString() : null,
      location: eventLocation.trim() || null,
    };

    try {
      if (editingEvent) {
        const { error: updateError } = await supabase
          .from('agenda_events')
          .update(payload)
          .eq('id', editingEvent);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('agenda_events')
          .insert({
            ...payload,
            created_by_character_id: characterId,
          });

        if (insertError) throw insertError;
      }

      resetEventForm();
      await loadAgenda();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer cet événement.'
      );
    }
  }

  async function deleteEvent(eventId: string) {
    if (!window.confirm('Supprimer cet événement ?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('agenda_events')
        .delete()
        .eq('id', eventId);

      if (deleteError) throw deleteError;
      await loadAgenda();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Impossible de supprimer cet événement.'
      );
    }
  }

  async function submitProposal(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!proposalActivity.trim()) {
      setError('Merci de préciser l’activité proposée.');
      return;
    }

    const date = new Date(proposalDate);
    if (Number.isNaN(date.getTime())) {
      setError('La date proposée est invalide.');
      return;
    }

    try {
      const { error: insertError } = await supabase
        .from('agenda_proposals')
        .insert({
          character_id: characterId,
          activity: proposalActivity.trim(),
          description: proposalDescription.trim() || null,
          proposed_at: date.toISOString(),
        });

      if (insertError) throw insertError;

      setProposalActivity('');
      setProposalDescription('');
      setProposalDate(toLocalInput());
      await loadAgenda();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Impossible d’envoyer la proposition.'
      );
    }
  }

  async function respondToProposal(
    proposalId: string,
    response: 'accepted' | 'refused'
  ) {
    setError('');

    try {
      const existing = responses.find(
        item => item.proposal_id === proposalId
      );

      if (existing) {
        const { error: updateError } = await supabase
          .from('agenda_proposal_responses')
          .update({
            response,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('agenda_proposal_responses')
          .insert({
            proposal_id: proposalId,
            character_id: characterId,
            response,
          });

        if (insertError) throw insertError;
      }

      await loadAgenda();
    } catch (err) {
      console.error('Erreur lors de la réponse à la proposition :', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer ta réponse.'
      );
    }
  }

  async function deleteProposal(proposalId: string) {
    if (!isAdmin) {
      setError('Seuls les administrateurs peuvent supprimer les propositions.');
      return;
    }

    if (!window.confirm('Supprimer définitivement cette proposition ?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('agenda_proposals')
        .delete()
        .eq('id', proposalId);

      if (deleteError) throw deleteError;

      await loadAgenda();
    } catch (err) {
      console.error('Erreur de suppression de proposition :', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de supprimer cette proposition.'
      );
    }
  }

  function getResponse(proposalId: string) {
    return responses.find(item => item.proposal_id === proposalId)?.response;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 p-8 text-center text-bone-100">
        Chargement de ton agenda...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 p-4 text-bone-100 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-gold-500/30 bg-ink-900 p-5">
          <h1 className="text-2xl font-semibold text-gold-400">Mon agenda</h1>
          <p className="mt-2 text-sm text-bone-300">
            LE CALENDRIER EST SYNCHRONISÉ AVEC LES JOURS RÉELS.
            Merci d’en tenir compte lorsque vous créez des événements.
          </p>
          <p className="mt-3 text-sm text-bone-400">
            Aujourd’hui : {formatDate(today)}
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-gold-500/20 bg-ink-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              className="rounded-lg border border-gold-500/30 px-3 py-2"
            >
              ←
            </button>

            <h2 className="text-lg font-semibold capitalize text-gold-300">
              {month.toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric',
              })}
            </h2>

            <button
              type="button"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
              className="rounded-lg border border-gold-500/30 px-3 py-2"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs text-bone-400">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
              <div key={day} className="py-2">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {daysInMonth.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} />;
              }

              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const key = localDateKey(date);
              const hasEvent = agendaItems.some(
                item => localDateKey(item.starts_at) === key
              );
              const isToday = key === localDateKey(today);
              const isSelected = key === selectedDate;

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={`relative min-h-12 rounded-xl border p-2 text-sm transition ${
                    isSelected
                      ? 'border-gold-400 bg-gold-500/20 text-gold-200'
                      : 'border-white/5 bg-ink-950 hover:border-gold-500/40'
                  } ${isToday ? 'ring-1 ring-gold-500/50' : ''}`}
                >
                  {day}
                  {hasEvent && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold-400" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              const current = new Date();
              setMonth(current);
              setToday(current);
              setSelectedDate(localDateKey(current));
            }}
            className="mt-4 text-sm text-gold-400 underline"
          >
            Revenir à aujourd’hui
          </button>
        </section>

        <section className="rounded-2xl border border-gold-500/20 bg-ink-900 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gold-300">
              {formatDate(new Date(`${selectedDate}T12:00:00`))}
            </h2>

            {scopes.length > 0 && (
              <button
                type="button"
                onClick={openNewEventForm}
                className="rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950"
              >
                + Créer un événement
              </button>
            )}
          </div>

          {selectedEvents.length === 0 ? (
            <p className="text-sm text-bone-400">
              Aucun événement prévu pour cette journée.
            </p>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map(item => {
                const event = item.event;
                const canEdit = event
                  ? scopes.some(
                      scope =>
                        scope.type === event.event_type &&
                        scope.name === event.scope_name
                    )
                  : false;

                return (
                  <article
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-ink-950 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gold-200">
                            {item.title}
                          </h3>
                          <span className="rounded-full border border-gold-500/30 px-2 py-1 text-xs text-gold-300">
                            {item.kind === 'proposal' ? 'Proposition acceptée' : 'Événement'}
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-bone-400">
                          {formatTime(item.starts_at)}
                          {item.ends_at ? ` – ${formatTime(item.ends_at)}` : ''}
                          {event ? ` · ${event.scope_name}` : ''}
                        </p>

                        {item.location && (
                          <p className="mt-1 text-sm text-bone-300">
                            📍 {item.location}
                          </p>
                        )}
                      </div>

                      {event && canEdit && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEditEventForm(event)}
                            className="text-xs text-gold-400 underline"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteEvent(event.id)}
                            className="text-xs text-red-400 underline"
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>

                    {item.description && (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-bone-300">
                        {item.description}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {showEventForm && (
          <section className="rounded-2xl border border-gold-500/30 bg-ink-900 p-4">
            <h2 className="mb-4 text-lg font-semibold text-gold-300">
              {editingEvent ? 'Modifier un événement' : 'Nouvel événement'}
            </h2>

            <form onSubmit={saveEvent} className="space-y-3">
              <input
                value={eventTitle}
                onChange={e => setEventTitle(e.target.value)}
                placeholder="Titre de l’événement"
                required
                className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
              />

              <select
                value={eventType}
                onChange={e => {
                  const type = e.target.value as AgendaEvent['event_type'];
                  setEventType(type);
                  setEventScope(scopes.find(item => item.type === type)?.name || '');
                }}
                className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
              >
                <option value="house">Maison / résidence</option>
                <option value="activity">Activité extrascolaire</option>
                <option value="course">Cours</option>
              </select>

              <select
                value={eventScope}
                onChange={e => setEventScope(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
              >
                <option value="">Choisir le domaine</option>
                {scopes
                  .filter(item => item.type === eventType)
                  .map(item => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
              </select>

              <label className="block text-sm text-bone-300">
                Début
                <input
                  type="datetime-local"
                  value={eventStart}
                  onChange={e => setEventStart(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
                />
              </label>

              <label className="block text-sm text-bone-300">
                Fin (facultatif)
                <input
                  type="datetime-local"
                  value={eventEnd}
                  onChange={e => setEventEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
                />
              </label>

              <input
                value={eventLocation}
                onChange={e => setEventLocation(e.target.value)}
                placeholder="Lieu (facultatif)"
                className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
              />

              <textarea
                value={eventDescription}
                onChange={e => setEventDescription(e.target.value)}
                placeholder="Description (facultatif)"
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-xl bg-gold-500 px-4 py-2 font-semibold text-ink-950"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={resetEventForm}
                  className="rounded-xl border border-white/10 px-4 py-2"
                >
                  Annuler
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-2xl border border-gold-500/20 bg-ink-900 p-4">
          <h2 className="mb-4 text-lg font-semibold text-gold-300">
            Proposer une activité
          </h2>

          <form onSubmit={submitProposal} className="space-y-3">
            <input
              value={proposalActivity}
              onChange={e => setProposalActivity(e.target.value)}
              placeholder="Activité proposée"
              required
              className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
            />

            <label className="block text-sm text-bone-300">
              Date et heure souhaitées
              <input
                type="datetime-local"
                value={proposalDate}
                onChange={e => setProposalDate(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
              />
            </label>

            <textarea
              value={proposalDescription}
              onChange={e => setProposalDescription(e.target.value)}
              placeholder="Détails de la proposition (facultatif)"
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100"
            />

            <button
              type="submit"
              className="rounded-xl bg-gold-500 px-4 py-2 font-semibold text-ink-950"
            >
              Envoyer la proposition
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-gold-500/20 bg-ink-900 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gold-300">
              Propositions des personnages
            </h2>
            {isAdmin && (
              <span className="rounded-full border border-gold-500/40 px-2 py-1 text-xs text-gold-300">
                Administration
              </span>
            )}
          </div>

          {proposals.length === 0 ? (
            <p className="text-sm text-bone-400">
              Aucune proposition pour le moment.
            </p>
          ) : (
            <div className="space-y-3">
              {proposals.map(proposal => {
                const response = getResponse(proposal.id);
                const isOwnProposal = proposal.character_id === characterId;

                return (
                  <article
                    key={proposal.id}
                    className="rounded-xl border border-white/10 bg-ink-950 p-4"
                  >
                    <h3 className="font-semibold text-gold-200">
                      {proposal.activity}
                    </h3>

                    <p className="mt-1 text-xs text-bone-400">
                      Proposé par {proposal.proposer || 'Personnage inconnu'}
                    </p>

                    <p className="mt-1 text-sm text-bone-300">
                      Date souhaitée : {formatDate(proposal.proposed_at)} à{' '}
                      {formatTime(proposal.proposed_at)}
                    </p>

                    {proposal.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-bone-300">
                        {proposal.description}
                      </p>
                    )}

                    {isOwnProposal ? (
                      <p className="mt-3 text-sm text-gold-400">
                        ✓ Cette proposition figure automatiquement dans ton agenda.
                      </p>
                    ) : response ? (
                      <p className="mt-3 text-sm text-gold-400">
                        {response === 'accepted'
                          ? '✓ Tu as accepté cette proposition. Elle figure dans ton agenda.'
                          : '✕ Tu as refusé cette proposition.'}
                      </p>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void respondToProposal(proposal.id, 'accepted')
                          }
                          className="rounded-lg bg-gold-500 px-3 py-2 text-sm font-semibold text-ink-950"
                        >
                          Accepter
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void respondToProposal(proposal.id, 'refused')
                          }
                          className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300"
                        >
                          Refuser
                        </button>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <button
                          type="button"
                          onClick={() => void deleteProposal(proposal.id)}
                          className="text-sm text-red-400 underline"
                        >
                          Supprimer cette proposition
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
