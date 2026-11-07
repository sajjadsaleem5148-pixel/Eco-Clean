import Link from "next/link";

export default function Pagination({ page, pages, prevHref, nextHref }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={prevHref} className="font-semibold text-emerald-800 underline">Previous</Link>
      ) : (
        <span />
      )}
      <span>Page {page} of {pages}</span>
      {page < pages ? (
        <Link href={nextHref} className="font-semibold text-emerald-800 underline">Next</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
