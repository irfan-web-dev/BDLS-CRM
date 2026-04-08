import { Router } from 'express';
import { InquirySource, InquiryTag } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();
const VALID_CAMPUS_TYPES = ['school', 'college'];

router.use(authenticate);

// --- Inquiry Sources ---

// GET /api/settings/inquiry-sources
router.get('/inquiry-sources', async (req, res) => {
  try {
    const where = { is_active: true };
    const requestedCampusType = req.query.campus_type;

    if (req.user.role === 'super_admin') {
      if (VALID_CAMPUS_TYPES.includes(requestedCampusType)) {
        where.campus_type = requestedCampusType;
      }
    } else {
      where.campus_type = req.user.campus?.campus_type || 'school';
    }

    const sources = await InquirySource.findAll({
      where,
      order: [['name', 'ASC']],
    });
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/settings/inquiry-sources
router.post('/inquiry-sources', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name, campus_type } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Source name is required' });
    }

    let normalizedCampusType = req.user.campus?.campus_type || 'school';
    if (req.user.role === 'super_admin') {
      normalizedCampusType = campus_type || 'school';
      if (!VALID_CAMPUS_TYPES.includes(normalizedCampusType)) {
        return res.status(400).json({ error: 'Campus type must be either school or college' });
      }
    }

    const existing = await InquirySource.findOne({ where: { name, campus_type: normalizedCampusType } });
    if (existing) return res.json(existing);

    const source = await InquirySource.create({ name, campus_type: normalizedCampusType });
    res.status(201).json(source);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/inquiry-sources/:id
router.put('/inquiry-sources/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const source = await InquirySource.findByPk(req.params.id);
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (req.user.role !== 'super_admin' && source.campus_type !== (req.user.campus?.campus_type || 'school')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, is_active, campus_type } = req.body;
    const nextCampusType = req.user.role === 'super_admin'
      ? (campus_type || source.campus_type)
      : source.campus_type;

    if (!VALID_CAMPUS_TYPES.includes(nextCampusType)) {
      return res.status(400).json({ error: 'Campus type must be either school or college' });
    }

    await source.update({
      name: name || source.name,
      is_active: is_active !== undefined ? is_active : source.is_active,
      campus_type: nextCampusType,
    });

    res.json(source);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/settings/inquiry-sources/:id (soft delete)
router.delete('/inquiry-sources/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const source = await InquirySource.findByPk(req.params.id);
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (req.user.role !== 'super_admin' && source.campus_type !== (req.user.campus?.campus_type || 'school')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await source.update({ is_active: false });
    res.json({ message: 'Source deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Inquiry Tags ---

// GET /api/settings/inquiry-tags
router.get('/inquiry-tags', async (req, res) => {
  try {
    const tags = await InquiryTag.findAll({
      order: [['name', 'ASC']],
    });
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/settings/inquiry-tags
router.post('/inquiry-tags', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const existing = await InquiryTag.findOne({ where: { name } });
    if (existing) return res.json(existing);

    const tag = await InquiryTag.create({ name });
    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/inquiry-tags/:id
router.put('/inquiry-tags/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const tag = await InquiryTag.findByPk(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const { name, is_active } = req.body;
    await tag.update({
      name: name || tag.name,
      is_active: is_active !== undefined ? is_active : tag.is_active,
    });

    res.json(tag);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/settings/inquiry-tags/:id (soft delete)
router.delete('/inquiry-tags/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const tag = await InquiryTag.findByPk(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    await tag.update({ is_active: false });
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
