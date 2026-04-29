import { fmtDate, fmtTime } from '../../utils/time'

const statusStyles = {
  scheduled: 'border-orange-300 bg-orange-50',
  checked_in: 'border-green-300 bg-green-50',
  completed: 'border-gray-300 bg-gray-50',
  missed: 'border-red-300 bg-red-50',
}

export default function ShiftCard({ shift, buildingName }) {
  return (
    <div className={`border-2 rounded-lg p-4 ${statusStyles[shift.status] || statusStyles.scheduled}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{buildingName || shift.building_id}</div>
          <div className="text-sm text-gray-600 mt-1">
            {fmtDate(shift.start_time)} &middot; {fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}
          </div>
        </div>
        <span className="text-sm font-medium capitalize">{shift.status}</span>
      </div>
    </div>
  )
}
