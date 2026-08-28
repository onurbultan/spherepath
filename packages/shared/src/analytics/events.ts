export const analyticsEvents = {
  DAILY_PLAN_OPENED: "daily_plan_opened",
  DAILY_TASK_COMPLETED: "daily_task_completed",
  INTERACTION_SAVED: "interaction_saved",
  OPPORTUNITY_STAGE_CHANGED: "opportunity_stage_changed",
  VOICE_NOTE_REVIEWED: "voice_note_reviewed",
} as const;

export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
