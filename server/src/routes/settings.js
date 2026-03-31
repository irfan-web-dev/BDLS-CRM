import { Router } from 'express';
import { InquirySource, InquiryTag } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// --- Inquiry Sources ---

// GET /api/settings/inquiry-sources
router.get('/inquiry-sources', async (req, res) => {
  try {
    const sources = await InquirySource.findAll({
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
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Source name is required' });
    }

    const existing = await InquirySource.findOne({ where: { name } });
    if (existing) return res.json(existing);

    const source = await InquirySource.create({ name });
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

    const { name, is_active } = req.body;
    await source.update({
      name: name || source.name,
      is_active: is_active !== undefined ? is_active : source.is_active,
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
