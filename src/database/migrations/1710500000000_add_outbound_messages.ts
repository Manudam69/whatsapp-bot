import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddOutboundMessages1710500000000 implements MigrationInterface {
  name = 'AddOutboundMessages1710500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "media_assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "category" character varying,
        "file_name" character varying NOT NULL,
        "file_path" character varying NOT NULL,
        "mime_type" character varying NOT NULL,
        "public_url" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_media_assets_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "jid" character varying NOT NULL,
        "name" character varying NOT NULL,
        "participant_count" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_synced_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_whatsapp_groups_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_whatsapp_groups_jid" UNIQUE ("jid")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "phone_number" character varying NOT NULL,
        "whatsapp_jid" character varying NOT NULL,
        "contact_name" character varying,
        "current_flow" character varying NOT NULL DEFAULT 'IDLE',
        "last_inbound_at" TIMESTAMP WITH TIME ZONE,
        "last_report_at" TIMESTAMP WITH TIME ZONE,
        "draft_service_name" character varying,
        "draft_incident_date" character varying,
        "draft_incident_time" character varying,
        "draft_incident_text" text,
        CONSTRAINT "PK_client_contacts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_client_contacts_phone_number" UNIQUE ("phone_number"),
        CONSTRAINT "UQ_client_contacts_whatsapp_jid" UNIQUE ("whatsapp_jid")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inbound_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "contact_id" uuid NOT NULL,
        "external_message_id" character varying,
        "from_jid" character varying NOT NULL,
        "body" text NOT NULL,
        "message_type" character varying NOT NULL DEFAULT 'text',
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "raw_payload" jsonb,
        CONSTRAINT "PK_inbound_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inbound_messages_contact_id" FOREIGN KEY ("contact_id") REFERENCES "client_contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "incident_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "folio" character varying NOT NULL,
        "contact_id" uuid NOT NULL,
        "service_name" character varying NOT NULL,
        "incident_date" character varying NOT NULL,
        "incident_time" character varying NOT NULL,
        "incident_text" text NOT NULL,
        "source_message" text NOT NULL,
        "status" character varying NOT NULL DEFAULT 'RECEIVED',
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "forwarded_at" TIMESTAMP WITH TIME ZONE,
        "forwarded_group_jid" character varying,
        "forwarded_group_name" character varying,
        CONSTRAINT "PK_incident_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_incident_reports_folio" UNIQUE ("folio"),
        CONSTRAINT "FK_incident_reports_contact_id" FOREIGN KEY ("contact_id") REFERENCES "client_contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_schedules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "message_text" text,
        "days_of_week" jsonb NOT NULL DEFAULT '[]',
        "times" jsonb NOT NULL DEFAULT '[]',
        "group_jids" jsonb NOT NULL DEFAULT '[]',
        "is_active" boolean NOT NULL DEFAULT true,
        "retry_limit" integer NOT NULL DEFAULT 3,
        "throttle_ms" integer NOT NULL DEFAULT 1500,
        "last_execution_key" character varying,
        "media_asset_id" uuid,
        CONSTRAINT "PK_notification_schedules_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_schedules_media_asset_id" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_dispatches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "schedule_id" uuid,
        "group_jid" character varying NOT NULL,
        "group_name" character varying,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "executed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "message_text" text,
        "media_asset_path" character varying,
        "error_message" text,
        CONSTRAINT "PK_notification_dispatches_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_dispatches_schedule_id" FOREIGN KEY ("schedule_id") REFERENCES "notification_schedules"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `)

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
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_dispatches"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_schedules"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_reports"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "inbound_messages"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "client_contacts"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_groups"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "media_assets"`)
  }
}