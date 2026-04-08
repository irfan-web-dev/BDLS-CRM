'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (!tableDesc.package_name) {
      await queryInterface.addColumn('inquiries', 'package_name', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableDesc.package_amount) {
      await queryInterface.addColumn('inquiries', 'package_amount', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (tableDesc.package_amount) {
      await queryInterface.removeColumn('inquiries', 'package_amount');
    }

    if (tableDesc.package_name) {
      await queryInterface.removeColumn('inquiries', 'package_name');
    }
  },
};
