import sequelize from '../config/database.js';
import User from './User.js';
import Campus from './Campus.js';
import ClassLevel from './ClassLevel.js';
import Section from './Section.js';
import Subject from './Subject.js';
import InquirySource from './InquirySource.js';
import Inquiry from './Inquiry.js';
import InquiryFollowUp from './InquiryFollowUp.js';
import InquiryTag from './InquiryTag.js';
import InquiryTagMap from './InquiryTagMap.js';
import AuditLog from './AuditLog.js';

// Campus associations
Campus.hasMany(User, { foreignKey: 'campus_id', as: 'staff' });
User.belongsTo(Campus, { foreignKey: 'campus_id', as: 'campus' });

Campus.hasMany(ClassLevel, { foreignKey: 'campus_id', as: 'classes' });
ClassLevel.belongsTo(Campus, { foreignKey: 'campus_id', as: 'campus' });

Campus.hasMany(Section, { foreignKey: 'campus_id', as: 'sections' });
Section.belongsTo(Campus, { foreignKey: 'campus_id', as: 'campus' });

// ClassLevel associations
ClassLevel.hasMany(Section, { foreignKey: 'class_level_id', as: 'sections' });
Section.belongsTo(ClassLevel, { foreignKey: 'class_level_id', as: 'classLevel' });

ClassLevel.hasMany(Subject, { foreignKey: 'class_level_id', as: 'subjects' });
Subject.belongsTo(ClassLevel, { foreignKey: 'class_level_id', as: 'classLevel' });

// Inquiry associations
Inquiry.belongsTo(Campus, { foreignKey: 'campus_id', as: 'campus' });
Inquiry.belongsTo(ClassLevel, { foreignKey: 'class_applying_id', as: 'classApplying' });
Inquiry.belongsTo(InquirySource, { foreignKey: 'source_id', as: 'source' });
Inquiry.belongsTo(User, { foreignKey: 'assigned_staff_id', as: 'assignedStaff' });
Inquiry.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });
Inquiry.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedBy' });

Inquiry.hasMany(InquiryFollowUp, { foreignKey: 'inquiry_id', as: 'followUps' });
InquiryFollowUp.belongsTo(Inquiry, { foreignKey: 'inquiry_id', as: 'inquiry' });
InquiryFollowUp.belongsTo(User, { foreignKey: 'staff_id', as: 'staff' });
InquiryFollowUp.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });

// Inquiry tags (many-to-many)
Inquiry.belongsToMany(InquiryTag, { through: InquiryTagMap, foreignKey: 'inquiry_id', as: 'tags' });
InquiryTag.belongsToMany(Inquiry, { through: InquiryTagMap, foreignKey: 'tag_id', as: 'inquiries' });

// Audit log
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export {
  sequelize,
  User,
  Campus,
  ClassLevel,
  Section,
  Subject,
  InquirySource,
  Inquiry,
  InquiryFollowUp,
  InquiryTag,
  InquiryTagMap,
  AuditLog,
};
