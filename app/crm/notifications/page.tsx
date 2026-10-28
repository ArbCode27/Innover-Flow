import { cookies } from "next/headers";
import { CRM_SESSION_COOKIE, verifySignedSessionToken } from "@/app/api/crm/_lib/crm-session";
import { NotificationsView } from "@/app/crm/_components/notifications/notifications-view";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CRM_SESSION_COOKIE)?.value;
  const session = await verifySignedSessionToken(token);

  return (
    <div className="flex h-full w-full flex-col">
      <NotificationsView organizationId={session?.organizationId} />
    </div>
  );
}
