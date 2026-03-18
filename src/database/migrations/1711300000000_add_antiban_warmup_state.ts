import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAntiBanWarmUpState1711300000000 implements MigrationInterface {
  name = 'AddAntiBanWarmUpState1711300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "antiban_warmup_state" (
        "id"               uuid        NOT NULL DEFAULT gen_random_uuid(),
        "first_message_at" bigint,
        "last_message_at"  bigint,
        "daily_counts"     jsonb       NOT NULL DEFAULT '{}',
        "created_at"       TIMESTAMP   NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_antiban_warmup_state" PRIMARY KEY ("id")
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "antiban_warmup_state"`)
  }
}
