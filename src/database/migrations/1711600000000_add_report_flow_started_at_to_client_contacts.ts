import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddReportFlowStartedAtToClientContacts1711600000000 implements MigrationInterface {
  name = 'AddReportFlowStartedAtToClientContacts1711600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client_contacts" ADD COLUMN IF NOT EXISTS "report_flow_started_at" timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client_contacts" DROP COLUMN IF EXISTS "report_flow_started_at"`)
  }
}