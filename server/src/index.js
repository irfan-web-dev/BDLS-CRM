import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { sequelize } from './models/index.js';
import { fullSync, startSyncSchedule } from './services/sync.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import campusRoutes from './routes/campuses.js';
import classRoutes from './routes/classes.js';
import inquiryRoutes from './routes/inquiries.js';
import followUpRoutes from './routes/followUps.js';
import dashboardRoutes from './routes/dashboard.js';
import settingRoutes from './routes/settings.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'crm', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('CRM Database connected.');

    // Sync cache from Shared API (non-blocking - CRM works even if sync fails)
    fullSync().then(() => {
      startSyncSchedule(5 * 60 * 1000); // Sync every 5 minutes
    });

    app.listen(PORT, () => {
      console.log(`CRM Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start CRM server:', error);
    process.exit(1);
  }
}

start();
