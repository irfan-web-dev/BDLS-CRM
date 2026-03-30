'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Helper: skip if table already exists (safe for existing databases)
    const tables = await queryInterface.showAllTables();
    const exists = (name) => tables.includes(name);

    // 1. campuses
    if (!exists('campuses')) {
      await queryInterface.createTable('campuses', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        address: { type: Sequelize.TEXT, allowNull: true },
        phone: { type: Sequelize.STRING, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 2. users
    if (!exists('users')) {
      await queryInterface.createTable('users', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        email: { type: Sequelize.STRING, allowNull: false, unique: true },
        phone: { type: Sequelize.STRING, allowNull: true },
        password: { type: Sequelize.STRING, allowNull: false },
        role: {
          type: Sequelize.ENUM('super_admin', 'admin', 'staff', 'teacher', 'student'),
          allowNull: false,
          defaultValue: 'staff',
        },
        campus_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'campuses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        last_login_at: { type: Sequelize.DATE, allowNull: true },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 3. class_levels
    if (!exists('class_levels')) {
      await queryInterface.createTable('class_levels', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        sort_order: { type: Sequelize.INTEGER, defaultValue: 0 },
        campus_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'campuses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 4. sections
    if (!exists('sections')) {
      await queryInterface.createTable('sections', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        class_level_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'class_levels', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        campus_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'campuses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 5. crm_subjects (renamed from 'subjects' to avoid conflict with LMS subjects table)
    if (!exists('crm_subjects')) {
      await queryInterface.createTable('crm_subjects', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        class_level_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'class_levels', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 6. inquiry_sources
    if (!exists('inquiry_sources')) {
      await queryInterface.createTable('inquiry_sources', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 7. inquiry_tags
    if (!exists('inquiry_tags')) {
      await queryInterface.createTable('inquiry_tags', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false, unique: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 8. inquiries
    if (!exists('inquiries')) {
      await queryInterface.createTable('inquiries', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Parent Info
        parent_name: { type: Sequelize.STRING, allowNull: false },
        relationship: {
          type: Sequelize.ENUM('father', 'mother', 'guardian', 'other'),
          allowNull: false,
        },
        parent_phone: { type: Sequelize.STRING, allowNull: false },
        parent_whatsapp: { type: Sequelize.STRING, allowNull: true },
        parent_email: { type: Sequelize.STRING, allowNull: true },
        city: { type: Sequelize.STRING, allowNull: true },
        area: { type: Sequelize.STRING, allowNull: true },
        // Student Info
        student_name: { type: Sequelize.STRING, allowNull: false },
        date_of_birth: { type: Sequelize.DATEONLY, allowNull: true },
        gender: {
          type: Sequelize.ENUM('male', 'female', 'other'),
          allowNull: true,
        },
        class_applying_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'class_levels', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        current_school: { type: Sequelize.STRING, allowNull: true },
        special_needs: { type: Sequelize.TEXT, allowNull: true },
        // Inquiry Details
        inquiry_date: { type: Sequelize.DATEONLY, allowNull: false },
        source_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'inquiry_sources', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        referral_parent_name: { type: Sequelize.STRING, allowNull: true },
        campus_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'campuses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        session_preference: { type: Sequelize.STRING, allowNull: true },
        assigned_staff_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        priority: {
          type: Sequelize.ENUM('normal', 'high', 'urgent'),
          defaultValue: 'normal',
        },
        // Status Pipeline
        status: {
          type: Sequelize.ENUM(
            'new', 'contacted_attempt_1', 'contacted_connected',
            'follow_up_scheduled', 'visit_scheduled', 'visit_completed',
            'form_issued', 'form_submitted', 'documents_pending',
            'admitted', 'deferred', 'not_interested', 'no_response', 'lost'
          ),
          defaultValue: 'new',
        },
        status_changed_at: { type: Sequelize.DATE, allowNull: true },
        interest_level: {
          type: Sequelize.ENUM('very_interested', 'interested', 'not_sure', 'not_interested'),
          allowNull: true,
        },
        // Tracking
        last_contact_date: { type: Sequelize.DATE, allowNull: true },
        next_follow_up_date: { type: Sequelize.DATEONLY, allowNull: true },
        converted_to_student_id: { type: Sequelize.INTEGER, allowNull: true },
        // Meta
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        updated_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 9. inquiry_follow_ups
    if (!exists('inquiry_follow_ups')) {
      await queryInterface.createTable('inquiry_follow_ups', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        inquiry_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'inquiries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        follow_up_date: { type: Sequelize.DATE, allowNull: false },
        type: {
          type: Sequelize.ENUM('outgoing_call', 'incoming_call', 'whatsapp', 'in_person', 'sms', 'email', 'other'),
          allowNull: false,
        },
        duration_minutes: { type: Sequelize.INTEGER, allowNull: true },
        staff_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        notes: { type: Sequelize.TEXT, allowNull: true },
        interest_level: {
          type: Sequelize.ENUM('very_interested', 'interested', 'not_sure', 'not_interested'),
          allowNull: true,
        },
        next_action: { type: Sequelize.STRING, allowNull: true },
        next_action_date: { type: Sequelize.DATEONLY, allowNull: true },
        was_on_time: { type: Sequelize.BOOLEAN, allowNull: true },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }

    // 10. inquiry_tag_map
    if (!exists('inquiry_tag_map')) {
      await queryInterface.createTable('inquiry_tag_map', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        inquiry_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'inquiries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        tag_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'inquiry_tags', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });

      // Unique constraint on inquiry_id + tag_id
      await queryInterface.addIndex('inquiry_tag_map', ['inquiry_id', 'tag_id'], {
        unique: true,
        name: 'inquiry_tag_map_inquiry_id_tag_id_unique',
      });
    }

    // 11. audit_logs
    if (!exists('audit_logs')) {
      await queryInterface.createTable('audit_logs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        action: { type: Sequelize.STRING, allowNull: false },
        entity_type: { type: Sequelize.STRING, allowNull: true },
        entity_id: { type: Sequelize.INTEGER, allowNull: true },
        old_values: { type: Sequelize.JSONB, allowNull: true },
        new_values: { type: Sequelize.JSONB, allowNull: true },
        ip_address: { type: Sequelize.STRING, allowNull: true },
        user_agent: { type: Sequelize.STRING, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }
  },

  async down(queryInterface) {
    // Drop in reverse order to respect foreign keys
    await queryInterface.dropTable('audit_logs');
    await queryInterface.dropTable('inquiry_tag_map');
    await queryInterface.dropTable('inquiry_follow_ups');
    await queryInterface.dropTable('inquiries');
    await queryInterface.dropTable('inquiry_tags');
    await queryInterface.dropTable('inquiry_sources');
    await queryInterface.dropTable('crm_subjects');
    await queryInterface.dropTable('sections');
    await queryInterface.dropTable('class_levels');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('campuses');
  },
};
