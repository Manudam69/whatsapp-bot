export type ParsedIncidentReport = {
  serviceName: string
  incidentDate: string
  incidentTime: string
  incidentText: string
}

function cleanValue(value: string) {
  return value.trim().replace(/^[-:*\s]+/, '').trim()
}

function parseLabeledMessage(input: string): ParsedIncidentReport | null {
  const serviceMatch = input.match(/servicio\s*[:=-]\s*(.+)/i)
  const dateMatch = input.match(/fecha\s*[:=-]\s*(.+)/i)
  const timeMatch = input.match(/hora\s*[:=-]\s*(.+)/i)
  const incidentMatch = input.match(/(?:reporte(?:\s+de\s+incidencia)?|incidencia)\s*[:=-]\s*([\s\S]+)/i)

  if (!serviceMatch || !dateMatch || !timeMatch || !incidentMatch) {
    return null
  }

  return {
    serviceName: cleanValue(serviceMatch[1]),
    incidentDate: cleanValue(dateMatch[1]),
    incidentTime: cleanValue(timeMatch[1]),
    incidentText: cleanValue(incidentMatch[1]),
  }
}

function parseCommaSeparatedMessage(input: string): ParsedIncidentReport | null {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 4) {
    return null
  }

  return {
    serviceName: parts[0],
    incidentDate: parts[1],
    incidentTime: parts[2],
    incidentText: parts.slice(3).join(', '),
  }
}

export const reportParserService = {
  parse(input: string): ParsedIncidentReport | null {
    return parseLabeledMessage(input) || parseCommaSeparatedMessage(input)
  },
}