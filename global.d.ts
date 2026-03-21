import { Handler } from 'express'
import { User } from '@/entities/user.entity'

declare global {
  type RestController = {
    GET?: Handler | Handler[]
    POST?: Handler | Handler[]
    PUT?: Handler | Handler[]
    DELETE?: Handler | Handler[]
    PATCH?: Handler | Handler[]
    HEAD?: Handler | Handler[]
    OPTIONS?: Handler | Handler[]
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: User
      requestId?: string
    }
  }
}

export {}