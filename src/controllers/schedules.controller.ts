import { NextFunction, Request, Response } from 'express'
import { notificationScheduleService } from '@/services/notification_schedule.service'
import { sessionOwnerService } from '@/services/session_owner.service'

export async function listSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const schedules = await notificationScheduleService.list(ownerPhoneNumber)
    res.json(schedules)
  } catch (error) {
    next(error)
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const schedule = await notificationScheduleService.create(ownerPhoneNumber, req.body)
    res.status(201).json(schedule)
  } catch (error) {
    next(error)
  }
}

export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const schedule = await notificationScheduleService.update(ownerPhoneNumber, scheduleId, req.body)
    res.json(schedule)
  } catch (error) {
    next(error)
  }
}

export async function getScheduleHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const history = await notificationScheduleService.listDispatchHistory(ownerPhoneNumber)
    res.json(history)
  } catch (error) {
    next(error)
  }
}