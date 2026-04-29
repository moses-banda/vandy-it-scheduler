const colorMap = {
  green: 'bg-green-500',
  orange: 'bg-orange-400',
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  gray: 'bg-gray-300',
}

const labelMap = {
  green: 'Checked In',
  orange: 'Pending',
  red: 'Missed',
  yellow: 'Ringing',
  gray: 'Not Started',
}

export default function StatusBadge({ state }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-full ${colorMap[state] || colorMap.gray}`} />
      <span className="text-sm">{labelMap[state] || state}</span>
    </span>
  )
}
