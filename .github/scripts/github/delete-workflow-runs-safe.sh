#!/usr/bin/env bash
set -Eeuo pipefail

repo="${1:-SinLess-Games/Aerealith-AI}"
status="${2:-completed}"

per_page="${PER_PAGE:-100}"
delete_sleep="${DELETE_SLEEP:-3}"
max_retries="${MAX_RETRIES:-8}"
cancel_wait="${CANCEL_WAIT:-60}"
dry_run="${DRY_RUN:-0}"

api_base="https://api.github.com"
output_dir=".outputs/github-actions-cleanup"

mkdir -p "$output_dir"

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    log "Missing required command: $command_name"
    exit 1
  fi
}

require_command gh
require_command curl
require_command jq
require_command awk
require_command mktemp
require_command date

if ! gh auth status >/dev/null 2>&1; then
  log "GitHub CLI is not authenticated."
  log "Run: gh auth login"
  exit 1
fi

token="$(gh auth token)"

header_value() {
  local headers_file="$1"
  local header_name="$2"

  awk -v name="$header_name" '
    BEGIN {
      IGNORECASE = 1
    }
    $0 ~ "^" name ":" {
      gsub("\r", "")
      sub("^[^:]+:[[:space:]]*", "")
      value = $0
    }
    END {
      print value
    }
  ' "$headers_file"
}

sleep_for_rate_limit() {
  local headers_file="$1"
  local attempt="$2"

  local retry_after
  retry_after="$(header_value "$headers_file" "retry-after")"

  local remaining
  remaining="$(header_value "$headers_file" "x-ratelimit-remaining")"

  local reset_epoch
  reset_epoch="$(header_value "$headers_file" "x-ratelimit-reset")"

  if [[ -n "${retry_after:-}" && "$retry_after" =~ ^[0-9]+$ ]]; then
    log "Rate limited. Sleeping for retry-after: ${retry_after}s"
    sleep "$retry_after"
    return 0
  fi

  if [[ "${remaining:-}" == "0" && -n "${reset_epoch:-}" && "$reset_epoch" =~ ^[0-9]+$ ]]; then
    local now
    now="$(date +%s)"

    local wait_seconds
    wait_seconds="$((reset_epoch - now + 10))"

    if [[ "$wait_seconds" -lt 60 ]]; then
      wait_seconds=60
    fi

    log "Primary rate limit reached. Sleeping until reset: ${wait_seconds}s"
    sleep "$wait_seconds"
    return 0
  fi

  local backoff
  backoff="$((60 * attempt))"

  if [[ "$backoff" -gt 900 ]]; then
    backoff=900
  fi

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

    if [[ -s "$output_file" ]]; then
      cat "$output_file" >&2 || true
      printf '\n' >&2
    fi

    rm -f "$headers_file"
    return 1
  done

  log "Giving up after $max_retries attempts: $method $path"
  return 1
}

list_first_page_run_ids() {
  local run_status="$1"
  local list_file="$2"

  github_api \
    "GET" \
    "repos/$repo/actions/runs?per_page=$per_page&status=$run_status&page=1" \
    "$list_file"

  jq -r '.workflow_runs[]?.id' "$list_file"
}

cancel_active_runs() {
  local active_statuses=(
    queued
    in_progress
    waiting
    requested
    pending
  )

  for active_status in "${active_statuses[@]}"; do
    log "Checking active runs with status: $active_status"

    while true; do
      local list_file
      list_file="$(mktemp)"

      local run_ids
      if ! run_ids="$(list_first_page_run_ids "$active_status" "$list_file")"; then
        rm -f "$list_file"
        break
      fi

      cp "$list_file" "$output_dir/active-${active_status}-page-1.json"
      rm -f "$list_file"

      if [[ -z "$run_ids" ]]; then
        log "No active runs found for status: $active_status"
        break
      fi

      while IFS= read -r run_id; do
        [[ -z "$run_id" ]] && continue

        if [[ "$dry_run" == "1" ]]; then
          log "[DRY RUN] Would force-cancel $active_status workflow run: $run_id"
          continue
        fi

        log "Force-canceling $active_status workflow run: $run_id"

        local body_file
        body_file="$(mktemp)"

        github_api \
          "POST" \
          "repos/$repo/actions/runs/$run_id/force-cancel" \
          "$body_file" || true

        rm -f "$body_file"

        sleep "$delete_sleep"
      done <<< "$run_ids"

      if [[ "$dry_run" == "1" ]]; then
        break
      fi
    done
  done
}

delete_runs_by_status() {
  local run_status="$1"

  log "Deleting workflow runs from repo: $repo"
  log "Run status filter: $run_status"

  local deleted=0
  local failed=0
  local pass=1

  while true; do
    local list_file
    list_file="$(mktemp)"

    local run_ids
    if ! run_ids="$(list_first_page_run_ids "$run_status" "$list_file")"; then
      rm -f "$list_file"
      break
    fi

    cp "$list_file" "$output_dir/delete-${run_status}-pass-${pass}.json"
    rm -f "$list_file"

    if [[ -z "$run_ids" ]]; then
      log "No workflow runs remain for status: $run_status"
      break
    fi

    local pass_deleted=0
    local pass_failed=0

    while IFS= read -r run_id; do
      [[ -z "$run_id" ]] && continue

      if [[ "$dry_run" == "1" ]]; then
        log "[DRY RUN] Would delete workflow run: $run_id"
        continue
      fi

      log "Deleting workflow run: $run_id"

      local body_file
      body_file="$(mktemp)"

      if github_api \
        "DELETE" \
        "repos/$repo/actions/runs/$run_id" \
        "$body_file"; then
        deleted="$((deleted + 1))"
        pass_deleted="$((pass_deleted + 1))"
        log "Deleted workflow run: $run_id"
      else
        failed="$((failed + 1))"
        pass_failed="$((pass_failed + 1))"
        log "Failed to delete workflow run: $run_id"
      fi

      rm -f "$body_file"

      sleep "$delete_sleep"
    done <<< "$run_ids"

    if [[ "$dry_run" == "1" ]]; then
      log "[DRY RUN] Stopping after first fetched page."
      break
    fi

    if [[ "$pass_deleted" -eq 0 && "$pass_failed" -gt 0 ]]; then
      log "No runs were deleted on this pass, but failures occurred. Stopping to avoid an infinite loop."
      break
    fi

    pass="$((pass + 1))"
  done

  log "Done deleting status '$run_status'. Deleted: $deleted. Failed: $failed."
}

log "Starting safe workflow cleanup."
log "Repository: $repo"
log "Target status: $status"
log "Per page: $per_page"
log "Sleep between delete/cancel calls: ${delete_sleep}s"
log "Dry run: $dry_run"

cancel_active_runs

if [[ "$dry_run" != "1" ]]; then
  log "Waiting ${cancel_wait}s after cancellation attempts."
  sleep "$cancel_wait"
fi

delete_runs_by_status "$status"

log "Workflow cleanup finished."