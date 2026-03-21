import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRateLimitedCountToNotificationDispatches1711700000000 implements MigrationInterface {
  name = 'AddRateLimitedCountToNotificationDispatches1711700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_dispatches" ADD COLUMN IF NOT EXISTS "rate_limited_count" integer NOT NULL DEFAULT 0`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_dispatches" DROP COLUMN IF EXISTS "rate_limited_count"`)
  }
}
