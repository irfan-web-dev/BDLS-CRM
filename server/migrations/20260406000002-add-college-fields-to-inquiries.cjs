'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (!tableDesc.student_phone) {
      await queryInterface.addColumn('inquiries', 'student_phone', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableDesc.previous_institute) {
      await queryInterface.addColumn('inquiries', 'previous_institute', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableDesc.previous_marks_obtained) {
      await queryInterface.addColumn('inquiries', 'previous_marks_obtained', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!tableDesc.previous_total_marks) {
      await queryInterface.addColumn('inquiries', 'previous_total_marks', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!tableDesc.previous_major_subjects) {
      await queryInterface.addColumn('inquiries', 'previous_major_subjects', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (tableDesc.previous_major_subjects) {
      await queryInterface.removeColumn('inquiries', 'previous_major_subjects');
    }
    if (tableDesc.previous_total_marks) {
      await queryInterface.removeColumn('inquiries', 'previous_total_marks');
    }
    if (tableDesc.previous_marks_obtained) {
      await queryInterface.removeColumn('inquiries', 'previous_marks_obtained');
    }
    if (tableDesc.previous_institute) {
      await queryInterface.removeColumn('inquiries', 'previous_institute');
    }
    if (tableDesc.student_phone) {
      await queryInterface.removeColumn('inquiries', 'student_phone');
    }
  },
};
