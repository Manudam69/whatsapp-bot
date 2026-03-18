import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMessageTemplateIdsToSchedules1711400000000 implements MigrationInterface {
  name = 'AddMessageTemplateIdsToSchedules1711400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_schedules"
        ADD COLUMN IF NOT EXISTS "message_template_ids" jsonb NOT NULL DEFAULT '[]'
    `)

    await queryRunner.query(`
      UPDATE "notification_schedules"
        SET "message_template_ids" = jsonb_build_array("message_template_id")
        WHERE "message_template_id" IS NOT NULL
          AND "message_template_ids" = '[]'::jsonb
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_schedules"
        DROP COLUMN IF EXISTS "message_template_ids"
    `)
  }
}
