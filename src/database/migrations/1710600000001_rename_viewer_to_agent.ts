import { MigrationInterface, QueryRunner } from 'typeorm'

export class RenameViewerToAgent1710600000001 implements MigrationInterface {
  name = 'RenameViewerToAgent1710600000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migrate existing viewer users to agent
    await queryRunner.query(`UPDATE "users" SET "role" = 'agent' WHERE "role" = 'viewer'`)

    // Replace the CHECK constraint to allow 'agent' instead of 'viewer'
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_role"`)
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_role" CHECK ("role" IN ('admin', 'agent'))
    `)

    // Update column default
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "role" = 'viewer' WHERE "role" = 'agent'`)
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_role"`)
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_role" CHECK ("role" IN ('admin', 'viewer'))
    `)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'viewer'`)
  }
}
