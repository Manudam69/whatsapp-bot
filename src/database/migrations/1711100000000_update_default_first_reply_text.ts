import { MigrationInterface, QueryRunner } from 'typeorm'

const OLD_FIRST_REPLY_TEXT = 'Gracias por tu mensaje. Tu reporte fue recibido y enviado al grupo operativo para seguimiento.'
const NEW_FIRST_REPLY_TEXT = '*ASISTENTE DE REPORTES* Se capturara la informacion *paso a paso*.\nSi deseas cancelar la captura, escribe *CANCELAR*.'

export class UpdateDefaultFirstReplyText1711100000000 implements MigrationInterface {
  name = 'UpdateDefaultFirstReplyText1711100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_configurations"
      SET "settings" = jsonb_set("settings", '{firstReplyText}', to_jsonb($1::text), true)
      WHERE COALESCE("settings" ->> 'firstReplyText', '') = $2
    `, [NEW_FIRST_REPLY_TEXT, OLD_FIRST_REPLY_TEXT])
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_configurations"
      SET "settings" = jsonb_set("settings", '{firstReplyText}', to_jsonb($1::text), true)
      WHERE COALESCE("settings" ->> 'firstReplyText', '') = $2
    `, [OLD_FIRST_REPLY_TEXT, NEW_FIRST_REPLY_TEXT])
  }
}