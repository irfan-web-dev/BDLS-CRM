'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (!tableDesc.quota) {
      await queryInterface.addColumn('inquiries', 'quota', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE inquiries
      SET quota = LOWER(TRIM(quota))
      WHERE quota IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      UPDATE inquiries
      SET quota = NULL
      WHERE quota NOT IN ('private', 'pwwf');
    `);

    const indexes = await queryInterface.showIndex('inquiries');
    const hasQuotaIndex = indexes.some((idx) => idx.name === 'inquiries_quota_idx');
    if (!hasQuotaIndex) {
      await queryInterface.addIndex('inquiries', ['quota'], { name: 'inquiries_quota_idx' });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    try {
      await queryInterface.removeIndex('inquiries', 'inquiries_quota_idx');
    } catch {
      // ignore when index does not exist
    }

    if (tableDesc.quota) {
      await queryInterface.removeColumn('inquiries', 'quota');
    }
  },
};
