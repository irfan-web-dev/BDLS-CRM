import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const InquiryFollowUp = sequelize.define('InquiryFollowUp', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  inquiry_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  follow_up_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('outgoing_call', 'incoming_call', 'whatsapp', 'in_person', 'sms', 'email', 'other'),
    allowNull: false,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  interest_level: {
    type: DataTypes.ENUM('very_interested', 'interested', 'not_sure', 'not_interested'),
    allowNull: true,
  },
  next_action: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  next_action_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  was_on_time: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'inquiry_follow_ups',
  underscored: true,
});

export default InquiryFollowUp;
