import { Request } from 'express'
import fs from 'fs'
import path from 'path'
import { config } from '@/config'
import { AutoMessage } from '@/entities/auto_message.entity'
import type { BotConfigurationSettings } from '@/entities/bot_configuration.entity'
import { IncidentReport } from '@/entities/incident_report.entity'
import { MediaAsset } from '@/entities/media_asset.entity'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'

type BotSettingsShape = BotConfigurationSettings

const dayNameToNumber = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const

const numberToDayName = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
} as const

function formatDate(value?: Date) {
  if (!value) {
    return undefined
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: config.SCHEDULE_TIME_ZONE,
  }).format(value)
}

function buildApiBaseUrl(req: Request) {
  return `${req.protocol}://${req.get('host')}`
}

function resolvePublicUrl(req: Request, asset?: MediaAsset | null) {
  if (!asset?.publicUrl) {
    return undefined
  }

  return `${buildApiBaseUrl(req)}${asset.publicUrl}`
}

function nextRunLabel(schedule: NotificationSchedule) {
  const firstDay = schedule.daysOfWeek[0]
  const firstTime = schedule.times[0]
  if (firstDay === undefined || !firstTime) {
    return undefined
  }

  const label = numberToDayName[firstDay as keyof typeof numberToDayName]
  return label ? `${label} · ${firstTime}` : firstTime
}

export const panelAdminService = {
  mapGroup(group: WhatsappGroup) {
    return {
      id: group.id,
      jid: group.jid,
      name: group.name,
      participants: group.participantCount,
      isActive: group.isActive,
      lastActivity: formatDate(group.lastSyncedAt),
    }
  },

  mapImage(req: Request, asset: MediaAsset) {
    const absolutePath = path.resolve(config.PROJECT_ROOT, asset.filePath)
    const size = fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0

    return {
      id: asset.id,
      name: asset.name,
      url: resolvePublicUrl(req, asset),
      size,
      uploadedAt: formatDate(asset.createdAt),
    }
  },

  mapMessage(message: AutoMessage) {
    return {
      id: message.id,
      name: message.name,
      content: message.content,
      type: message.type,
      imageId: message.image?.id,
      groupIds: message.groupIds,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    }
  },

  mapSchedule(schedule: NotificationSchedule, lastDispatch?: NotificationDispatch | null) {
    const templateIds = schedule.messageTemplateIds?.length
      ? schedule.messageTemplateIds
      : schedule.messageTemplateId
        ? [schedule.messageTemplateId]
        : []

    return {
      id: schedule.id,
      name: schedule.name,
      messageIds: templateIds,
      groupIds: schedule.groupJids,
      days: schedule.daysOfWeek.map((day) => numberToDayName[day as keyof typeof numberToDayName]).filter(Boolean),
      time: schedule.times[0] || '08:00',
      isActive: schedule.isActive,
      createdAt: schedule.createdAt.toISOString(),
      lastRun: formatDate(lastDispatch?.executedAt),
      nextRun: schedule.isActive ? nextRunLabel(schedule) : 'Pausado',
    }
  },

  mapReport(req: Request, report: IncidentReport) {
    return {
      id: report.id,
      groupId: report.forwardedGroupJid || '',
      groupName: report.forwardedGroupName,
      senderId: report.contact.id,
      senderName: report.contact.contactName || report.contact.phoneNumber,
      senderPhone: report.contact.phoneNumber,
      serviceName: report.serviceName,
      content: report.incidentText,
      type: 'text' as const,
      imageUrl: undefined,
      receivedAt: formatDate(report.receivedAt),
      folio: report.folio,
      status: report.reviewStatus,
      isArchived: report.isArchived,
    }
  },

  mapSentMessage(dispatch: NotificationDispatch, messageName?: string, canRevokeFromWhatsapp = false) {
    return {
      id: dispatch.id,
      scheduleId: dispatch.schedule?.id,
      scheduleName: dispatch.schedule?.name,
      messageId: dispatch.schedule?.messageTemplateId || '',
      messageName,
      groupId: dispatch.groupJid,
      groupName: dispatch.groupName,
      sentAt: formatDate(dispatch.executedAt),
      status: dispatch.status === 'SENT' ? 'success' : dispatch.status === 'FAILED' ? 'failed' : 'retrying',
      error: dispatch.errorMessage,
      retryCount: dispatch.attempts,
      rateLimitedCount: dispatch.rateLimitedCount ?? 0,
      canRevokeFromWhatsapp,
    }
  },

  mapBotSettings(settings: BotSettingsShape) {
    return {
      reportKeyword: settings.reportKeyword,
      retryAttempts: settings.retryAttempts,
      retryDelayMs: settings.retryDelayMs,
      dispatchWindowMinutes: settings.dispatchWindowMinutes,
      concurrencyLimit: settings.concurrencyLimit,
      operationalGroupId: settings.operationalGroupId || '',
      firstReplyText: settings.firstReplyText,
      firstReplyEnabled: settings.firstReplyEnabled,
      confirmationEnabled: settings.confirmationEnabled,
      reviewedReplyText: settings.reviewedReplyText,
      resolvedReplyText: settings.resolvedReplyText,
      strategy: settings.strategy,
      skipIdenticalMessageCheck: settings.skipIdenticalMessageCheck,
    }
  },

  mapSession(state: { status: 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected'; qr?: string; connectedAt?: Date; phoneNumber?: string }) {
    return {
      id: 'main-session',
      phoneNumber: state.phoneNumber || '',
      status: state.status === 'connected' ? 'connected' : state.status === 'qr' ? 'qr_pending' : 'disconnected',
      connectedAt: formatDate(state.connectedAt),
      qrCode: state.qr,
    }
  },

  toScheduleDays(days: string[]) {
    return days.map((day) => dayNameToNumber[day as keyof typeof dayNameToNumber]).filter((value) => value !== undefined)
  },
}