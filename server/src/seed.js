import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import {
  sequelize, User, Campus, ClassLevel, InquirySource, InquiryTag,
} from './models/index.js';

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database.');

    await sequelize.sync({ force: true });
    console.log('Tables created.');

    // Create campuses
    const mainCampus = await Campus.create({
      name: 'Main Campus',
      address: '123 Main Street, City Center',
      phone: '0300-1234567',
    });

    const branchCampus = await Campus.create({
      name: 'Branch Campus',
      address: '456 Branch Road, Suburb Area',
      phone: '0300-7654321',
    });

    console.log('Campuses created.');

    // Create users
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await User.create({
      name: 'Super Admin',
      email: 'admin@school.com',
      password: hashedPassword,
      role: 'super_admin',
      phone: '0300-0000001',
    });

    await User.create({
      name: 'Campus Admin',
      email: 'campusadmin@school.com',
      password: hashedPassword,
      role: 'admin',
      campus_id: mainCampus.id,
      phone: '0300-0000002',
    });

    await User.create({
      name: 'Staff Member',
      email: 'staff@school.com',
      password: hashedPassword,
      role: 'staff',
      campus_id: mainCampus.id,
      phone: '0300-0000003',
    });

    await User.create({
      name: 'Branch Staff',
      email: 'branchstaff@school.com',
      password: hashedPassword,
      role: 'staff',
      campus_id: branchCampus.id,
      phone: '0300-0000004',
    });

    console.log('Users created.');

    // Create class levels
    const classNames = [
      'Play Group', 'Nursery', 'KG', 'Class 1', 'Class 2', 'Class 3',
      'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8',
      'Class 9', 'Class 10',
    ];

    for (let i = 0; i < classNames.length; i++) {
      await ClassLevel.create({
        name: classNames[i],
        sort_order: i + 1,
        campus_id: mainCampus.id,
      });
    }

    console.log('Class levels created.');

    // Create inquiry sources
    const sourceNames = [
      'WhatsApp', 'Facebook', 'Instagram', 'Referral',
      'Walk-in', 'Phone Call', 'Website', 'Banner',
      'School Event', 'Other',
    ];

    for (const name of sourceNames) {
      await InquirySource.create({ name });
    }

    console.log('Inquiry sources created.');

    // Create inquiry tags
    const tagNames = [
      'Scholarship', 'Sibling', 'Teacher Referral', 'VIP',
      'Hostel Interested', 'Staff Child', 'Special Needs',
    ];

    for (const name of tagNames) {
      await InquiryTag.create({ name });
    }

    console.log('Inquiry tags created.');

    console.log('\n=== Seed Complete ===');
    console.log('Login credentials:');
    console.log('  Super Admin: admin@school.com / admin123');
    console.log('  Admin:       campusadmin@school.com / admin123');
    console.log('  Staff:       staff@school.com / admin123');
    console.log('  Branch Staff: branchstaff@school.com / admin123');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
