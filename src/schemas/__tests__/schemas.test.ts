import {
  LoginSchema,
  ChangePasswordSchema,
  CreateUserSchema,
  UpdateUserSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  UpdateReportSchema,
  ArchiveReportSchema,
  UuidParamSchema,
} from '../index'

// ─── LoginSchema ─────────────────────────────────────────────────────────────

describe('LoginSchema', () => {
  it('accepts valid credentials', () => {
    expect(LoginSchema.safeParse({ email: 'user@example.com', password: 'secret' }).success).toBe(true)
  })

  it('rejects invalid email', () => {
    expect(LoginSchema.safeParse({ email: 'not-an-email', password: 'secret' }).success).toBe(false)
  })

  it('rejects empty password', () => {
    expect(LoginSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(LoginSchema.safeParse({}).success).toBe(false)
  })
})

// ─── ChangePasswordSchema ────────────────────────────────────────────────────

describe('ChangePasswordSchema', () => {
  it('accepts valid passwords', () => {
    expect(ChangePasswordSchema.safeParse({ currentPassword: 'old123', newPassword: 'newpass1' }).success).toBe(true)
  })

  it('rejects new password shorter than 6 characters', () => {
    const result = ChangePasswordSchema.safeParse({ currentPassword: 'old123', newPassword: 'abc' })
    expect(result.success).toBe(false)
  })

  it('rejects empty current password', () => {
    expect(ChangePasswordSchema.safeParse({ currentPassword: '', newPassword: 'newpass1' }).success).toBe(false)
  })
})

// ─── CreateUserSchema ────────────────────────────────────────────────────────

describe('CreateUserSchema', () => {
  const valid = { name: 'Test User', email: 'user@test.com', password: 'pass123', role: 'agent' as const }

  it('accepts valid user payload', () => {
    expect(CreateUserSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts admin role', () => {
    expect(CreateUserSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(true)
  })

  it('rejects unknown role', () => {
    expect(CreateUserSchema.safeParse({ ...valid, role: 'superuser' }).success).toBe(false)
  })

  it('rejects empty name', () => {
    expect(CreateUserSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })

  it('rejects invalid email', () => {
    expect(CreateUserSchema.safeParse({ ...valid, email: 'bad-email' }).success).toBe(false)
  })

  it('rejects password shorter than 6 characters', () => {
    expect(CreateUserSchema.safeParse({ ...valid, password: 'abc' }).success).toBe(false)
  })
})

// ─── UpdateUserSchema ────────────────────────────────────────────────────────

describe('UpdateUserSchema', () => {
  it('accepts partial updates', () => {
    expect(UpdateUserSchema.safeParse({ name: 'New Name' }).success).toBe(true)
    expect(UpdateUserSchema.safeParse({ role: 'admin' }).success).toBe(true)
    expect(UpdateUserSchema.safeParse({}).success).toBe(true)
  })

  it('rejects invalid email when provided', () => {
    expect(UpdateUserSchema.safeParse({ email: 'not-valid' }).success).toBe(false)
  })

  it('rejects invalid role when provided', () => {
    expect(UpdateUserSchema.safeParse({ role: 'god' }).success).toBe(false)
  })
})

// ─── CreateScheduleSchema ────────────────────────────────────────────────────

describe('CreateScheduleSchema', () => {
  const valid = { name: 'Morning Report', days: ['monday', 'tuesday', 'wednesday'], time: '08:00' }

  it('accepts valid schedule', () => {
    expect(CreateScheduleSchema.safeParse(valid).success).toBe(true)
  })

  it('defaults messageIds and groupIds to empty arrays', () => {
    const result = CreateScheduleSchema.safeParse(valid)
    expect(result.success && result.data.messageIds).toEqual([])
    expect(result.success && result.data.groupIds).toEqual([])
  })

  it('rejects empty name', () => {
    expect(CreateScheduleSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })

  it('rejects empty days array', () => {
    expect(CreateScheduleSchema.safeParse({ ...valid, days: [] }).success).toBe(false)
  })

  it('rejects invalid day names', () => {
    expect(CreateScheduleSchema.safeParse({ ...valid, days: ['miercoles'] }).success).toBe(false)
    expect(CreateScheduleSchema.safeParse({ ...valid, days: ['1'] }).success).toBe(false)
  })

  it('rejects malformed time', () => {
    expect(CreateScheduleSchema.safeParse({ ...valid, time: '8:00' }).success).toBe(false)
    expect(CreateScheduleSchema.safeParse({ ...valid, time: '25:00' }).success).toBe(false)
    expect(CreateScheduleSchema.safeParse({ ...valid, time: 'morning' }).success).toBe(false)
  })

  it('accepts all valid day names', () => {
    const result = CreateScheduleSchema.safeParse({ ...valid, days: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] })
    expect(result.success).toBe(true)
  })
})

// ─── UpdateReportSchema ──────────────────────────────────────────────────────

describe('UpdateReportSchema', () => {
  it('accepts pending status', () => {
    expect(UpdateReportSchema.safeParse({ status: 'pending' }).success).toBe(true)
  })

  it('accepts reviewed status', () => {
    expect(UpdateReportSchema.safeParse({ status: 'reviewed' }).success).toBe(true)
  })

  it('accepts resolved status with resolutionDetails', () => {
    expect(UpdateReportSchema.safeParse({ status: 'resolved', resolutionDetails: 'Fixed the issue' }).success).toBe(true)
  })

  it('rejects resolved status without resolutionDetails', () => {
    const result = UpdateReportSchema.safeParse({ status: 'resolved' })
    expect(result.success).toBe(false)
  })

  it('rejects resolved status with empty resolutionDetails', () => {
    const result = UpdateReportSchema.safeParse({ status: 'resolved', resolutionDetails: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown status', () => {
    expect(UpdateReportSchema.safeParse({ status: 'deleted' }).success).toBe(false)
  })
})

// ─── ArchiveReportSchema ─────────────────────────────────────────────────────

describe('ArchiveReportSchema', () => {
  it('accepts true', () => {
    expect(ArchiveReportSchema.safeParse({ isArchived: true }).success).toBe(true)
  })

  it('accepts false', () => {
    expect(ArchiveReportSchema.safeParse({ isArchived: false }).success).toBe(true)
  })

  it('rejects string "true"', () => {
    expect(ArchiveReportSchema.safeParse({ isArchived: 'true' }).success).toBe(false)
  })

  it('rejects missing field', () => {
    expect(ArchiveReportSchema.safeParse({}).success).toBe(false)
  })
})

// ─── UuidParamSchema ─────────────────────────────────────────────────────────

describe('UuidParamSchema', () => {
  it('accepts a valid UUID v4', () => {
    expect(UuidParamSchema.safeParse({ id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }).success).toBe(true)
  })

  it('rejects a plain string', () => {
    expect(UuidParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects missing id', () => {
    expect(UuidParamSchema.safeParse({}).success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(UuidParamSchema.safeParse({ id: '' }).success).toBe(false)
  })
})
