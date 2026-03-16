import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import jwt, { SignOptions } from 'jsonwebtoken'
import { config } from '@/config'
import { User } from '@/entities/user.entity'
import { BadRequest, Unauthorized } from '@/middlewares/error_handler'

const KEY_LENGTH = 64

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function sanitizeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

export const authService = {
  sanitizeUser,

  hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
    return `${salt}:${hash}`
  },

  verifyPassword(password: string, passwordHash: string) {
    const [salt, storedHash] = passwordHash.split(':')
    if (!salt || !storedHash) {
      return false
    }

    const derived = scryptSync(password, salt, KEY_LENGTH)
    const stored = Buffer.from(storedHash, 'hex')

    if (stored.length !== derived.length) {
      return false
    }

    return timingSafeEqual(stored, derived)
  },

  signToken(user: User) {
    const options: SignOptions = { expiresIn: config.AUTH.TOKEN_EXPIRES_IN as SignOptions['expiresIn'] }
    return jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.AUTH.JWT_SECRET, options)
  },

  async verifyToken(token: string) {
    try {
      const payload = jwt.verify(token, config.AUTH.JWT_SECRET) as jwt.JwtPayload
      const userId = typeof payload.sub === 'string' ? payload.sub : ''
      if (!userId) {
        throw Unauthorized('Token inválido.')
      }

      const user = await User.findOne({ where: { id: userId } })
      if (!user) {
        throw Unauthorized('La sesión ya no es válida.')
      }

      return user
    } catch (error) {
      if (error instanceof Error) {
        throw Unauthorized('Token inválido o expirado.')
      }
      throw error
    }
  },

  async login(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail || !password) {
      throw BadRequest('Correo y contraseña son obligatorios.')
    }

    const user = await User.findOne({ where: { email: normalizedEmail } })
    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw Unauthorized('Credenciales inválidas.')
    }

    return {
      token: this.signToken(user),
      user: sanitizeUser(user),
    }
  },

  async changePassword(user: User, currentPassword: string, newPassword: string) {
    if (!currentPassword || !newPassword) {
      throw BadRequest('La contraseña actual y la nueva son obligatorias.')
    }
    if (!this.verifyPassword(currentPassword, user.passwordHash)) {
      throw Unauthorized('La contraseña actual es incorrecta.')
    }
    if (newPassword.trim().length < 6) {
      throw BadRequest('La nueva contraseña debe tener al menos 6 caracteres.')
    }

    user.passwordHash = this.hashPassword(newPassword.trim())
    await user.save()

    return { success: true }
  },

  async ensureDefaultAdminUser() {
    const email = normalizeEmail(config.AUTH.DEFAULT_ADMIN_EMAIL)
    const existing = await User.findOne({ where: { email } })
    if (existing) {
      return existing
    }

    return User.save({
      name: config.AUTH.DEFAULT_ADMIN_NAME,
      email,
      role: 'admin',
      passwordHash: this.hashPassword(config.AUTH.DEFAULT_ADMIN_PASSWORD),
    })
  },
}