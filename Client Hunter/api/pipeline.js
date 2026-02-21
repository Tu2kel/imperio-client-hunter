// api/pipeline.js - Manage outreach pipeline in MongoDB
// Fixed: body parsing, ObjectId safety

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
    const pipelineCol = db.collection('pipeline');
    const leadsCol = db.collection('leads');

    if (req.method === 'GET') {
      const entries = await pipelineCol.find({}).sort({ addedAt: -1 }).toArray();
      res.status(200).json({ success: true, count: entries.length, pipeline: entries });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || await readBody(req);
      const { leadId } = body;
      if (!leadId) { res.status(400).json({ error: 'Missing leadId' }); return; }

      const oid = safeObjectId(leadId);
      if (!oid) { res.status(400).json({ error: 'Invalid leadId format' }); return; }

      const lead = await leadsCol.findOne({ _id: oid });
      if (!lead) { res.status(404).json({ error: 'Lead not found' }); return; }

      // Check if already in pipeline (by leadId string to avoid duplicate ObjectId issues)
      const existing = await pipelineCol.findOne({ leadId: leadId.toString() });
      if (existing) {
        res.status(200).json({ success: true, message: 'Already in pipeline', entry: existing });
        return;
      }

      const entry = {
        leadId: leadId.toString(),
        name: lead.name,
        domain: lead.domain,
        placementModel: lead.placementModel,
        contactName: lead.contactName,
        contactEmail: lead.contactEmail,
        totalPostings: lead.totalPostings,
        openRoles: lead.openRoles,
        stage: 'New Lead',
        notes: '',
        addedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        activities: [{
          type: 'added',
          note: 'Added to pipeline',
          date: new Date().toISOString(),
        }],
      };

      await pipelineCol.insertOne(entry);
      await leadsCol.updateOne({ _id: oid }, { $set: { addedToPipeline: true } });

      res.status(200).json({ success: true, entry });
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body || await readBody(req);
      const { id, stage, notes, activity } = body;
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

      const oid = safeObjectId(id);
      if (!oid) { res.status(400).json({ error: 'Invalid id format' }); return; }

      const updates = { lastActivity: new Date().toISOString() };
      if (stage) updates.stage = stage;
      if (notes !== undefined) updates.notes = notes;

      const update = { $set: updates };
      if (activity) {
        update.$push = {
          activities: {
            type: activity.type || 'note',
            note: activity.note,
            date: new Date().toISOString(),
          },
        };
      }

      await pipelineCol.updateOne({ _id: oid }, update);
      res.status(200).json({ success: true });
      return;
    }

    if (req.method === 'DELETE') {
      const body = req.body || await readBody(req);
      const { id, leadId } = body;
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

      const oid = safeObjectId(id);
      if (!oid) { res.status(400).json({ error: 'Invalid id format' }); return; }

      await pipelineCol.deleteOne({ _id: oid });

      if (leadId) {
        const leadOid = safeObjectId(leadId);
        if (leadOid) {
          await leadsCol.updateOne({ _id: leadOid }, { $set: { addedToPipeline: false } });
        }
      }

      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    console.error('Pipeline API error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};
