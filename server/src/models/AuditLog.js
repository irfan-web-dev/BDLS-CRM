import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  entity_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  entity_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  old_values: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  new_values: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  user_agent: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'audit_logs',
  underscored: true,
});

export default AuditLog;
