import { Column, Entity } from 'typeorm'
import { EntityBase } from './entity.base'

const bigintTransformer = {
  to: (v: number | null | undefined) => v ?? null,
  from: (v: string | null) => (v != null ? Number(v) : undefined),
}

@Entity({ name: 'antiban_warmup_state' })
export class AntiBanWarmUpState extends EntityBase {
  @Column({ name: 'first_message_at', type: 'bigint', nullable: true, transformer: bigintTransformer })
  firstMessageAt: number | undefined

  @Column({ name: 'last_message_at', type: 'bigint', nullable: true, transformer: bigintTransformer })
  lastMessageAt: number | undefined

  @Column({ name: 'daily_counts', type: 'jsonb', default: () => "'{}'::jsonb" })
  dailyCounts: Record<string, number>
}
