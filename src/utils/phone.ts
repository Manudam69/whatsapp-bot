export function normalizePhoneNumber(value?: string | null) {
  if (!value) {
    return ''
  }

  const digits = value.replace(/\D/g, '')
  return digits || value.trim()
}

export function getPhoneNumberFromJid(jid?: string | null) {
  if (!jid) {
    return ''
  }

  const localPart = jid.split('@')[0] || ''
  const numericPart = localPart.split(':')[0] || localPart
  return normalizePhoneNumber(numericPart)
}