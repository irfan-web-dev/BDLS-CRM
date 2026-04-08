'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('campuses');

    if (!tableDesc.campus_type) {
      await queryInterface.addColumn('campuses', 'campus_type', {
        type: Sequelize.ENUM('school', 'college'),
        allowNull: false,
        defaultValue: 'school',
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE campuses
      SET campus_type = 'school'
      WHERE campus_type IS NULL
    `);

    const [kipsRows] = await queryInterface.sequelize.query(`
      SELECT id
      FROM campuses
      WHERE LOWER(name) = LOWER('KIPS')
        AND campus_type = 'college'
        AND deleted_at IS NULL
      LIMIT 1
    `);

    if (!kipsRows.length) {
      await queryInterface.sequelize.query(`
        INSERT INTO campuses (name, campus_type, address, phone, is_active, deleted_at, created_at, updated_at)
        VALUES ('KIPS', 'college', NULL, NULL, true, NULL, NOW(), NOW())
      `);
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('campuses');
    if (tableDesc.campus_type) {
      await queryInterface.removeColumn('campuses', 'campus_type');
    }
  },
};
