#!/usr/bin/env bash
# Provision a Cozy user under the dev-twake.maudet.cloud domain.
# - Creates an instance with the standard apps in the dev context
# - Sets a freshly-generated temporary passphrase the user must rotate
#   on first login (cozy-stack no longer prints a registerToken for
#   instances created in a context that has OIDC configured, see
#   model/instance/lifecycle/create.go which auto-assigns a random
#   passphrase when authentication.<ctx>.oidc is set)
# - Installs the local twakespace webapp
# - Emails the user the temp passphrase + login URL via smtp.linagora.com

set -euo pipefail

if [ $# -lt 3 ]; then
  cat >&2 <<EOF
Usage: $0 <slug> <public_name> <email>

  slug          subdomain label, becomes <slug>.dev-twake.maudet.cloud
  public_name   first name shown in the Cozy bar (e.g. "Benjamin")
  email         contact email for the instance + recipient of the invite

Reads ~/.cozy/admin-passphrase.txt for the stack admin passphrase.
Reads ~/.cozy/smtp.env for COZY_MAIL_USERNAME and COZY_MAIL_PASSWORD.
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

# 14 url-safe chars + an exclamation mark to satisfy Cozy's complexity
# rules. Never written to disk; only handed to cozy-stack and the
# outgoing mail.
TEMP_PASS="$(openssl rand -base64 16 | tr -d '/+=' | head -c 14)!"

echo
echo "== Setting temporary passphrase"
cozy-stack instances set-passphrase "$DOMAIN" "$TEMP_PASS"

echo
echo "== Installing twakespace from $APP_SRC"
cozy-stack apps install twakespace "$APP_SRC" --domain "$DOMAIN"

URL="https://${DOMAIN}/"

echo
echo "== Sending invitation email to $EMAIL"
python3 - "$PUBLIC_NAME" "$EMAIL" "$URL" "$TEMP_PASS" <<'PY'
import os, smtplib, ssl, sys
from email.message import EmailMessage

name, to, url, temp = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
base = url.rstrip("/")

text = f"""Bonjour {name},

Tu as un accès à la plateforme de dev Twake (Cozy) que j'héberge.

Ton instance personnelle :
{base}/

Mot de passe temporaire pour ta première connexion :
{temp}

Pense à le changer immédiatement après la connexion via Paramètres → Sécurité.

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
<p>Ton instance personnelle :<br><a href="{base}/">{base}/</a></p>
<p>Mot de passe temporaire pour ta première connexion :<br>
<code style="background:#f3f3f7;padding:4px 8px;border-radius:4px;font-size:14px">{temp}</code></p>
<p>Pense à le changer immédiatement après la connexion via <b>Paramètres → Sécurité</b>.</p>
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
echo "== Done. Login URL:"
echo "$URL"
echo "== Done. Temporary passphrase (also in the email): $TEMP_PASS"
