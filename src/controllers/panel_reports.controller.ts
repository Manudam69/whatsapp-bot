import { NextFunction, Request, Response } from 'express'
import { botConfigurationService } from '@/services/bot_configuration.service'
import { BadRequest } from '@/middlewares/error_handler'
import { formatReportStatusNotification, reportService } from '@/services/report.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { outboundMessageService } from '@/services/outbound_message.service'
import { sseService } from '@/services/sse.service'
import logger from '@/utils/logger'
import { IncidentReport } from '@/entities/incident_report.entity'

function isValidReviewStatus(value: string): value is IncidentReport['reviewStatus'] {
  return value === 'pending' || value === 'reviewed' || value === 'resolved'
}

export async function listArchivedReports(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const reports = await reportService.listArchived(clientId)
    res.json(reports.map((report) => panelAdminService.mapReport(req, report)))
  } catch (error) {
    next(error)
  }
}

export async function archiveReport(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const isArchived = req.body?.isArchived === true

    const report = await reportService.setArchived(clientId, reportId, isArchived)
    const mapped = panelAdminService.mapReport(req, report)
    sseService.emit(clientId, 'report:archived', mapped)
    res.json(mapped)
  } catch (error) {
    next(error)
  }
}

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const reports = await reportService.list(clientId)
    res.json(reports.map((report) => panelAdminService.mapReport(req, report)))
  } catch (error) {
    next(error)
  }
}

export async function updateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const requestedStatus = String(req.body?.status || 'pending')
    const resolutionDetails = typeof req.body?.resolutionDetails === 'string' ? req.body.resolutionDetails.trim() : ''
    const status: IncidentReport['reviewStatus'] = isValidReviewStatus(requestedStatus) ? requestedStatus : 'pending'
    if (status === 'resolved' && !resolutionDetails) {
      throw BadRequest('Debes capturar el detalle de la resolución para marcar el reporte como resuelto.')
    }

    const report = await reportService.setReviewStatus(clientId, reportId, status)
    const botSettings = await botConfigurationService.get(clientId)

    const notification = formatReportStatusNotification(report, botSettings, resolutionDetails)

    if (notification && report.contact?.whatsappJid) {
      try {
        await outboundMessageService.queueText({
          sessionId: report.contact.sessionId,
          recipientJid: report.contact.whatsappJid,
          text: notification,
          sourceType: 'REPORT_STATUS_UPDATE',
          sourceId: report.id,
          metadata: {
            folio: report.folio,
            reviewStatus: report.reviewStatus,
          },
        })
      } catch (error) {
        logger.warn(`Failed to enqueue status update for report ${report.folio}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const mapped = panelAdminService.mapReport(req, report)
    sseService.emit(clientId, 'report:updated', mapped)
    sseService.emit(clientId, 'dashboard:refresh')
    res.json(mapped)
  } catch (error) {
    next(error)
  }
}