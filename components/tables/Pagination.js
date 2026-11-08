import Link from "next/link";

const btn =
  "inline-flex min-h-10 items-center rounded-md border border-emerald-700 px-4 font-semibold text-emerald-900 hover:bg-emerald-50";

export default function Pagination({ page, pages, prevHref, nextHref }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={prevHref} className={btn}>Previous</Link>
      ) : (
        <span />
      )}
      <span className="text-gray-700">Page {page} of {pages}</span>
      {page < pages ? (
        <Link href={nextHref} className={btn}>Next</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
