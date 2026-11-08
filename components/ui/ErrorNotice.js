export default function ErrorNotice({ children }) {
  return (
    <p role="alert" className="rounded-md border border-red-300 border-l-4 border-l-red-700 bg-red-50 p-3 text-sm text-red-900">
      {children}
    </p>
  );
}
