import { FeedView } from "@/features/inbox/views/FeedView";
import { TodayView } from "@/features/today/views/TodayView";

export default function TodayPage() {
  return process.env.NEXT_PUBLIC_SIMPLE_WORKSPACE === "false" ? <TodayView /> : <FeedView />;
}
