'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiry_sources');

    if (!tableDesc.campus_type) {
      await queryInterface.addColumn('inquiry_sources', 'campus_type', {
        type: Sequelize.ENUM('school', 'college'),
        allowNull: false,
        defaultValue: 'school',
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE inquiry_sources
      SET campus_type = 'school'
      WHERE campus_type IS NULL
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO inquiry_sources (name, campus_type, is_active, created_at, updated_at)
      SELECT src.name, 'college', src.is_active, NOW(), NOW()
      FROM inquiry_sources src
      LEFT JOIN inquiry_sources college_src
        ON LOWER(college_src.name) = LOWER(src.name)
       AND college_src.campus_type = 'college'
      WHERE src.campus_type = 'school'
        AND college_src.id IS NULL
    `);
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiry_sources');
    if (tableDesc.campus_type) {
      await queryInterface.removeColumn('inquiry_sources', 'campus_type');
    }
  },
};
