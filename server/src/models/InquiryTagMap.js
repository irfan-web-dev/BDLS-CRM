import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const InquiryTagMap = sequelize.define('InquiryTagMap', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  inquiry_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tag_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'inquiry_tag_map',
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['inquiry_id', 'tag_id'],
    },
  ],
});

export default InquiryTagMap;
