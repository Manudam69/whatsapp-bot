import { Container, TOKENS } from '../container'

describe('Container', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  it('registers and resolves a service', () => {
    const token = Symbol('TestService')
    const service = { greet: () => 'hello' }

    container.register(token, () => service)

    expect(container.resolve(token)).toBe(service)
  })

  it('calls the factory only once (singleton)', () => {
    const token = Symbol('Singleton')
    const factory = jest.fn(() => ({ value: Math.random() }))

    container.register(token, factory)
    container.resolve(token)
    container.resolve(token)

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('throws when resolving an unregistered token', () => {
    const token = Symbol('Unknown')
    expect(() => container.resolve(token)).toThrow(/not registered/)
  })

  it('throws when registering the same token twice', () => {
    const token = Symbol('Duplicate')
    container.register(token, () => ({}))
    expect(() => container.register(token, () => ({}))).toThrow(/already registered/)
  })

  it('overrides an existing registration', () => {
    const token = Symbol('Overridable')
    container.register(token, () => ({ version: 1 }))
    container.override(token, () => ({ version: 2 }))

    expect(container.resolve<{ version: number }>(token).version).toBe(2)
  })

  it('resolves different services by their tokens', () => {
    const tokenA = Symbol('A')
    const tokenB = Symbol('B')
    container.register(tokenA, () => 'service-a')
    container.register(tokenB, () => 'service-b')

    expect(container.resolve(tokenA)).toBe('service-a')
    expect(container.resolve(tokenB)).toBe('service-b')
  })
})

describe('TOKENS', () => {
  it('each token is a unique symbol', () => {
    const values = Object.values(TOKENS)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it('covers core services', () => {
    expect(TOKENS.InboundMessageService).toBeDefined()
    expect(TOKENS.OutboundMessageService).toBeDefined()
    expect(TOKENS.ReportService).toBeDefined()
    expect(TOKENS.AuthService).toBeDefined()
  })
})
