import { NextFunction, Request, Response } from 'express'
import { reportService } from '@/services/report.service'
import { panelAdminService } from '@/services/panel_admin.service'

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
    const status = String(req.body?.status || 'pending') as 'pending' | 'reviewed' | 'resolved'
    const report = await reportService.setReviewStatus(reportId, status)
    res.json(panelAdminService.mapReport(req, report))
  } catch (error) {
    next(error)
  }
}