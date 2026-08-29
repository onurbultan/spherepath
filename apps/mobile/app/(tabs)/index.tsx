import FeedView from "@/features/inbox/views/FeedView";
import TodayView from "@/features/today/views/TodayView";
export default process.env.EXPO_PUBLIC_SIMPLE_WORKSPACE === "false" ? TodayView : FeedView;
