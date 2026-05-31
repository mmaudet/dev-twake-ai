#!/usr/bin/env bash
# Provision a new user on the dev-twake.maudet.cloud platform.
#
# Three things happen, in order:
#   1. The user is added to Authelia's file backend on hermes (this is
#      THE login path — the Cozy stack runs with
#      `disable_password_authentication: true` for context `dev`, so
#      every cozy login is redirected to /oidc/start → Authelia, and a
#      user without an Authelia account can not get past the SSO).
#   2. A Cozy instance is created with the standard apps + the local
#      `twakespace` webapp. The instance keeps a passphrase as a back-
#      up auth channel (currently unused), wired via the official
#      /auth/passphrase_reset → /auth/passphrase_renew flow so the
#      browser does the PBKDF2 step correctly (the `instances
#      set-passphrase` CLI stores the scrypt of the raw value, which
#      the login form will never match because it hashes the plaintext
#      client-side before sending).
#   3. A welcome mail bundles BOTH credential sets.
#
# Prereqs on athena:
#   ~/.cozy/admin-passphrase.txt   cozy-stack admin passphrase
#   ~/.cozy/smtp.env               COZY_MAIL_USERNAME, COZY_MAIL_PASSWORD,
#                                  optional COZY_BCC_EMAIL
#   ~/.cozy/couchdb.env            COZY_COUCHDB_URL=http://user:pass@host:5984
#   ssh hermes                     passwordless sudo for the authelia bits

set -euo pipefail

if [ $# -lt 3 ]; then
  cat >&2 <<EOF
Usage: $0 <slug> <public_name> <email>

  slug          subdomain label, becomes <slug>.dev-twake.maudet.cloud
                AND the Authelia username (must be the same — that's
                what oidc.userinfo_instance_field=preferred_username
                + userinfo_instance_suffix=.dev-twake.maudet.cloud
                expect).
  public_name   full name shown in the Cozy bar and Authelia profile
                (e.g. "Benjamin Andre")
  email         contact email for the instance + recipient of the invite
EOF
  exit 2
fi

SLUG="$1"
PUBLIC_NAME="$2"
EMAIL="$3"

DOMAIN="${SLUG}.dev-twake.maudet.cloud"
APP_SRC="file://$(cd "$(dirname "$0")/../twake-space-app" && pwd)"
APPS="home,store,drive,photos,settings,contacts,notes,passwords,dataproxy"
AUTHELIA_DB=/opt/authelia/config/users_database.yml

export PATH="/usr/local/go/bin:$HOME/go/bin:$PATH"
export COZY_ADMIN_PASSPHRASE="$(cat "$HOME/.cozy/admin-passphrase.txt")"

# shellcheck disable=SC1090
set -a; . "$HOME/.cozy/smtp.env"; set +a
# shellcheck disable=SC1090
set -a; . "$HOME/.cozy/couchdb.env"; set +a

if [ -z "${COZY_COUCHDB_URL:-}" ]; then
  echo "FAIL: COZY_COUCHDB_URL not set (expected in ~/.cozy/couchdb.env)" >&2
  exit 1
fi

#─────────────────────────────────────────────────────────────────────
# 1. Authelia
#─────────────────────────────────────────────────────────────────────
echo "== Checking Authelia users_database on hermes"
if ssh hermes "sudo grep -qE '^  ${SLUG}:$' $AUTHELIA_DB"; then
  echo "   user '$SLUG' already in Authelia — skipping"
  AUTHELIA_PASS=""
else
  AUTHELIA_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)Xy!"
  echo "== Hashing Authelia password (argon2id)"
  AUTHELIA_HASH=$(ssh hermes \
    "sudo docker exec authelia authelia crypto hash generate argon2 --password '$AUTHELIA_PASS' 2>/dev/null \
     | grep -oE '\\\$argon2id\\\$[^[:space:]]+'")
  if [ -z "$AUTHELIA_HASH" ]; then
    echo "FAIL: could not generate argon2 hash via authelia container" >&2
    exit 1
  fi

  echo "== Appending '$SLUG' to $AUTHELIA_DB"
  ssh hermes "sudo tee -a $AUTHELIA_DB > /dev/null" <<EOF
  ${SLUG}:
    disabled: false
    displayname: '${PUBLIC_NAME}'
    password: '${AUTHELIA_HASH}'
    email: '${EMAIL}'
    groups:
      - 'users'
EOF

  echo "== Restarting Authelia"
  ssh hermes 'sudo docker restart authelia > /dev/null'
  # Give it a moment to come back up before any later flow touches it.
  for _ in 1 2 3 4 5; do
    sleep 1
    if curl -sk -o /dev/null -w '%{http_code}\n' https://auth.maudet.cloud/ | grep -qE '^(200|3[0-9]{2})$'; then
      break
    fi
  done
fi

#─────────────────────────────────────────────────────────────────────
# 2. Cozy instance + back-up passphrase
#─────────────────────────────────────────────────────────────────────
echo
echo "== Creating Cozy instance $DOMAIN"
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
RESET_HEX=$(curl -s "${COZY_COUCHDB_URL%/}/global%2Finstances/_find" \
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

#─────────────────────────────────────────────────────────────────────
# 3. Welcome mail
#─────────────────────────────────────────────────────────────────────
echo
echo "== Sending welcome email to $EMAIL"
python3 - "$PUBLIC_NAME" "$EMAIL" "$DOMAIN" "$RENEW_URL" "$SLUG" "$AUTHELIA_PASS" <<'PY'
import os, smtplib, ssl, sys
from email.message import EmailMessage

name, to, domain, renew, slug, authelia_pass = sys.argv[1:7]
base = f"https://{domain}"

if authelia_pass:
    authelia_text = f"""Tes identifiants Authelia (c'est *par là* que tu te connectes) :

  utilisateur : {slug}
  mot de passe : {authelia_pass}

Pense à le changer dès la première connexion via https://auth.maudet.cloud/.

"""
    authelia_html = f"""<p>Tes identifiants <b>Authelia</b> (c'est <i>par là</i> que tu te connectes) :</p>
<ul>
  <li>utilisateur : <code>{slug}</code></li>
  <li>mot de passe : <code>{authelia_pass}</code></li>
</ul>
<p>Pense à le changer dès la première connexion via <a href="https://auth.maudet.cloud/">https://auth.maudet.cloud/</a>.</p>
"""
else:
    authelia_text = "(Compte Authelia déjà existant pour ce slug — pas de mot de passe joint.)\n\n"
    authelia_html = "<p><i>Compte Authelia déjà existant pour ce slug — pas de mot de passe joint.</i></p>"

text = f"""Bonjour {name},

Tu as un accès à la plateforme de dev Twake (Cozy) que j'héberge.

{authelia_text}Ta page d'entrée :
{base}/
  → tu seras redirigé sur auth.maudet.cloud
  → après login, tu retombes sur ta Cozy.

(Optionnel — back-up Cozy passphrase, ne sert que si on coupe Authelia)
Définis-le ici, lien à usage unique valable 24h :
{renew}

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
{authelia_html}
<p><b>Ta page d'entrée</b> :<br>
<a href="{base}/">{base}/</a><br>
&nbsp;&nbsp;→ tu seras redirigé sur <code>auth.maudet.cloud</code><br>
&nbsp;&nbsp;→ après login, tu retombes sur ta Cozy.</p>
<p><i>Optionnel — back-up Cozy passphrase, ne sert que si on coupe Authelia.
Définis-le ici, lien à usage unique valable 24h :<br>
<a href="{renew}">{renew}</a></i></p>
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

# Recipients: the new user as primary, plus the operator on bcc if
# COZY_BCC_EMAIL is set in the environment (kept out of the visible
# headers to avoid leaking it to the user).
BCC = os.environ.get("COZY_BCC_EMAIL", "").strip()

msg = EmailMessage()
msg["From"] = f"Michel Maudet <{os.environ['COZY_MAIL_USERNAME']}>"
msg["To"] = to
msg["Subject"] = "Accès à ta plateforme Twake / Cozy de dev"
msg.set_content(text)
msg.add_alternative(html, subtype="html")

recipients = [to] + ([BCC] if BCC else [])

with smtplib.SMTP("smtp.linagora.com", 587, timeout=20) as s:
    s.ehlo(); s.starttls(context=ssl.create_default_context()); s.ehlo()
    s.login(os.environ["COZY_MAIL_USERNAME"], os.environ["COZY_MAIL_PASSWORD"])
    s.send_message(msg, to_addrs=recipients)
print(f"Sent → {to}" + (f" (bcc: {BCC})" if BCC else ""))
PY

echo
echo "== Done."
echo "   Authelia user : $SLUG"
[ -n "$AUTHELIA_PASS" ] && echo "   Authelia pass : $AUTHELIA_PASS"
echo "   Cozy renew    : $RENEW_URL"
