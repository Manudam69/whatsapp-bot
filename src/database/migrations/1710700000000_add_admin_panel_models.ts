import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAdminPanelModels1710700000000 implements MigrationInterface {
  name = 'AddAdminPanelModels1710700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bot_configurations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "report_keyword" character varying NOT NULL DEFAULT 'REPORTE',
        "retry_attempts" integer NOT NULL DEFAULT 3,
        "retry_delay_ms" integer NOT NULL DEFAULT 2000,
        "dispatch_window_minutes" integer NOT NULL DEFAULT 12,
        "concurrency_limit" integer NOT NULL DEFAULT 18,
        "operational_group_id" character varying,
        "first_reply_text" text NOT NULL DEFAULT '*ASISTENTE DE REPORTES* Se capturara la informacion *paso a paso*.
      Si deseas cancelar la captura, escribe *CANCELAR*.',
        "first_reply_enabled" boolean NOT NULL DEFAULT true,
        "confirmation_enabled" boolean NOT NULL DEFAULT true,
        "strategy" character varying NOT NULL DEFAULT 'hybrid-automation',
        CONSTRAINT "PK_bot_configurations_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auto_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "content" text NOT NULL,
        "type" character varying NOT NULL DEFAULT 'text',
        "group_ids" jsonb NOT NULL DEFAULT '[]',
        "image_id" uuid,
        CONSTRAINT "PK_auto_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auto_messages_image_id" FOREIGN KEY ("image_id") REFERENCES "media_assets"("id") ON DELETE SET NULL
      )
    `)

    await queryRunner.query(`ALTER TABLE "notification_schedules" ADD COLUMN IF NOT EXISTS "message_template_id" character varying`)
    await queryRunner.query(`ALTER TABLE "incident_reports" ADD COLUMN IF NOT EXISTS "review_status" character varying NOT NULL DEFAULT 'pending'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "incident_reports" DROP COLUMN IF EXISTS "review_status"`)
    await queryRunner.query(`ALTER TABLE "notification_schedules" DROP COLUMN IF EXISTS "message_template_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "auto_messages"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_configurations"`)
  }
}