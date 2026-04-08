const CAMPUS_TYPE_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
];

export default function CampusTypeTabs({ value, onChange, className = '', includeAll = false }) {
  const options = includeAll
    ? [{ value: 'all', label: 'All' }, ...CAMPUS_TYPE_OPTIONS]
    : CAMPUS_TYPE_OPTIONS;

  return (
    <div className={`flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto ${className}`.trim()}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
            value === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
