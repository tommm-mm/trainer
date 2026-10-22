import { redirect } from "next/navigation";

// Stats moved into the Progress tab (Running · Body · Gym).
export default function AnalyticsPage() {
  redirect("/progress");
}
