// Short-circuit license checks for `feat:oidc` so the SSO OIDC module
// (Enterprise-gated upstream) initializes AND its admin endpoints stop
// returning "Plan lacks license for this feature".
//
// n8n has two layers that both call .isLicensed():
//   1) @n8n/backend-common's LicenseState — used by the module registry
//      to decide whether to load the sso-oidc module at all.
//   2) The CLI License wrapper (/dist/license.js) — used by the
//      controller registry middleware that wraps every @Licensed route.
// We patch both to return true for 'feat:oidc' (and arrays containing it).
const fs = require('fs');
const { execSync } = require('child_process');

const NEEDLE = 'isLicensed(feature) {';
const INJECT =
  "isLicensed(feature) { if (feature === 'feat:oidc' || (Array.isArray(feature) && feature.includes('feat:oidc'))) return true;";

function patch(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes("feature === 'feat:oidc'")) {
    console.log('already patched:', file);
    return;
  }
  const patched = src.replace(NEEDLE, INJECT);
  if (patched === src) {
    throw new Error('anchor not found in ' + file);
  }
  fs.writeFileSync(file, patched);
  console.log('patched:', file);
}

function find(args) {
  return execSync('find ' + args).toString().trim().split('\n').filter(Boolean);
}

const targets = [
  ...find(
    "/usr/local/lib -name license-state.js -path '*backend-common*'"
  ),
  ...find("/usr/local/lib/node_modules/n8n/dist -name license.js"),
];

if (!targets.length) {
  console.error('no license files found');
  process.exit(1);
}

for (const f of targets) patch(f);
