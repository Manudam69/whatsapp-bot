/**
 * Lightweight service container for dependency injection.
 *
 * Services are registered once at bootstrap and resolved by token.
 * This makes dependencies explicit and swappable — useful for testing
 * (register mock implementations before resolving) and for understanding
 * the dependency graph at a glance.
 *
 * Usage:
 *   container.register(TOKENS.MyService, () => new MyService(dep1, dep2))
 *   const svc = container.resolve<MyService>(TOKENS.MyService)
 *
 * For testing, create a fresh Container instance and register mocks:
 *   const testContainer = new Container()
 *   testContainer.register(TOKENS.ReportService, () => mockReportService)
 */

export class Container {
  private readonly registry = new Map<symbol, unknown>()

  register<T>(token: symbol, factory: () => T): void {
    if (this.registry.has(token)) {
      throw new Error(`Service already registered: ${String(token)}`)
    }
    this.registry.set(token, factory())
  }

  resolve<T>(token: symbol): T {
    const service = this.registry.get(token)
    if (service === undefined) {
      throw new Error(`Service not registered: ${String(token)}`)
    }
    return service as T
  }

  /** Replace an existing registration (useful in tests). */
  override<T>(token: symbol, factory: () => T): void {
    this.registry.set(token, factory())
  }
}

/** Tokens for each service. Add a token here whenever a new service is created. */
export const TOKENS = {
  InboundMessageService: Symbol('InboundMessageService'),
  OutboundMessageService: Symbol('OutboundMessageService'),
  ReportService: Symbol('ReportService'),
  BotConfigurationService: Symbol('BotConfigurationService'),
  GroupService: Symbol('GroupService'),
  WhatsappIdentityService: Symbol('WhatsappIdentityService'),
  SseService: Symbol('SseService'),
  SchedulerService: Symbol('SchedulerService'),
  AntibanService: Symbol('AntibanService'),
  AuthService: Symbol('AuthService'),
  UserService: Symbol('UserService'),
} as const

/** Application-wide container instance. */
export const container = new Container()
