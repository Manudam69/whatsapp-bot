import { Column, Entity } from 'typeorm'
import { EntityBase } from './entity.base'

@Entity({ name: 'media_assets' })
export class MediaAsset extends EntityBase {
  @Column()
  name: string

  @Column({ nullable: true })
  category?: string

  @Column({ name: 'file_name' })
  fileName: string

  @Column({ name: 'file_path' })
  filePath: string

  @Column({ name: 'mime_type' })
  mimeType: string

  @Column({ name: 'public_url' })
  publicUrl: string

  @Column({ name: 'is_active', default: true })
  isActive: boolean
}