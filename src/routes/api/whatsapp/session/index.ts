import { connectSession, disconnectSession, getSessionStatus } from '@/controllers/whatsapp.controller'

export default {
  GET: getSessionStatus,
  POST: connectSession,
  DELETE: disconnectSession,
} satisfies RestController