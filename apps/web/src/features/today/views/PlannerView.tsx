"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, NotebookPen, RefreshCw } from "lucide-react";
import {
  apiQueryKeys,
  buildPlannerWeek,
  dailyTaskQueryKeys,
  istanbulWeekStart,
  nextActionTypeLabels,
  plannerWeekLabel,
  taskTimeLabel,
  weekdayLabels,
  type DailyTaskOutcome,
  type TodayTask,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { finishDailyTask, loadTodayOverview } from "../resources/today";
import { TaskResolutionSheet } from "../components/TaskResolutionSheet";

const dayMs = 86_400_000;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Takvim yüklenemedi.";

/** Where a piece of work is worked, which is not always the contact it belongs to. */
function taskHref(task: TodayTask): string {
  if (task.inboxItemId) return `/note?inboxItemId=${encodeURIComponent(task.inboxItemId)}`;
  if (task.portfolioItemId) return `/listings?view=pool&portfolioItemId=${encodeURIComponent(task.portfolioItemId)}`;
  if (task.opportunityId) return `/opportunities?opportunityId=${encodeURIComponent(task.opportunityId)}`;
  return `/contacts/__contact__?contactId=${encodeURIComponent(task.contactId)}`;
}

/**
 * The week the advisor is standing in. The plan says what to do next; it never
 * said that Thursday already holds four appointments and Friday nothing, which
 * is the question behind asking to see a calendar.
 *
 * Nothing new is stored for this. Every piece of work already carries the
 * moment it is due, and moving one is the same reschedule the plan has always
 * offered -- reached here from the day it sits on.
 */
export function PlannerView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [now] = useState(() => Date.now());
  const [weekStart, setWeekStart] = useState(() => istanbulWeekStart(Date.now()));
  const [resolving, setResolving] = useState<TodayTask | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: apiQueryKeys.todayOverviewPeriod("30d"),
    queryFn: () => loadTodayOverview("30d"),
    enabled: Boolean(session),
  });

  const week = buildPlannerWeek(overview.data?.scheduledTasks ?? [], weekStart, now);
  const total = week.days.reduce((count, day) => count + day.tasks.length, 0);

  async function resolve(outcome: DailyTaskOutcome) {
    if (!session) return;
    setPending(true); setError(null);
    try {
      await finishDailyTask(session, outcome);
      await Promise.all(dailyTaskQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      setResolving(null);
    } catch (next) { setError(messageFrom(next)); }
    finally { setPending(false); }
  }

  function taskButton(task: TodayTask) {
    return (
      <li className={`planner-task priority-${task.priority}`} key={task.id}>
        <button onClick={() => { setError(null); setResolving(task); }} type="button">
          <time>{taskTimeLabel(task)}</time>
          <span>
            <strong>{task.title}</strong>
            <small>{task.actionType ? nextActionTypeLabels[task.actionType] : task.reason}</small>
          </span>
        </button>
        <Link aria-label={`${task.title} kaydına git`} className="planner-task-open" href={taskHref(task)}>→</Link>
      </li>
    );
  }

  return (
    <AppShell>
      <header className="page-header planner-header">
        <div>
          <p className="eyebrow">TAKVİM</p>
          <h1>{plannerWeekLabel(week)}</h1>
          <p className="context-sentence">
            {total ? `Bu hafta ${total} iş planlı.` : "Bu haftaya planlanmış iş yok."}
            {week.overdue.length ? ` Önceki haftalardan ${week.overdue.length} iş bekliyor.` : ""}
          </p>
        </div>
        <div className="header-actions planner-nav">
          <button aria-label="Önceki hafta" className="icon-action" onClick={() => setWeekStart((start) => start - 7 * dayMs)} type="button"><ChevronLeft size={18} /></button>
          <button className="secondary-action" onClick={() => setWeekStart(istanbulWeekStart(now))} type="button">Bu hafta</button>
          <button aria-label="Sonraki hafta" className="icon-action" onClick={() => setWeekStart((start) => start + 7 * dayMs)} type="button"><ChevronRight size={18} /></button>
        </div>
      </header>

      {overview.isPending ? <div className="content-state"><RefreshCw className="spin" size={22} aria-hidden /> Takvim hazırlanıyor…</div>
        : overview.error ? <p className="form-error notice">{messageFrom(overview.error)}</p> : <>
        {week.overdue.length ? (
          <SpCard className="planner-overdue">
            <div className="section-heading compact">
              <div><p className="eyebrow">ÖNCEKİ HAFTALARDAN</p><h2>{week.overdue.length} iş hâlâ açık</h2></div>
            </div>
            <ul className="planner-day-tasks">{week.overdue.map(taskButton)}</ul>
          </SpCard>
        ) : null}

        <section className="planner-week" aria-label="Haftanın planı">
          {week.days.map((day, index) => (
            <div className={`planner-day${day.isToday ? " is-today" : ""}${day.isPast ? " is-past" : ""}`} key={day.dayKey}>
              <div className="planner-day-heading">
                <span className="planner-weekday">{weekdayLabels[index]}</span>
                <strong>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", timeZone: "Europe/Istanbul" }).format(day.startsAt)}</strong>
                {day.tasks.length ? <span className="planner-day-count">{day.tasks.length}</span> : null}
              </div>
              {day.tasks.length
                ? <ul className="planner-day-tasks">{day.tasks.map(taskButton)}</ul>
                : <p className="planner-day-empty">—</p>}
            </div>
          ))}
        </section>

        <p className="planner-foot">
          <CalendarClock size={15} aria-hidden /> Bir işe tıklayıp tamamlayabilir veya başka bir güne alabilirsin.
          {" "}<Link className="inline-link" href="/note"><NotebookPen size={14} aria-hidden /> Günlük not</Link>
        </p>
        {error ? <p className="form-error notice" role="alert">{error}</p> : null}
      </>}

      {resolving ? (
        <TaskResolutionSheet
          task={resolving}
          pending={pending}
          error={error}
          onClose={() => setResolving(null)}
          onResolve={(outcome) => void resolve(outcome)}
        />
      ) : null}
    </AppShell>
  );
}
