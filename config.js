// ─────────────────────────────────────────────────────────────────────────────
// IMPERIO SAM SCANNER - CONFIG FILE
// ─────────────────────────────────────────────────────────────────────────────
//
//  ⚠️  NEVER commit this file to GitHub.
//
//  Add this line to your .gitignore file:
//      config.js
//
//  HOW TO GET YOUR SAM.gov API KEY:
//      1. Go to sam.gov
//      2. Click your name (top right) → Account Details
//      3. Scroll to "Public API Key"
//      4. Copy it and paste below
//
//  This file is loaded by sam-scanner.html via:
//      <script src="config.js"></script>
//  before the main app script, so SAM_CONFIG.apiKey is available globally.
//
// ─────────────────────────────────────────────────────────────────────────────

// let front = "SAM-3b0dd3c9-";
// let mid   = "aa37-4fbf-9682-";
// let end   = "78d452027cfa";

// const Piggy = {front, mid, end}



// const SAM_CONFIG = {
//     apiKey: Piggy
// };


const { useState, useEffect } = React;
      let front = 'SAM-3b0dd3c9-';
      let mid = 'aa37-4fbf-9682-';
      let end = '78d452027cfa';

      const Piggy = { front, mid, end };

      `SAM-3b0dd3c9-aa37-4fbf-9682-78d452027cfa`