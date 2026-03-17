import { cookies } from "next/headers";
import { isValidSession } from "@/lib/dashboard-auth";
import PinGate from "./PinGate";
import DashboardContent from "./DashboardContent";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("dash_session")?.value;
  const pin = process.env.DASHBOARD_PIN;

  if (!isValidSession(session, pin)) {
    return <PinGate />;
  }

  return <DashboardContent />;
}
