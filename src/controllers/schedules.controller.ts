import { NextFunction, Request, Response } from 'express'
import { notificationScheduleService } from '@/services/notification_schedule.service'

export async function listSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const schedules = await notificationScheduleService.list(clientId)
    res.json(schedules)
  } catch (error) {
    next(error)
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const schedule = await notificationScheduleService.create(clientId, req.body)
    res.status(201).json(schedule)
  } catch (error) {
    next(error)
  }
}

export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const schedule = await notificationScheduleService.update(clientId, scheduleId, req.body)
    res.json(schedule)
  } catch (error) {
    next(error)
  }
}

export async function getScheduleHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const history = await notificationScheduleService.listDispatchHistory(clientId)
    res.json(history)
  } catch (error) {
    next(error)
  }
}