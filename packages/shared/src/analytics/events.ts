export const analyticsEvents = {
  DAILY_PLAN_OPENED: "daily_plan_opened",
  DAILY_TASK_COMPLETED: "daily_task_completed",
  INTERACTION_SAVED: "interaction_saved",
  OPPORTUNITY_STAGE_CHANGED: "opportunity_stage_changed",
  VOICE_NOTE_REVIEWED: "voice_note_reviewed",
  INBOX_ITEM_CREATED: "inbox_item_created",
  INBOX_ITEM_PROCESSED: "inbox_item_processed",
  INBOX_ITEM_AUTO_APPLIED: "inbox_item_auto_applied",
  INBOX_ITEM_UNDONE: "inbox_item_undone",
  INBOX_ITEM_FAILED: "inbox_item_failed",
  DAILY_TASK_REPLACED: "daily_task_replaced",
  FUNNEL_COACHING_OPENED: "funnel_coaching_opened",
  FUNNEL_COACHING_ACTION_OPENED: "funnel_coaching_action_opened",
  WHATSAPP_ITEM_INGESTED: "whatsapp_item_ingested",
  WHATSAPP_SHARE_FALLBACK_USED: "whatsapp_share_fallback_used",
} as const;

export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
