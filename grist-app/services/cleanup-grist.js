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

const https = require('https');
const { URL } = require('url');

const GRIST_BASE = process.env.GRIST_BASE_URL || 'https://grist.dev-twake.maudet.cloud';
const apiKey = process.env.GRIST_API_KEY || '';

function log(...args) {
  // The cozy konnector runner forwards stdout/stderr to the job log.
  console.log('[cleanup-grist]', ...args);
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
          reject(new Error('DELETE ' + docId + ' → ' + res.statusCode + ' ' + body));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
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
    const r = await deleteGristDoc(docId);
    log('Grist doc', docId, 'deleted (' + r.statusCode + ')');
  } catch (e) {
    log('failed to delete Grist doc', docId + ':', e.message);
    process.exit(1);
  }
})();
