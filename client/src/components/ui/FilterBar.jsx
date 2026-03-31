import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';

function MultiSelect({ label, options, selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const count = selected.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-lg border py-2 px-3 text-sm outline-none transition-colors ${
          count > 0
            ? 'border-primary-300 bg-primary-50 text-primary-700'
            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        <span>{label}</span>
        {count > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-primary-600 text-white text-xs font-medium h-5 min-w-[20px] px-1">
            {count}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {options.map(opt => {
            const isSelected = selected.includes(String(opt.value));
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(String(opt.value))}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                  isSelected ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                }`}
              >
                <span className={`flex-shrink-0 h-4 w-4 rounded border flex items-center justify-center ${
                  isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300'
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({ filters, values, onChange, onClear }) {
  const hasActiveFilters = Object.values(values).some(v => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== '' && v !== undefined && v !== null;
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {filters.map(filter => (
        <MultiSelect
          key={filter.key}
          label={filter.label}
          options={filter.options}
          selected={values[filter.key] || []}
          onChange={(val) => onChange(filter.key, val)}
        />
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
