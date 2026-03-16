import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { EntityBase } from './entity.base'
import { MediaAsset } from './media_asset.entity'

export type AutoMessageType = 'text' | 'image'

@Entity({ name: 'auto_messages' })
export class AutoMessage extends EntityBase {
  @Column()
  name: string

  @Column({ type: 'text' })
  content: string

  @Column({ default: 'text' })
  type: AutoMessageType

  @Column({ name: 'group_ids', type: 'jsonb', default: () => "'[]'" })
  groupIds: string[]

  @ManyToOne(() => MediaAsset, { eager: true, nullable: true })
  @JoinColumn({ name: 'image_id' })
  image?: MediaAsset | null
}