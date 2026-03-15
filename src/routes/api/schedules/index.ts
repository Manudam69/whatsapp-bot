import { createSchedule, listSchedules } from '@/controllers/schedules.controller'

export default {
  GET: listSchedules,
  POST: createSchedule,
} satisfies RestController