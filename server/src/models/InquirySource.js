import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const InquirySource = sequelize.define('InquirySource', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  campus_type: {
    type: DataTypes.ENUM('school', 'college'),
    allowNull: false,
    defaultValue: 'school',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'inquiry_sources',
  underscored: true,
});

export default InquirySource;
