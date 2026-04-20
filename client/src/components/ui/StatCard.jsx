export default function StatCard({ title, value, icon: Icon, color = 'blue', subtitle }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 min-h-[126px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-tight text-gray-500 sm:text-sm">{title}</p>
          <p className="mt-2 text-2xl font-bold leading-none text-gray-900 sm:text-[28px]">{value}</p>
          {subtitle && <p className="mt-2 text-xs leading-snug text-gray-500 break-words">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 self-start rounded-lg p-2.5 sm:p-3 ${colorClasses[color] || colorClasses.blue}`}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
        )}
      </div>
    </div>
  );
}
