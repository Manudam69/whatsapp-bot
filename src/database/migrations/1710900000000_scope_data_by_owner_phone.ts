import { MigrationInterface, QueryRunner } from 'typeorm'

const LEGACY_OWNER_PHONE_NUMBER = '5214422833799'

export class ScopeDataByOwnerPhone1710900000000 implements MigrationInterface {
  name = 'ScopeDataByOwnerPhone1710900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bot_configurations" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "whatsapp_groups" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "client_contacts" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "inbound_messages" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "outbound_messages" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "incident_reports" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "notification_schedules" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "notification_dispatches" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "auto_messages" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)
    await queryRunner.query(`ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying`)

    await queryRunner.query(`UPDATE "bot_configurations" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "whatsapp_groups" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "client_contacts" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "inbound_messages" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "outbound_messages" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "incident_reports" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "notification_schedules" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "notification_dispatches" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "auto_messages" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)
    await queryRunner.query(`UPDATE "media_assets" SET "owner_phone_number" = COALESCE("owner_phone_number", '${LEGACY_OWNER_PHONE_NUMBER}')`)

    await queryRunner.query(`ALTER TABLE "bot_configurations" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "whatsapp_groups" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "client_contacts" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "inbound_messages" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "outbound_messages" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "incident_reports" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "notification_schedules" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "notification_dispatches" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "auto_messages" ALTER COLUMN "owner_phone_number" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "media_assets" ALTER COLUMN "owner_phone_number" SET NOT NULL`)

    await queryRunner.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT con.conname
          FROM pg_constraint con
          INNER JOIN pg_class rel ON rel.oid = con.conrelid
          INNER JOIN pg_namespace nsp ON nsp.oid = con.connamespace
          INNER JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
          INNER JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
          WHERE rel.relname = 'client_contacts'
            AND nsp.nspname = current_schema()
            AND con.contype = 'u'
          GROUP BY con.conname
          HAVING array_agg(att.attname::text ORDER BY cols.ord) = ARRAY['phone_number']
        LOOP
          EXECUTE format('ALTER TABLE "client_contacts" DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT con.conname
          FROM pg_constraint con
          INNER JOIN pg_class rel ON rel.oid = con.conrelid
          INNER JOIN pg_namespace nsp ON nsp.oid = con.connamespace
          INNER JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
          INNER JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
          WHERE rel.relname = 'client_contacts'
            AND nsp.nspname = current_schema()
            AND con.contype = 'u'
          GROUP BY con.conname
          HAVING array_agg(att.attname::text ORDER BY cols.ord) = ARRAY['whatsapp_jid']
        LOOP
          EXECUTE format('ALTER TABLE "client_contacts" DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT con.conname
          FROM pg_constraint con
          INNER JOIN pg_class rel ON rel.oid = con.conrelid
          INNER JOIN pg_namespace nsp ON nsp.oid = con.connamespace
          INNER JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
          INNER JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
          WHERE rel.relname = 'whatsapp_groups'
            AND nsp.nspname = current_schema()
            AND con.contype = 'u'
          GROUP BY con.conname
          HAVING array_agg(att.attname::text ORDER BY cols.ord) = ARRAY['jid']
        LOOP
          EXECUTE format('ALTER TABLE "whatsapp_groups" DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;
      END $$;
    `)

    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bot_configurations_owner_phone_number" ON "bot_configurations" ("owner_phone_number")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_whatsapp_groups_owner_phone_number" ON "whatsapp_groups" ("owner_phone_number")`)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_whatsapp_groups_owner_jid" ON "whatsapp_groups" ("owner_phone_number", "jid")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_client_contacts_owner_phone_number" ON "client_contacts" ("owner_phone_number")`)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_client_contacts_owner_phone" ON "client_contacts" ("owner_phone_number", "phone_number")`)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_client_contacts_owner_jid" ON "client_contacts" ("owner_phone_number", "whatsapp_jid")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_client_contacts_owner_jid"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_client_contacts_owner_phone"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_client_contacts_owner_phone_number"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_whatsapp_groups_owner_jid"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_groups_owner_phone_number"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bot_configurations_owner_phone_number"`)

    await queryRunner.query(`ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "auto_messages" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "notification_dispatches" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "notification_schedules" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "incident_reports" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "outbound_messages" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "inbound_messages" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "client_contacts" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "whatsapp_groups" DROP COLUMN IF EXISTS "owner_phone_number"`)
    await queryRunner.query(`ALTER TABLE "bot_configurations" DROP COLUMN IF EXISTS "owner_phone_number"`)
  }
}