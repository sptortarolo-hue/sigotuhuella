import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM collaboration_accounts ORDER BY display_order ASC');
    res.json({ accounts: result.rows });
  } catch (err) {
    console.error('Get collaboration accounts error:', err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { title, description, bankName, alias, cbu, cvu, displayOrder } = req.body;
  if (!title || !bankName) {
    return res.status(400).json({ error: 'Title and bank name are required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO collaboration_accounts (title, description, bank_name, alias, cbu, cvu, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [title, description || null, bankName, alias || null, cbu || null, cvu || null, displayOrder || 0]
    );
    res.status(201).json({ account: result.rows[0] });
  } catch (err) {
    console.error('Create account error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { title, description, bankName, alias, cbu, cvu, displayOrder } = req.body;
  try {
    const result = await pool.query(
      'UPDATE collaboration_accounts SET title = COALESCE($1, title), description = COALESCE($2, description), bank_name = COALESCE($3, bank_name), alias = COALESCE($4, alias), cbu = COALESCE($5, cbu), cvu = COALESCE($6, cvu), display_order = COALESCE($7, display_order) WHERE id = $8 RETURNING *',
      [title, description, bankName, alias, cbu, cvu, displayOrder, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ account: result.rows[0] });
  } catch (err) {
    console.error('Update account error:', err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM collaboration_accounts WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ message: 'Account deleted' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
