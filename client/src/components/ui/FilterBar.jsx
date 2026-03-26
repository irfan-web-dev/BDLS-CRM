import { X } from 'lucide-react';

export default function FilterBar({ filters, values, onChange, onClear }) {
  const hasActiveFilters = Object.values(values).some(v => v !== '' && v !== undefined && v !== null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {filters.map(filter => (
        <select
          key={filter.key}
          value={values[filter.key] || ''}
          onChange={(e) => onChange(filter.key, e.target.value)}
          className="rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none bg-white"
        >
          <option value="">{filter.label}</option>
          {filter.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          <X className="h-3 w-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}
