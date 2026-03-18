import { User, UserRole } from '@/entities/user.entity'
import { BadRequest, Conflict, NotFound } from '@/middlewares/error_handler'
import { authService } from './auth.service'

type UserPayload = {
  name?: string
  email?: string
  password?: string
  role?: UserRole
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function validateRole(role: string): role is UserRole {
  return role === 'admin' || role === 'agent'
}

export const userService = {
  async list(clientId: string) {
    return User.find({ where: { clientId }, order: { createdAt: 'DESC' } })
  },

  async findById(id: string) {
    const user = await User.findOne({ where: { id } })
    if (!user) {
      throw NotFound('Usuario no encontrado.')
    }

    return user
  },

  async findByEmail(email: string) {
    return User.findOne({ where: { email: normalizeEmail(email) } })
  },

  async create(clientId: string, payload: UserPayload) {
    const name = payload.name?.trim()
    const email = payload.email ? normalizeEmail(payload.email) : ''
    const password = payload.password?.trim() || ''
    const role = payload.role || 'agent'

    if (!name) {
      throw BadRequest('El nombre es obligatorio.')
    }
    if (!email) {
      throw BadRequest('El correo es obligatorio.')
    }
    if (password.length < 6) {
      throw BadRequest('La contraseña debe tener al menos 6 caracteres.')
    }
    if (!validateRole(role)) {
      throw BadRequest('Rol inválido.')
    }

    const existing = await this.findByEmail(email)
    if (existing) {
      throw Conflict('Ya existe un usuario con ese correo.')
    }

    return User.save({
      clientId,
      name,
      email,
      role,
      passwordHash: authService.hashPassword(password),
    })
  },

  async update(id: string, payload: UserPayload, currentUserId?: string) {
    const user = await this.findById(id)

    if (payload.name !== undefined) {
      const nextName = payload.name.trim()
      if (!nextName) {
        throw BadRequest('El nombre es obligatorio.')
      }
      user.name = nextName
    }

    if (payload.email !== undefined) {
      const nextEmail = normalizeEmail(payload.email)
      if (!nextEmail) {
        throw BadRequest('El correo es obligatorio.')
      }

      const existing = await this.findByEmail(nextEmail)
      if (existing && existing.id !== user.id) {
        throw Conflict('Ya existe un usuario con ese correo.')
      }

      user.email = nextEmail
    }

    if (payload.role !== undefined) {
      if (!validateRole(payload.role)) {
        throw BadRequest('Rol inválido.')
      }

      if (user.id === currentUserId && payload.role !== 'admin') {
        throw BadRequest('No puedes quitarte el rol de administrador.')
      }

      user.role = payload.role
    }

    if (payload.password !== undefined && payload.password.trim() !== '') {
      if (payload.password.trim().length < 6) {
        throw BadRequest('La contraseña debe tener al menos 6 caracteres.')
      }
      user.passwordHash = authService.hashPassword(payload.password.trim())
    }

    await user.save()
    return user
  },

  async remove(id: string, currentUserId?: string) {
    const user = await this.findById(id)

    if (user.id === currentUserId) {
      throw BadRequest('No puedes eliminar tu propio usuario.')
    }

    if (user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' } })
      if (adminCount <= 1) {
        throw BadRequest('Debe existir al menos un administrador activo.')
      }
    }

    await user.remove()
    return { success: true }
  },
}