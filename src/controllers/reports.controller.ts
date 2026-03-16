import { NextFunction, Request, Response } from 'express'
import { NotFound } from '@/middlewares/error_handler'
import { reportService } from '@/services/report.service'
import { sessionOwnerService } from '@/services/session_owner.service'

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const reports = await reportService.list(ownerPhoneNumber)
    res.json(reports)
  } catch (error) {
    next(error)
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const report = await reportService.findById(ownerPhoneNumber, reportId)
    if (!report) {
      throw NotFound('Reporte no encontrado.')
    }
    res.json(report)
  } catch (error) {
    next(error)
  }
}