import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Inquiry = sequelize.define('Inquiry', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },

  // Parent Information
  parent_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  relationship: {
    type: DataTypes.ENUM('father', 'mother', 'guardian', 'other'),
    allowNull: false,
  },
  parent_phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  parent_whatsapp: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  parent_email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  area: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // Student Information
  student_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  date_of_birth: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'other'),
    allowNull: true,
  },
  student_phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  class_applying_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  current_school: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  previous_institute: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  previous_marks_obtained: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  previous_total_marks: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  previous_major_subjects: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  special_needs: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Inquiry Details
  inquiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  referral_parent_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  package_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  package_amount: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  inquiry_form_taken: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  campus_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  session_preference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  assigned_staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  priority: {
    type: DataTypes.ENUM('normal', 'high', 'urgent'),
    defaultValue: 'normal',
  },
  quota: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['private', 'pwwf']],
    },
  },

  // Status Pipeline
  status: {
    type: DataTypes.ENUM(
      'new',
      'contacted_attempt_1',
      'contacted_connected',
      'follow_up_scheduled',
      'visit_scheduled',
      'visit_completed',
      'form_issued',
      'form_submitted',
      'documents_pending',
      'admitted',
      'deferred',
      'not_interested',
      'no_response',
      'lost'
    ),
    defaultValue: 'new',
  },
  status_changed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  interest_level: {
    type: DataTypes.ENUM('very_interested', 'interested', 'not_sure', 'not_interested'),
    allowNull: true,
  },

  // Tracking
  last_contact_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  next_follow_up_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  was_ever_overdue: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  first_overdue_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  last_overdue_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  overdue_resolved_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  overdue_last_resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  converted_to_student_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_sibling: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  sibling_of_inquiry_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  sibling_group_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_manual_entry: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  // Meta
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'inquiries',
  underscored: true,
});

export default Inquiry;
