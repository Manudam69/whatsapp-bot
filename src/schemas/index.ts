import { z } from 'zod'

// ─── Auth ────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.email({ error: 'Correo inválido' }),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
})

// ─── Users ───────────────────────────────────────────────────────────────────

export const CreateUserSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  email: z.email({ error: 'Correo inválido' }),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  role: z.enum(['admin', 'agent'], { message: 'Rol inválido, debe ser admin o agent' }),
})

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.email({ error: 'Correo inválido' }).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'agent']).optional(),
})

// ─── Schedules ───────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

export const CreateScheduleSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(150),
  messageIds: z.array(z.uuid()).default([]),
  groupIds: z.array(z.string()).default([]),
  days: z
    .array(z.enum(DAYS_OF_WEEK, { message: 'Día inválido' }))
    .min(1, 'Selecciona al menos un día'),
  // Explicit HH:MM range: hours 00–23, minutes 00–59
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener formato HH:MM (00:00–23:59)').default('08:00'),
  isActive: z.boolean().optional(),
})

export const UpdateScheduleSchema = CreateScheduleSchema

// ─── Reports ─────────────────────────────────────────────────────────────────

export const UpdateReportSchema = z
  .object({
    status: z.enum(['pending', 'reviewed', 'resolved'], { message: 'Estado inválido' }),
    resolutionDetails: z.string().max(1000).optional(),
  })
  .refine(
    (data) => data.status !== 'resolved' || (data.resolutionDetails && data.resolutionDetails.trim().length > 0),
    { message: 'Debes capturar el detalle de la resolución para marcar el reporte como resuelto.', path: ['resolutionDetails'] },
  )

export const ArchiveReportSchema = z.object({
  isArchived: z.boolean(),
})

// ─── Params ──────────────────────────────────────────────────────────────────

export const UuidParamSchema = z.object({
  id: z.uuid({ error: 'El id debe ser un UUID válido' }),
})
