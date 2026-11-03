import { redirect } from "next/navigation";

// The fan vote moved to its own Grand Finale section; keeps old bookmarks working.
export default function MovedFanVote() {
  redirect("/portal/admin/finale/fan-vote");
}
