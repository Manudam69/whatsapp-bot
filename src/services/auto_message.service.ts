import { AutoMessage } from '@/entities/auto_message.entity'
import { BadRequest, NotFound } from '@/middlewares/error_handler'
import { mediaAssetService } from './media_asset.service'

export type AutoMessageInput = {
  name: string
  content: string
  type: 'text' | 'image'
  imageId?: string | null
  groupIds?: string[]
}

function validate(input: AutoMessageInput) {
  if (!input.name.trim()) {
    throw BadRequest('El nombre del mensaje es obligatorio.')
  }
  if (!input.content.trim()) {
    throw BadRequest('El contenido del mensaje es obligatorio.')
  }
  if (input.type !== 'text' && input.type !== 'image') {
    throw BadRequest('Tipo de mensaje inválido.')
  }
}

async function assignImage(message: AutoMessage, imageId?: string | null) {
  if (imageId === undefined) {
    return
  }

  message.image = imageId ? await mediaAssetService.findById(message.clientId, imageId) : null
}

export const autoMessageService = {
  async list(clientId: string) {
    return AutoMessage.find({ where: { clientId }, order: { createdAt: 'DESC' } })
  },

  async findById(clientId: string, id: string) {
    const message = await AutoMessage.findOne({ where: { id, clientId } })
    if (!message) {
      throw NotFound('Mensaje no encontrado.')
    }
    return message
  },

  async create(clientId: string, input: AutoMessageInput) {
    validate(input)

    const message = AutoMessage.create({
      clientId,
      name: input.name.trim(),
      content: input.content.trim(),
      type: input.type,
      groupIds: input.groupIds || [],
    })

    await assignImage(message, input.imageId)
    await message.save()
    return message
  },

  async update(clientId: string, id: string, input: Partial<AutoMessageInput>) {
    const message = await this.findById(clientId, id)

    if (input.name !== undefined) {
      message.name = input.name.trim()
    }
    if (input.content !== undefined) {
      message.content = input.content.trim()
    }
    if (input.type !== undefined) {
      message.type = input.type
    }
    if (input.groupIds !== undefined) {
      message.groupIds = input.groupIds
    }

    await assignImage(message, input.imageId)

    validate({
      name: message.name,
      content: message.content,
      type: message.type,
      groupIds: message.groupIds,
      imageId: message.image?.id,
    })

    await message.save()
    return message
  },

  async remove(clientId: string, id: string) {
    const message = await this.findById(clientId, id)
    await message.remove()
    return { success: true }
  },
}
