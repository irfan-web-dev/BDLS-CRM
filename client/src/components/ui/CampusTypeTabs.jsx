const CAMPUS_TYPE_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
];

export default function CampusTypeTabs({ value, onChange, className = '', includeAll = false }) {
  const options = includeAll
    ? [{ value: 'all', label: 'All' }, ...CAMPUS_TYPE_OPTIONS]
    : CAMPUS_TYPE_OPTIONS;

  return (
    <div className={`flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 ${className}`.trim()}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`min-w-0 flex-1 rounded-md px-4 py-2 text-center text-sm font-medium whitespace-normal transition-colors sm:flex-none sm:whitespace-nowrap ${
            value === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
