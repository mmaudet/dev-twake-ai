# OpenProject Community 13 with the Enterprise gate around OmniAuth SSO
# strategies (OIDC, SAML) removed, so that we can plug OpenProject into
# Authelia OIDC despite running the free Community edition.
#
# Upstream pin: openproject/community:13 (sha256:e3582d3e... at 2026-05-29)
FROM openproject/community:13

# Always allow filtered OmniAuth strategies (Enterprise-only gate dropped).
# Keeps the surrounding method definition intact.
RUN ruby -i.bak -pe "gsub(/!EnterpriseToken\.show_banners\? \|\| name == 'developer'/, 'true')" \
      /app/modules/auth_plugins/lib/open_project/plugins/auth_plugin.rb \
 && grep -A2 'def self.filtered_strategy?' \
      /app/modules/auth_plugins/lib/open_project/plugins/auth_plugin.rb
