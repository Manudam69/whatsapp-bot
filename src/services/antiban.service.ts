/**
 * AntiBan Service
 * Protects the connected WhatsApp number from bans by enforcing human-like
 * messaging patterns: rate limiting, gaussian jitter, warm-up, and health monitoring.
 */
import { config } from '@/config'
import logger from '@/utils/logger'
import { AppDataSource } from '@/database/datasource'
import { AntiBanWarmUpState } from '@/entities/antiban_warmup_state.entity'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface AntiBanConfig {
  skipWarmUp?: boolean
  rateLimiter?: {
    maxPerMinute?: number
    maxPerHour?: number
    maxPerDay?: number
    minDelayMs?: number
    maxDelayMs?: number
    newChatDelayMs?: number
    maxIdenticalMessages?: number
    burstAllowance?: number
  }
  warmUp?: {
    warmUpDays?: number
    day1Limit?: number
    growthFactor?: number
    inactivityThresholdHours?: number
  }
  health?: {
    disconnectWarningThreshold?: number
    disconnectCriticalThreshold?: number
    failedMessageThreshold?: number
    autoPauseAt?: RiskLevel
    onRiskChange?: (status: HealthStatus) => void
  }
}

export interface HealthStatus {
  risk: RiskLevel
  score: number
  recommendation: string
}

export interface SendDecision {
  allowed: boolean
  delayMs: number
  reason?: string
}

export interface AntiBanStats {
  health: HealthStatus & { isPaused: boolean }
  rateLimiter: {
    sentToday: number
    sentThisHour: number
    sentThisMinute: number
    dailyLimit: number
    hourlyLimit: number
    minuteLimit: number
  }
  warmUp: {
    isActive: boolean
    dayNumber: number
    todayLimit: number
    sentToday: number
  }
}

interface WarmUpState {
  firstMessageAt?: number
  lastMessageAt?: number
  dailyCounts: Record<string, number>
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  maxPerMinute: 8,
  maxPerHour: 200,
  maxPerDay: 1500,
  minDelayMs: 1500,
  maxDelayMs: 5000,
  newChatDelayMs: 3000,
  maxIdenticalMessages: 3,
  burstAllowance: 3,
  warmUpDays: 7,
  day1Limit: 20,
  growthFactor: 1.8,
  inactivityThresholdHours: 72,
  disconnectWarningThreshold: 3,
  disconnectCriticalThreshold: 5,
  failedMessageThreshold: 5,
  autoPauseAt: 'high' as RiskLevel,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gaussian jitter: delay clustered around the middle of [min, max].
 * Uses Box-Muller to produce a normal-ish distribution clamped to the range.
 */
function gaussianDelay(min: number, max: number): number {
  const u = 1 - Math.random()
  const v = Math.random()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  const mid = (min + max) / 2
  const sigma = (max - min) / 6
  return Math.round(Math.max(min, Math.min(max, mid + z * sigma)))
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function hourKey(): string {
  const d = new Date()
  return `${d.toISOString().slice(0, 10)}-${d.getHours()}`
}

function minuteKey(): string {
  const d = new Date()
  return `${d.toISOString().slice(0, 10)}-${d.getHours()}-${d.getMinutes()}`
}

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical']

function riskLevelIndex(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level)
}

// ---------------------------------------------------------------------------
// AntiBan class
// ---------------------------------------------------------------------------

export class AntiBan {
  private readonly cfg: Required<typeof DEFAULTS>
  private readonly onRiskChange?: (status: HealthStatus) => void
  private readonly skipWarmUp: boolean

  // Rate limiter counters: key → count
  private sentCounts: Map<string, number> = new Map()
  // Last N recipients (for new-chat detection)
  private knownRecipients: Set<string> = new Set()
  // Recent identical messages: content → count
  private recentMessages: Map<string, number> = new Map()
  // Burst tracking
  private burstCount = 0
  private lastBurstReset = Date.now()

  // Health tracking (per-hour sliding window — stored as timestamps)
  private disconnectEvents: number[] = []
  private failedMessageEvents: number[] = []
  private currentRisk: RiskLevel = 'low'
  private healthScore = 0
  private isPaused = false

  // Warm-up state
  private warmUpState: WarmUpState

  constructor(config?: AntiBanConfig, savedWarmUpState?: WarmUpState) {
    this.cfg = {
      maxPerMinute: config?.rateLimiter?.maxPerMinute ?? DEFAULTS.maxPerMinute,
      maxPerHour: config?.rateLimiter?.maxPerHour ?? DEFAULTS.maxPerHour,
      maxPerDay: config?.rateLimiter?.maxPerDay ?? DEFAULTS.maxPerDay,
      minDelayMs: config?.rateLimiter?.minDelayMs ?? DEFAULTS.minDelayMs,
      maxDelayMs: config?.rateLimiter?.maxDelayMs ?? DEFAULTS.maxDelayMs,
      newChatDelayMs: config?.rateLimiter?.newChatDelayMs ?? DEFAULTS.newChatDelayMs,
      maxIdenticalMessages: config?.rateLimiter?.maxIdenticalMessages ?? DEFAULTS.maxIdenticalMessages,
      burstAllowance: config?.rateLimiter?.burstAllowance ?? DEFAULTS.burstAllowance,
      warmUpDays: config?.warmUp?.warmUpDays ?? DEFAULTS.warmUpDays,
      day1Limit: config?.warmUp?.day1Limit ?? DEFAULTS.day1Limit,
      growthFactor: config?.warmUp?.growthFactor ?? DEFAULTS.growthFactor,
      inactivityThresholdHours: config?.warmUp?.inactivityThresholdHours ?? DEFAULTS.inactivityThresholdHours,
      disconnectWarningThreshold: config?.health?.disconnectWarningThreshold ?? DEFAULTS.disconnectWarningThreshold,
      disconnectCriticalThreshold: config?.health?.disconnectCriticalThreshold ?? DEFAULTS.disconnectCriticalThreshold,
      failedMessageThreshold: config?.health?.failedMessageThreshold ?? DEFAULTS.failedMessageThreshold,
      autoPauseAt: config?.health?.autoPauseAt ?? DEFAULTS.autoPauseAt,
    }
    this.onRiskChange = config?.health?.onRiskChange
    this.skipWarmUp = config?.skipWarmUp ?? false
    this.warmUpState = savedWarmUpState ?? { dailyCounts: {} }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async beforeSend(recipient: string, content: string): Promise<SendDecision> {
    if (this.isPaused) {
      return { allowed: false, delayMs: 0, reason: 'antiban: sending is paused due to high risk' }
    }

    // Identical message check
    const identicalCount = (this.recentMessages.get(content) ?? 0) + 1
    if (identicalCount > this.cfg.maxIdenticalMessages) {
      return { allowed: false, delayMs: 0, reason: `antiban: identical message blocked after ${this.cfg.maxIdenticalMessages} sends` }
    }

    // Rate limit checks
    const daily = this.getCount(todayKey())
    const hourly = this.getCount(hourKey())
    const minute = this.getCount(minuteKey())

    // Warm-up daily limit
    const warmUpLimit = this.getWarmUpDailyLimit()
    if (warmUpLimit !== null && daily >= warmUpLimit) {
      return { allowed: false, delayMs: 0, reason: `antiban: warm-up daily limit reached (day ${this.getWarmUpDay()}, limit ${warmUpLimit})` }
    }

    if (daily >= this.cfg.maxPerDay) {
      return { allowed: false, delayMs: 0, reason: 'antiban: daily limit reached' }
    }
    if (hourly >= this.cfg.maxPerHour) {
      return { allowed: false, delayMs: 0, reason: 'antiban: hourly limit reached' }
    }
    if (minute >= this.cfg.maxPerMinute) {
      return { allowed: false, delayMs: 0, reason: 'antiban: per-minute limit reached' }
    }

    // Compute delay
    const delayMs = this.computeDelay(recipient, content)

    return { allowed: true, delayMs }
  }

  afterSend(recipient: string, content: string): void {
    this.increment(todayKey())
    this.increment(hourKey())
    this.increment(minuteKey())
    this.knownRecipients.add(recipient)

    // Track identical messages (reset after a different message)
    const prev = this.recentMessages.get(content) ?? 0
    this.recentMessages.set(content, prev + 1)

    // Update warm-up daily count
    const key = todayKey()
    this.warmUpState.dailyCounts[key] = (this.warmUpState.dailyCounts[key] ?? 0) + 1
    this.warmUpState.lastMessageAt = Date.now()
    if (!this.warmUpState.firstMessageAt) {
      this.warmUpState.firstMessageAt = Date.now()
    }
  }

  afterSendFailed(errorMessage: string): void {
    const now = Date.now()
    this.failedMessageEvents.push(now)
    this.recalculateHealth()

    // Detect 403 / 401 patterns from error strings
    if (/403|forbidden/i.test(errorMessage)) {
      this.healthScore = Math.min(100, this.healthScore + 40)
      this.evaluateRiskLevel()
    } else if (/401|logged.?out/i.test(errorMessage)) {
      this.healthScore = Math.min(100, this.healthScore + 60)
      this.evaluateRiskLevel()
    }
  }

  onDisconnect(statusCode?: number): void {
    const now = Date.now()
    this.disconnectEvents.push(now)

    if (statusCode === 403) {
      this.healthScore = Math.min(100, this.healthScore + 40)
    } else if (statusCode === 401) {
      this.healthScore = Math.min(100, this.healthScore + 60)
    }

    this.recalculateHealth()
  }

  onReconnect(): void {
    // Slight recovery on successful reconnect
    this.healthScore = Math.max(0, this.healthScore - 5)
    this.evaluateRiskLevel()
  }

  pause(): void {
    this.isPaused = true
    logger.warn('[antiban] Sending PAUSED manually')
  }

  resume(): void {
    this.isPaused = false
    logger.info('[antiban] Sending RESUMED')
  }

  reset(): void {
    this.healthScore = 0
    this.disconnectEvents = []
    this.failedMessageEvents = []
    this.recentMessages.clear()
    this.burstCount = 0
    this.isPaused = false
    const prev = this.currentRisk
    this.currentRisk = 'low'
    logger.info('[antiban] State RESET')
    if (prev !== 'low') {
      this.onRiskChange?.({ risk: 'low', score: 0, recommendation: 'Sistema reiniciado. Operando normalmente.' })
    }
  }

  getStats(): AntiBanStats {
    const warmUpDay = this.getWarmUpDay()
    const warmUpLimit = this.getWarmUpDailyLimit()
    const isWarmUpActive = warmUpLimit !== null

    return {
      health: {
        risk: this.currentRisk,
        score: this.healthScore,
        recommendation: this.getRecommendation(),
        isPaused: this.isPaused,
      },
      rateLimiter: {
        sentToday: this.getCount(todayKey()),
        sentThisHour: this.getCount(hourKey()),
        sentThisMinute: this.getCount(minuteKey()),
        dailyLimit: isWarmUpActive && warmUpLimit !== null ? warmUpLimit : this.cfg.maxPerDay,
        hourlyLimit: this.cfg.maxPerHour,
        minuteLimit: this.cfg.maxPerMinute,
      },
      warmUp: {
        isActive: isWarmUpActive,
        dayNumber: warmUpDay,
        todayLimit: warmUpLimit ?? this.cfg.maxPerDay,
        sentToday: this.warmUpState.dailyCounts[todayKey()] ?? 0,
      },
    }
  }

  exportWarmUpState(): WarmUpState {
    return { ...this.warmUpState, dailyCounts: { ...this.warmUpState.dailyCounts } }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private computeDelay(recipient: string, content: string): number {
    const now = Date.now()

    // Reset burst window every minute
    if (now - this.lastBurstReset > 60_000) {
      this.burstCount = 0
      this.lastBurstReset = now
    }

    // Within burst allowance: much shorter delay
    if (this.burstCount < this.cfg.burstAllowance) {
      this.burstCount++
      return gaussianDelay(Math.floor(this.cfg.minDelayMs / 2), this.cfg.minDelayMs)
    }

    let delay = gaussianDelay(this.cfg.minDelayMs, this.cfg.maxDelayMs)

    // Typing simulation: +30ms per character (capped at 3s extra)
    const typingExtra = Math.min(content.length * 30, 3000)
    delay += typingExtra

    // New chat penalty
    if (!this.knownRecipients.has(recipient)) {
      delay += this.cfg.newChatDelayMs
    }

    return delay
  }

  private getCount(key: string): number {
    return this.sentCounts.get(key) ?? 0
  }

  private increment(key: string): void {
    this.sentCounts.set(key, (this.sentCounts.get(key) ?? 0) + 1)
  }

  private getWarmUpDay(): number {
    if (!this.warmUpState.firstMessageAt) return 1
    const elapsed = Date.now() - this.warmUpState.firstMessageAt

    // Re-enter warm-up if inactive for threshold
    const lastAt = this.warmUpState.lastMessageAt ?? this.warmUpState.firstMessageAt
    const inactiveHours = (Date.now() - lastAt) / 3_600_000
    if (inactiveHours >= this.cfg.inactivityThresholdHours) {
      this.warmUpState.firstMessageAt = Date.now()
      return 1
    }

    return Math.floor(elapsed / 86_400_000) + 1
  }

  private getWarmUpDailyLimit(): number | null {
    if (this.skipWarmUp) return null
    const day = this.getWarmUpDay()
    if (day > this.cfg.warmUpDays) return null
    // day1Limit * growthFactor^(day-1)
    return Math.floor(this.cfg.day1Limit * Math.pow(this.cfg.growthFactor, day - 1))
  }

  private pruneOldEvents(): void {
    const oneHourAgo = Date.now() - 3_600_000
    this.disconnectEvents = this.disconnectEvents.filter((t) => t > oneHourAgo)
    this.failedMessageEvents = this.failedMessageEvents.filter((t) => t > oneHourAgo)
  }

  private recalculateHealth(): void {
    this.pruneOldEvents()

    const disconnects = this.disconnectEvents.length
    const failures = this.failedMessageEvents.length

    let score = 0

    if (disconnects >= this.cfg.disconnectCriticalThreshold) {
      score += 30
    } else if (disconnects >= this.cfg.disconnectWarningThreshold) {
      score += 15
    }

    if (failures >= this.cfg.failedMessageThreshold) {
      score += 20
    }

    // Merge with existing score (take the higher to be conservative)
    this.healthScore = Math.max(score, this.healthScore)
    // Natural decay: reduce by 2 per recalculation when no new events
    if (disconnects === 0 && failures === 0) {
      this.healthScore = Math.max(0, this.healthScore - 2)
    }

    this.evaluateRiskLevel()
  }

  private evaluateRiskLevel(): void {
    const prev = this.currentRisk
    let next: RiskLevel

    if (this.healthScore >= 85) {
      next = 'critical'
    } else if (this.healthScore >= 60) {
      next = 'high'
    } else if (this.healthScore >= 30) {
      next = 'medium'
    } else {
      next = 'low'
    }

    if (next !== prev) {
      this.currentRisk = next
      const status: HealthStatus = { risk: next, score: this.healthScore, recommendation: this.getRecommendation() }
      this.onRiskChange?.(status)

      // Auto-pause if risk reaches or exceeds configured threshold
      if (riskLevelIndex(next) >= riskLevelIndex(this.cfg.autoPauseAt) && !this.isPaused) {
        this.isPaused = true
        logger.warn(`[antiban] Auto-paused at risk level "${next}" (score=${this.healthScore}). ${this.getRecommendation()}`)
      }
    }
  }

  private getRecommendation(): string {
    switch (this.currentRisk) {
      case 'low':
        return 'Operando normalmente.'
      case 'medium':
        return 'Reduce la frecuencia de envío al 50%. Verifica los registros de errores.'
      case 'high':
        return 'Reduce el envío al 80%. Considera pausar las notificaciones programadas temporalmente.'
      case 'critical':
        return '¡DETÉN EL ENVÍO INMEDIATAMENTE! El número está en riesgo de baneo. Espera al menos 24 horas.'
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton with warm-up state persistence (database-backed)
// ---------------------------------------------------------------------------

async function loadWarmUpState(): Promise<WarmUpState | undefined> {
  try {
    const repo = AppDataSource.getRepository(AntiBanWarmUpState)
    const row = await repo.findOne({ where: {} })
    if (!row) return undefined
    return {
      firstMessageAt: row.firstMessageAt,
      lastMessageAt: row.lastMessageAt,
      dailyCounts: row.dailyCounts ?? {},
    }
  } catch (err) {
    logger.warn(`[antiban] No se pudo cargar el estado de warm-up desde la base de datos: ${err}`)
    return undefined
  }
}

async function saveWarmUpState(state: WarmUpState): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(AntiBanWarmUpState)
    let row = await repo.findOne({ where: {} })
    if (!row) {
      row = repo.create()
    }
    row.firstMessageAt = state.firstMessageAt
    row.lastMessageAt = state.lastMessageAt
    row.dailyCounts = state.dailyCounts
    await repo.save(row)
  } catch (err) {
    logger.warn(`[antiban] No se pudo persistir el estado de warm-up: ${err}`)
  }
}

export let antibanService: AntiBan

export async function initAntibanService(): Promise<void> {
  const savedState = await loadWarmUpState()

  antibanService = new AntiBan(
    {
      skipWarmUp: config.ANTIBAN_SKIP_WARMUP,
      rateLimiter: {
        maxPerMinute: 8,
        maxPerHour: 200,
        maxPerDay: 1500,
        minDelayMs: 2000,
        maxDelayMs: 6000,
        newChatDelayMs: 3000,
        maxIdenticalMessages: 3,
        burstAllowance: 2,
      },
      warmUp: {
        warmUpDays: 7,
        day1Limit: 20,
        growthFactor: 1.8,
        inactivityThresholdHours: 72,
      },
      health: {
        disconnectWarningThreshold: 3,
        disconnectCriticalThreshold: 5,
        failedMessageThreshold: 5,
        autoPauseAt: 'high',
        onRiskChange: (status) => {
          if (status.risk === 'critical' || status.risk === 'high') {
            logger.warn(`[antiban] Riesgo: ${status.risk} (score=${status.score}) — ${status.recommendation}`)
          } else {
            logger.info(`[antiban] Riesgo cambiado a ${status.risk} (score=${status.score})`)
          }
          void saveWarmUpState(antibanService.exportWarmUpState())
        },
      },
    },
    savedState,
  )

  // Persist warm-up state every 5 minutes
  setInterval(() => {
    void saveWarmUpState(antibanService.exportWarmUpState())
  }, 5 * 60 * 1000)

  logger.info('[antiban] Servicio inicializado con estado desde la base de datos')
}
