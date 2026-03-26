import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Section = sequelize.define('Section', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  class_level_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  campus_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'sections',
  underscored: true,
});

export default Section;
