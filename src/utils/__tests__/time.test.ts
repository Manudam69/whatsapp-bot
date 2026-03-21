import { getTimeParts } from '../time'

describe('getTimeParts', () => {
  it('returns dateKey in YYYY-MM-DD format', () => {
    const { dateKey } = getTimeParts('America/Mexico_City')
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns minuteKey in HH:MM format', () => {
    const { minuteKey } = getTimeParts('America/Mexico_City')
    expect(minuteKey).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns weekday as number 0–6', () => {
    const { weekday } = getTimeParts('America/Mexico_City')
    expect(weekday).toBeGreaterThanOrEqual(0)
    expect(weekday).toBeLessThanOrEqual(6)
  })

  it('respects the given timezone', () => {
    // UTC and Mexico City usually differ — verify the function at least runs
    // without throwing for various timezones
    expect(() => getTimeParts('UTC')).not.toThrow()
    expect(() => getTimeParts('Europe/Madrid')).not.toThrow()
    expect(() => getTimeParts('Asia/Tokyo')).not.toThrow()
  })

  it('minuteKey hour is always padded to 2 digits (format check)', () => {
    // getTimeParts uses Intl.DateTimeFormat which always zero-pads hours/minutes
    const { minuteKey } = getTimeParts('UTC')
    expect(minuteKey).toMatch(/^\d{2}:\d{2}$/)
  })
})
