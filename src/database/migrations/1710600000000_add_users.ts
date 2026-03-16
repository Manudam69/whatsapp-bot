import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddUsers1710600000000 implements MigrationInterface {
  name = 'AddUsers1710600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "email" character varying NOT NULL,
        "password_hash" text NOT NULL,
        "role" character varying NOT NULL DEFAULT 'viewer',
        CONSTRAINT "CHK_users_role" CHECK ("role" IN ('admin', 'viewer')),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_role_created_at"
      ON "users" ("role", "created_at")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role_created_at"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`)
  }
}