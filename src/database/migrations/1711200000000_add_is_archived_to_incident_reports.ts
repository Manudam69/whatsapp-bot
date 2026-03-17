import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIsArchivedToIncidentReports1711200000000 implements MigrationInterface {
  name = 'AddIsArchivedToIncidentReports1711200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "incident_reports"
      ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "incident_reports"
      DROP COLUMN IF EXISTS "is_archived"
    `)
  }
}
