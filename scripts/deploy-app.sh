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
#   scripts/deploy-app.sh <slug> [--branch <branch>] [--build] [--dry-run]
#
# Examples:
#   scripts/deploy-app.sh excalidraw                   # sync from current worktree
#   scripts/deploy-app.sh grist --branch feature/grist # sync from a specific branch
#   scripts/deploy-app.sh drive --branch feature/twake-drive-fork --build
#                                                      # twake-drive needs yarn build first
#   scripts/deploy-app.sh grist --dry-run              # show what would happen, change nothing
#
# Known slugs (slug → source dir → stable dir):
#   twakespace   twake-space-app/  ~/cozy-apps/twake-space-app/
#   grist        grist-app/        ~/cozy-apps/grist-app/
#   excalidraw   excalidraw-app/   ~/cozy-apps/excalidraw-app/
#   kanbn        kanbn-app/        ~/cozy-apps/kanbn-app/
#   openproject  openproject-app/  ~/cozy-apps/openproject-app/
#   n8n          n8n-app/          ~/cozy-apps/n8n-app/
#   twake2fa     twake-2fa-app/    ~/cozy-apps/twake-2fa-app/
#   bentopdf     bentopdf-app/     ~/cozy-apps/bentopdf-app/
#   dashboard    dashboard-app/build ~/cozy-apps/dashboard/       (--build runs `yarn build`)
#   drive        twake-drive/build ~/cozy-apps/drive/             (--build runs `yarn build`)

set -euo pipefail

slug="${1:-}"
shift || true
branch=""
do_build=false
dry_run=false
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) branch="$2"; shift 2 ;;
    --build) do_build=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

# Marker prepended to every line that would normally execute a side effect.
# The functions below honor it: rsync gets --dry-run, cozy-stack calls are
# printed instead of executed.
DRY="$( [ "$dry_run" = true ] && printf '[DRY] ' || true )"

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
  twake2fa)    src_rel="twake-2fa-app"    ; dst_dir="$HOME/cozy-apps/twake-2fa-app"    ;;
  bentopdf)    src_rel="bentopdf-app"     ; dst_dir="$HOME/cozy-apps/bentopdf-app"     ;;
  dashboard)   src_rel="dashboard-app/build"; dst_dir="$HOME/cozy-apps/dashboard"      ;;
  drive)       src_rel="twake-drive/build"; dst_dir="$HOME/cozy-apps/drive"            ;;
  *) echo "Unknown slug: $slug" >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:/usr/local/go/bin:$HOME/go/bin:$PATH"
export COZY_ADMIN_PASSPHRASE="$(cat "$HOME/.cozy/admin-passphrase.txt")"

# Optionally switch branch (refuses if the working tree is dirty, like git
# itself does). On exit, return to whatever branch we started on so we
# don't surprise the operator.
#
# Special case: if the requested branch is already checked out in another
# linked worktree (`git worktree add`), `git checkout` here would fail
# with "already used by worktree at …". Use that worktree as the source
# instead, no checkout needed.
if [ -n "$branch" ]; then
  alt_worktree="$(git -C "$repo_root" worktree list --porcelain 2>/dev/null \
    | awk -v b="refs/heads/$branch" '
        /^worktree / {wt=$2; next}
        $0=="branch "b {print wt; exit}
      ')"
  if [ -n "$alt_worktree" ] && [ "$alt_worktree" != "$repo_root" ]; then
    echo "== $branch is checked out at $alt_worktree (worktree) — using it as source"
    repo_root="$alt_worktree"
  else
    start_branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
    trap 'git -C "$repo_root" checkout "$start_branch" >/dev/null 2>&1 || true' EXIT
    echo "== Checking out $branch (from $start_branch)"
    git -C "$repo_root" checkout "$branch"
  fi
fi

src_dir="$repo_root/$src_rel"
if [ ! -d "$src_dir" ]; then
  echo "FAIL: $src_rel does not exist on this branch" >&2
  exit 1
fi

if [ "$do_build" = true ]; then
  # Drive needs a yarn build before we can sync.
  build_dir="$(dirname "$src_dir")"
  echo "== ${DRY}yarn build in $build_dir"
  if [ "$dry_run" = false ]; then
    ( cd "$build_dir" && yarn build )
  fi
fi

echo "== ${DRY}Syncing $src_dir → $dst_dir"
if [ "$dry_run" = true ]; then
  rsync -an --delete --itemize-changes "$src_dir/" "$dst_dir/" 2>&1 | head -50
else
  mkdir -p "$dst_dir"
  rsync -a --delete "$src_dir/" "$dst_dir/"
fi

# Cache-bust the static asset references in index.html so browsers
# don't keep serving an outdated bar.js / editor.js after a deploy.
# (cozy-stack already adds hashed filenames to the built Drive bundle,
# so this only matters for our home-grown coquilles which ship
# unhashed files like editor.js + bar.js. We append ?v=<8-char md5>.)
if [ "$dry_run" = false ] && [ -f "$dst_dir/index.html" ]; then
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

echo "== ${DRY}Updating $slug on every instance"
mapfile -t instances < <(cozy-stack instances ls 2>/dev/null | awk '{print $1}')
if [ "${#instances[@]}" -eq 0 ]; then
  echo "FAIL: no instances returned by cozy-stack instances ls" >&2
  exit 1
fi
target_src="file://$dst_dir"
fail_count=0
for inst in "${instances[@]}"; do
  printf '  - %-50s ' "$inst"
  current_src=$(cozy-stack apps ls --domain "$inst" 2>/dev/null \
                | awk -v s="$slug" '$1==s {print $2}')
  if [ "$dry_run" = true ]; then
    if [ -z "$current_src" ]; then
      echo "would: install $slug $target_src"
    elif [ "$current_src" = "$target_src" ]; then
      echo "would: update $slug (same source)"
    else
      echo "would: uninstall+install $slug (was $current_src)"
    fi
    continue
  fi
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
  # Healthcheck: cozy-stack apps show must succeed AND report our target_src.
  # An install/update that "succeeded" but left the app in a broken state
  # (e.g. manifest parse error) is caught here. The show output is JSON, so
  # we parse it instead of regexing for a non-existent "Source: …" line.
  current_after=$(cozy-stack apps show "$slug" --domain "$inst" 2>/dev/null \
                  | python3 -c "import json,sys; print(json.load(sys.stdin).get('source',''))" 2>/dev/null)
  if [ "$current_after" = "$target_src" ]; then
    printf '    ✓ healthcheck OK\n'
  else
    printf '    ✗ healthcheck FAIL (Source=%s, expected=%s)\n' \
           "${current_after:-<none>}" "$target_src" >&2
    fail_count=$((fail_count + 1))
  fi
done

if [ "$fail_count" -gt 0 ]; then
  echo "== FAIL: $fail_count/${#instances[@]} instance(s) failed healthcheck" >&2
  exit 1
fi
echo "== ${DRY}Done. $slug deployed from $dst_dir to ${#instances[@]} instance(s)."
