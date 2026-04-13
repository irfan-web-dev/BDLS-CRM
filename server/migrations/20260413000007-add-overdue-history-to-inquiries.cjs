'use strict';

const ACTIVE_STATUSES = [
  'new',
  'contacted_attempt_1',
  'contacted_connected',
  'follow_up_scheduled',
  'visit_scheduled',
  'visit_completed',
  'form_issued',
  'form_submitted',
  'documents_pending',
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (!tableDesc.was_ever_overdue) {
      await queryInterface.addColumn('inquiries', 'was_ever_overdue', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!tableDesc.first_overdue_date) {
      await queryInterface.addColumn('inquiries', 'first_overdue_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }

    if (!tableDesc.last_overdue_date) {
      await queryInterface.addColumn('inquiries', 'last_overdue_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }

    if (!tableDesc.overdue_resolved_count) {
      await queryInterface.addColumn('inquiries', 'overdue_resolved_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!tableDesc.overdue_last_resolved_at) {
      await queryInterface.addColumn('inquiries', 'overdue_last_resolved_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    const activeStatusSql = ACTIVE_STATUSES.map((status) => `'${status}'`).join(',');

    await queryInterface.sequelize.query(`
      UPDATE inquiries
      SET
        was_ever_overdue = TRUE,
        first_overdue_date = COALESCE(first_overdue_date, next_follow_up_date),
        last_overdue_date = COALESCE(last_overdue_date, next_follow_up_date)
      WHERE deleted_at IS NULL
        AND next_follow_up_date IS NOT NULL
        AND next_follow_up_date < CURRENT_DATE
        AND status IN (${activeStatusSql});
    `);
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('inquiries');

    if (tableDesc.overdue_last_resolved_at) {
      await queryInterface.removeColumn('inquiries', 'overdue_last_resolved_at');
    }
    if (tableDesc.overdue_resolved_count) {
      await queryInterface.removeColumn('inquiries', 'overdue_resolved_count');
    }
    if (tableDesc.last_overdue_date) {
      await queryInterface.removeColumn('inquiries', 'last_overdue_date');
    }
    if (tableDesc.first_overdue_date) {
      await queryInterface.removeColumn('inquiries', 'first_overdue_date');
    }
    if (tableDesc.was_ever_overdue) {
      await queryInterface.removeColumn('inquiries', 'was_ever_overdue');
    }
  },
};
