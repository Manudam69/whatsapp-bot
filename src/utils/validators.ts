// Acepta DD/MM/AAAA, DD-MM-AAAA o DD.MM.AAAA con años de 2 o 4 dígitos
const DATE_REGEX = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/

// Acepta HH:MM o HH:MM:SS (24 hrs)
const TIME_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/

export function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) {
    return false
  }
  const parts = value.split(/[\/\-\.]/).map(Number)
  const [day, month, year] = parts
  if (day === undefined || month === undefined || year === undefined) return false
  // Normalize 2-digit year to 4-digit (e.g. 24 → 2024)
  const fullYear = year < 100 ? 2000 + year : year
  // Use Date constructor to validate calendar correctness (e.g. 31/02 or 99/99 are rejected)
  const date = new Date(fullYear, month - 1, day)
  return (
    date.getFullYear() === fullYear &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

export function isValidTime(value: string): boolean {
  if (!TIME_REGEX.test(value)) {
    return false
  }
  const [hours, minutes] = value.split(':').map(Number)
  return (hours as number) >= 0 && (hours as number) <= 23 && (minutes as number) >= 0 && (minutes as number) <= 59
}
