'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (!tableDesc.is_manual_entry) {
      await queryInterface.addColumn('inquiries', 'is_manual_entry', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (tableDesc.is_manual_entry) {
      await queryInterface.removeColumn('inquiries', 'is_manual_entry');
    }
  },
};
