import { BadRequest } from '@/middlewares/error_handler'
import { whatsappService } from './whatsapp.service'

class SessionOwnerService {
  getActiveOwnerPhoneNumber() {
    return whatsappService.getConnectedPhoneNumber()
  }

  requireActiveOwnerPhoneNumber() {
    const ownerPhoneNumber = this.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      throw BadRequest('No hay una sesión de WhatsApp conectada para consultar información vinculada.')
    }

    return ownerPhoneNumber
  }
}

export const sessionOwnerService = new SessionOwnerService()