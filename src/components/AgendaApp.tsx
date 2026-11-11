
import { useEffect, useMemo, useState } from 'react';
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
};

type ProposalResponse = {
  id: string;
  proposal_id: string;
  character_id: string;
  response: 'accepted' | 'refused';
};

type Props = {
  characterId: string;
};

const HOUSES = ['Alpha King', 'Kappa Gold', 'Omega Crow'];

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function sameDay(first: string, second: Date) {
  return dateKey(new Date(first)) === dateKey(second);
}

function isHouseManager(character: Character, house: string) {
  const responsibility = normalize(character.university_responsibility);
  const housing = normalize(character.housing);
  const target = normalize(house);

  const hasRole =
    responsibility.includes('chef') ||
    responsibility.includes('sous-chef');

  const belongsToHouse =
    housing.includes(target) || responsibility.includes(target);

  return hasRole && belongsToHouse;
}

function isActivityManager(character: Character, activity: string) {
  const responsibility = normalize(character.university_responsibility);
  const assignedActivity = normalize(character.extracurricular_activity);

  return (
    responsibility.includes('chef') &&
    assignedActivity === normalize(activity)
  );
}

function isCourseManager(character: Character, course: string) {
  const position = normalize(character.course_position);
  const program = normalize(character.study_program);

  return (
    (position.includes('professeur') || position.includes('enseignant')) &&
    (position.includes(normalize(course)) ||
      program === normalize(course))
  );
}

function canManageScope(
  character: Character,
  type: AgendaEvent['event_type'],
  scope: string
) {
  if (type === 'house') return isHouseManager(character, scope);
  if (type === 'activity') return isActivityManager(character, scope);
  return isCourseManager(character, scope);
}

export default function AgendaApp({ characterId }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [responses, setResponses] = useState<ProposalResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [today, setToday] = useState(() => new Date());
  const [displayedMonth, setDisplayedMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [showEventForm, setShowEventForm] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);

  const [eventType, setEventType] =
    useState<AgendaEvent['event_type']>('house');
  const [eventScope, setEventScope] = useState(HOUSES[0]);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventStart, setEventStart] = useState(
    () => localDateTimeValue(new Date())
  );
  const [eventEnd, setEventEnd] = useState('');

  const [proposalActivity, setProposalActivity] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalDate, setProposalDate] = useState(
    () => localDateTimeValue(new Date())
  );

  const [saving, setSaving] = useState(false);

  // Actualise la date du jour automatiquement.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = new Date();
      setToday(current);

      setSelectedDate((previous) => {
        if (dateKey(previous) !== dateKey(current)) {
          return current;
        }
        return previous;
      });

      setDisplayedMonth((previous) => {
        if (
          previous.getFullYear() !== current.getFullYear() ||
          previous.getMonth() !== current.getMonth()
        ) {
          return new Date(current.getFullYear(), current.getMonth(), 1);
        }
        return previous;
      });
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  async function loadAgenda() {
    setLoading(true);
    setError('');

    const [
      characterResult,
      eventsResult,
      proposalsResult,
      responsesResult,
    ] = await Promise.all([
      supabase
        .from('characters')
        .select(
          'id, name, first_name, housing, extracurricular_activity, study_program, university_responsibility, course_position'
        )
        .eq('id', characterId)
        .single(),

      supabase
        .from('agenda_events')
        .select('*')
        .order('starts_at', { ascending: true }),

      supabase
        .from('agenda_proposals')
        .select('*')
        .order('proposed_at', { ascending: true }),

      supabase
        .from('agenda_proposal_responses')
        .select('*')
        .eq('character_id', characterId),
    ]);

    if (characterResult.error) {
      console.error(characterResult.error);
      setError('Impossible de charger les informations du personnage.');
      setLoading(false);
      return;
    }

    if (eventsResult.error || proposalsResult.error || responsesResult.error) {
      console.error(
        eventsResult.error ||
          proposalsResult.error ||
          responsesResult.error
      );
      setError("Impossible de charger les données de l'agenda.");
      setLoading(false);
      return;
    }

    setCharacter(characterResult.data as Character);
    setEvents((eventsResult.data || []) as AgendaEvent[]);
    setProposals((proposalsResult.data || []) as Proposal[]);
    setResponses((responsesResult.data || []) as ProposalResponse[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAgenda();
  }, [characterId]);

  const activityOptions = character?.extracurricular_activity
    ? [character.extracurricular_activity]
    : [];

  const courseOptions = character?.study_program
    ? [character.study_program]
    : [];

  const availableScopes = useMemo(() => {
    if (!character) return [];

    if (eventType === 'house') {
      return HOUSES.filter((house) => isHouseManager(character, house));
    }

    if (eventType === 'activity') {
      return activityOptions.filter((activity) =>
        isActivityManager(character, activity)
      );
    }

    return courseOptions.filter((course) =>
      isCourseManager(character, course)
    );
  }, [character, eventType]);

  useEffect(() => {
    if (availableScopes.length > 0) {
      setEventScope(availableScopes[0]);
    } else {
      setEventScope('');
    }
  }, [eventType, characterId, availableScopes.join('|')]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth(),
      1
    );

    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - mondayOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [displayedMonth]);

  const selectedEvents = events.filter((event) =>
    sameDay(event.starts_at, selectedDate)
  );

  const acceptedProposals = proposals.filter((proposal) => {
    const response = responses.find(
      (item) => item.proposal_id === proposal.id
    );

    return (
      response?.response === 'accepted' &&
      sameDay(proposal.proposed_at, selectedDate)
    );
  });

  function hasEventOnDay(day: Date) {
    return events.some((event) => sameDay(event.starts_at, day));
  }

  function hasAcceptedProposalOnDay(day: Date) {
    return proposals.some((proposal) => {
      const response = responses.find(
        (item) => item.proposal_id === proposal.id
      );

      return (
        response?.response === 'accepted' &&
        sameDay(proposal.proposed_at, day)
      );
    });
  }

  async function createEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!character || !eventTitle.trim() || !eventScope || !eventStart) {
      return;
    }

    if (!canManageScope(character, eventType, eventScope)) {
      setError("Tu n'as pas les droits pour gérer cette catégorie.");
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    const { error: insertError } = await supabase
      .from('agenda_events')
      .insert({
        title: eventTitle.trim(),
        description: eventDescription.trim() || null,
        event_type: eventType,
        scope_name: eventScope,
        starts_at: new Date(eventStart).toISOString(),
        ends_at: eventEnd ? new Date(eventEnd).toISOString() : null,
        location: eventLocation.trim() || null,
        created_by_character_id: characterId,
      });

    if (insertError) {
      console.error(insertError);
      setError("Impossible d'enregistrer cet événement.");
    } else {
      setMessage('Événement ajouté au calendrier.');
      setEventTitle('');
      setEventDescription('');
      setEventLocation('');
      setEventEnd('');
      setShowEventForm(false);
      await loadAgenda();
    }

    setSaving(false);
  }

  async function deleteEvent(event: AgendaEvent) {
    if (!character) return;

    const authorized =
      event.created_by_character_id === characterId ||
      canManageScope(character, event.event_type, event.scope_name);

    if (!authorized) {
      setError("Tu n'as pas les droits pour supprimer cet événement.");
      return;
    }

    if (!window.confirm('Supprimer cet événement ?')) return;

    const { error: deleteError } = await supabase
      .from('agenda_events')
      .delete()
      .eq('id', event.id);

    if (deleteError) {
      console.error(deleteError);
      setError("Impossible de supprimer cet événement.");
    } else {
      setMessage('Événement supprimé.');
      await loadAgenda();
    }
  }

  async function createProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!proposalActivity.trim() || !proposalDate) return;

    setSaving(true);
    setError('');
    setMessage('');

    const { error: insertError } = await supabase
      .from('agenda_proposals')
      .insert({
        character_id: characterId,
        activity: proposalActivity.trim(),
        proposed_at: new Date(proposalDate).toISOString(),
        description: proposalDescription.trim() || null,
      });

    if (insertError) {
      console.error(insertError);
      setError('Impossible de transmettre ta proposition.');
    } else {
      setMessage('Ta proposition a été envoyée.');
      setProposalActivity('');
      setProposalDescription('');
      setShowProposalForm(false);
      await loadAgenda();
    }

    setSaving(false);
  }

  async function answerProposal(
    proposalId: string,
    response: 'accepted' | 'refused'
  ) {
    setError('');
    setMessage('');

    const { error: responseError } = await supabase
      .from('agenda_proposal_responses')
      .upsert(
        {
          proposal_id: proposalId,
          character_id: characterId,
          response,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'proposal_id,character_id' }
      );

    if (responseError) {
      console.error(responseError);
      setError('Impossible d’enregistrer ta réponse.');
    } else {
      setMessage(
        response === 'accepted'
          ? 'Activité ajoutée à ton agenda.'
          : 'Tu as refusé cette proposition.'
      );
      await loadAgenda();
    }
  }

  function changeMonth(direction: number) {
    setDisplayedMonth(
      new Date(
        displayedMonth.getFullYear(),
        displayedMonth.getMonth() + direction,
        1
      )
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-8 text-center text-bone-300">
        Chargement de ton agenda...
      </div>
    );
  }

  if (error && !character) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-ink-900 p-6 text-red-300">
        {error}
      </div>
    );
  }

  if (!character) return null;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-gold-500/30 bg-ink-900/80 p-5 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-300">
          Sterling Campus
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-bone-100">
          Agenda
        </h1>
        <p className="mt-4 text-sm font-bold uppercase tracking-wide text-gold-300">
          LE CALENDRIER EST SYNCHRONISÉ AVEC LES JOURS RÉELS.
        </p>
        <p className="mt-1 text-sm text-bone-300">
          Merci d’en tenir compte lorsque vous créez des événements.
        </p>
        <p className="mt-4 text-lg font-medium capitalize text-bone-100">
          {formatDate(today)}
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-xl border border-green-500/30 bg-green-950/20 p-3 text-sm text-green-300">
          {message}
        </p>
      )}

      <section className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="rounded-lg border border-gold-500/30 px-3 py-2 text-gold-300 hover:bg-gold-500/10"
          >
            ←
          </button>

          <h2 className="text-lg font-semibold capitalize text-bone-100">
            {new Intl.DateTimeFormat('fr-FR', {
              month: 'long',
              year: 'numeric',
            }).format(displayedMonth)}
          </h2>

          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="rounded-lg border border-gold-500/30 px-3 py-2 text-gold-300 hover:bg-gold-500/10"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
            <div
              key={day}
              className="py-2 text-xs font-semibold uppercase text-gold-300"
            >
              {day}
            </div>
          ))}

          {calendarDays.map((day) => {
            const isCurrentMonth =
              day.getMonth() === displayedMonth.getMonth();
            const isToday = dateKey(day) === dateKey(today);
            const isSelected = dateKey(day) === dateKey(selectedDate);
            const hasEvents = hasEventOnDay(day);
            const hasProposals = hasAcceptedProposalOnDay(day);

            return (
              <button
                key={dateKey(day)}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`relative flex min-h-12 flex-col items-center justify-center rounded-lg border text-sm transition ${
                  isSelected
                    ? 'border-gold-400 bg-gold-500/20 text-gold-200'
                    : isToday
                      ? 'border-gold-500/50 text-gold-300'
                      : 'border-transparent text-bone-300 hover:border-gold-500/30 hover:bg-white/5'
                } ${!isCurrentMonth ? 'opacity-30' : ''}`}
              >
                <span className="font-medium">{day.getDate()}</span>
                {(hasEvents || hasProposals) && (
                  <span className="mt-1 flex gap-1">
                    {hasEvents && (
                      <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                    )}
                    {hasProposals && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            const current = new Date();
            setToday(current);
            setSelectedDate(current);
            setDisplayedMonth(
              new Date(current.getFullYear(), current.getMonth(), 1)
            );
          }}
          className="mt-4 w-full rounded-lg border border-gold-500/30 px-4 py-2 text-sm text-gold-300 hover:bg-gold-500/10"
        >
          Revenir à aujourd’hui
        </button>

        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-bone-400">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gold-400" />
            Événement
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            Proposition acceptée
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold capitalize text-bone-100">
            {formatDate(selectedDate)}
          </h2>
          <button
            type="button"
            onClick={() => {
              setEventStart(localDateTimeValue(selectedDate));
              setShowEventForm(!showEventForm);
            }}
            className="rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-gold-400"
          >
            + Créer un événement
          </button>
        </div>

        {showEventForm && (
          <form
            onSubmit={createEvent}
            className="mt-5 space-y-4 rounded-xl border border-gold-500/20 bg-ink-950/70 p-4"
          >
            <h3 className="font-semibold text-gold-300">
              Nouvel événement
            </h3>

            <label className="block text-sm text-bone-300">
              Catégorie
              <select
                value={eventType}
                onChange={(event) =>
                  setEventType(
                    event.target.value as AgendaEvent['event_type']
                  )
                }
                className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
              >
                <option value="house">Événement de maison</option>
                <option value="activity">Activité extrascolaire</option>
                <option value="course">Cours</option>
              </select>
            </label>

            {availableScopes.length > 0 ? (
              <label className="block text-sm text-bone-300">
                Maison, activité ou cours
                <select
                  value={eventScope}
                  onChange={(event) => setEventScope(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
                >
                  {availableScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="rounded-lg border border-gold-500/20 p-3 text-sm text-bone-400">
                Aucun rôle ne te permet actuellement de gérer cette
                catégorie.
              </p>
            )}

            <label className="block text-sm text-bone-300">
              Nom de l’événement
              <input
                required
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                placeholder="Ex. Réunion de rentrée"
                className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
              />
            </label>

            <label className="block text-sm text-bone-300">
              Description
              <textarea
                value={eventDescription}
                onChange={(event) =>
                  setEventDescription(event.target.value)
                }
                rows={3}
                placeholder="Détails de l’événement..."
                className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
              />
            </label>

            <label className="block text-sm text-bone-300">
              Lieu
              <input
                value={eventLocation}
                onChange={(event) => setEventLocation(event.target.value)}
                placeholder="Lieu de rendez-vous"
                className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-bone-300">
                Date et heure de début
                <input
                  required
                  type="datetime-local"
                  value={eventStart}
                  onChange={(event) => setEventStart(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
                />
              </label>

              <label className="block text-sm text-bone-300">
                Date et heure de fin (facultatif)
                <input
                  type="datetime-local"
                  min={eventStart}
                  value={eventEnd}
                  onChange={(event) => setEventEnd(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving || availableScopes.length === 0}
                className="rounded-lg bg-gold-500 px-5 py-2 font-semibold text-ink-950 disabled:opacity-40"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={() => setShowEventForm(false)}
                className="rounded-lg border border-white/20 px-5 py-2 text-bone-300"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 space-y-3">
          {selectedEvents.length === 0 &&
          acceptedProposals.length === 0 ? (
            <p className="rounded-xl border border-white/10 p-5 text-center text-sm text-bone-400">
              Aucun événement prévu pour cette date.
            </p>
          ) : (
            <>
              {selectedEvents.map((event) => {
                const canDelete =
                  event.created_by_character_id === characterId ||
                  canManageScope(
                    character,
                    event.event_type,
                    event.scope_name
                  );

                return (
                  <article
                    key={event.id}
                    className="rounded-xl border border-gold-500/20 bg-ink-950/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-gold-300">
                          {event.event_type === 'house'
                            ? 'Maison'
                            : event.event_type === 'activity'
                              ? 'Activité extrascolaire'
                              : 'Cours'}{' '}
                          · {event.scope_name}
                        </p>
                        <h3 className="mt-1 font-semibold text-bone-100">
                          {event.title}
                        </h3>
                      </div>
                      <span className="text-sm font-semibold text-gold-300">
                        {formatTime(event.starts_at)}
                      </span>
                    </div>

                    {event.description && (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-bone-300">
                        {event.description}
                      </p>
                    )}

                    {event.location && (
                      <p className="mt-2 text-xs text-bone-400">
                        📍 {event.location}
                      </p>
                    )}

                    {event.ends_at && (
                      <p className="mt-2 text-xs text-bone-400">
                        Fin : {formatTime(event.ends_at)}
                      </p>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteEvent(event)}
                        className="mt-3 text-xs text-red-300 hover:text-red-200"
                      >
                        Supprimer l’événement
                      </button>
                    )}
                  </article>
                );
              })}

              {acceptedProposals.map((proposal) => (
                <article
                  key={proposal.id}
                  className="rounded-xl border border-blue-400/30 bg-blue-950/10 p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-blue-300">
                    Proposition acceptée
                  </p>
                  <h3 className="mt-1 font-semibold text-bone-100">
                    {proposal.activity}
                  </h3>
                  <p className="mt-2 text-sm text-bone-300">
                    {formatTime(proposal.proposed_at)}
                  </p>
                  {proposal.description && (
                    <p className="mt-2 text-sm text-bone-300">
                      {proposal.description}
                    </p>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-bone-100">
              Propositions d’activités
            </h2>
            <p className="mt-1 text-sm text-bone-400">
              Propose une activité ou réponds aux propositions des autres.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowProposalForm(!showProposalForm)}
            className="rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-gold-400"
          >
            + Proposer
          </button>
        </div>

        {showProposalForm && (
          <form
            onSubmit={createProposal}
            className="mt-5 space-y-4 rounded-xl border border-gold-500/20 bg-ink-950/70 p-4"
          >
            <h3 className="font-semibold text-gold-300">
              Nouvelle proposition
            </h3>

            <label className="block text-sm text-bone-300">
              Activité proposée
              <input
                required
                value={proposalActivity}
                onChange={(event) =>
                  setProposalActivity(event.target.value)
                }
                placeholder="Quelle activité souhaites-tu proposer ?"
                className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
              />
            </label>

            <label className="block text-sm text-bone-300">
              Date et heure
              <input
                required
                type="datetime-local"
                value={proposalDate}
                onChange={(event) => setProposalDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
              />
            </label>

            <label className="block text-sm text-bone-300">
              Informations complémentaires (facultatif)
              <textarea
                rows={3}
                value={proposalDescription}
                onChange={(event) =>
                  setProposalDescription(event.target.value)
                }
                placeholder="Quelques précisions sur l’activité..."
                className="mt-1 w-full rounded-lg border border-gold-500/20 bg-ink-900 p-3 text-bone-100"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-gold-500 px-5 py-2 font-semibold text-ink-950 disabled:opacity-50"
              >
                {saving ? 'Envoi...' : 'Envoyer la proposition'}
              </button>
              <button
                type="button"
                onClick={() => setShowProposalForm(false)}
                className="rounded-lg border border-white/20 px-5 py-2 text-bone-300"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 space-y-3">
          {proposals.length === 0 ? (
            <p className="rounded-xl border border-white/10 p-5 text-center text-sm text-bone-400">
              Aucune proposition pour le moment.
            </p>
          ) : (
            proposals.map((proposal) => {
              const proposer = null;
              const myResponse = responses.find(
                (response) => response.proposal_id === proposal.id
              );

              return (
                <article
                  key={proposal.id}
                  className="rounded-xl border border-white/10 bg-ink-950/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gold-300">
                        Proposition d’activité
                      </p>
                      <h3 className="mt-1 font-semibold text-bone-100">
                        {proposal.activity}
                      </h3>
                    </div>
                    <span className="text-sm text-bone-300">
                      {formatDate(new Date(proposal.proposed_at))} ·{' '}
                      {formatTime(proposal.proposed_at)}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-bone-400">
                    Proposé par un personnage
                  </p>

                  {proposal.description && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-bone-300">
                      {proposal.description}
                    </p>
                  )}

                  {myResponse ? (
                    <p className="mt-4 text-sm text-gold-300">
                      {myResponse.response === 'accepted'
                        ? '✓ Tu as accepté cette activité. Elle figure dans ton agenda.'
                        : '✕ Tu as refusé cette activité.'}
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          answerProposal(proposal.id, 'accepted')
                        }
                        className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-gold-400"
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          answerProposal(proposal.id, 'refused')
                        }
                        className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
                      >
                        Refuser
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
