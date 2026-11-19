import connectDB from "@/lib/db/connect";
import Vendor from "@/models/Vendor";
import { requirePermission } from "@/lib/auth/guards";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_REASON_REQUIRED,
  vendorTargets,
  vendorTargetLabel,
} from "@/lib/vendorRules";
import VendorForm, { EditVendorForm, VendorStatusForm } from "@/components/forms/VendorForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Vendors | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/vendors" + (status ? "?status=" + status : "");
}

export default async function AdminVendorsPage({ searchParams }) {
  await requirePermission("rewards.manage");
  const sp = await searchParams;
  const status = VENDOR_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let vendors = [];
  let loadError = false;
  try {
    await connectDB();
    vendors = await Vendor.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  } catch (err) {
    console.error("Load vendors failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(VENDOR_CATEGORIES).map(([value, label]) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    VENDOR_STATUSES.map((s) => ({ label: VENDOR_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <p className="mt-1 text-sm text-gray-600">
          This is the list of suppliers. A new vendor is pending until staff approve it. Vendors are not linked to
          reward products yet. Only enter details that are real and checked.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Vendors could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && vendors.length === 0 && (
          <div className="mt-4">
            <EmptyState>No vendors match this filter.</EmptyState>
          </div>
        )}

        {vendors.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Vendor</th>
                  <th scope="col" className="py-2 pr-4">Supplies</th>
                  <th scope="col" className="py-2 pr-4">Contact</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const id = v._id.toString();
                  const plain = {
                    id: id,
                    name: v.name,
                    category: v.category,
                    contactPerson: v.contactPerson || "",
                    email: v.email || "",
                    phone: v.phone || "",
                    address: v.address || "",
                    notes: v.notes || "",
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{v.name}</td>
                      <td className="py-2 pr-4">{VENDOR_CATEGORIES[v.category] || v.category}</td>
                      <td className="py-2 pr-4">
                        {v.contactPerson && <span className="block">{v.contactPerson}</span>}
                        {v.email && <span className="block break-all">{v.email}</span>}
                        {v.phone && <span className="block">{v.phone}</span>}
                        {!v.contactPerson && !v.email && !v.phone && <span className="text-gray-500">-</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={v.status} label={VENDOR_STATUS_LABELS[v.status]} />
                        {v.status === "INACTIVE" && v.statusReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {v.statusReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                            <EditVendorForm vendor={plain} categories={categories} />
                          </details>
                          {vendorTargets(v.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "INACTIVE" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {vendorTargetLabel(v.status, t)}
                              </summary>
                              <VendorStatusForm
                                vendorId={id}
                                target={t}
                                label={vendorTargetLabel(v.status, t)}
                                needsReason={VENDOR_REASON_REQUIRED.includes(t)}
                                danger={t === "INACTIVE"}
                              />
                            </details>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Add a vendor</h2>
        <VendorForm categories={categories} />
      </section>
    </div>
  );
}
