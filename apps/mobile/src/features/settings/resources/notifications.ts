import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const reminderKind = "daily_plan";
const channelId = "daily-plan";

export function configureNotificationPresentation() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function syncDailyPlanReminder(enabled: boolean, hour: number, minute: number) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((item) => item.content.data?.spherepathType === reminderKind)
    .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));

  if (!enabled) return { scheduled: false };

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: "Günlük plan",
      description: "Spherepath günlük çalışma planı hatırlatmaları",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { scheduled: false };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Bugünün odağı hazır",
      body: "Spherepath'te öncelikli kişi ve fırsatlarını gözden geçir.",
      data: { spherepathType: reminderKind },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === "android" ? { channelId } : {}),
    },
  });
  return { scheduled: true };
}
