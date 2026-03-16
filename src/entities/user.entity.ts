import { Column, Entity } from 'typeorm'
import { EntityBase } from './entity.base'

export type UserRole = 'admin' | 'viewer'

@Entity({ name: 'users' })
export class User extends EntityBase {
  @Column()
  name: string

  @Column({ unique: true })
  email: string

  @Column({ name: 'password_hash' })
  passwordHash: string

  @Column({ default: 'viewer' })
  role: UserRole
}