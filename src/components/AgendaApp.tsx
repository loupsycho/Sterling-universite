
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

type Character = {
  id: string;
  name: string | null;
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

const HOUSE_NAMES = ['Alpha King', 'Kappa Gold', 'Omega Crow'];

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalInput(value: string | Date) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 16);
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function characterName(character?: Character) {
  if (!character) return 'Personnage inconnu';
  return `${character.first_name || ''} ${character.name || ''}`.trim() || 'Personnage';
}

function getScopes(character: Character): ScopeOption[] {
  const scopes: ScopeOption[] = [];
  const responsibility = normalize(character.university_responsibility);
  const coursePosition = normalize(character.course_position);

  // Responsables des maisons : Chef ou Sous-chef.
  if (
    responsibility.includes('chef') ||
    responsibility.includes('sous-chef')
  ) {
    HOUSE_NAMES.forEach((house) => {
      const houseName = normalize(house);
      if (
        responsibility.includes(houseName) ||
        normalize(character.housing).includes(houseName)
      ) {
        scopes.push({ type: 'house', name: house });
      }
    });
  }

  // Responsable d'une activité : Chef de l'activité concernée.
  if (
    responsibility.includes('chef') &&
    character.extracurricular_activity?.trim()
  ) {
    scopes.push({
      type: 'activity',
      name: character.extracurricular_activity.trim(),
    });
  }

  // Professeur : responsable du programme/cours qui lui est attribué.
  if (
    (coursePosition.includes('professeur') ||
      coursePosition.includes('enseignant')) &&
    character.study_program?.trim()
  ) {
    scopes.push({
      type: 'course',
      name: character.study_program.trim(),
    });
  }

  return scopes;
}

export default function AgendaApp({ characterId }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [responses, setResponses] = useState<ProposalResponse[]>([]);
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [today, setToday] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => localDateKey(new Date()));

  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventType, setEventType] = useState<'house' | 'activity' | 'course'>('house');
  const [eventScope, setEventScope] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStart, setEventStart] = useState(toLocalInput(new Date(Date.now() + 3600000)));
  const [eventEnd, setEventEnd] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  const [proposalActivity, setProposalActivity] = useState('');
  const [proposalDate, setProposalDate] = useState(
    toLocalInput(new Date(Date.now() + 86400000))
  );
  const [proposalDescription, setProposalDescription] = useState('');
  const [sendingProposal, setSendingProposal] = useState(false);

  const availableScopes = useMemo(
    () => (character ? getScopes(character) : []),
    [character]
  );

  const scopesForType = availableScopes.filter((scope) => scope.type === eventType);

  const selectedEvents = events.filter(
    (event) => localDateKey(event.starts_at) === selectedDay
  );

  const myResponses = responses.filter(
    (response) => response.character_id === characterId
  );

  const acceptedProposals = proposals.filter((proposal) =>
    myResponses.some(
      (response) =>
        response.proposal_id === proposal.id &&
        response.response === 'accepted'
    )
  );

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const days: Array<Date | null> = [];

    for (let i = 0; i < mondayOffset; i++) days.push(null);
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, monthIndex, day));
    }
    while (days.length % 7 !== 0) days.push(null);

    return days;
  }, [month]);

  async function loadAgenda() {
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
          'id,name,first_name,housing,extracurricular_activity,study_program,university_responsibility,course_position,staff_job'
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
      setError('Impossible de charger le personnage.');
      setLoading(false);
      return;
    }

    if (eventsResult.error || proposalsResult.error || responsesResult.error) {
      setError('Impossible de charger toutes les données de l’agenda.');
      setLoading(false);
      return;
    }

    const loadedCharacter = characterResult.data as Character;
    const loadedProposals = (proposalsResult.data || []) as Proposal[];

    setCharacter(loadedCharacter);
    setEvents((eventsResult.data || []) as AgendaEvent[]);
    setProposals(loadedProposals);
    setResponses((responsesResult.data || []) as ProposalResponse[]);

    const ids = [...new Set(loadedProposals.map((proposal) => proposal.character_id))];

    if (ids.length > 0) {
      const peopleResult = await supabase
        .from('characters')
        .select('id,name,first_name')
        .in('id', ids);

      if (!peopleResult.error) {
        const peopleMap: Record<string, Character> = {};
        (peopleResult.data || []).forEach((person) => {
          peopleMap[person.id] = person as Character;
        });
        setCharacters(peopleMap);
      }
    } else {
      setCharacters({});
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAgenda();
    // Le changement de personnage recharge son agenda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = new Date();
      setToday(current);
      setMonth((previous) => {
        if (
          previous.getFullYear() !== current.getFullYear() ||
          previous.getMonth() !== current.getMonth()
        ) {
          return current;
        }
        return previous;
      });
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const validScope = scopesForType.some((scope) => scope.name === eventScope);
    if (!validScope) setEventScope(scopesForType[0]?.name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, character]);

  function resetEventForm() {
    setEditingEventId(null);
    setEventType('house');
    setEventScope('');
    setEventTitle('');
    setEventDescription('');
    setEventStart(toLocalInput(new Date(Date.now() + 3600000)));
    setEventEnd('');
    setEventLocation('');
    setShowEventForm(false);
  }

  function startEditing(event: AgendaEvent) {
    setEditingEventId(event.id);
    setEventType(event.event_type);
    setEventScope(event.scope_name);
    setEventTitle(event.title);
    setEventDescription(event.description || '');
    setEventStart(toLocalInput(event.starts_at));
    setEventEnd(event.ends_at ? toLocalInput(event.ends_at) : '');
    setEventLocation(event.location || '');
    setShowEventForm(true);
  }

  async function saveEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!character || !eventScope || !eventTitle.trim() || !eventStart) return;

    if (eventEnd && new Date(eventEnd) < new Date(eventStart)) {
      setError('La fin de l’événement doit être après son début.');
      return;
    }

    setSavingEvent(true);
    setError('');

    const payload = {
      title: eventTitle.trim(),
      description: eventDescription.trim() || null,
      event_type: eventType,
      scope_name: eventScope,
      starts_at: new Date(eventStart).toISOString(),
      ends_at: eventEnd ? new Date(eventEnd).toISOString() : null,
      location: eventLocation.trim() || null,
      created_by_character_id: characterId,
    };

    const result = editingEventId
      ? await supabase
          .from('agenda_events')
          .update(payload)
          .eq('id', editingEventId)
      : await supabase.from('agenda_events').insert(payload);

    setSavingEvent(false);

    if (result.error) {
      setError(
        'Enregistrement refusé. Vérifie que ton personnage possède bien le rôle responsable de cet événement.'
      );
      return;
    }

    resetEventForm();
    await loadAgenda();
  }

  async function deleteEvent(eventId: string) {
    if (!window.confirm('Supprimer définitivement cet événement ?')) return;

    const { error: deleteError } = await supabase
      .from('agenda_events')
      .delete()
      .eq('id', eventId);

    if (deleteError) {
      setError('Tu ne peux pas supprimer cet événement avec ce personnage.');
      return;
    }

    await loadAgenda();
  }

  async function submitProposal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!proposalActivity.trim() || !proposalDate) return;

    setSendingProposal(true);
    setError('');

    const { error: proposalError } = await supabase
      .from('agenda_proposals')
      .insert({
        character_id: characterId,
        activity: proposalActivity.trim(),
        proposed_at: new Date(proposalDate).toISOString(),
        description: proposalDescription.trim() || null,
      });

    setSendingProposal(false);

    if (proposalError) {
      setError('Impossible d’envoyer cette proposition.');
      return;
    }

    setProposalActivity('');
    setProposalDescription('');
    await loadAgenda();
  }

  async function answerProposal(
    proposalId: string,
    response: 'accepted' | 'refused'
  ) {
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
      setError('Impossible d’enregistrer ta réponse.');
      return;
    }

    await loadAgenda();
  }

  function changeMonth(amount: number) {
    setMonth((previous) => new Date(
      previous.getFullYear(),
      previous.getMonth() + amount,
      1
    ));
  }

  function openNewEventForm() {
    resetEventForm();
    setEventType(availableScopes[0]?.type || 'house');
    setEventScope(availableScopes[0]?.name || '');
    setShowEventForm(true);
  }

  if (loading) {
    return (
      <div className="agenda-loading">
        <span className="agenda-loading-icon">✦</span>
        Chargement de l’agenda…
      </div>
    );
  }

  return (
    <div className="agenda-app">
      <style>{`
        .agenda-app {
          color: #eee9df;
          background: #101010;
          min-height: 100%;
          padding: 20px;
          font-family: inherit;
        }
        .agenda-app * { box-sizing: border-box; }
        .agenda-header { text-align: center; margin-bottom: 22px; }
        .agenda-header h2 {
          color: #d7b56d; letter-spacing: 4px; text-transform: uppercase;
          font-size: 23px; margin: 0 0 8px;
        }
        .agenda-reminder {
          border: 1px solid #806637; background: #211c13; color: #f1d99e;
          padding: 12px; border-radius: 8px; font-size: 12px;
          line-height: 1.6; text-align: center; margin-bottom: 20px;
        }
        .agenda-panel {
          background: #191919; border: 1px solid #393126;
          border-radius: 10px; padding: 16px; margin-bottom: 18px;
        }
        .agenda-panel h3 {
          color: #d7b56d; text-transform: uppercase; letter-spacing: 2px;
          font-size: 13px; margin: 0 0 14px;
        }
        .agenda-month-bar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; margin-bottom: 14px;
        }
        .agenda-month-bar strong {
          color: #e7d3a5; text-transform: capitalize; font-size: 15px;
        }
        .agenda-app button {
          cursor: pointer; border: 1px solid #806637; color: #e8d4a4;
          background: #292216; border-radius: 6px; padding: 8px 11px;
          font-size: 12px;
        }
        .agenda-app button:hover { background: #45371f; }
        .agenda-calendar {
          display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 5px;
        }
        .agenda-weekday {
          color: #9e8a64; text-align: center; font-size: 10px;
          padding: 5px 0; text-transform: uppercase;
        }
        .agenda-day {
          min-height: 43px; padding: 7px 3px !important;
          border-color: #393126 !important; background: #111 !important;
          display: flex; flex-direction: column; align-items: center;
          justify-content: flex-start; gap: 4px;
        }
        .agenda-day.muted { opacity: .22; cursor: default; }
        .agenda-day.today { border-color: #d7b56d !important; color: #f3d99d; }
        .agenda-day.selected { background: #49391f !important; }
        .agenda-day-dot { width: 5px; height: 5px; border-radius: 50%; background: #d7b56d; }
        .agenda-list { display: flex; flex-direction: column; gap: 10px; }
        .agenda-event, .agenda-proposal {
          background: #111; border: 1px solid #393126; border-radius: 8px;
          padding: 12px;
        }
        .agenda-event-title { color: #e8d4a4; font-weight: 700; margin-bottom: 5px; }
        .agenda-meta { color: #a99a7c; font-size: 11px; line-height: 1.6; }
        .agenda-description { color: #d0cbc1; font-size: 12px; margin-top: 8px; white-space: pre-wrap; }
        .agenda-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
        .agenda-form { display: flex; flex-direction: column; gap: 10px; }
        .agenda-form label { color: #c6ad78; font-size: 11px; }
        .agenda-form input, .agenda-form textarea, .agenda-form select {
          width: 100%; background: #0e0e0e; color: #eee9df;
          border: 1px solid #51432b; border-radius: 6px; padding: 10px;
          margin-top: 5px; font: inherit; font-size: 12px;
        }
        .agenda-form textarea { min-height: 75px; resize: vertical; }
        .agenda-form button.primary { background: #806637; color: #fff8e8; }
        .agenda-empty { color: #928a7d; font-size: 12px; text-align: center; padding: 14px 4px; }
        .agenda-error {
          color: #ffb4a9; background: #321c1a; border: 1px solid #75413b;
          padding: 10px; border-radius: 7px; font-size: 12px; margin-bottom: 12px;
        }
        .agenda-loading { color: #d7b56d; padding: 30px; text-align: center; }
        .agenda-loading-icon { display: block; font-size: 25px; margin-bottom: 8px; }
        .agenda-section-heading {
          display: flex; justify-content: space-between; align-items: center;
          gap: 10px; margin-bottom: 12px;
        }
        .agenda-section-heading h3 { margin: 0; }
        .agenda-response { color: #cdbb91; font-size: 11px; margin-top: 8px; }
        @media (max-width: 420px) {
          .agenda-app { padding: 12px; }
          .agenda-panel { padding: 12px; }
          .agenda-day { min-height: 38px; }
        }
      `}</style>

      <header className="agenda-header">
        <h2>✦ Agenda ✦</h2>
        <div className="agenda-meta">
          {character ? characterName(character) : 'Mon agenda'}
        </div>
      </header>

      <div className="agenda-reminder">
        <strong>LE CALENDRIER EST SYNCHRONISÉ AVEC LES JOURS RÉELS.</strong>
        <br />
        Merci d’en tenir compte lorsque vous créez des événements.
      </div>

      {error && <div className="agenda-error">{error}</div>}

      <section className="agenda-panel">
        <div className="agenda-month-bar">
          <button type="button" onClick={() => changeMonth(-1)}>‹</button>
          <strong>
            {month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </strong>
          <button type="button" onClick={() => changeMonth(1)}>›</button>
        </div>

        <div className="agenda-calendar">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
            <div className="agenda-weekday" key={day}>{day}</div>
          ))}

          {calendarDays.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} />;

            const key = localDateKey(day);
            const hasEvent = events.some((event) => localDateKey(event.starts_at) === key);
            const hasAcceptedProposal = acceptedProposals.some(
              (proposal) => localDateKey(proposal.proposed_at) === key
            );
            const isToday = key === localDateKey(today);
            const isSelected = key === selectedDay;

            return (
              <button
                type="button"
                key={key}
                className={`agenda-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedDay(key)}
              >
                <span>{day.getDate()}</span>
                {(hasEvent || hasAcceptedProposal) && <span className="agenda-day-dot" />}
              </button>
            );
          })}
        </div>

        <div className="agenda-actions">
          <button
            type="button"
            onClick={() => {
              const key = localDateKey(new Date());
              setSelectedDay(key);
              setMonth(new Date());
            }}
          >
            Aujourd’hui
          </button>
        </div>
      </section>

      <section className="agenda-panel">
        <div className="agenda-section-heading">
          <h3>{formatDate(`${selectedDay}T12:00:00`)}</h3>
          {availableScopes.length > 0 && (
            <button type="button" onClick={openNewEventForm}>＋ Événement</button>
          )}
        </div>

        {selectedEvents.length === 0 &&
          acceptedProposals.filter(
            (proposal) => localDateKey(proposal.proposed_at) === selectedDay
          ).length === 0 && (
            <div className="agenda-empty">Aucun événement prévu ce jour-là.</div>
          )}

        <div className="agenda-list">
          {selectedEvents.map((event) => (
            <article className="agenda-event" key={event.id}>
              <div className="agenda-event-title">{event.title}</div>
              <div className="agenda-meta">
                {formatTime(event.starts_at)}
                {event.ends_at ? ` – ${formatTime(event.ends_at)}` : ''}
                {' · '}
                {event.scope_name}
                {' · '}
                {event.event_type === 'house'
                  ? 'Maison'
                  : event.event_type === 'activity'
                    ? 'Activité'
                    : 'Cours'}
                {event.location ? ` · ${event.location}` : ''}
              </div>
              {event.description && (
                <div className="agenda-description">{event.description}</div>
              )}
              {availableScopes.some(
                (scope) =>
                  scope.type === event.event_type && scope.name === event.scope_name
              ) && (
                <div className="agenda-actions">
                  <button type="button" onClick={() => startEditing(event)}>Modifier</button>
                  <button type="button" onClick={() => deleteEvent(event.id)}>Supprimer</button>
                </div>
              )}
            </article>
          ))}

          {acceptedProposals
            .filter((proposal) => localDateKey(proposal.proposed_at) === selectedDay)
            .map((proposal) => (
              <article className="agenda-event" key={`proposal-${proposal.id}`}>
                <div className="agenda-event-title">{proposal.activity}</div>
                <div className="agenda-meta">
                  {formatTime(proposal.proposed_at)} · Proposition acceptée
                </div>
                {proposal.description && (
                  <div className="agenda-description">{proposal.description}</div>
                )}
              </article>
            ))}
        </div>
      </section>

      {showEventForm && (
        <section className="agenda-panel">
          <h3>{editingEventId ? 'Modifier un événement' : 'Créer un événement'}</h3>
          <form className="agenda-form" onSubmit={saveEvent}>
            <label>
              Type d’événement
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as typeof eventType)}
              >
                <option value="house">Événement de maison</option>
                <option value="activity">Activité extrascolaire</option>
                <option value="course">Cours</option>
              </select>
            </label>

            <label>
              Maison, activité ou cours
              <select
                value={eventScope}
                onChange={(e) => setEventScope(e.target.value)}
                required
              >
                {scopesForType.map((scope) => (
                  <option value={scope.name} key={`${scope.type}-${scope.name}`}>
                    {scope.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Nom de l’événement
              <input
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                required
                maxLength={100}
                placeholder="Ex. Entraînement collectif"
              />
            </label>

            <label>
              Date et heure de début
              <input
                type="datetime-local"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                required
              />
            </label>

            <label>
              Date et heure de fin (facultatif)
              <input
                type="datetime-local"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
              />
            </label>

            <label>
              Lieu (facultatif)
              <input
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                placeholder="Ex. Gymnase"
              />
            </label>

            <label>
              Description (facultatif)
              <textarea
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                placeholder="Informations complémentaires…"
              />
            </label>

            <div className="agenda-actions">
              <button className="primary" type="submit" disabled={savingEvent || !eventScope}>
                {savingEvent ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button type="button" onClick={resetEventForm}>Annuler</button>
            </div>
          </form>
        </section>
      )}

      <section className="agenda-panel">
        <h3>Proposer une activité</h3>
        <form className="agenda-form" onSubmit={submitProposal}>
          <label>
            Activité proposée
            <input
              value={proposalActivity}
              onChange={(e) => setProposalActivity(e.target.value)}
              required
              maxLength={120}
              placeholder="Quelle activité souhaites-tu proposer ?"
            />
          </label>

          <label>
            Date et heure souhaitées
            <input
              type="datetime-local"
              value={proposalDate}
              onChange={(e) => setProposalDate(e.target.value)}
              required
            />
          </label>

          <label>
            Description (facultatif)
            <textarea
              value={proposalDescription}
              onChange={(e) => setProposalDescription(e.target.value)}
              placeholder="Décris ton idée…"
            />
          </label>

          <button className="primary" type="submit" disabled={sendingProposal}>
            {sendingProposal ? 'Envoi…' : 'Envoyer ma proposition'}
          </button>
        </form>
      </section>

      <section className="agenda-panel">
        <h3>Propositions des personnages</h3>
        {proposals.length === 0 ? (
          <div className="agenda-empty">Aucune proposition pour le moment.</div>
        ) : (
          <div className="agenda-list">
            {proposals.map((proposal) => {
              const myResponse = myResponses.find(
                (response) => response.proposal_id === proposal.id
              );

              return (
                <article className="agenda-proposal" key={proposal.id}>
                  <div className="agenda-event-title">{proposal.activity}</div>
                  <div className="agenda-meta">
                    Proposé par : {characterName(characters[proposal.character_id])}
                    <br />
                    Date souhaitée : {formatDate(proposal.proposed_at)} à {formatTime(proposal.proposed_at)}
                  </div>
                  {proposal.description && (
                    <div className="agenda-description">{proposal.description}</div>
                  )}

                  {myResponse ? (
                    <div className="agenda-response">
                      {myResponse.response === 'accepted'
                        ? '✓ Tu as accepté cette proposition.'
                        : '✕ Tu as refusé cette proposition.'}
                      <div className="agenda-actions">
                        <button
                          type="button"
                          onClick={() =>
                            answerProposal(
                              proposal.id,
                              myResponse.response === 'accepted' ? 'refused' : 'accepted'
                            )
                          }
                        >
                          Changer ma réponse
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="agenda-actions">
                      <button
                        type="button"
                        onClick={() => answerProposal(proposal.id, 'accepted')}
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => answerProposal(proposal.id, 'refused')}
                      >
                        Refuser
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
  );
}
