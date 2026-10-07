import { AppShell } from "@/components/AppShell";

/** Static app shell; all live data arrives through /api/snapshot on the client. */
export default function Home() {
  return <AppShell />;
}
