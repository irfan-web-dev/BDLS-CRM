import { User, Campus, ClassLevel, Section, Subject, sequelize } from '../models/index.js';
import sharedClient from './shared-client.js';

let lastSyncTime = null;
let syncInterval = null;

// Populate cache tables from shared API data
async function applySyncData(data) {
  const t = await sequelize.transaction();

  try {
    if (data.campuses) {
      for (const campus of data.campuses) {
        // Shared API currently may not send campus_type; preserve existing type in CRM.
        const existingCampus = await Campus.findByPk(campus.id, { transaction: t });
        await Campus.upsert({
          id: campus.id,
          name: campus.name,
          campus_type: campus.campus_type || existingCampus?.campus_type || 'school',
          address: campus.address,
          phone: campus.phone,
          is_active: campus.is_active,
          deleted_at: campus.deleted_at || null,
        }, { transaction: t });
      }
    }

    if (data.people) {
      for (const person of data.people) {
        // Map person_type to CRM role
        let role = 'staff';
        if (person.person_type === 'super_admin') role = 'super_admin';
        else if (person.person_type === 'campus_admin') role = 'admin';
        else if (person.person_type === 'teacher') role = 'staff';
        else if (person.person_type === 'student') role = 'student';

        await User.upsert({
          id: person.id,
          name: person.name,
          email: person.email || `user.${person.id}@cache.local`,
          phone: person.phone,
          password: person.password || 'cached',
          role,
          campus_id: person.campus_id,
          is_active: person.is_active,
          deleted_at: person.deleted_at || null,
        }, { transaction: t });
      }
    }

    if (data.classes) {
      for (const cls of data.classes) {
        await ClassLevel.upsert({
          id: cls.id,
          name: cls.name,
          sort_order: cls.sort_order,
          campus_id: cls.campus_id,
          is_active: cls.is_active,
        }, { transaction: t });
      }
    }

    if (data.sections) {
      for (const section of data.sections) {
        await Section.upsert({
          id: section.id,
          name: section.name,
          class_level_id: section.class_id,
          campus_id: section.campus_id,
          is_active: section.is_active,
        }, { transaction: t });
      }
    }

    if (data.subjects) {
      for (const subject of data.subjects) {
        await Subject.upsert({
          id: subject.id,
          name: subject.name,
          class_level_id: subject.class_id,
          is_active: subject.is_active,
        }, { transaction: t });
      }
    }

    await t.commit();
    lastSyncTime = data.sync_timestamp;
    console.log(`Cache sync completed at ${lastSyncTime}`);
  } catch (error) {
    await t.rollback();
    console.error('Cache sync failed:', error.message);
  }
}

// Full sync - populates cache from scratch
export async function fullSync() {
  try {
    console.log('Running full cache sync from Shared API...');
    const data = await sharedClient.syncFull('people,classes,sections,subjects,campuses');
    await applySyncData(data);
    return true;
  } catch (error) {
    console.error('Full sync failed (will use existing cache):', error.message);
    return false;
  }
}

// Incremental sync - only gets changes since last sync
export async function incrementalSync() {
  try {
    if (!lastSyncTime) {
      return fullSync();
    }
    const data = await sharedClient.syncIncremental(lastSyncTime);
    await applySyncData(data);
    return true;
  } catch (error) {
    console.error('Incremental sync failed:', error.message);
    return false;
  }
}

// Start periodic sync (every 5 minutes)
export function startSyncSchedule(intervalMs = 5 * 60 * 1000) {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(incrementalSync, intervalMs);
  console.log(`Cache sync scheduled every ${intervalMs / 1000}s`);
}

export function stopSyncSchedule() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
