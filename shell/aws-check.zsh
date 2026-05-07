# AWS SSO session check on terminal open
if command -v aws >/dev/null 2>&1; then
  if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo ""
    echo "  AWS session expired. Run: aws sso login"
    echo ""
  fi
fi
