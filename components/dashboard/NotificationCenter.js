import Link from "next/link";
import { listFor } from "@/services/notifications";
import { NOTIFICATION_TYPE_LABELS, safeLink } from "@/lib/notificationTypes";
import { formatDateTime } from "@/lib/reportStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";
import { MarkReadButton, MarkAllReadButton } from "@/components/forms/NotificationForms";

const PAGE_SIZE = 20;

function href(basePath, page, unreadOnly) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("filter", "unread");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return basePath + (qs ? "?" + qs : "");
}

// userId must always come from the server session, never from the URL.
export default async function NotificationCenter({ userId, basePath, sp }) {
  const unreadOnly = sp && sp.filter === "unread";
  const page = Math.max(1, parseInt(sp && sp.page, 10) || 1);

  let data = null;
  let loadError = false;
  try {
    data = await listFor(userId, { unreadOnly, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("Load notifications failed:", err.message);
    loadError = true;
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const tabs = [
    { label: "All", href: href(basePath, 1, false), active: !unreadOnly },
    { label: "Unread", href: href(basePath, 1, true), active: Boolean(unreadOnly) },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {data && <p className="mt-1 text-sm text-gray-600">Unread: {data.unread}</p>}
        </div>
        {data && data.unread > 0 && <MarkAllReadButton />}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        These are in-app notifications only. No email or SMS is sent.
      </p>

      <div className="mt-4">
        <FilterTabs label="Notification filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Notifications could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && data && data.items.length === 0 && (
        <div className="mt-4">
          <EmptyState>{unreadOnly ? "You have no unread notifications." : "You have no notifications yet."}</EmptyState>
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="mt-4 space-y-3">
          {data.items.map((n) => {
            const link = safeLink(n.link);
            return (
              <li
                key={n.id}
                className={"rounded-md border p-4 " + (n.read ? "border-gray-200" : "border-emerald-300 bg-emerald-50")}
              >
                <p className="text-xs font-semibold text-emerald-800">
                  {NOTIFICATION_TYPE_LABELS[n.type] || n.type}
                  {!n.read && " | Unread"}
                </p>
                <p className="mt-1 font-semibold text-gray-900">{n.title}</p>
                <p className="mt-1 text-sm text-gray-700">{n.body}</p>
                <p className="mt-1 text-xs text-gray-600">{formatDateTime(n.createdAt)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {link && (
                    <Link href={link} className="text-sm font-semibold text-emerald-800 underline">Open</Link>
                  )}
                  {!n.read && <MarkReadButton id={n.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={page}
        pages={pages}
        prevHref={href(basePath, page - 1, unreadOnly)}
        nextHref={href(basePath, page + 1, unreadOnly)}
      />
    </section>
  );
}
