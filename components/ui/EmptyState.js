export default function EmptyState({ children }) {
  return (
    <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
      {children}
    </p>
  );
}
