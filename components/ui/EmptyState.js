export default function EmptyState({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-700">
      {children}
    </p>
  );
}
