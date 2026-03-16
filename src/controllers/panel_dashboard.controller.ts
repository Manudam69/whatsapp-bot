import { NextFunction, Request, Response } from 'express'
import { AutoMessage } from '@/entities/auto_message.entity'
import { IncidentReport } from '@/entities/incident_report.entity'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { OutboundMessage } from '@/entities/outbound_message.entity'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'
import { panelAdminService } from '@/services/panel_admin.service'
import { whatsappService } from '@/services/whatsapp.service'

export async function getDashboardOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const [groups, schedules, reports, dispatches, messages, pendingOutbound] = await Promise.all([
      WhatsappGroup.find({ where: { isMember: true } }),
      NotificationSchedule.find(),
      IncidentReport.find({ order: { receivedAt: 'DESC' }, take: 50 }),
      NotificationDispatch.find({ order: { executedAt: 'DESC' }, take: 100 }),
      AutoMessage.find(),
      OutboundMessage.count({ where: { status: 'PENDING' } }),
    ])

    const now = Date.now()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const last24Hours = now - (24 * 60 * 60 * 1000)

    const dispatchesToday = dispatches.filter((item) => item.executedAt.getTime() >= today.getTime())
    const dispatchesLast24Hours = dispatches.filter((item) => item.executedAt.getTime() >= last24Hours)

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
        title: `Reporte ${report.folio}`,
        description: report.incidentText,
        timestamp: panelAdminService.mapReport(req, report).receivedAt || '',
        orderAt: report.receivedAt.getTime(),
        tone: report.reviewStatus === 'resolved' ? 'success' : report.reviewStatus === 'reviewed' ? 'info' : 'warning',
      })),
      ...dispatches.slice(0, 3).map((dispatch) => ({
        id: `dispatch-${dispatch.id}`,
        title: dispatch.schedule?.name || 'Envio programado',
        description: `${dispatch.groupName || dispatch.groupJid} · ${dispatch.status}`,
        timestamp: panelAdminService.mapSentMessage(dispatch, dispatch.schedule?.name).sentAt || '',
        orderAt: dispatch.executedAt.getTime(),
        tone: dispatch.status === 'SENT' ? 'success' : dispatch.status === 'FAILED' ? 'warning' : 'info',
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
        sessionStatus: panelAdminService.mapSession(whatsappService.getSessionState()).status,
      },
      delivery: {
        queueDepth: retryingCount,
        retrying: retryingCount,
        failedLast24h,
        throughputPerHour: Math.max(throughputPerHour, messages.length > 0 ? 1 : 0),
        successRate,
      },
      timeline,
    })
  } catch (error) {
    next(error)
  }
}