import { listGroups, syncGroups } from '@/controllers/whatsapp.controller'

export default {
  GET: listGroups,
  POST: syncGroups,
} satisfies RestController