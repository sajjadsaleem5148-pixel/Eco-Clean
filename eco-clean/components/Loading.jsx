export default function Loading({
  text = "Loading...",
  fullScreen = false,
}) {
  return (
    <div
      className={`flex items-center justify-center ${
        fullScreen ? "min-h-screen" : "py-12"
      }`}
    >
      <div className="flex flex-col items-center">
        
        {/* Spinner */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-green-600" />

        {/* Loading Text */}
        {text && (
          <p className="mt-4 text-sm font-medium text-gray-500">
            {text}
          </p>
        )}
      </div>
    </div>
  );
}