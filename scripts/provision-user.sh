#!/usr/bin/env bash
# Provision a Cozy user under the dev-twake.maudet.cloud domain.
# - Creates an instance with the standard apps
# - Installs the local twakespace webapp
# - Sends an invitation email through smtp.linagora.com

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
CREATE_OUT=$(cozy-stack instances add "$DOMAIN" \
  --apps "$APPS" \
  --email "$EMAIL" --locale fr --public-name "$PUBLIC_NAME" --context-name dev)
echo "$CREATE_OUT"

TOKEN=$(echo "$CREATE_OUT" | grep -oE 'registerToken=[a-f0-9]+' | head -1 | cut -d= -f2)
if [ -z "$TOKEN" ]; then
  echo "FAIL: could not extract registerToken" >&2
  exit 1
fi
URL="https://${DOMAIN}/?registerToken=${TOKEN}"

echo
echo "== Installing twakespace from $APP_SRC"
cozy-stack apps install twakespace "$APP_SRC" --domain "$DOMAIN"

echo
echo "== Sending invitation email to $EMAIL"
python3 - "$PUBLIC_NAME" "$EMAIL" "$URL" <<'PY'
import os, smtplib, ssl, sys
from email.message import EmailMessage

name, to, url = sys.argv[1], sys.argv[2], sys.argv[3]
base = url.split("/?")[0]

text = f"""Bonjour {name},

Tu as un accès à la plateforme de dev Twake (Cozy) que j'héberge.

Ton instance personnelle :
{url}

Ce lien te permet de définir ton mot de passe et d'accéder à ta Cozy.
Le lien d'inscription est à usage unique — une fois ton mot de passe défini, l'URL de connexion devient :
{base}

Ton compte vient pré-installé avec les apps : Drive, Photos, Contacts, Notes,
Passwords, Store, Settings, ainsi que la démo Twake Space.

Si problème, ping-moi.

Michel
"""

html = f"""<p>Bonjour {name},</p>
<p>Tu as un accès à la plateforme de dev <b>Twake (Cozy)</b> que j'héberge.</p>
<p>Ton instance personnelle :<br><a href="{url}">{url}</a></p>
<p>Ce lien te permet de définir ton mot de passe et d'accéder à ta Cozy.<br>
Le lien d'inscription est à usage unique — une fois ton mot de passe défini, l'URL de connexion devient :<br>
<a href="{base}">{base}</a></p>
<p>Ton compte vient pré-installé avec les apps : Drive, Photos, Contacts, Notes,
Passwords, Store, Settings, ainsi que la démo <b>Twake Space</b>.</p>
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
echo "== Done. Register URL:"
echo "$URL"
