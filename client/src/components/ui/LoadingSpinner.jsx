export default function LoadingSpinner({ text = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        <p className="text-sm text-gray-500">{text}</p>
      </div>
    </div>
  );
}
