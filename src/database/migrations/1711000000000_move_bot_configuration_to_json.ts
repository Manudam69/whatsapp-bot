import { MigrationInterface, QueryRunner } from 'typeorm'

export class MoveBotConfigurationToJson1711000000000 implements MigrationInterface {
  name = 'MoveBotConfigurationToJson1711000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bot_configurations"
      ADD COLUMN IF NOT EXISTS "settings" jsonb NOT NULL DEFAULT '{}'::jsonb
    `)

    await queryRunner.query(`
      UPDATE "bot_configurations"
      SET "settings" = jsonb_strip_nulls(jsonb_build_object(
        'reportKeyword', "report_keyword",
        'retryAttempts', "retry_attempts",
        'retryDelayMs', "retry_delay_ms",
        'dispatchWindowMinutes', "dispatch_window_minutes",
        'concurrencyLimit', "concurrency_limit",
        'operationalGroupId', "operational_group_id",
        'firstReplyText', "first_reply_text",
        'firstReplyEnabled', "first_reply_enabled",
        'confirmationEnabled', "confirmation_enabled",
        'reviewedReplyText', '*ACTUALIZACION DE REPORTE*\n\nTu reporte *{{folio}}* ya esta siendo revisado por el equipo.\nTe compartiremos una nueva actualizacion cuando quede resuelto.',
        'resolvedReplyText', '*ACTUALIZACION DE REPORTE*\n\nTu reporte *{{folio}}* fue marcado como resuelto.\nSi el problema continua, responde a este mensaje para dar seguimiento.',
        'strategy', "strategy"
      ))
    `)

    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "report_keyword"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "retry_attempts"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "retry_delay_ms"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "dispatch_window_minutes"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "concurrency_limit"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "operational_group_id"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "first_reply_text"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "first_reply_enabled"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "confirmation_enabled"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "strategy"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "report_keyword" character varying NOT NULL DEFAULT 'REPORTE'`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "retry_attempts" integer NOT NULL DEFAULT 3`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "retry_delay_ms" integer NOT NULL DEFAULT 2000`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "dispatch_window_minutes" integer NOT NULL DEFAULT 12`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "concurrency_limit" integer NOT NULL DEFAULT 18`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "operational_group_id" character varying`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "first_reply_text" text NOT NULL DEFAULT 'Gracias por tu mensaje. Tu reporte fue recibido y enviado al grupo operativo para seguimiento.'`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "first_reply_enabled" boolean NOT NULL DEFAULT true`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "confirmation_enabled" boolean NOT NULL DEFAULT true`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "strategy" character varying NOT NULL DEFAULT 'hybrid-automation'`)

    await queryRunner.query(`
      UPDATE "bot_configurations"
      SET
        "report_keyword" = COALESCE("settings" ->> 'reportKeyword', 'REPORTE'),
        "retry_attempts" = COALESCE(("settings" ->> 'retryAttempts')::integer, 3),
        "retry_delay_ms" = COALESCE(("settings" ->> 'retryDelayMs')::integer, 2000),
        "dispatch_window_minutes" = COALESCE(("settings" ->> 'dispatchWindowMinutes')::integer, 12),
        "concurrency_limit" = COALESCE(("settings" ->> 'concurrencyLimit')::integer, 18),
        "operational_group_id" = NULLIF("settings" ->> 'operationalGroupId', ''),
        "first_reply_text" = COALESCE("settings" ->> 'firstReplyText', 'Gracias por tu mensaje. Tu reporte fue recibido y enviado al grupo operativo para seguimiento.'),
        "first_reply_enabled" = COALESCE(("settings" ->> 'firstReplyEnabled')::boolean, true),
        "confirmation_enabled" = COALESCE(("settings" ->> 'confirmationEnabled')::boolean, true),
        "strategy" = COALESCE("settings" ->> 'strategy', 'hybrid-automation')
    `)

    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "settings"`)
  }
}