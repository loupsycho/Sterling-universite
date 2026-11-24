import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clipboard, Loader2, RefreshCw, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Player = { id: string; discord_username: string | null };
type Character = { id: string; player_id: string; name: string; first_name: string | null };
type Course = { id: string; subject: string; scheduled_at: string };
type Attendance = { id: string; course_id: string; character_id: string; attendance_status: string | null; had_notified_absence: boolean };
type Appointment = { id: string; reason: string | null; created_at: string };
type Proposal = { appointment_id: string; proposed_at: string; status: string };
type Report = { id: string; appointment_id: string; character_id: string; outcome: 'done' | 'not_done' };
type EventItem = { kind: 'absence' | 'late' | 'appointment'; label: string; date: string; character: string; note?: string };
type PlayerSummary = { player: Player; characters: { character: Character; events: EventItem[] }[]; absences: number; lates: number };

function characterLabel(character: Character) {
  return (character.first_name ? character.first_name + ' ' : '') + character.name;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SterlingPortalAdmin() {
  const [summaries, setSummaries] = useState<PlayerSummary[]>([]);
  const [absenceThreshold, setAbsenceThreshold] = useState(4);
  const [lateThreshold, setLateThreshold] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [playersResult, charactersResult, coursesResult, attendanceResult, appointmentsResult, proposalsResult, reportsResult, settingsResult] = await Promise.all([
        supabase.from('players').select('id,discord_username').order('discord_username'),
        supabase.from('characters').select('id,player_id,name,first_name').order('name'),
        supabase.from('portal_courses').select('id,subject,scheduled_at'),
        supabase.from('portal_course_students').select('id,course_id,character_id,attendance_status,had_notified_absence'),
        supabase.from('portal_appointments').select('id,reason,created_at'),
        supabase.from('portal_appointment_proposals').select('appointment_id,proposed_at,status'),
        supabase.from('portal_appointment_reports').select('id,appointment_id,character_id,outcome'),
        supabase.from('portal_settings').select('absence_threshold,late_threshold').eq('id', true).single()
      ]);
      const results = [playersResult, charactersResult, coursesResult, attendanceResult, appointmentsResult, proposalsResult, reportsResult, settingsResult];
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;

      const players = (playersResult.data || []) as Player[];
      const characters = (charactersResult.data || []) as Character[];
      const courses = (coursesResult.data || []) as Course[];
      const attendance = (attendanceResult.data || []) as Attendance[];
      const appointments = (appointmentsResult.data || []) as Appointment[];
      const proposals = (proposalsResult.data || []) as Proposal[];
      const reports = (reportsResult.data || []) as Report[];
      setAbsenceThreshold(settingsResult.data.absence_threshold);
      setLateThreshold(settingsResult.data.late_threshold);

      const courseMap = new Map(courses.map(course => [course.id, course]));
      const appointmentMap = new Map(appointments.map(appointment => [appointment.id, appointment]));
      const latestProposal = new Map<string, Proposal>();
      proposals.filter(item => item.status === 'accepted').forEach(item => {
        const current = latestProposal.get(item.appointment_id);
        if (!current || item.proposed_at > current.proposed_at) latestProposal.set(item.appointment_id, item);
      });

      const byPlayer = players.map(player => {
        const playerCharacters = characters.filter(character => character.player_id === player.id).map(character => {
          const events: EventItem[] = [];
          attendance.filter(row => row.character_id === character.id && (row.attendance_status === 'absent' || row.attendance_status === 'late') && courseMap.get(row.course_id)?.attendance_submitted).forEach(row => {
            const course = courseMap.get(row.course_id);
            if (!course) return;
            events.push({
              kind: row.attendance_status === 'late' ? 'late' : 'absence',
              label: row.attendance_status === 'late' ? 'Retard · cours de ' + course.subject : 'Absence · cours de ' + course.subject,
              date: course.scheduled_at,
              character: characterLabel(character),
              note: row.had_notified_absence ? 'Avait prévenu' : undefined
            });
          });
          reports.filter(report => report.character_id === character.id && report.outcome === 'not_done').forEach(report => {
            const appointment = appointmentMap.get(report.appointment_id);
            const proposal = latestProposal.get(report.appointment_id);
            events.push({
              kind: 'appointment',
              label: 'Rendez-vous RP non effectué' + (appointment?.reason ? ' · ' + appointment.reason : ''),
              date: proposal?.proposed_at || appointment?.created_at || new Date().toISOString(),
              character: characterLabel(character)
            });
          });
          return { character, events: events.sort((a, b) => b.date.localeCompare(a.date)) };
        });
        const allEvents = playerCharacters.flatMap(item => item.events);
        return {
          player,
          characters: playerCharacters,
          absences: allEvents.filter(item => item.kind !== 'late').length,
          lates: allEvents.filter(item => item.kind === 'late').length
        };
      }).filter(item => item.characters.length > 0).sort((a, b) =>
        (a.player.discord_username || '').localeCompare(b.player.discord_username || '', 'fr', { sensitivity: 'base' })
      );
      setSummaries(byPlayer);
    } catch (loadError) {
      console.error(loadError);
      setError('Impossible de charger le suivi administratif de Sterling Portal.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel('sterling-portal-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_course_students' }, () => { void loadData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_courses' }, () => { void loadData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_appointment_reports' }, () => { void loadData(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function saveThresholds() {
    setSaving(true); setError(''); setNotice('');
    const { error: updateError } = await supabase.from('portal_settings')
      .update({ absence_threshold: absenceThreshold, late_threshold: lateThreshold, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (updateError) setError(updateError.message);
    else setNotice('Seuils d’alerte enregistrés.');
    setSaving(false);
  }

  async function copyPlayer(username: string | null) {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(username);
      setNotice('Nom Discord copié : ' + username);
    } catch {
      setError('Impossible de copier le nom Discord sur cet appareil.');
    }
  }

  const alertCount = useMemo(() => summaries.filter(item => item.absences >= absenceThreshold || item.lates >= lateThreshold).length, [summaries, absenceThreshold, lateThreshold]);

  if (loading) return <div className="flex min-h-48 items-center justify-center text-gold-300"><Loader2 className="mr-3 h-5 w-5 animate-spin" /> Chargement du suivi…</div>;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-300">Sterling University</p>
        <h2 className="mt-2 text-2xl font-semibold text-bone-100">Suivi des absences et retards</h2>
        <p className="mt-2 text-sm text-bone-400">Classement par joueur, puis par personnage. Les absences aux cours et les rendez-vous RP non effectués sont cumulés ; les retards restent séparés.</p>
      </header>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}

      <section className="rounded-2xl border border-gold-500/25 bg-ink-900/70 p-4 sm:p-5">
        <h3 className="font-semibold text-gold-200">Seuils d’alerte</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-bone-300">Absences (cours + rendez-vous RP non effectués)
            <input type="number" min="1" max="100" value={absenceThreshold} onChange={event => setAbsenceThreshold(Math.max(1, Number(event.target.value)))} className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100" />
          </label>
          <label className="text-sm text-bone-300">Retards (séparément)
            <input type="number" min="1" max="100" value={lateThreshold} onChange={event => setLateThreshold(Math.max(1, Number(event.target.value)))} className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950 p-3 text-bone-100" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-bone-400">{alertCount} joueur(s) au seuil ou au-dessus.</p>
          <button disabled={saving} onClick={() => void saveThresholds()} className="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"><Save className="h-4 w-4" /> Enregistrer les seuils</button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-bone-100">Joueurs ({summaries.length})</h3>
        <button onClick={() => void loadData()} className="inline-flex items-center gap-2 text-xs text-bone-400 hover:text-gold-200"><RefreshCw className="h-3.5 w-3.5" /> Actualiser</button>
      </div>

      {summaries.length === 0 ? <p className="rounded-xl border border-white/10 p-5 text-sm text-bone-400">Aucun événement enregistré pour le moment.</p> : (
        <div className="space-y-4">
          {summaries.map(summary => {
            const absenceAlert = summary.absences >= absenceThreshold;
            const lateAlert = summary.lates >= lateThreshold;
            return (
              <details key={summary.player.id} className="overflow-hidden rounded-2xl border border-gold-500/20 bg-ink-900/70">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold text-bone-100">{summary.player.discord_username || 'Joueur sans nom Discord'}</p>
                    <p className="mt-1 text-xs text-bone-400">{summary.characters.length} personnage(s)</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={'rounded-full border px-2.5 py-1 ' + (absenceAlert ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-white/10 text-bone-300')}>Absences : {summary.absences}/{absenceThreshold}</span>
                    <span className={'rounded-full border px-2.5 py-1 ' + (lateAlert ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-white/10 text-bone-300')}>Retards : {summary.lates}/{lateThreshold}</span>
                    {(absenceAlert || lateAlert) && <span className="inline-flex items-center gap-1 text-red-300"><AlertTriangle className="h-4 w-4" /> À surveiller</span>}
                  </div>
                </summary>
                <div className="border-t border-white/10 p-4">
                  <div className="mb-4 flex justify-end">
                    <button onClick={() => void copyPlayer(summary.player.discord_username)} className="inline-flex items-center gap-2 rounded-lg border border-gold-500/30 px-3 py-2 text-xs text-gold-200"><Clipboard className="h-3.5 w-3.5" /> Copier le nom Discord</button>
                  </div>
                  <div className="space-y-4">
                    {summary.characters.map(item => (
                      <section key={item.character.id} className="rounded-xl border border-white/10 bg-ink-950 p-3">
                        <h4 className="font-semibold text-gold-200">{characterLabel(item.character)}</h4>
                        {item.events.length === 0 ? <p className="mt-2 text-xs text-bone-500">Aucune absence ni aucun retard.</p> : (
                          <ul className="mt-3 space-y-2">
                            {item.events.map((event, index) => (
                              <li key={event.kind + event.date + index} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-white/5 p-3">
                                <div>
                                  <p className="text-sm text-bone-100">{event.label}</p>
                                  <p className="mt-1 text-xs text-bone-400">{dateLabel(event.date)}</p>
                                  {event.note && <p className="mt-1 text-xs text-amber-200">{event.note}</p>}
                                </div>
                                <span className={'rounded-full border px-2 py-1 text-[10px] ' + (event.kind === 'late' ? statusClass('late') : event.kind === 'appointment' ? statusClass('not_done') : statusClass('absent'))}>
                                  {event.kind === 'late' ? 'Retard' : event.kind === 'appointment' ? 'RP non effectué' : 'Absence'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function statusClass(value: string) {
  if (value === 'late') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (value === 'not_done') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-white/10 bg-white/5 text-bone-300';
}
