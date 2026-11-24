import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen, CalendarDays, Check, GraduationCap, History, Loader2,
  Plus, RefreshCw, Send, X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type CharacterRow = {
  id: string;
  player_id: string;
  name: string;
  first_name: string | null;
  character_type: string | null;
  study_program: string | null;
  staff_job: string | null;
  status: string;
  players?: { discord_username: string | null } | { discord_username: string | null }[] | null;
};

type Course = {
  id: string;
  teacher_character_id: string;
  subject: string;
  scheduled_at: string;
  details: string | null;
  is_historical: boolean;
  attendance_submitted: boolean;
};

type CourseStudent = {
  id: string;
  course_id: string;
  character_id: string;
  availability: 'pending' | 'present' | 'absent';
  attendance_status: 'present' | 'late' | 'absent' | null;
  had_notified_absence: boolean;
  characters?: CharacterRow | null;
};

type Proposal = {
  id: string;
  appointment_id: string;
  proposed_by_character_id: string;
  proposed_at: string;
  status: 'pending' | 'accepted' | 'refused';
  refusal_reason: string | null;
  responded_by_character_id: string | null;
  created_at: string;
};

type Appointment = {
  id: string;
  created_by_character_id: string;
  target_character_id: string;
  reason: string | null;
  status: 'pending' | 'accepted' | 'cancelled';
  cancelled_by_character_id: string | null;
  created_at: string;
  portal_appointment_proposals?: Proposal[];
};

type Report = {
  id: string;
  appointment_id: string;
  character_id: string;
  outcome: 'done' | 'not_done';
};

type Props = { characterId: string };

const COURSE_TYPES = ['course_upcoming', 'course_response', 'course_attendance'];
const REQUEST_TYPES = ['appointment_request', 'appointment_proposal', 'appointment_refused'];
const UPCOMING_TYPES = ['appointment_accepted'];
const OLD_TYPES = ['appointment_cancelled', 'appointment_report_reminder'];

function displayName(person?: CharacterRow | null) {
  if (!person) return 'Personnage inconnu';
  const player = Array.isArray(person.players) ? person.players[0] : person.players;
  return (person.first_name ? person.first_name + ' ' : '') + person.name +
    ' (' + (player?.discord_username || 'Joueur inconnu') + ')';
}

function localInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function statusLabel(value: string) {
  if (value === 'present') return 'Présent';
  if (value === 'late') return 'En retard';
  if (value === 'absent') return 'Absent';
  return 'En attente de réponse';
}

function statusClass(value: string) {
  if (value === 'present' || value === 'done') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (value === 'late') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  if (value === 'absent' || value === 'not_done' || value === 'refused') return 'border-red-500/30 bg-red-500/10 text-red-300';
  return 'border-white/10 bg-white/5 text-bone-300';
}

export default function SterlingPortal({ characterId }: Props) {
  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [directory, setDirectory] = useState<CharacterRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseStudents, setCourseStudents] = useState<CourseStudent[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [mainTab, setMainTab] = useState<'courses' | 'appointments'>('courses');
  const [courseSubtab, setCourseSubtab] = useState<'past' | 'upcoming'>('upcoming');
  const [appointmentSubtab, setAppointmentSubtab] = useState<'request' | 'upcoming' | 'old'>('request');

  const [courseDate, setCourseDate] = useState(localInputValue(new Date(Date.now() + 86400000)));
  const [courseDetails, setCourseDetails] = useState('');
  const [historicalMode, setHistoricalMode] = useState(false);
  const [appointmentTarget, setAppointmentTarget] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(localInputValue(new Date(Date.now() + 86400000)));
  const [appointmentReason, setAppointmentReason] = useState('');
  const [refusingProposal, setRefusingProposal] = useState<string | null>(null);
  const [refusalReasons, setRefusalReasons] = useState<Record<string, string>>({});
  const [alternativeDates, setAlternativeDates] = useState<Record<string, string>>({});

  const isStudent = character?.character_type === 'Étudiant(e)';
  const teacherSubject = useMemo(() => {
    if (!character?.staff_job || !character.staff_job.toLowerCase().startsWith('professeur')) return '';
    return character.staff_job.split('—').slice(1).join('—').trim();
  }, [character]);
  const isTeacher = Boolean(teacherSubject);
  const canSeeCourses = Boolean(isStudent || isTeacher);

  const peopleById = useMemo(() => {
    const map: Record<string, CharacterRow> = {};
    directory.forEach(person => { map[person.id] = person; });
    if (character) map[character.id] = character;
    return map;
  }, [directory, character]);

  const latestProposal = useCallback((appointment: Appointment) => {
    return [...(appointment.portal_appointment_proposals || [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
  }, []);

  const loadNotifications = useCallback(async () => {
    const { data, error: notificationError } = await supabase
      .from('notifications')
      .select('notification_type')
      .eq('recipient_character_id', characterId)
      .eq('source_app', 'sterling_portal')
      .eq('is_read', false);
    if (notificationError) {
      console.error(notificationError);
      return;
    }
    const counts: Record<string, number> = {};
    (data || []).forEach((item: { notification_type: string }) => {
      counts[item.notification_type] = (counts[item.notification_type] || 0) + 1;
    });
    setUnread(counts);
  }, [characterId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [characterResult, directoryResult, courseResult, appointmentResult] = await Promise.all([
        supabase.from('characters')
          .select('id,player_id,name,first_name,character_type,study_program,staff_job,status,players(discord_username)')
          .eq('id', characterId).single(),
        supabase.from('characters')
          .select('id,player_id,name,first_name,character_type,study_program,staff_job,status,players(discord_username)')
          .eq('status', 'approved').order('name'),
        supabase.from('portal_courses').select('*').order('scheduled_at', { ascending: true }),
        supabase.from('portal_appointments').select('*').order('created_at', { ascending: false })
      ]);
      if (characterResult.error) throw characterResult.error;
      if (directoryResult.error) throw directoryResult.error;
      if (courseResult.error) throw courseResult.error;
      if (appointmentResult.error) throw appointmentResult.error;

      const current = characterResult.data as CharacterRow;
      setCharacter(current);
      setDirectory((directoryResult.data || []) as CharacterRow[]);
      if (current.character_type !== 'Étudiant(e)' && !current.staff_job?.toLowerCase().startsWith('professeur')) {
        setMainTab('appointments');
      }

      const loadedCourses = (courseResult.data || []) as Course[];
      setCourses(loadedCourses);
      const courseIds = loadedCourses.map(item => item.id);
      if (courseIds.length) {
        const rosterResult = await supabase.from('portal_course_students')
          .select('id,course_id,character_id,availability,attendance_status,had_notified_absence,characters(id,player_id,name,first_name,character_type,study_program,staff_job,status,players(discord_username))')
          .in('course_id', courseIds);
        if (rosterResult.error) throw rosterResult.error;
        setCourseStudents((rosterResult.data || []) as unknown as CourseStudent[]);
      } else {
        setCourseStudents([]);
      }

      const loadedAppointments = (appointmentResult.data || []) as Appointment[];
      setAppointments(loadedAppointments);
      const appointmentIds = loadedAppointments.map(item => item.id);
      if (appointmentIds.length) {
        const [proposalResult, reportResult] = await Promise.all([
          supabase.from('portal_appointment_proposals').select('*').in('appointment_id', appointmentIds).order('created_at', { ascending: true }),
          supabase.from('portal_appointment_reports').select('*').in('appointment_id', appointmentIds)
        ]);
        if (proposalResult.error) throw proposalResult.error;
        if (reportResult.error) throw reportResult.error;
        const proposals = (proposalResult.data || []) as Proposal[];
        setAppointments(loadedAppointments.map(item => ({
          ...item,
          portal_appointment_proposals: proposals.filter(p => p.appointment_id === item.id)
        })));
        setReports((reportResult.data || []) as Report[]);
      } else {
        setAppointments(loadedAppointments);
        setReports([]);
      }
      await loadNotifications();
    } catch (loadError) {
      console.error(loadError);
      setError('Impossible de charger Sterling Portal. Réessaie dans un instant.');
    } finally {
      setLoading(false);
    }
  }, [characterId, loadNotifications]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    const channel = supabase
      .channel(`sterling-portal-notifications-${characterId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_character_id=eq.${characterId}`
      }, () => { void loadNotifications(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [characterId, loadNotifications]);

  const markRead = useCallback(async (types: string[]) => {
    if (!types.length) return;
    const { error: readError } = await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_character_id', characterId)
      .eq('source_app', 'sterling_portal')
      .eq('is_read', false)
      .in('notification_type', types);
    if (readError) console.error(readError);
    await loadNotifications();
  }, [characterId, loadNotifications]);

  useEffect(() => {
    if (!character) return;
    if (mainTab === 'courses') {
      void markRead(courseSubtab === 'upcoming'
        ? ['course_upcoming', 'course_response']
        : ['course_attendance']);
    } else {
      void markRead(
        appointmentSubtab === 'request' ? REQUEST_TYPES :
        appointmentSubtab === 'upcoming' ? UPCOMING_TYPES :
        OLD_TYPES
      );
    }
  }, [mainTab, courseSubtab, appointmentSubtab, character, markRead]);

  async function createCourse(event: FormEvent) {
    event.preventDefault();
    if (!character || !isTeacher) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const scheduledAt = new Date(courseDate);
      const { error: createError } = await supabase.rpc('portal_create_course', {
        p_teacher_character_id: characterId,
        p_scheduled_at: scheduledAt.toISOString(),
        p_details: courseDetails.trim() || null,
        p_is_historical: historicalMode
      });
      if (createError) throw createError;
      setCourseDetails('');
      setCourseDate(localInputValue(new Date(Date.now() + 86400000)));
      setHistoricalMode(false);
      setNotice(historicalMode ? 'Ancien cours ajouté. Complète sa fiche d’appel.' : 'Cours programmé et ajouté à l’Agenda.');
      await loadAll();
    } catch (createError) {
      console.error(createError);
      setError(createError instanceof Error ? createError.message : 'Impossible de programmer ce cours.');
    } finally {
      setSaving(false);
    }
  }

  async function setAvailability(row: CourseStudent, availability: 'present' | 'absent') {
    setSaving(true); setError('');
    const { error: updateError } = await supabase.from('portal_course_students')
      .update({ availability }).eq('id', row.id);
    if (updateError) {
      setError(updateError.message.includes('verrouillée') ? updateError.message : 'Impossible d’enregistrer ta réponse.');
    } else {
      setNotice('Ta réponse a été enregistrée.');
      await loadAll();
    }
    setSaving(false);
  }

  async function setAttendance(row: CourseStudent, attendance_status: 'present' | 'late' | 'absent') {
    setSaving(true); setError('');
    const { error: updateError } = await supabase.from('portal_course_students')
      .update({ attendance_status }).eq('id', row.id);
    if (updateError) setError(updateError.message || 'Impossible d’enregistrer cet appel.');
    else await loadAll();
    setSaving(false);
  }

  async function finalizeCourse(course: Course) {
    if (!window.confirm('Valider définitivement cette fiche d’appel ? Elle sera ensuite verrouillée et ne pourra plus être modifiée.')) return;
    setSaving(true); setError('');
    const { error: finalizeError } = await supabase.rpc('portal_finalize_course', { p_course_id: course.id });
    if (finalizeError) setError(finalizeError.message);
    else {
      setNotice('Fiche d’appel validée et définitivement verrouillée.');
      await loadAll();
    }
    setSaving(false);
  }

  async function createAppointment(event: FormEvent) {
    event.preventDefault();
    if (!character || !appointmentTarget) return;
    setSaving(true); setError(''); setNotice('');
    const { error: createError } = await supabase.rpc('portal_create_appointment', {
      p_created_by_character_id: characterId,
      p_target_character_id: appointmentTarget,
      p_reason: appointmentReason.trim() || null,
      p_proposed_at: new Date(appointmentDate).toISOString()
    });
    if (createError) setError(createError.message);
    else {
      setAppointmentTarget('');
      setAppointmentReason('');
      setNotice('Demande de rendez-vous envoyée.');
      await loadAll();
    }
    setSaving(false);
  }

  async function respondToProposal(proposal: Proposal, status: 'accepted' | 'refused') {
    const reason = (refusalReasons[proposal.id] || '').trim();
    if (status === 'refused' && !reason) {
      setError('Le motif du refus est obligatoire.');
      return;
    }
    setSaving(true); setError('');
    const { error: responseError } = await supabase.from('portal_appointment_proposals')
      .update({
        status,
        refusal_reason: status === 'refused' ? reason : null,
        responded_by_character_id: characterId,
        responded_at: new Date().toISOString()
      }).eq('id', proposal.id);
    if (responseError) setError(responseError.message);
    else {
      setRefusingProposal(null);
      setRefusalReasons(current => ({ ...current, [proposal.id]: '' }));
      setNotice(status === 'accepted' ? 'Rendez-vous accepté et ajouté à l’Agenda.' : 'Demande refusée. Tu peux proposer une autre date.');
      await loadAll();
    }
    setSaving(false);
  }

  async function proposeAlternative(appointment: Appointment) {
    const date = alternativeDates[appointment.id];
    if (!date) { setError('Choisis une nouvelle date et une nouvelle heure.'); return; }
    setSaving(true); setError('');
    const { error: proposalError } = await supabase.from('portal_appointment_proposals')
      .insert({
        appointment_id: appointment.id,
        proposed_by_character_id: characterId,
        proposed_at: new Date(date).toISOString()
      });
    if (proposalError) setError(proposalError.message);
    else {
      setNotice('Nouvelle proposition envoyée.');
      setAlternativeDates(current => ({ ...current, [appointment.id]: '' }));
      await loadAll();
    }
    setSaving(false);
  }

  async function cancelAppointment(appointment: Appointment) {
    if (!window.confirm('Annuler définitivement ce rendez-vous ? L’autre participant recevra une notification.')) return;
    setSaving(true); setError('');
    const { error: cancelError } = await supabase.from('portal_appointments')
      .update({ status: 'cancelled', cancelled_by_character_id: characterId })
      .eq('id', appointment.id);
    if (cancelError) setError(cancelError.message);
    else {
      setNotice('Rendez-vous annulé.');
      await loadAll();
    }
    setSaving(false);
  }

  async function saveReport(appointment: Appointment, outcome: 'done' | 'not_done') {
    setSaving(true); setError('');
    const existing = reports.find(item => item.appointment_id === appointment.id && item.character_id === characterId);
    const result = existing
      ? await supabase.from('portal_appointment_reports').update({ outcome }).eq('id', existing.id)
      : await supabase.from('portal_appointment_reports').insert({ appointment_id: appointment.id, character_id: characterId, outcome });
    if (result.error) setError(result.error.message);
    else {
      setNotice(outcome === 'done' ? 'Bilan enregistré : RP effectué.' : 'Bilan enregistré : RP non effectué. Il est transmis à l’administration.');
      await loadAll();
    }
    setSaving(false);
  }

  const unreadCount = (types: string[]) => types.reduce((sum, type) => sum + (unread[type] || 0), 0);
  const myCourses = courses.filter(course => course.teacher_character_id === characterId || courseStudents.some(row => row.course_id === course.id && row.character_id === characterId));
  const upcomingCourses = myCourses.filter(course => new Date(course.scheduled_at).getTime() > Date.now() || (!course.attendance_submitted && !course.is_historical));
  const pastCourses = myCourses.filter(course => new Date(course.scheduled_at).getTime() <= Date.now() && (course.attendance_submitted || course.is_historical));
  const hasUnsubmittedCourse = isTeacher && courses.some(item => item.teacher_character_id === characterId && !item.attendance_submitted);
  const myAppointments = appointments.filter(item => item.created_by_character_id === characterId || item.target_character_id === characterId);
  const appointmentDateFor = (item: Appointment) => latestProposal(item)?.proposed_at || item.created_at;
  const upcomingAppointments = myAppointments.filter(item => item.status === 'accepted' && new Date(appointmentDateFor(item)).getTime() >= Date.now());
  const oldAppointments = myAppointments.filter(item => item.status === 'cancelled' || (item.status === 'accepted' && new Date(appointmentDateFor(item)).getTime() < Date.now()));
  const pendingAppointments = myAppointments.filter(item => item.status === 'pending');

  const availableTargets = directory.filter(person => {
    if (person.id === characterId) return false;
    if (isStudent) return person.character_type === 'Membre du personnel' && Boolean(person.staff_job);
    return person.character_type === 'Étudiant(e)';
  });

  if (loading) {
    return <div className="flex min-h-72 items-center justify-center text-gold-300"><Loader2 className="mr-3 h-5 w-5 animate-spin" /> Chargement de Sterling Portal…</div>;
  }

  if (error && !character) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">{error}</div>;
  if (!character) return null;

  const renderCourseCard = (course: Course) => {
    const roster = courseStudents.filter(row => row.course_id === course.id);
    const isOwnCourse = course.teacher_character_id === characterId;
    const canCall = isOwnCourse && !course.attendance_submitted && new Date(course.scheduled_at).getTime() <= Date.now();
    const canDeclare = !isOwnCourse && roster.some(row => row.character_id === characterId) &&
      !course.attendance_submitted && new Date(course.scheduled_at).getTime() - Date.now() > 2 * 60 * 60 * 1000;
    const allMarked = roster.every(row => row.attendance_status !== null);
    const ownRow = roster.find(row => row.character_id === characterId);

    return (
      <article key={course.id} className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gold-200">{course.subject}</h3>
            <p className="mt-1 flex items-center gap-2 text-xs text-bone-400"><CalendarDays className="h-4 w-4" />{dateLabel(course.scheduled_at)}</p>
            {!isOwnCourse && <p className="mt-2 text-xs text-bone-400">Professeur : {displayName(peopleById[course.teacher_character_id])}</p>}
          </div>
          <span className={'rounded-full border px-3 py-1 text-xs ' + (course.attendance_submitted ? statusClass('present') : statusClass('pending'))}>
            {course.attendance_submitted ? 'Appel validé' : course.is_historical ? 'Ancien cours à compléter' : 'À traiter'}
          </span>
        </div>
        {course.details && <p className="mt-3 whitespace-pre-wrap text-sm text-bone-300">{course.details}</p>}

        {!isOwnCourse && ownRow && !course.attendance_submitted && (
          <div className="mt-4 rounded-xl border border-white/10 bg-ink-950 p-3">
            <p className="text-sm font-medium text-bone-100">Ta réponse : <span className="text-gold-300">{statusLabel(ownRow.availability)}</span></p>
            {canDeclare ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={saving} onClick={() => void setAvailability(ownRow, 'present')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">Présent</button>
                <button disabled={saving} onClick={() => void setAvailability(ownRow, 'absent')} className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">Absent</button>
              </div>
            ) : new Date(course.scheduled_at).getTime() - Date.now() <= 2 * 60 * 60 * 1000 ? (
              <p className="mt-2 text-xs text-bone-400">Les réponses sont verrouillées deux heures avant le cours.</p>
            ) : null}
          </div>
        )}

        {course.attendance_submitted && !isOwnCourse && ownRow && (
          <div className="mt-4">
            <span className={'inline-flex rounded-full border px-3 py-1 text-xs ' + statusClass(ownRow.attendance_status || 'pending')}>{statusLabel(ownRow.attendance_status || 'pending')}</span>
            {ownRow.had_notified_absence && <p className="mt-1 text-xs text-bone-400">(Avait prévenu)</p>}
          </div>
        )}

        {isOwnCourse && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <h4 className="font-semibold text-bone-100">Liste d’appel ({roster.length} élèves)</h4>
            {roster.length === 0 ? <p className="mt-2 text-sm text-bone-400">Aucun élève n’est actuellement associé à cette matière.</p> : (
              <div className="mt-3 space-y-3">
                {roster.map(row => (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-ink-950 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-bone-100">{displayName(row.characters)}</p>
                      {!course.attendance_submitted && (
                        <span className="text-xs text-bone-400">A répondu : {statusLabel(row.availability)}</span>
                      )}
                    </div>
                    {course.attendance_submitted ? (
                      <div className="mt-2">
                        <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs ' + statusClass(row.attendance_status || 'pending')}>{statusLabel(row.attendance_status || 'pending')}</span>
                        {row.had_notified_absence && <p className="mt-1 text-xs text-bone-400">(Avait prévenu)</p>}
                      </div>
                    ) : canCall ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(['present','late','absent'] as const).map(value => (
                          <button key={value} disabled={saving} onClick={() => void setAttendance(row, value)}
                            className={'rounded-lg border px-3 py-2 text-xs ' + (row.attendance_status === value ? statusClass(value) : 'border-white/10 text-bone-300')}>
                            {statusLabel(value)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-bone-400">La fiche d’appel devient accessible à l’heure prévue du cours. Le professeur la complète lorsqu’il décide que le cours est terminé.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canCall && (
              <button disabled={saving || !allMarked} onClick={() => void finalizeCourse(course)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40">
                <Check className="h-4 w-4" /> Terminer le cours et valider définitivement l’appel
              </button>
            )}
            {!course.attendance_submitted && !canCall && <p className="mt-3 text-xs text-bone-400">Le professeur peut compléter l’appel à partir de l’heure prévue du cours, puis terminer le cours lorsqu’il le souhaite. Aucune durée de cours n’est imposée.</p>}
          </div>
        )}
      </article>
    );
  };

  const renderAppointmentCard = (appointment: Appointment, mode: 'request' | 'upcoming' | 'old') => {
    const proposal = latestProposal(appointment);
    const otherId = appointment.created_by_character_id === characterId ? appointment.target_character_id : appointment.created_by_character_id;
    const other = peopleById[otherId];
    const ownProposal = proposal?.proposed_by_character_id === characterId;
    const scheduled = proposal?.proposed_at || appointment.created_at;
    const ownReport = reports.find(report => report.appointment_id === appointment.id && report.character_id === characterId);
    const otherReport = reports.find(report => report.appointment_id === appointment.id && report.character_id === otherId);
    const canRespond = mode === 'request' && proposal?.status === 'pending' && !ownProposal;
    const canProposeAgain = mode === 'request' && proposal?.status === 'refused' && proposal.responded_by_character_id === characterId;
    const canCancel = mode === 'upcoming' && appointment.status === 'accepted' && new Date(scheduled).getTime() - Date.now() > 2 * 60 * 60 * 1000;
    const canReport = appointment.status === 'accepted' && new Date(scheduled).getTime() < Date.now();

    return (
      <article key={appointment.id} className="rounded-2xl border border-gold-500/20 bg-ink-900/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-gold-200">Avec {displayName(other)}</h3>
            <p className="mt-1 text-xs text-bone-400">{dateLabel(scheduled)}</p>
            {appointment.reason && <p className="mt-2 whitespace-pre-wrap text-sm text-bone-300">Motif : {appointment.reason}</p>}
          </div>
          <span className={'rounded-full border px-3 py-1 text-xs ' + statusClass(appointment.status === 'cancelled' ? 'not_done' : proposal?.status || appointment.status)}>
            {appointment.status === 'cancelled' ? 'Annulé' : proposal?.status === 'refused' ? 'Proposition refusée' : appointment.status === 'accepted' ? 'Accepté' : 'En attente'}
          </span>
        </div>

        {canRespond && proposal && (
          <div className="mt-4 rounded-xl border border-white/10 bg-ink-950 p-3">
            <p className="text-sm text-bone-200">Une réponse est attendue de ta part.</p>
            {refusingProposal === proposal.id ? (
              <div className="mt-3 space-y-2">
                <textarea value={refusalReasons[proposal.id] || ''} onChange={event => setRefusalReasons(current => ({ ...current, [proposal.id]: event.target.value }))} rows={2} placeholder="Motif du refus (obligatoire)" className="w-full rounded-xl border border-white/10 bg-ink-900 p-3 text-sm text-bone-100" />
                <div className="flex gap-2">
                  <button disabled={saving} onClick={() => void respondToProposal(proposal, 'refused')} className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">Confirmer le refus</button>
                  <button onClick={() => setRefusingProposal(null)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-bone-300">Retour</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={saving} onClick={() => void respondToProposal(proposal, 'accepted')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200"><Check className="h-4 w-4" /> Accepter</button>
                <button disabled={saving} onClick={() => setRefusingProposal(proposal.id)} className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200"><X className="h-4 w-4" /> Refuser</button>
              </div>
            )}
          </div>
        )}

        {mode === 'request' && proposal?.status === 'pending' && ownProposal && (
          <p className="mt-3 text-sm text-bone-400">En attente de la réponse de l’autre participant.</p>
        )}

        {canProposeAgain && (
          <div className="mt-4 rounded-xl border border-gold-500/20 bg-ink-950 p-3">
            {proposal?.refusal_reason && <p className="mb-3 text-sm text-red-200">Motif du refus : {proposal.refusal_reason}</p>}
            <label className="block text-xs text-bone-300">Proposer une autre date et heure
              <input type="datetime-local" min={localInputValue(new Date(Date.now() + 60000))} value={alternativeDates[appointment.id] || ''} onChange={event => setAlternativeDates(current => ({ ...current, [appointment.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-ink-900 p-3 text-sm text-bone-100" />
            </label>
            <button disabled={saving || !alternativeDates[appointment.id]} onClick={() => void proposeAlternative(appointment)} className="mt-3 rounded-lg bg-gold-500 px-3 py-2 text-sm font-semibold text-ink-950">Envoyer une nouvelle proposition</button>
          </div>
        )}

        {canCancel && (
          <button disabled={saving} onClick={() => void cancelAppointment(appointment)} className="mt-4 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300">Annuler le rendez-vous</button>
        )}
        {mode === 'upcoming' && appointment.status === 'accepted' && !canCancel && (
          <p className="mt-3 text-xs text-bone-400">L’annulation est verrouillée deux heures avant le rendez-vous.</p>
        )}

        {canReport && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <h4 className="font-semibold text-bone-100">Bilan de ton RP</h4>
            {ownReport ? (
              <p className={'mt-2 inline-flex rounded-full border px-3 py-1 text-xs ' + statusClass(ownReport.outcome)}>
                {ownReport.outcome === 'done' ? 'RP effectué' : 'RP non effectué'}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={saving} onClick={() => void saveReport(appointment, 'done')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">RP effectué</button>
                <button disabled={saving} onClick={() => void saveReport(appointment, 'not_done')} className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">RP non effectué</button>
              </div>
            )}
            <p className="mt-3 text-xs text-bone-400">Bilan de l’autre participant : {otherReport ? (otherReport.outcome === 'done' ? 'RP effectué' : 'RP non effectué') : 'En attente de réponse'}</p>
          </div>
        )}
        {appointment.status === 'cancelled' && <p className="mt-3 text-xs text-bone-400">Ce rendez-vous a été annulé. Il est conservé dans l’historique.</p>}
      </article>
    );
  };

  const courseCount = unreadCount(COURSE_TYPES);
  const appointmentCount = unreadCount([...new Set(REQUEST_TYPES.concat(UPCOMING_TYPES, OLD_TYPES))]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 sm:px-6">
      <header className="mb-6 rounded-3xl border border-gold-500/25 bg-gradient-to-br from-ink-900 to-ink-950 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-gold-500/30 bg-gold-500/10 p-3 text-gold-300"><GraduationCap className="h-7 w-7" /></div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-400">Sterling University</p>
            <h1 className="mt-1 text-2xl font-semibold text-bone-100">Sterling Portal</h1>
            <p className="mt-1 text-xs text-bone-400">{displayName(character)} · Espace personnel</p>
          </div>
        </div>
      </header>

      <nav className="mb-4 grid grid-cols-2 gap-2">
        {canSeeCourses && (
          <button onClick={() => setMainTab('courses')} className={'relative rounded-xl border px-3 py-3 text-sm font-semibold ' + (mainTab === 'courses' ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-900 text-bone-300')}>
            <BookOpen className="mr-2 inline h-4 w-4" /> Mon cours
            {courseCount > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{courseCount}</span>}
          </button>
        )}
        <button onClick={() => setMainTab('appointments')} className={'relative rounded-xl border px-3 py-3 text-sm font-semibold ' + (mainTab === 'appointments' ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-900 text-bone-300')}>
          <CalendarDays className="mr-2 inline h-4 w-4" /> Rendez-vous
          {appointmentCount > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{appointmentCount}</span>}
        </button>
      </nav>

      {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      {notice && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      {mainTab === 'courses' && canSeeCourses && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2">
            <button onClick={() => setCourseSubtab('past')} className={'rounded-xl border px-3 py-3 text-sm ' + (courseSubtab === 'past' ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-900 text-bone-300')}>
              <History className="mr-2 inline h-4 w-4" /> Ancien
              {unreadCount(['course_attendance']) > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{unreadCount(['course_attendance'])}</span>}
            </button>
            <button onClick={() => setCourseSubtab('upcoming')} className={'rounded-xl border px-3 py-3 text-sm ' + (courseSubtab === 'upcoming' ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-900 text-bone-300')}>
              <CalendarDays className="mr-2 inline h-4 w-4" /> À venir
              {unreadCount(['course_upcoming','course_response']) > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{unreadCount(['course_upcoming','course_response'])}</span>}
            </button>
          </div>

          {isTeacher && courseSubtab === 'upcoming' && (
            <section className="mb-5 rounded-2xl border border-gold-500/25 bg-ink-900/70 p-4 sm:p-5">
              <h2 className="font-semibold text-gold-200">Programmer un cours · {teacherSubject}</h2>
              <p className="mt-1 text-xs text-bone-400">Un seul cours non clôturé peut être géré à la fois.</p>
              <form onSubmit={createCourse} className="mt-4 space-y-3">
                <label className="block text-sm text-bone-300">Date et heure
                  <input type="datetime-local" required value={courseDate} onChange={event => setCourseDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100" />
                </label>
                <textarea rows={3} value={courseDetails} onChange={event => setCourseDetails(event.target.value)} placeholder="Détails du cours (facultatif)" className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-sm text-bone-100" />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={saving || hasUnsubmittedCourse} className="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-ink-950 disabled:opacity-40"><Plus className="h-4 w-4" /> {historicalMode ? 'Ajouter l’ancien cours' : 'Programmer le cours'}</button>
                  <button type="button" onClick={() => { setHistoricalMode(true); setCourseDate(localInputValue(new Date(Date.now() - 86400000))); }} disabled={saving || hasUnsubmittedCourse} className="rounded-xl border border-gold-500/40 px-4 py-3 text-sm text-gold-200 disabled:opacity-40">Ajouter un ancien cours</button>
                </div>
                {historicalMode && (
                  <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-3">
                    <p className="text-sm font-medium text-gold-200">Ajout d’un cours déjà passé</p>
                    <p className="mt-1 text-xs text-bone-400">Choisis sa date passée. Sa fiche d’appel devra être validée avant d’en ajouter un autre.</p>
                    <button type="button" onClick={() => setHistoricalMode(false)} className="mt-2 text-xs text-bone-400 underline">Annuler le mode ancien cours</button>
                  </div>
                )}
              </form>
            </section>
          )}

          {(courseSubtab === 'upcoming' ? upcomingCourses : pastCourses).length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6 text-center text-sm text-bone-400">
              Aucun cours {courseSubtab === 'upcoming' ? 'à venir' : 'dans l’historique'} pour le moment.
            </div>
          ) : (
            <div className="space-y-4">
              {(courseSubtab === 'upcoming' ? upcomingCourses : pastCourses).map(renderCourseCard)}
            </div>
          )}
        </>
      )}

      {mainTab === 'appointments' && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2">
            <button onClick={() => setAppointmentSubtab('request')} className={'rounded-xl border px-2 py-3 text-xs sm:text-sm ' + (appointmentSubtab === 'request' ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-900 text-bone-300')}>
              Demander un rendez-vous
              {unreadCount(REQUEST_TYPES) > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{unreadCount(REQUEST_TYPES)}</span>}
            </button>
            <button onClick={() => setAppointmentSubtab('upcoming')} className={'rounded-xl border px-2 py-3 text-xs sm:text-sm ' + (appointmentSubtab === 'upcoming' ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-900 text-bone-300')}>
              Rendez-vous à venir
              {unreadCount(UPCOMING_TYPES) > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{unreadCount(UPCOMING_TYPES)}</span>}
            </button>
            <button onClick={() => setAppointmentSubtab('old')} className={'rounded-xl border px-2 py-3 text-xs sm:text-sm ' + (appointmentSubtab === 'old' ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-900 text-bone-300')}>
              Anciens rendez-vous
              {unreadCount(OLD_TYPES) > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{unreadCount(OLD_TYPES)}</span>}
            </button>
          </div>

          {appointmentSubtab === 'request' && (
            <>
              <section className="mb-5 rounded-2xl border border-gold-500/25 bg-ink-900/70 p-4 sm:p-5">
                <h2 className="font-semibold text-gold-200">Nouvelle demande de rendez-vous</h2>
                <p className="mt-1 text-xs text-bone-400">{isStudent ? 'Choisis un membre du personnel.' : 'Choisis un élève.'}</p>
                <form onSubmit={createAppointment} className="mt-4 space-y-3">
                  <label className="block text-sm text-bone-300">Personne concernée
                    <select required value={appointmentTarget} onChange={event => setAppointmentTarget(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100">
                      <option value="">Sélectionner un personnage</option>
                      {availableTargets.map(person => <option key={person.id} value={person.id}>{displayName(person)}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm text-bone-300">Date et heure souhaitées
                    <input type="datetime-local" min={localInputValue(new Date(Date.now() + 60000))} required value={appointmentDate} onChange={event => setAppointmentDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100" />
                  </label>
                  <textarea rows={2} value={appointmentReason} onChange={event => setAppointmentReason(event.target.value)} placeholder="Motif du rendez-vous (facultatif)" className="w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-sm text-bone-100" />
                  <button disabled={saving || !availableTargets.length} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-ink-950 disabled:opacity-40"><Send className="h-4 w-4" /> Envoyer la demande</button>
                </form>
              </section>
              <h2 className="mb-3 font-semibold text-bone-100">Demandes en cours</h2>
              {pendingAppointments.length ? <div className="space-y-4">{pendingAppointments.map(item => renderAppointmentCard(item, 'request'))}</div> : <p className="rounded-xl border border-white/10 p-4 text-sm text-bone-400">Aucune demande en attente.</p>}
            </>
          )}

          {appointmentSubtab === 'upcoming' && (
            upcomingAppointments.length ? <div className="space-y-4">{upcomingAppointments.map(item => renderAppointmentCard(item, 'upcoming'))}</div> : <p className="rounded-xl border border-white/10 p-4 text-sm text-bone-400">Aucun rendez-vous à venir.</p>
          )}

          {appointmentSubtab === 'old' && (
            oldAppointments.length ? <div className="space-y-4">{oldAppointments.map(item => renderAppointmentCard(item, 'old'))}</div> : <p className="rounded-xl border border-white/10 p-4 text-sm text-bone-400">Aucun ancien rendez-vous.</p>
          )}
        </>
      )}

      <div className="mt-8 flex justify-end">
        <button onClick={() => void loadAll()} className="inline-flex items-center gap-2 text-xs text-bone-400 hover:text-gold-200"><RefreshCw className="h-3.5 w-3.5" /> Actualiser</button>
      </div>
    </div>
  );
}
