import { MigrationInterface, QueryRunner } from 'typeorm'

export class ReconcileWhatsappGroups1710800000000 implements MigrationInterface {
  name = 'ReconcileWhatsappGroups1710800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_groups"
      ADD COLUMN IF NOT EXISTS "is_member" boolean NOT NULL DEFAULT true
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_groups"
      DROP COLUMN IF EXISTS "is_member"
    `)
  }
}