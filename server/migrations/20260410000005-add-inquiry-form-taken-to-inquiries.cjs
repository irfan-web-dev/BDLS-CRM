'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (!tableDesc.inquiry_form_taken) {
      await queryInterface.addColumn('inquiries', 'inquiry_form_taken', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (tableDesc.inquiry_form_taken) {
      await queryInterface.removeColumn('inquiries', 'inquiry_form_taken');
    }
  },
};
