#!/usr/bin/env bash
# Deploy one of our local coquilles to every Cozy instance on the stack.
#
# The cozy-stack `file://` install reads the app source at request time
# (not at install time), so the path it points to MUST stay readable
# across git branch switches. We keep a stable copy under
# ~/cozy-apps/<dir>/ that this script syncs from a chosen git branch
# (or the current worktree), then runs `cozy-stack apps update` against
# every instance returned by `cozy-stack instances ls`.
#
# Usage:
#   scripts/deploy-app.sh <slug> [--branch <branch>] [--build]
#
# Examples:
#   scripts/deploy-app.sh excalidraw                   # sync from current worktree
#   scripts/deploy-app.sh grist --branch feature/grist # sync from a specific branch
#   scripts/deploy-app.sh drive --branch feature/twake-drive-fork --build
#                                                      # twake-drive needs yarn build first
#
# Known slugs (slug → source dir → stable dir):
#   twakespace   twake-space-app/  ~/cozy-apps/twake-space-app/
#   grist        grist-app/        ~/cozy-apps/grist-app/
#   excalidraw   excalidraw-app/   ~/cozy-apps/excalidraw-app/
#   kanbn        kanbn-app/        ~/cozy-apps/kanbn-app/
#   openproject  openproject-app/  ~/cozy-apps/openproject-app/
#   n8n          n8n-app/          ~/cozy-apps/n8n-app/
#   drive        twake-drive/build ~/cozy-apps/drive/             (--build runs `yarn build`)

set -euo pipefail

slug="${1:-}"
shift || true
branch=""
do_build=false
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) branch="$2"; shift 2 ;;
    --build) do_build=true; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$slug" ]; then
  sed -n '2,/^$/p' "$0" >&2
  exit 2
fi

case "$slug" in
  twakespace)  src_rel="twake-space-app"  ; dst_dir="$HOME/cozy-apps/twake-space-app"  ;;
  grist)       src_rel="grist-app"        ; dst_dir="$HOME/cozy-apps/grist-app"        ;;
  excalidraw)  src_rel="excalidraw-app"   ; dst_dir="$HOME/cozy-apps/excalidraw-app"   ;;
  kanbn)       src_rel="kanbn-app"        ; dst_dir="$HOME/cozy-apps/kanbn-app"        ;;
  openproject) src_rel="openproject-app"  ; dst_dir="$HOME/cozy-apps/openproject-app"  ;;
  n8n)         src_rel="n8n-app"          ; dst_dir="$HOME/cozy-apps/n8n-app"          ;;
  drive)       src_rel="twake-drive/build"; dst_dir="$HOME/cozy-apps/drive"            ;;
  *) echo "Unknown slug: $slug" >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:/usr/local/go/bin:$HOME/go/bin:$PATH"
export COZY_ADMIN_PASSPHRASE="$(cat "$HOME/.cozy/admin-passphrase.txt")"

# Optionally switch branch (refuses if the working tree is dirty, like git
# itself does). On exit, return to whatever branch we started on so we
# don't surprise the operator.
if [ -n "$branch" ]; then
  start_branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
  trap 'git -C "$repo_root" checkout "$start_branch" >/dev/null 2>&1 || true' EXIT
  echo "== Checking out $branch (from $start_branch)"
  git -C "$repo_root" checkout "$branch"
fi

src_dir="$repo_root/$src_rel"
if [ ! -d "$src_dir" ]; then
  echo "FAIL: $src_rel does not exist on this branch" >&2
  exit 1
fi

if [ "$do_build" = true ]; then
  # Drive needs a yarn build before we can sync.
  build_dir="$(dirname "$src_dir")"
  echo "== yarn build in $build_dir"
  ( cd "$build_dir" && yarn build )
fi

echo "== Syncing $src_dir → $dst_dir"
mkdir -p "$dst_dir"
rsync -a --delete "$src_dir/" "$dst_dir/"

# Cache-bust the static asset references in index.html so browsers
# don't keep serving an outdated bar.js / editor.js after a deploy.
# (cozy-stack already adds hashed filenames to the built Drive bundle,
# so this only matters for our home-grown coquilles which ship
# unhashed files like editor.js + bar.js. We append ?v=<8-char md5>.)
if [ -f "$dst_dir/index.html" ]; then
  echo "== Adding cache-busters to index.html"
  for asset in bar.js bar.css editor.js editor.css; do
    [ -f "$dst_dir/$asset" ] || continue
    h=$(md5sum "$dst_dir/$asset" | cut -c1-8)
    # Replace either the bare reference (first deploy) or a previous
    # ?v=… tag (subsequent deploy). Cover both " and ' quoted forms.
    sed -i -E "s|([\"'])${asset}([?][^\"']*)?([\"'])|\1${asset}?v=${h}\3|g" \
      "$dst_dir/index.html"
  done
fi

echo "== Updating $slug on every instance"
mapfile -t instances < <(cozy-stack instances ls 2>/dev/null | awk '{print $1}')
if [ "${#instances[@]}" -eq 0 ]; then
  echo "FAIL: no instances returned by cozy-stack instances ls" >&2
  exit 1
fi
target_src="file://$dst_dir"
for inst in "${instances[@]}"; do
  printf '  - %-50s ' "$inst"
  current_src=$(cozy-stack apps ls --domain "$inst" 2>/dev/null \
                | awk -v s="$slug" '$1==s {print $2}')
  if [ -z "$current_src" ]; then
    cozy-stack apps install "$slug" "$target_src" --domain "$inst" 2>&1 | tail -1
  elif [ "$current_src" = "$target_src" ]; then
    # Same source URL — `apps update` re-hashes the on-disk content.
    cozy-stack apps update "$slug" --domain "$inst" 2>&1 | tail -1
  else
    # Different source (e.g. registry://drive/stable vs our local
    # build). `apps update` would silently keep the old source, so
    # we have to uninstall and reinstall.
    cozy-stack apps uninstall "$slug" --domain "$inst" >/dev/null 2>&1
    cozy-stack apps install "$slug" "$target_src" --domain "$inst" 2>&1 | tail -1
  fi
done

echo "== Done. $slug deployed from $dst_dir to ${#instances[@]} instance(s)."
