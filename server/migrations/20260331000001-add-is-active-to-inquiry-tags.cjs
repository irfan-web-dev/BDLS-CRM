'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiry_tags');
    if (!tableDesc.is_active) {
      await queryInterface.addColumn('inquiry_tags', 'is_active', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('inquiry_tags', 'is_active');
  },
};
