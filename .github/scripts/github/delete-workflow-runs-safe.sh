#!/usr/bin/env bash
set -euo pipefail

repo="${1:-SinLess-Games/Aerealith-AI}"
status="${2:-completed}"
per_page="${PER_PAGE:-50}"
delete_sleep="${DELETE_SLEEP:-2}"
max_retries="${MAX_RETRIES:-6}"

token="$(gh auth token)"
api_base="https://api.github.com"

mkdir -p .outputs/github-actions-cleanup

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

sleep_for_rate_limit() {
  local headers_file="$1"
  local attempt="$2"

  local retry_after
  retry_after="$(awk 'BEGIN{IGNORECASE=1} /^retry-after:/ {gsub("\r","",$2); print $2}' "$headers_file" | tail -n 1)"

  local remaining
  remaining="$(awk 'BEGIN{IGNORECASE=1} /^x-ratelimit-remaining:/ {gsub("\r","",$2); print $2}' "$headers_file" | tail -n 1)"

  local reset_epoch
  reset_epoch="$(awk 'BEGIN{IGNORECASE=1} /^x-ratelimit-reset:/ {gsub("\r","",$2); print $2}' "$headers_file" | tail -n 1)"

  if [[ -n "${retry_after:-}" && "$retry_after" =~ ^[0-9]+$ ]]; then
    log "Rate limited. Sleeping for retry-after: ${retry_after}s"
    sleep "$retry_after"
    return 0
  fi

  if [[ "${remaining:-}" == "0" && -n "${reset_epoch:-}" && "$reset_epoch" =~ ^[0-9]+$ ]]; then
    local now
    now="$(date +%s)"

    local wait_seconds
    wait_seconds="$((reset_epoch - now + 5))"

    if [[ "$wait_seconds" -lt 60 ]]; then
      wait_seconds=60
    fi

    log "Primary rate limit reached. Sleeping until reset: ${wait_seconds}s"
    sleep "$wait_seconds"
    return 0
  fi

  local backoff
  backoff="$((60 * attempt))"

  log "Possible secondary rate limit. Sleeping with backoff: ${backoff}s"
  sleep "$backoff"
}

github_api() {
  local method="$1"
  local path="$2"
  local output_file="$3"

  local attempt=1

  while [[ "$attempt" -le "$max_retries" ]]; do
    local headers_file
    headers_file="$(mktemp)"

    local status_code
    status_code="$(
      curl -sS \
        -X "$method" \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -D "$headers_file" \
        -o "$output_file" \
        -w "%{http_code}" \
        "$api_base/$path"
    )"

    if [[ "$status_code" =~ ^2[0-9][0-9]$ ]]; then
      rm -f "$headers_file"
      return 0
    fi

    if [[ "$status_code" == "403" || "$status_code" == "429" ]]; then
      log "GitHub returned HTTP $status_code for $method $path"
      sleep_for_rate_limit "$headers_file" "$attempt"
      rm -f "$headers_file"
      attempt="$((attempt + 1))"
      continue
    fi

    log "GitHub returned HTTP $status_code for $method $path"
    cat "$output_file" || true
    rm -f "$headers_file"
    return 1
  done

  log "Giving up after $max_retries attempts: $method $path"
  return 1
}

cancel_active_runs() {
  for active_status in queued in_progress waiting requested pending; do
    log "Checking active runs with status: $active_status"

    local page=1

    while true; do
      local list_file
      list_file="$(mktemp)"

      github_api "GET" "repos/$repo/actions/runs?per_page=$per_page&status=$active_status&page=$page" "$list_file" || {
        rm -f "$list_file"
        break
      }

      local run_ids
      run_ids="$(jq -r '.workflow_runs[]?.id' "$list_file")"

      rm -f "$list_file"

      if [[ -z "$run_ids" ]]; then
        break
      fi

      while IFS= read -r run_id; do
        [[ -z "$run_id" ]] && continue

        log "Force canceling $active_status run: $run_id"

        local body_file
        body_file="$(mktemp)"

        github_api "POST" "repos/$repo/actions/runs/$run_id/force-cancel" "$body_file" || true
        rm -f "$body_file"

        sleep "$delete_sleep"
      done <<< "$run_ids"

      page="$((page + 1))"
    done
  done
}

delete_runs() {
  log "Deleting workflow runs from repo: $repo"
  log "Run status filter: $status"

  local page=1
  local deleted=0
  local failed=0

  while true; do
    local list_file
    list_file="$(mktemp)"

    github_api "GET" "repos/$repo/actions/runs?per_page=$per_page&status=$status&page=$page" "$list_file" || {
      rm -f "$list_file"
      break
    }

    cp "$list_file" ".outputs/github-actions-cleanup/runs-page-${page}.json"

    local run_ids
    run_ids="$(jq -r '.workflow_runs[]?.id' "$list_file")"

    rm -f "$list_file"

    if [[ -z "$run_ids" ]]; then
      break
    fi

    while IFS= read -r run_id; do
      [[ -z "$run_id" ]] && continue

      log "Deleting workflow run: $run_id"

      local body_file
      body_file="$(mktemp)"

      if github_api "DELETE" "repos/$repo/actions/runs/$run_id" "$body_file"; then
        deleted="$((deleted + 1))"
        log "Deleted run: $run_id"
      else
        failed="$((failed + 1))"
        log "Failed to delete run: $run_id"
      fi

      rm -f "$body_file"

      sleep "$delete_sleep"
    done <<< "$run_ids"

    page="$((page + 1))"
  done

  log "Done. Deleted: $deleted. Failed: $failed."
}

log "Starting safe workflow cleanup."
log "Repository: $repo"

cancel_active_runs

log "Waiting 60 seconds after cancellation attempts."
sleep 60

delete_runs