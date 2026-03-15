import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddOutboundMessages1710500000000 implements MigrationInterface {
  name = 'AddOutboundMessages1710500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outbound_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "recipient_jid" character varying NOT NULL,
        "message_type" character varying NOT NULL,
        "message_text" text,
        "media_file_path" character varying,
        "caption" text,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 3,
        "retry_delay_ms" integer NOT NULL DEFAULT 1500,
        "last_attempt_at" TIMESTAMP WITH TIME ZONE,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "error_message" text,
        "source_type" character varying NOT NULL DEFAULT 'FLOW_REPLY',
        "source_id" character varying,
        "metadata" jsonb,
        CONSTRAINT "PK_outbound_messages_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outbound_messages_status_created_at"
      ON "outbound_messages" ("status", "created_at")
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_inbound_messages_external_message_id"
      ON "inbound_messages" ("external_message_id")
      WHERE "external_message_id" IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inbound_messages_external_message_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outbound_messages_status_created_at"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "outbound_messages"`)
  }
}