import { NextFunction, Request, Response } from 'express'
import { NotFound } from '@/middlewares/error_handler'
import { reportService } from '@/services/report.service'

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const reports = await reportService.list(clientId)
    res.json(reports)
  } catch (error) {
    next(error)
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const report = await reportService.findById(clientId, reportId)
    if (!report) {
      throw NotFound('Reporte no encontrado.')
    }
    res.json(report)
  } catch (error) {
    next(error)
  }
}