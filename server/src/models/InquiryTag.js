import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const InquiryTag = sequelize.define('InquiryTag', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'inquiry_tags',
  underscored: true,
});

export default InquiryTag;
