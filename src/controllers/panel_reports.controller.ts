import { NextFunction, Request, Response } from 'express'
import { formatReportStatusNotification, reportService } from '@/services/report.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { outboundMessageService } from '@/services/outbound_message.service'
import logger from '@/utils/logger'
import { IncidentReport } from '@/entities/incident_report.entity'

function isValidReviewStatus(value: string): value is IncidentReport['reviewStatus'] {
  return value === 'pending' || value === 'reviewed' || value === 'resolved'
}

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const reports = await reportService.list()
    res.json(reports.map((report) => panelAdminService.mapReport(req, report)))
  } catch (error) {
    next(error)
  }
}

export async function updateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const requestedStatus = String(req.body?.status || 'pending')
    const status: IncidentReport['reviewStatus'] = isValidReviewStatus(requestedStatus) ? requestedStatus : 'pending'
    const report = await reportService.setReviewStatus(reportId, status)

    const notification = formatReportStatusNotification(report)

    if (notification && report.contact?.whatsappJid) {
      try {
        await outboundMessageService.queueText({
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

    res.json(panelAdminService.mapReport(req, report))
  } catch (error) {
    next(error)
  }
}