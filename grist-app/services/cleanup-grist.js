#!/usr/bin/env node
// Service triggered by @event io.cozy.files:DELETED.
//
// For every file purged from the Drive, we look at the prior doc state in
// COZY_COUCH_DOC. If it was a Grist shortcut (metadata.target.app === "grist"
// with a docId), we call the Grist API to delete the matching doc, so the
// Grist side stays in sync with the Drive tree.
//
// The Grist API key is read from the GRIST_API_KEY env var, populated by the
// cozy-stack systemd unit via EnvironmentFile=~/.cozy/grist.env. If unset,
// the service logs the would-be DELETE and exits 0 — that way the trigger
// can be wired up before the secret is provisioned.

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const GRIST_BASE = process.env.GRIST_BASE_URL || 'https://grist.dev-twake.maudet.cloud';
const DEBUG_LOG = '/tmp/cleanup-grist.log';

// cozy-stack hands its services an explicit env list (COZY_URL,
// COZY_CREDENTIALS, COZY_COUCH_DOC, …) and replaces the child's env wholesale
// — see worker/exec/common.go: `cmd.Env = env`. That means HOME, PATH and our
// GRIST_API_KEY (loaded into the cozy-stack process via systemd
// EnvironmentFile) are all stripped before we run. We recover the home dir
// from /etc/passwd via os.userInfo() and read ~/.cozy/grist.env directly.
const os = require('os');
function loadApiKey() {
  if (process.env.GRIST_API_KEY) return process.env.GRIST_API_KEY;
  let home = process.env.HOME;
  if (!home) { try { home = os.userInfo().homedir; } catch {} }
  const envPath = process.env.GRIST_ENV_FILE
    || (home ? `${home}/.cozy/grist.env` : null);
  if (!envPath) return '';
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    const m = text.match(/^\s*GRIST_API_KEY\s*=\s*(.+?)\s*$/m);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}
const apiKey = loadApiKey();

function log(...args) {
  // The cozy konnector runner forwards stdout/stderr to the job log, but
  // it isn't surfaced at INFO level in journalctl, so we also tee to a
  // tmp file for debugging the event payload + delete result.
  console.log('[cleanup-grist]', ...args);
  try {
    fs.appendFileSync(DEBUG_LOG,
      new Date().toISOString() + ' ' + args.map(a =>
        typeof a === 'string' ? a : JSON.stringify(a)
      ).join(' ') + '\n');
  } catch {}
}

function parseTriggerDoc() {
  const raw = process.env.COZY_COUCH_DOC;
  if (!raw) {
    log('no COZY_COUCH_DOC in env — nothing to do');
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    log('failed to parse COZY_COUCH_DOC:', e.message);
    return null;
  }
}

function pickGristDocId(doc) {
  if (!doc) return null;
  if (doc.type !== 'file') return null;
  const target = doc.metadata && doc.metadata.target;
  if (!target) return null;
  if (target.app !== 'grist') return null;
  if (!target.docId) return null;
  return target.docId;
}

function deleteGristDoc(docId) {
  return new Promise((resolve, reject) => {
    const u = new URL(GRIST_BASE + '/api/docs/' + encodeURIComponent(docId));
    const req = https.request({
      method: 'DELETE',
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/json'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body });
        } else {
          const err = new Error('DELETE ' + docId + ' → ' + res.statusCode + ' ' + body);
          err.statusCode = res.statusCode;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// A 4xx other than 408/429 is a permanent client error — no point retrying.
function isRetriable(err) {
  if (!err.statusCode) return true; // network / DNS / TLS — try again
  if (err.statusCode === 408 || err.statusCode === 429) return true;
  if (err.statusCode >= 500) return true;
  return false;
}

async function deleteGristDocWithRetry(docId) {
  const delaysMs = [1000, 3000, 10000];
  let lastError;
  for (let attempt = 0; attempt < delaysMs.length + 1; attempt++) {
    try {
      return await deleteGristDoc(docId);
    } catch (e) {
      lastError = e;
      log('attempt', attempt + 1, 'failed:', e.message);
      if (!isRetriable(e) || attempt === delaysMs.length) break;
      await new Promise(r => setTimeout(r, delaysMs[attempt]));
    }
  }
  throw lastError;
}

(async () => {
  const doc = parseTriggerDoc();
  const docId = pickGristDocId(doc);
  if (!docId) {
    log('event was not a Grist shortcut — skipping');
    return;
  }
  if (!apiKey) {
    log('GRIST_API_KEY not set — would DELETE Grist doc', docId, '(skipping)');
    return;
  }
  try {
    const r = await deleteGristDocWithRetry(docId);
    log('Grist doc', docId, 'deleted (' + r.statusCode + ')');
  } catch (e) {
    log('failed to delete Grist doc', docId, 'after retries:', e.message);
    process.exit(1);
  }
})();
