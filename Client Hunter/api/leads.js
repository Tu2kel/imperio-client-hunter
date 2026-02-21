// api/leads.js - Get and update client leads from MongoDB
// Fixed: body parsing, ObjectId safety, CORS

const { connectToDatabase } = require('../lib/mongodb');
const { ObjectId } = require('mongodb');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function safeObjectId(id) {
  try { return new ObjectId(id); }
  catch { return null; }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const { db } = await connectToDatabase();
    const leadsCol = db.collection('leads');

    if (req.method === 'GET') {
      const { model, pipeline, site, level, search, limit = 200 } = req.query;

      const filter = {};
      if (model && model !== 'all') filter.placementModel = model;
      if (site && site !== 'all') filter.site = site;
      if (pipeline === 'true') filter.addedToPipeline = true;
      if (level === 'entry') filter.entryCount = { $gt: 0 };
      if (level === 'mid') filter.midCount = { $gt: 0 };
      if (level === 'senior') filter.seniorCount = { $gt: 0 };
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { 'openRoles.title': { $regex: search, $options: 'i' } },
        ];
      }

      const leads = await leadsCol
        .find(filter)
        .sort({ score: -1 })
        .limit(parseInt(limit))
        .toArray();

      res.status(200).json({ success: true, count: leads.length, leads });
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body || await readBody(req);
      const { id, ...updates } = body;
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

      const oid = safeObjectId(id);
      if (!oid) { res.status(400).json({ error: 'Invalid id format' }); return; }

      const allowedFields = ['placementModel', 'notes', 'addedToPipeline', 'contactName', 'contactEmail'];
      const safeUpdates = {};
      allowedFields.forEach(f => { if (updates[f] !== undefined) safeUpdates[f] = updates[f]; });

      await leadsCol.updateOne(
        { _id: oid },
        { $set: { ...safeUpdates, updatedAt: new Date().toISOString() } }
      );

      res.status(200).json({ success: true });
      return;
    }

    if (req.method === 'DELETE') {
      const body = req.body || await readBody(req);
      const { id } = body;
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

      const oid = safeObjectId(id);
      if (!oid) { res.status(400).json({ error: 'Invalid id format' }); return; }

      await leadsCol.deleteOne({ _id: oid });
      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    console.error('Leads API error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};
