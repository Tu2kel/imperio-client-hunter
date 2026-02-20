/**
 * IMPERIO CLIENT HUNTER — Local Proxy Server
 * Run: node proxy.js
 * Listens on http://localhost:3001
 *
 * Built In: scrapes __NEXT_DATA__ JSON embedded in page HTML (no API needed)
 * ClearanceJobs: forwards API request with your session cookie + CSRF token
 */

const http  = require('http');
const https = require('https');
const zlib  = require('zlib');
const url   = require('url');

const PORT = 3001;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Csrf-Token, X-Requested-With, X-Cookie, Authorization');
}

function sendJSON(res, status, data) {
  setCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

function fetchRaw(targetUrl, extraHeaders) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 OPR/127.0.0.0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        ...extraHeaders,
      },
    };

    const req = https.request(options, (response) => {
      const chunks = [];
      response.on('data', c => chunks.push(c));
      response.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = response.headers['content-encoding'];
        const decompress = enc === 'gzip' ? zlib.gunzip
                         : enc === 'br'   ? zlib.brotliDecompress
                         : enc === 'deflate' ? zlib.inflate : null;
        if (decompress) {
          decompress(raw, (err, buf) => {
            if (err) reject(err);
            else resolve({ status: response.statusCode, body: buf.toString('utf8'), headers: response.headers });
          });
        } else {
          resolve({ status: response.statusCode, body: raw.toString('utf8'), headers: response.headers });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function fetchJSON(targetUrl, extraHeaders) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 OPR/127.0.0.0',
        'Referer': `https://${parsed.hostname}/jobs`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        ...extraHeaders,
      },
    };

    const req = https.request(options, (response) => {
      const chunks = [];
      response.on('data', c => chunks.push(c));
      response.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = response.headers['content-encoding'];
        const decompress = enc === 'gzip' ? zlib.gunzip
                         : enc === 'br'   ? zlib.brotliDecompress
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
    req.end();
  });
}

function parseBuiltInHTML(html) {
  // Strategy 1: __NEXT_DATA__ JSON blob (most reliable)
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (match) {
    try {
      const nextData = JSON.parse(match[1]);
      const pageProps = nextData?.props?.pageProps;
      const jobsRaw =
        pageProps?.jobs ||
        pageProps?.initialData?.jobs ||
        pageProps?.data?.jobs ||
        pageProps?.searchResults?.jobs ||
        pageProps?.jobListings ||
        pageProps?.results ||
        [];
      if (jobsRaw.length > 0) {
        console.log(`  ✓ __NEXT_DATA__ — ${jobsRaw.length} jobs`);
        return jobsRaw.map(j => ({
          title:        j.title || j.job_title || j.name || '',
          company_name: j.company?.name || j.companyName || j.company_name || '',
          company_url:  j.company?.url  || j.companyUrl  || '',
          location:     j.location || j.city || 'Remote',
          posted_date:  j.postedDate || j.posted_date || j.publishedDate || '',
          job_id:       String(j.id || j.jobId || Math.random()),
        }));
      }
      // Log what keys exist so we can adjust
      console.log('  ⚠ __NEXT_DATA__ found but no jobs key. pageProps keys:', Object.keys(pageProps || {}).join(', '));
    } catch(e) {
      console.log('  ⚠ __NEXT_DATA__ parse error:', e.message);
    }
  }

  // Strategy 2: inline JSON arrays with job data
  const inlineMatch = html.match(/"jobs"\s*:\s*(\[[\s\S]{10,5000}?\])/);
  if (inlineMatch) {
    try {
      const jobs = JSON.parse(inlineMatch[1]);
      console.log(`  ✓ Inline JSON — ${jobs.length} jobs`);
      return jobs.map(j => ({
        title:        j.title || j.job_title || '',
        company_name: j.company?.name || j.companyName || '',
        company_url:  '',
        location:     j.location || 'Remote',
        posted_date:  j.postedDate || j.posted_date || '',
        job_id:       String(j.id || Math.random()),
      }));
    } catch(e) {}
  }

  console.log('  ✗ No job data found in HTML');
  return [];
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCors(res); res.writeHead(204); res.end(); return;
  }

  const parsed = url.parse(req.url, true);
  const path   = parsed.pathname;
  const query  = parsed.query;

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${path}`);

  // ── /builtin ─────────────────────────────────────────────────────────────
  if (path === '/builtin') {
    const search = query.search || '';
    const page   = parseInt(query.page || '0');
    const params = new URLSearchParams({ search, remote: '1', page: String(page), per_page: '25' });
    const target = `https://api.builtin.com/api/v1/jobs?${params}`;
    console.log(`  → ${target}`);
    try {
      const { status, body } = await fetchJSON(target, { 'Origin': 'https://builtin.com', 'Referer': 'https://builtin.com/' });
      console.log(`  ← HTTP ${status}, ${body.length} bytes`);
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          const jobs = data.jobs || data.data?.jobs || data.results || [];
          const jobArr = Array.isArray(jobs) ? jobs : [];
          console.log(`  ✓ ${jobArr.length} jobs`);
          sendJSON(res, 200, { jobs: jobArr, count: jobArr.length });
        } catch(e) {
          console.log('  ⚠ Parse error:', e.message, 'body:', body.substring(0,200));
          sendJSON(res, 200, { jobs: [], error: 'JSON parse failed' });
        }
      } else {
        console.log('  ✗ Body:', body.substring(0,300));
        sendJSON(res, status, { jobs: [], error: `api.builtin.com HTTP ${status}` });
      }
    } catch(e) {
      console.error('  ✗', e.message);
      sendJSON(res, 502, { jobs: [], error: e.message });
    }
    return;
  }

  // ── /clearance ───────────────────────────────────────────────────────────
  if (path === '/clearance') {
    const params = new URLSearchParams({ q: query.q || '', sort: 'date', page: query.page || '0' });
    if (query.clearance) params.append('clearance', query.clearance);
    // Try the jobs search endpoint — CJ may use /jobs or /search
    const target = `https://www.clearancejobs.com/api/v1/jobs?${params}`;
    console.log(`  → ${target}`);
    const authHeaders = {};
    if (req.headers['x-csrf-token'])     authHeaders['X-Csrf-Token']     = req.headers['x-csrf-token'];
    if (req.headers['x-cookie'])         authHeaders['Cookie']            = req.headers['x-cookie'];
    if (req.headers['x-requested-with']) authHeaders['X-Requested-With'] = req.headers['x-requested-with'];
    try {
      const { status, body } = await fetchJSON(target, authHeaders);
      console.log(`  ← HTTP ${status} | body preview: ${body.substring(0, 300)}`);
      setCors(res);
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(status);
      res.end(body);
    } catch(e) {
      console.error('  ✗', e.message);
      sendJSON(res, 502, { error: e.message });
    }
    return;
  }

  // ── /debug-builtin — returns raw response for inspection ─────────────────
  if (path === '/debug-builtin') {
    const search = query.search || 'junior developer';
    const target = `https://builtin.com/jobs/remote?search=${encodeURIComponent(search)}`;
    console.log(`  → Debug: ${target}`);
    try {
      const { status, body, headers } = await fetchRaw(target, {});
      setCors(res);
      res.setHeader('Content-Type', 'text/plain');
      res.writeHead(200);
      res.end(`HTTP ${status}\nContent-Type: ${headers['content-type']}\nSize: ${body.length} bytes\n\n--- FIRST 4000 CHARS ---\n${body.substring(0, 4000)}`);
    } catch(e) {
      sendJSON(res, 502, { error: e.message });
    }
    return;
  }

  // ── /health ───────────────────────────────────────────────────────────────
  if (path === '/health') {
    sendJSON(res, 200, { status: 'ok', port: PORT, time: new Date().toISOString() });
    return;
  }

  sendJSON(res, 404, { error: 'Unknown route. Use /builtin, /clearance, /debug-builtin, or /health' });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ██╗███╗   ███╗██████╗ ███████╗██████╗ ██╗ ██████╗ ');
  console.log('  ██║████╗ ████║██╔══██╗██╔════╝██╔══██╗██║██╔═══██╗');
  console.log('  ██║██╔████╔██║██████╔╝█████╗  ██████╔╝██║██║   ██║');
  console.log('  ██║██║╚██╔╝██║██╔═══╝ ██╔══╝  ██╔══██╗██║██║   ██║');
  console.log('  ██║██║ ╚═╝ ██║██║     ███████╗██║  ██║██║╚██████╔╝');
  console.log('  ╚═╝╚═╝     ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝ ╚═════╝ ');
  console.log('');
  console.log(`  CLIENT HUNTER PROXY — Running on http://localhost:${PORT}`);
  console.log('');
  console.log('  Routes:');
  console.log(`    /builtin?search=junior+developer&page=0`);
  console.log(`    /clearance?q=soc+analyst&page=0`);
  console.log(`    /debug-builtin?search=developer   ← inspect raw HTML`);
  console.log(`    /health`);
  console.log('');
  console.log('  Keep this terminal open. Press Ctrl+C to stop.');
  console.log('');
});