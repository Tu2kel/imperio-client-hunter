// api/hunt.js - Server-side job fetching (no CORS issues)
// Fixed: body parsing, endpoint resilience, timeout handling

const https = require('https');
const zlib = require('zlib');
const url = require('url');
const { connectToDatabase } = require('../lib/mongodb');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Csrf-Token, X-Cookie');
}

// ── BODY PARSER (Vercel doesn't auto-parse body for non-Next.js) ──────────────
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

// ── HTTP FETCH HELPER ─────────────────────────────────────────────────────────
function fetchURL(targetUrl, extraHeaders = {}, acceptHTML = false) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: 'GET',
      headers: {
        'Accept': acceptHTML
          ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          : 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        ...extraHeaders,
      },
    };

    const req = https.request(options, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
        return fetchURL(response.headers.location, extraHeaders, acceptHTML)
          .then(resolve).catch(reject);
      }

      const chunks = [];
      response.on('data', c => chunks.push(c));
      response.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = response.headers['content-encoding'];
        const decompress = enc === 'gzip' ? zlib.gunzip
          : enc === 'br' ? zlib.brotliDecompress
          : enc === 'deflate' ? zlib.inflate : null;

        if (decompress) {
          decompress(raw, (err, buf) => {
            if (err) reject(err);
            else resolve({ status: response.statusCode, body: buf.toString('utf8') });
          });
        } else {
          resolve({ status: response.statusCode, body: raw.toString('utf8') });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// ── BUILT IN FETCHER ─────────────────────────────────────────────────────────
async function fetchBuiltIn(query, page = 0) {
  const apiEndpoints = [
    `https://builtin.com/api/jobs/search?search=${encodeURIComponent(query)}&page=${page}&per_page=25`,
    `https://api.builtin.com/api/v1/jobs?search=${encodeURIComponent(query)}&page=${page}&per_page=25`,
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const { status, body } = await fetchURL(endpoint, {
        'Origin': 'https://builtin.com',
        'Referer': 'https://builtin.com/jobs',
        'X-Requested-With': 'XMLHttpRequest',
      });

      if (status === 200) {
        let data;
        try { data = JSON.parse(body); } catch { continue; }

        const jobs = data.jobs || data.data?.jobs || data.results || data.data || [];
        if (Array.isArray(jobs) && jobs.length > 0) {
          return jobs.map(j => ({
            site: 'builtin',
            jobTitle: j.title || j.job_title || j.name || '',
            companyName: j.company?.name || j.company_name || j.employer?.name || '',
            companyDomain: cleanDomain(j.company?.url || j.company?.website || ''),
            location: j.locations?.[0]?.name || j.location || j.city || 'Remote',
            postedDate: j.posted_date || j.postedDate || j.created_at || '',
            jobId: 'bi_' + String(j.id || j.job_id || Math.random()),
          })).filter(j => j.companyName && j.jobTitle);
        }
      }
    } catch (e) {
      console.warn('BuiltIn endpoint failed:', e.message);
    }
  }
  return [];
}

// ── CLEARANCEJOBS FETCHER ─────────────────────────────────────────────────────
async function fetchClearanceJobs(query, cookieStr, csrfToken, page = 0) {
  if (!cookieStr || !csrfToken) return [];
  try {
    const params = new URLSearchParams({ q: query, sort: 'date', page: String(page + 1) });
    const { status, body } = await fetchURL(
      `https://www.clearancejobs.com/api/v1/jobs?${params}`,
      {
        'X-Csrf-Token': csrfToken,
        'Cookie': cookieStr,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://clearancejobs.com/jobs',
        'Origin': 'https://clearancejobs.com',
      }
    );

    if (status === 200) {
      let data;
      try { data = JSON.parse(body); } catch { return []; }
      const jobs = data.jobs || data.data || data.results || [];
      return Array.isArray(jobs) ? jobs.map(j => ({
        site: 'clearance',
        jobTitle: j.job_title || j.title || '',
        companyName: j.company?.name || j.company_name || '',
        companyDomain: cleanDomain(j.company?.url || ''),
        location: j.location || '',
        postedDate: j.published_at || j.posted_date || '',
        jobId: 'cj_' + String(j.id || Math.random()),
        contactName: j.recruiter?.name || null,
      })).filter(j => j.companyName && j.jobTitle) : [];
    }
  } catch (e) {
    console.error('ClearanceJobs error:', e.message);
  }
  return [];
}

function cleanDomain(rawUrl) {
  if (!rawUrl) return '';
  return rawUrl.replace(/https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().trim();
}

const ENTRY_TERMS = ['junior', 'jr', 'jr.', 'entry level', 'entry-level', 'associate', 'new grad', 'early career', 'level i', 'level 1', 'early'];
const SENIOR_TERMS = ['senior', 'sr.', 'sr ', 'staff', 'principal', 'lead', 'level iii', 'level 3', 'manager', 'director', 'vp', 'head of', 'architect'];

function detectLevel(title) {
  const t = title.toLowerCase();
  if (ENTRY_TERMS.some(x => t.includes(x))) return 'entry';
  if (SENIOR_TERMS.some(x => t.includes(x))) return 'senior';
  return 'mid';
}

function scoreClient(client) {
  let score = 0;
  score += Math.min(client.totalPostings * 8, 40);
  score += client.entryCount * 12;
  score += client.midCount * 6;
  score += client.seniorCount * 3;
  if (client.placementModel !== 'unknown') score += 15;
  if (client.contactEmail || client.contactName) score += 10;
  if (client.mostRecentPost) {
    const daysAgo = Math.floor((new Date() - new Date(client.mostRecentPost)) / 86400000);
    if (daysAgo <= 7) score += 20;
    else if (daysAgo <= 14) score += 10;
    else if (daysAgo <= 30) score += 5;
  }
  return score;
}

function aggregateJobs(allJobs) {
  const companyMap = new Map();
  allJobs.forEach(job => {
    const key = job.companyName.toLowerCase().trim();
    if (!key || key.length < 2) return;

    if (!companyMap.has(key)) {
      companyMap.set(key, {
        name: job.companyName,
        domain: job.companyDomain || '',
        site: job.site,
        placementModel: 'unknown',
        contactName: job.contactName || null,
        contactEmail: null,
        openRoles: [],
        totalPostings: 0,
        entryCount: 0,
        midCount: 0,
        seniorCount: 0,
        mostRecentPost: job.postedDate || new Date().toISOString(),
        addedToPipeline: false,
        lastScanned: new Date().toISOString(),
      });
    }

    const client = companyMap.get(key);
    const level = detectLevel(job.jobTitle);
    client.openRoles.push({ title: job.jobTitle, level });
    client.totalPostings++;
    if (level === 'entry') client.entryCount++;
    else if (level === 'mid') client.midCount++;
    else client.seniorCount++;

    if (job.postedDate && job.postedDate > client.mostRecentPost) {
      client.mostRecentPost = job.postedDate;
    }
    if (!client.contactName && job.contactName) client.contactName = job.contactName;
    if (!client.domain && job.companyDomain) client.domain = job.companyDomain;
  });

  return Array.from(companyMap.values())
    .map(c => ({ ...c, score: scoreClient(c) }))
    .sort((a, b) => b.score - a.score);
}

const SEARCH_PULLS = [
  { site: 'builtin', query: 'junior software developer', pages: 2 },
  { site: 'builtin', query: 'entry level software engineer', pages: 2 },
  { site: 'builtin', query: 'SOC analyst', pages: 2 },
  { site: 'builtin', query: 'cybersecurity analyst entry level', pages: 2 },
  { site: 'builtin', query: 'information security analyst', pages: 1 },
  { site: 'builtin', query: 'sales development representative', pages: 2 },
  { site: 'builtin', query: 'business development representative', pages: 2 },
  { site: 'builtin', query: 'account executive entry level', pages: 1 },
  { site: 'builtin', query: 'network engineer entry level', pages: 1 },
  { site: 'builtin', query: 'IT support specialist', pages: 1 },
  { site: 'builtin', query: 'help desk technician', pages: 1 },
  { site: 'builtin', query: 'project manager', pages: 2 },
  { site: 'builtin', query: 'program manager', pages: 1 },
  { site: 'builtin', query: 'scrum master', pages: 1 },
  { site: 'builtin', query: 'medical assistant', pages: 1 },
  { site: 'builtin', query: 'HVAC technician', pages: 1 },
  { site: 'clearance', query: 'SOC analyst', pages: 2 },
  { site: 'clearance', query: 'cybersecurity analyst', pages: 2 },
  { site: 'clearance', query: 'program manager', pages: 2 },
  { site: 'clearance', query: 'IT specialist', pages: 1 },
  { site: 'clearance', query: 'network engineer', pages: 1 },
  { site: 'clearance', query: 'logistics coordinator', pages: 1 },
];

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  // if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Critical fix: Vercel serverless needs manual body parsing
  const body = req.body || await readBody(req);
  const { cjCookie, cjCsrf } = body;

  try {
    const { db } = await connectToDatabase();
    const leadsCol = db.collection('leads');
    const scansCol = db.collection('scans');

    const allJobs = [];
    let builtInCount = 0;
    let clearanceCount = 0;
    const errors = [];

    for (const pull of SEARCH_PULLS) {
      try {
        if (pull.site === 'builtin') {
          for (let p = 0; p < pull.pages; p++) {
            const jobs = await fetchBuiltIn(pull.query, p);
            allJobs.push(...jobs);
            builtInCount += jobs.length;
            if (jobs.length < 5) break;
            await new Promise(r => setTimeout(r, 250));
          }
        }
        if (pull.site === 'clearance' && cjCookie && cjCsrf) {
          for (let p = 0; p < pull.pages; p++) {
            const jobs = await fetchClearanceJobs(pull.query, cjCookie, cjCsrf, p);
            allJobs.push(...jobs);
            clearanceCount += jobs.length;
            if (jobs.length < 5) break;
            await new Promise(r => setTimeout(r, 250));
          }
        }
      } catch (e) {
        errors.push(`${pull.site}:${pull.query} — ${e.message}`);
      }
    }

    if (allJobs.length === 0) {
      res.status(200).json({
        success: false,
        message: 'No jobs fetched. Built In API may have changed. Check errors for details.',
        hint: 'Open DevTools on builtin.com, go to Network tab, search for jobs, and find the actual API endpoint being called.',
        errors,
        builtInCount,
        clearanceCount,
        leads: [],
      });
      return;
    }

    const leads = aggregateJobs(allJobs);

    // Upsert — preserve manually-set fields (placementModel, notes, contactEmail)
    const ops = leads.map(lead => ({
      updateOne: {
        filter: { name: { $regex: new RegExp(`^${lead.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        update: {
          // CHANGE TO:
$set: {
  domain: lead.domain,
  site: lead.site,
  openRoles: lead.openRoles,
  totalPostings: lead.totalPostings,
  entryCount: lead.entryCount,
  midCount: lead.midCount,
  seniorCount: lead.seniorCount,
  mostRecentPost: lead.mostRecentPost,
  score: lead.score,
  lastScanned: new Date().toISOString(),
},
$setOnInsert: {
  name: lead.name,
  addedToPipeline: false,
  placementModel: 'unknown',
  notes: '',
  contactName: lead.contactName,
  contactEmail: null,
  createdAt: new Date().toISOString(),
},
        },
        upsert: true,
      },
    }));

    if (ops.length > 0) {
      await leadsCol.bulkWrite(ops, { ordered: false });
    }

    await scansCol.insertOne({
      scannedAt: new Date().toISOString(),
      totalJobs: allJobs.length,
      totalLeads: leads.length,
      builtInCount,
      clearanceCount,
      errors,
    });

    res.status(200).json({
      success: true,
      totalJobs: allJobs.length,
      totalLeads: leads.length,
      builtInCount,
      clearanceCount,
      errors: errors.length > 0 ? errors : undefined,
      leads: leads.slice(0, 100),
    });

  } catch (e) {
    console.error('Hunt API error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};
