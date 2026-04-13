'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (!tableDesc.is_sibling) {
      await queryInterface.addColumn('inquiries', 'is_sibling', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!tableDesc.sibling_of_inquiry_id) {
      await queryInterface.addColumn('inquiries', 'sibling_of_inquiry_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'inquiries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!tableDesc.sibling_group_id) {
      await queryInterface.addColumn('inquiries', 'sibling_group_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (tableDesc.sibling_group_id) {
      await queryInterface.removeColumn('inquiries', 'sibling_group_id');
    }
    if (tableDesc.sibling_of_inquiry_id) {
      await queryInterface.removeColumn('inquiries', 'sibling_of_inquiry_id');
    }
    if (tableDesc.is_sibling) {
      await queryInterface.removeColumn('inquiries', 'is_sibling');
    }
  },
};
