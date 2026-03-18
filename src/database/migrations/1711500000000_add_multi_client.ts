import fs from 'fs'
import path from 'path'
import { MigrationInterface, QueryRunner } from 'typeorm'

const MILODI_CLIENT_ID = '00000000-0000-0000-0000-000000000001'
const MILODI_SESSION_ID = '00000000-0000-0000-0000-000000000002'
const MILODI_CLIENT_NAME = 'milodi'
const MILODI_AUTH_DIR_KEY = 'milodi'

export class AddMultiClient1711500000000 implements MigrationInterface {
  name = 'AddMultiClient1711500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Create clients table ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clients" (
        "id"                 uuid         NOT NULL DEFAULT gen_random_uuid(),
        "created_at"         timestamptz  NOT NULL DEFAULT now(),
        "updated_at"         timestamptz  NOT NULL DEFAULT now(),
        "name"               varchar      NOT NULL,
        "display_name"       varchar      NOT NULL DEFAULT '',
        "display_logo"       jsonb,
        "secrets"            jsonb,
        "flags"              jsonb,
        "public_config"      jsonb,
        "email_config"       jsonb,
        "customization"      jsonb,
        "enabled_entities"   jsonb,
        "disabled_entities"  jsonb,
        "client_class"       varchar,
        CONSTRAINT "PK_clients" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_clients_name" ON "clients" ("name")`)

    // ── 2. Create whatsapp_sessions table ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_sessions" (
        "id"            uuid         NOT NULL DEFAULT gen_random_uuid(),
        "created_at"    timestamptz  NOT NULL DEFAULT now(),
        "updated_at"    timestamptz  NOT NULL DEFAULT now(),
        "client_id"     uuid         NOT NULL,
        "phone_number"  varchar,
        "auth_dir_key"  varchar      NOT NULL,
        "status"        varchar      NOT NULL DEFAULT 'idle',
        "connected_at"  timestamptz,
        CONSTRAINT "PK_whatsapp_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_whatsapp_sessions_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_whatsapp_sessions_auth_dir_key" ON "whatsapp_sessions" ("auth_dir_key")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_whatsapp_sessions_client_id" ON "whatsapp_sessions" ("client_id")`)

    // ── 3. Detect if there is existing data to backfill ──────────────────────
    // On a fresh database all tables are empty — we skip the milodi seed so
    // the first real client can be created separately.
    // On an existing database the users table will have at least 1 row.
    const rows: Array<{ count: string }> = await queryRunner.query(`SELECT COUNT(*) AS count FROM "users"`)
    const [{ count }] = rows
    const hasExistingData = parseInt(count, 10) > 0

    if (hasExistingData) {
      // Insert milodi client and session only to backfill pre-existing rows
      await queryRunner.query(`
        INSERT INTO "clients" ("id", "name", "display_name")
        VALUES ('${MILODI_CLIENT_ID}', '${MILODI_CLIENT_NAME}', 'Milodi')
        ON CONFLICT DO NOTHING
      `)
      await queryRunner.query(`
        INSERT INTO "whatsapp_sessions" ("id", "client_id", "auth_dir_key", "status")
        VALUES ('${MILODI_SESSION_ID}', '${MILODI_CLIENT_ID}', '${MILODI_AUTH_DIR_KEY}', 'idle')
        ON CONFLICT DO NOTHING
      `)
    }

    // ── 4. Add client_id to users ────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "client_id" uuid`)
    if (hasExistingData) {
      await queryRunner.query(`UPDATE "users" SET "client_id" = '${MILODI_CLIENT_ID}' WHERE "client_id" IS NULL`)
    }
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "client_id" SET NOT NULL`)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_users_client' AND table_name = 'users'
        ) THEN
          ALTER TABLE "users" ADD CONSTRAINT "FK_users_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT;
        END IF;
      END $$
    `)

    // ── 5. Add client_id to data tables (replaces owner_phone_number) ────────
    const clientTables = [
      'bot_configurations',
      'incident_reports',
      'notification_schedules',
      'notification_dispatches',
      'auto_messages',
      'media_assets',
    ]

    for (const table of clientTables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "client_id" uuid`)
      if (hasExistingData) {
        await queryRunner.query(`UPDATE "${table}" SET "client_id" = '${MILODI_CLIENT_ID}' WHERE "client_id" IS NULL`)
      }
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "client_id" SET NOT NULL`)
    }

    // ── 6. Add session_id to conversation tables ─────────────────────────────
    const sessionTables = [
      'client_contacts',
      'inbound_messages',
      'outbound_messages',
      'whatsapp_groups',
    ]

    for (const table of sessionTables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "session_id" uuid`)
      if (hasExistingData) {
        await queryRunner.query(`UPDATE "${table}" SET "session_id" = '${MILODI_SESSION_ID}' WHERE "session_id" IS NULL`)
      }
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "session_id" SET NOT NULL`)
    }

    // client_contacts also gets client_id
    await queryRunner.query(`ALTER TABLE "client_contacts" ADD COLUMN IF NOT EXISTS "client_id" uuid`)
    if (hasExistingData) {
      await queryRunner.query(`UPDATE "client_contacts" SET "client_id" = '${MILODI_CLIENT_ID}' WHERE "client_id" IS NULL`)
    }
    await queryRunner.query(`ALTER TABLE "client_contacts" ALTER COLUMN "client_id" SET NOT NULL`)

    // ── 8. Drop old owner_phone_number unique indexes ─────────────────────────
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bot_configurations_owner_phone_number"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_groups_owner_phone_number"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_whatsapp_groups_owner_jid"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_client_contacts_owner_phone_number"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_client_contacts_owner_phone"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_client_contacts_owner_jid"`)

    // ── 9. Deduplicate bot_configurations before creating unique index ────────
    // Keep only the most recently updated row per client_id in case the table
    // accumulated duplicates during development.
    await queryRunner.query(`
      DELETE FROM "bot_configurations"
      WHERE "id" NOT IN (
        SELECT DISTINCT ON ("client_id") "id"
        FROM "bot_configurations"
        ORDER BY "client_id", "updated_at" DESC NULLS LAST
      )
    `)

    // ── 10. Create new indexes ────────────────────────────────────────────────
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bot_configurations_client_id" ON "bot_configurations" ("client_id")`)
    // Deduplicate client_contacts by (session_id, phone_number).
    // First reassign child rows to the winner contact, then delete losers.
    await queryRunner.query(`
      DO $$
      DECLARE
        loser_id  uuid;
        winner_id uuid;
      BEGIN
        FOR loser_id, winner_id IN
          SELECT dup.id, keep.id
          FROM "client_contacts" dup
          JOIN (
            SELECT DISTINCT ON ("session_id", "phone_number") "id", "session_id", "phone_number"
            FROM "client_contacts"
            ORDER BY "session_id", "phone_number", "created_at" ASC NULLS LAST
          ) keep
            ON  keep."session_id"    = dup."session_id"
            AND keep."phone_number"  = dup."phone_number"
            AND keep."id"           <> dup."id"
        LOOP
          UPDATE "inbound_messages"  SET "contact_id" = winner_id WHERE "contact_id" = loser_id;
          UPDATE "incident_reports"  SET "contact_id" = winner_id WHERE "contact_id" = loser_id;
          DELETE FROM "client_contacts" WHERE "id" = loser_id;
        END LOOP;
      END $$
    `)

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_client_contacts_client_id" ON "client_contacts" ("client_id")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_client_contacts_session_id" ON "client_contacts" ("session_id")`)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_client_contacts_session_phone" ON "client_contacts" ("session_id", "phone_number")`)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_client_contacts_session_jid" ON "client_contacts" ("session_id", "whatsapp_jid")`)
    // Deduplicate whatsapp_groups by (session_id, jid) before unique index
    await queryRunner.query(`
      DELETE FROM "whatsapp_groups"
      WHERE "id" NOT IN (
        SELECT DISTINCT ON ("session_id", "jid") "id"
        FROM "whatsapp_groups"
        ORDER BY "session_id", "jid", "created_at" ASC NULLS LAST
      )
    `)

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_whatsapp_groups_session_id" ON "whatsapp_groups" ("session_id")`)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_whatsapp_groups_session_jid" ON "whatsapp_groups" ("session_id", "jid")`)

    // ── 11. Drop owner_phone_number columns ──────────────────────────────────
    const allOwnerPhoneTables = [
      'bot_configurations',
      'incident_reports',
      'notification_schedules',
      'notification_dispatches',
      'auto_messages',
      'media_assets',
      'client_contacts',
      'inbound_messages',
      'outbound_messages',
      'whatsapp_groups',
    ]

    for (const table of allOwnerPhoneTables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "owner_phone_number"`)
    }

    // ── 12. Move auth directory: auth/ → auth/milodi/ ────────────────────────
    const projectRoot = path.resolve(process.cwd())
    const oldAuthDir = path.join(projectRoot, 'auth')
    const newAuthDir = path.join(projectRoot, 'auth', 'milodi')

    // If creds.json still lives directly under auth/, the auth state hasn't
    // been migrated yet — move every file into auth/milodi/.
    // We re-check on every run so a previously-interrupted migration can resume.
    const oldCredsFile = path.join(oldAuthDir, 'creds.json')
    if (fs.existsSync(oldCredsFile)) {
      fs.mkdirSync(newAuthDir, { recursive: true })
      for (const entry of fs.readdirSync(oldAuthDir)) {
        const src = path.join(oldAuthDir, entry)
        if (fs.statSync(src).isFile()) {
          fs.renameSync(src, path.join(newAuthDir, entry))
        }
      }
    } else if (!fs.existsSync(newAuthDir)) {
      // Fresh database — just create the folder so Baileys can write into it
      fs.mkdirSync(newAuthDir, { recursive: true })
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore owner_phone_number columns (backfill with empty string as placeholder)
    const sessionTables = ['client_contacts', 'inbound_messages', 'outbound_messages', 'whatsapp_groups']
    const clientTables = ['bot_configurations', 'incident_reports', 'notification_schedules', 'notification_dispatches', 'auto_messages', 'media_assets']

    for (const table of [...sessionTables, ...clientTables]) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "owner_phone_number" varchar NOT NULL DEFAULT ''`)
    }

    // Drop new indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_whatsapp_groups_session_jid"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_groups_session_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_client_contacts_session_jid"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_client_contacts_session_phone"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_client_contacts_session_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_client_contacts_client_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bot_configurations_client_id"`)

    // Drop session_id and client_id columns
    for (const table of sessionTables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "session_id"`)
    }
    await queryRunner.query(`ALTER TABLE "client_contacts" DROP COLUMN IF EXISTS "client_id"`)
    for (const table of clientTables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "client_id"`)
    }

    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_client"`)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "client_id"`)

    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_sessions"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "clients"`)
  }
}
