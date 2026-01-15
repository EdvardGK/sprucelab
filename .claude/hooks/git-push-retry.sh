#!/bin/bash
# Hook: Retry git push with GITHUB_SECRET on auth failure

# Read JSON input from stdin
input=$(cat)

# Extract tool input command
tool_input=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only process git push commands
if ! echo "$tool_input" | grep -q "git push"; then
  exit 0
fi

# Check if the response indicates an auth failure
tool_response=$(echo "$input" | jq -r '.tool_response // ""')
if ! echo "$tool_response" | grep -qi "could not read Username\|could not read Password\|Authentication failed\|permission denied"; then
  exit 0
fi

# Load GITHUB_SECRET from .env
if [ -f "$CLAUDE_PROJECT_DIR/.env" ]; then
  GITHUB_SECRET=$(grep '^GITHUB_SECRET=' "$CLAUDE_PROJECT_DIR/.env" | cut -d'=' -f2-)
fi

if [ -z "$GITHUB_SECRET" ]; then
  echo "GITHUB_SECRET not found in .env" >&2
  exit 0
fi

# Get remote URL and current branch
cd "$CLAUDE_PROJECT_DIR" || exit 0
remote_url=$(git config --get remote.origin.url)
branch=$(git rev-parse --abbrev-ref HEAD)

# Only handle GitHub HTTPS URLs
if ! echo "$remote_url" | grep -q "https://github.com"; then
  exit 0
fi

# Add token to URL
auth_url=$(echo "$remote_url" | sed "s|https://|https://${GITHUB_SECRET}@|")

echo "Retrying git push with token authentication..." >&2
if git push "$auth_url" "$branch" 2>&1; then
  echo "Push succeeded with token authentication" >&2
else
  echo "Push still failed" >&2
fi
