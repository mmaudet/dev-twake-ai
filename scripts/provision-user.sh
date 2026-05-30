#!/usr/bin/env bash
# Provision a Cozy user under the dev-twake.maudet.cloud domain.
# - Creates an instance with the standard apps in the dev context
# - Triggers a passphrase reset and grabs the token from CouchDB so
#   the user can set their own password via the browser
#   (`cozy-stack instances set-passphrase` is NOT used: it stores the
#   scrypt of the raw value, but the login form sends a PBKDF2-derived
#   client hash, so a plaintext set via the CLI will never let the user
#   log in. The /auth/passphrase_reset → /auth/passphrase_renew flow
#   uses the browser to do the PBKDF2 step correctly.)
# - Installs the local twakespace webapp
# - Emails the user the renew URL via smtp.linagora.com

set -euo pipefail

if [ $# -lt 3 ]; then
  cat >&2 <<EOF
Usage: $0 <slug> <public_name> <email>

  slug          subdomain label, becomes <slug>.dev-twake.maudet.cloud
  public_name   first name shown in the Cozy bar (e.g. "Benjamin")
  email         contact email for the instance + recipient of the invite

Reads ~/.cozy/admin-passphrase.txt for the stack admin passphrase.
Reads ~/.cozy/smtp.env for COZY_MAIL_USERNAME and COZY_MAIL_PASSWORD.

CouchDB is reached at http://admin:password@127.0.0.1:5984 to read the
passphrase reset token straight out of the global "instances" db after
POSTing to /auth/passphrase_reset; this is OK in the dev setup but
would have to move to an admin endpoint in production.
EOF
  exit 2
fi

SLUG="$1"
PUBLIC_NAME="$2"
EMAIL="$3"

DOMAIN="${SLUG}.dev-twake.maudet.cloud"
APP_SRC="file://$(cd "$(dirname "$0")/../twake-space-app" && pwd)"
APPS="home,store,drive,photos,settings,contacts,notes,passwords,dataproxy"

export PATH="/usr/local/go/bin:$HOME/go/bin:$PATH"
export COZY_ADMIN_PASSPHRASE="$(cat "$HOME/.cozy/admin-passphrase.txt")"

# shellcheck disable=SC1090
set -a; . "$HOME/.cozy/smtp.env"; set +a

echo "== Creating instance $DOMAIN"
cozy-stack instances add "$DOMAIN" \
  --apps "$APPS" \
  --email "$EMAIL" --locale fr --public-name "$PUBLIC_NAME" --context-name dev

echo
echo "== Installing twakespace from $APP_SRC"
cozy-stack apps install twakespace "$APP_SRC" --domain "$DOMAIN"

echo
echo "== Triggering passphrase reset (CSRF dance)"
COOKIES=$(mktemp)
trap 'rm -f "$COOKIES"' EXIT
CSRF=$(curl -sk -c "$COOKIES" "https://${DOMAIN}/auth/passphrase_reset" \
  | grep -oE 'name="csrf_token" value="[^"]+"' | head -1 \
  | sed 's/.*value="//;s/"//')
if [ -z "$CSRF" ]; then
  echo "FAIL: could not grab csrf_token from /auth/passphrase_reset" >&2
  exit 1
fi
curl -sk -b "$COOKIES" -c "$COOKIES" -X POST "https://${DOMAIN}/auth/passphrase_reset" \
  -d "csrf_token=$CSRF" >/dev/null

echo
echo "== Reading the reset token from CouchDB"
RESET_HEX=$(curl -s "http://admin:password@127.0.0.1:5984/global%2Finstances/_find" \
  -X POST -H 'Content-Type: application/json' \
  -d "{\"selector\":{\"domain\":\"${DOMAIN}\"}}" \
  | python3 -c "
import sys, json, base64
d = json.load(sys.stdin)['docs'][0]
tok = d.get('passphrase_reset_token')
if not tok:
    raise SystemExit('No reset token on the instance — did the POST succeed?')
print(base64.b64decode(tok).hex())
")
if [ -z "$RESET_HEX" ]; then
  echo "FAIL: empty reset token in CouchDB" >&2
  exit 1
fi
RENEW_URL="https://${DOMAIN}/auth/passphrase_renew?token=${RESET_HEX}"

echo
echo "== Sending invitation email to $EMAIL"
python3 - "$PUBLIC_NAME" "$EMAIL" "$DOMAIN" "$RENEW_URL" <<'PY'
import os, smtplib, ssl, sys
from email.message import EmailMessage

name, to, domain, renew = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
base = f"https://{domain}"

text = f"""Bonjour {name},

Tu as un accès à la plateforme de dev Twake (Cozy) que j'héberge.

Définis directement ton mot de passe ici (lien à usage unique, valable 24h) :
{renew}

Une fois ton mot de passe choisi, ta page de connexion habituelle est :
{base}/

Ton compte vient pré-installé avec les apps standard (Drive, Photos, Contacts, Notes,
Passwords, Settings, Store, Home), Twake Drive patché, ainsi que les coquilles maison :
- Twake Space (démo Twake Chat)
- OpenProject : https://openproject.dev-twake.maudet.cloud
- kan.bn : https://kanbn.dev-twake.maudet.cloud
- Excalidraw : intégré dans Drive (+ Créer → Excalidraw)
- Grist : intégré dans Drive (+ Créer → Grist)
- n8n : https://n8n.dev-twake.maudet.cloud (SSO Authelia)

Toutes les apps tierces utilisent le SSO Authelia (auth.maudet.cloud).

Si problème, ping-moi.

Michel
"""

html = f"""<p>Bonjour {name},</p>
<p>Tu as un accès à la plateforme de dev <b>Twake (Cozy)</b> que j'héberge.</p>
<p>Définis directement ton mot de passe ici (lien à usage unique, valable 24h) :<br>
<a href="{renew}">{renew}</a></p>
<p>Une fois ton mot de passe choisi, ta page de connexion habituelle est :<br>
<a href="{base}/">{base}/</a></p>
<p>Ton compte vient pré-installé avec les apps standard (Drive, Photos, Contacts, Notes,
Passwords, Settings, Store, Home), <b>Twake Drive patché</b>, ainsi que les coquilles maison :</p>
<ul>
  <li>Twake Space (démo Twake Chat)</li>
  <li>OpenProject : <a href="https://openproject.dev-twake.maudet.cloud">https://openproject.dev-twake.maudet.cloud</a></li>
  <li>kan.bn : <a href="https://kanbn.dev-twake.maudet.cloud">https://kanbn.dev-twake.maudet.cloud</a></li>
  <li>Excalidraw : intégré dans Drive (<i>+ Créer → Excalidraw</i>)</li>
  <li>Grist : intégré dans Drive (<i>+ Créer → Grist</i>)</li>
  <li>n8n : <a href="https://n8n.dev-twake.maudet.cloud">https://n8n.dev-twake.maudet.cloud</a> (SSO Authelia)</li>
</ul>
<p>Toutes les apps tierces utilisent le SSO Authelia (auth.maudet.cloud).</p>
<p>Si problème, ping-moi.</p>
<p>Michel</p>
"""

# Recipients: the new user as primary, plus the operator on bcc so
# I keep a copy on michel.maudet@gmail.com without leaking that
# address to the user.
BCC = "michel.maudet@gmail.com"

msg = EmailMessage()
msg["From"] = f"Michel Maudet <{os.environ['COZY_MAIL_USERNAME']}>"
msg["To"] = to
msg["Subject"] = "Accès à ta plateforme Twake / Cozy de dev"
msg.set_content(text)
msg.add_alternative(html, subtype="html")

with smtplib.SMTP("smtp.linagora.com", 587, timeout=20) as s:
    s.ehlo(); s.starttls(context=ssl.create_default_context()); s.ehlo()
    s.login(os.environ["COZY_MAIL_USERNAME"], os.environ["COZY_MAIL_PASSWORD"])
    s.send_message(msg, to_addrs=[to, BCC])
print(f"Sent → {to} (bcc: {BCC})")
PY

echo
echo "== Done. Renew URL (also sent in the email):"
echo "$RENEW_URL"
