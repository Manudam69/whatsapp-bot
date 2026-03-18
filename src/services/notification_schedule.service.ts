import { BadRequest, NotFound } from '@/middlewares/error_handler'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { mediaAssetService } from './media_asset.service'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { config } from '@/config'

export type ScheduleInput = {
  name: string
  messageText?: string
  daysOfWeek: number[]
  times: string[]
  groupJids: string[]
  messageTemplateId?: string
  messageTemplateIds?: string[]
  isActive?: boolean
  retryLimit?: number
  throttleMs?: number
  mediaAssetId?: string | null
}

function validate(input: ScheduleInput) {
  if (!input.name.trim()) {
    throw BadRequest('El nombre de la programación es obligatorio.')
  }
  const hasTemplates = Array.isArray(input.messageTemplateIds) && input.messageTemplateIds.length > 0
  if (!hasTemplates && !input.messageText?.trim() && !input.mediaAssetId) {
    throw BadRequest('La programación requiere al menos un mensaje plantilla.')
  }
  if (!Array.isArray(input.daysOfWeek) || input.daysOfWeek.length === 0) {
    throw BadRequest('Debes indicar al menos un día de envío.')
  }
  if (!Array.isArray(input.times) || input.times.length === 0) {
    throw BadRequest('Debes indicar al menos un horario de envío.')
  }
  if (!Array.isArray(input.groupJids) || input.groupJids.length === 0) {
    throw BadRequest('Debes indicar al menos un grupo destino.')
  }
}

async function assignMedia(schedule: NotificationSchedule, mediaAssetId?: string | null) {
  if (mediaAssetId === undefined) {
    return
  }

  schedule.mediaAsset = mediaAssetId ? await mediaAssetService.findById(schedule.clientId, mediaAssetId) : null
}

export const notificationScheduleService = {
  async create(clientId: string, input: ScheduleInput) {
    validate(input)

    const schedule = NotificationSchedule.create({
      clientId,
      name: input.name.trim(),
      messageText: input.messageText?.trim(),
      daysOfWeek: input.daysOfWeek,
      times: input.times,
      groupJids: input.groupJids,
      messageTemplateId: input.messageTemplateId,
      messageTemplateIds: input.messageTemplateIds ?? [],
      isActive: input.isActive ?? true,
      retryLimit: input.retryLimit ?? config.MAX_SEND_RETRIES,
      throttleMs: input.throttleMs ?? config.MESSAGE_THROTTLE_MS,
    })

    await assignMedia(schedule, input.mediaAssetId)
    await schedule.save()
    return schedule
  },

  async update(clientId: string, id: string, input: Partial<ScheduleInput>) {
    const schedule = await NotificationSchedule.findOne({ where: { id, clientId } })
    if (!schedule) {
      throw NotFound('Programación no encontrada.')
    }

    if (input.name !== undefined) {
      schedule.name = input.name.trim()
    }
    if (input.messageText !== undefined) {
      schedule.messageText = input.messageText?.trim()
    }
    if (input.daysOfWeek !== undefined) {
      schedule.daysOfWeek = input.daysOfWeek
    }
    if (input.times !== undefined) {
      schedule.times = input.times
    }
    if (input.groupJids !== undefined) {
      schedule.groupJids = input.groupJids
    }
    if (input.messageTemplateId !== undefined) {
      schedule.messageTemplateId = input.messageTemplateId
    }
    if (input.messageTemplateIds !== undefined) {
      schedule.messageTemplateIds = input.messageTemplateIds
    }
    if (input.isActive !== undefined) {
      schedule.isActive = input.isActive
    }
    if (input.retryLimit !== undefined) {
      schedule.retryLimit = input.retryLimit
    }
    if (input.throttleMs !== undefined) {
      schedule.throttleMs = input.throttleMs
    }

    await assignMedia(schedule, input.mediaAssetId)

    const candidate: ScheduleInput = {
      name: schedule.name,
      messageText: schedule.messageText,
      daysOfWeek: schedule.daysOfWeek,
      times: schedule.times,
      groupJids: schedule.groupJids,
      messageTemplateId: schedule.messageTemplateId,
      messageTemplateIds: schedule.messageTemplateIds,
      mediaAssetId: schedule.mediaAsset?.id,
    }
    validate(candidate)

    await schedule.save()
    return schedule
  },

  async list(clientId: string) {
    return NotificationSchedule.find({ where: { clientId }, order: { createdAt: 'DESC' } })
  },

  async findById(clientId: string, id: string) {
    const schedule = await NotificationSchedule.findOne({ where: { id, clientId } })
    if (!schedule) {
      throw NotFound('Programación no encontrada.')
    }
    return schedule
  },

  async listDispatchHistory(clientId: string, limit = 100) {
    return NotificationDispatch.find({ where: { clientId }, order: { executedAt: 'DESC' }, take: limit })
  },

  async remove(clientId: string, id: string) {
    const schedule = await this.findById(clientId, id)
    await schedule.remove()
    return { success: true }
  },
}
