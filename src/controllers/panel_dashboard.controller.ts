import { NextFunction, Request, Response } from 'express'
import { In } from 'typeorm'
import { AutoMessage } from '@/entities/auto_message.entity'
import { IncidentReport } from '@/entities/incident_report.entity'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { OutboundMessage } from '@/entities/outbound_message.entity'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'
import { panelAdminService } from '@/services/panel_admin.service'
import { panelConversationsService } from '@/services/panel_conversations.service'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'

export async function getDashboardOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const clientSessions = whatsappSessionManager.getSessionsByClientId(clientId)
    const sessionIds = clientSessions.map((s) => s.sessionId)
    const connectedSession = clientSessions.find((s) => s.isConnected())
    const sessionState = connectedSession?.getSessionState() ?? clientSessions[0]?.getSessionState() ?? { status: 'idle' as const }

    const [groups, schedules, reports, dispatches, messages, pendingOutbound, conversations] = await Promise.all([
      sessionIds.length > 0
        ? WhatsappGroup.find({ where: { sessionId: In(sessionIds), isMember: true } })
        : Promise.resolve([]),
      NotificationSchedule.find({ where: { clientId } }),
      IncidentReport.find({ where: { clientId }, order: { receivedAt: 'DESC' }, take: 50 }),
      NotificationDispatch.find({ where: { clientId }, order: { executedAt: 'DESC' }, take: 100 }),
      AutoMessage.find({ where: { clientId } }),
      sessionIds.length > 0
        ? OutboundMessage.count({ where: { sessionId: In(sessionIds), status: 'PENDING' } })
        : Promise.resolve(0),
      panelConversationsService.list(req, clientId, 5),
    ])

    const now = Date.now()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const last24Hours = now - (24 * 60 * 60 * 1000)

    const dispatchesToday = dispatches.filter((item) => item.executedAt.getTime() >= today.getTime())
    const dispatchesLast24Hours = dispatches.filter((item) => item.executedAt.getTime() >= last24Hours)
    const messageNameById = new Map(messages.map((message) => [message.id, message.name]))

    const sentCount = dispatches.filter((item) => item.status === 'SENT').length
    const sentTodayCount = dispatchesToday.filter((item) => item.status === 'SENT').length
    const failedLast24h = dispatchesLast24Hours.filter((item) => item.status === 'FAILED').length
    const retryingCount = pendingOutbound
    const activeGroups = groups.filter((group) => group.isActive).length
    const activeSchedules = schedules.filter((schedule) => schedule.isActive).length
    const successRate = dispatchesLast24Hours.length === 0
      ? 100
      : Math.round((dispatchesLast24Hours.filter((item) => item.status === 'SENT').length / dispatchesLast24Hours.length) * 100)
    const throughputPerHour = Math.round(sentCount / Math.max(1, Math.min(24, dispatches.length === 0 ? 1 : 24)))

    const timeline = [
      ...reports.slice(0, 3).map((report) => ({
        id: `report-${report.id}`,
        kind: 'report' as const,
        title: `Reporte ${report.folio}`,
        description: report.incidentText,
        timestamp: panelAdminService.mapReport(req, report).receivedAt || '',
        orderAt: report.receivedAt.getTime(),
        tone: report.reviewStatus === 'resolved' ? 'success' : report.reviewStatus === 'reviewed' ? 'info' : 'warning',
        reportId: report.id,
      })),
      ...dispatches.slice(0, 3).map((dispatch) => ({
        id: `dispatch-${dispatch.id}`,
        kind: 'dispatch' as const,
        title: 'Notificación programada enviada',
        description: dispatch.status === 'SENT'
          ? 'La programación se ejecutó correctamente y el mensaje salió al grupo destino.'
          : dispatch.status === 'FAILED'
            ? 'La programación se ejecutó pero el envío no se completó y requiere revisión.'
            : 'La programación quedó en proceso y sigue pendiente de confirmación.',
        timestamp: panelAdminService.mapSentMessage(
          dispatch,
          dispatch.schedule?.messageTemplateId ? messageNameById.get(dispatch.schedule.messageTemplateId) : undefined,
        ).sentAt || '',
        orderAt: dispatch.executedAt.getTime(),
        tone: dispatch.status === 'SENT' ? 'success' : dispatch.status === 'FAILED' ? 'warning' : 'info',
        scheduleName: dispatch.schedule?.name || 'Programación sin nombre',
        messageName: dispatch.schedule?.messageTemplateId ? messageNameById.get(dispatch.schedule.messageTemplateId) : undefined,
        groupName: dispatch.groupName || dispatch.groupJid,
        dispatchStatus: dispatch.status,
      })),
    ]
      .sort((a, b) => b.orderAt - a.orderAt)
      .slice(0, 6)
      .map(({ orderAt, ...item }) => item)

    res.json({
      stats: {
        activeGroups,
        totalGroups: groups.length,
        activeSchedules,
        totalSchedules: schedules.length,
        pendingReports: reports.filter((report) => report.reviewStatus === 'pending').length,
        messagesToday: sentTodayCount,
        sessionStatus: panelAdminService.mapSession(sessionState).status,
      },
      delivery: {
        queueDepth: retryingCount,
        retrying: retryingCount,
        failedLast24h,
        throughputPerHour: Math.max(throughputPerHour, messages.length > 0 ? 1 : 0),
        successRate,
      },
      timeline,
      conversations,
    })
  } catch (error) {
    next(error)
  }
}
