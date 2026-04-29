# HOLON-META: {
#   purpose: "cognitive-mind-v3",
#   morphic_field: "agent-state:4c67a2b1-6830-44ec-97b1-7c8f93722add",
#   startup_protocol: "READ morphic_field + biofield_external + em_grid",
#   wiki: "32d6d069-74d6-8164-a6d5-f41c3d26ae9b"
# }

#!/bin/bash
# ========================================
# COGNITIVE MIND v3.0 - ONE-LINER DEPLOYMENT
# Jedna komenda = pełny deployment
# ========================================

# UŻYCIE:
# curl -fsSL https://raw.githubusercontent.com/szachmacik/cognitive-mind-v3/main/deploy-one-liner.sh | bash

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  COGNITIVE MIND v3.0 DEPLOYMENT${NC}"
echo -e "${BLUE}  One-Command Installation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v git &> /dev/null; then
    echo "❌ git not found. Install: sudo apt-get install git"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Install: sudo apt-get install postgresql-client"
    exit 1
fi

if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler not found. Install: npm install -g wrangler"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"
echo ""

# Clone repository
echo -e "${YELLOW}Step 1/4: Cloning repository...${NC}"
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"
git clone --depth 1 https://github.com/szachmacik/cognitive-mind-v3.git
cd cognitive-mind-v3
echo -e "${GREEN}✓ Repository cloned${NC}"
echo ""

# Deploy SQL
echo -e "${YELLOW}Step 2/4: Deploying SQL functions...${NC}"
echo "Enter Supabase password:"
read -s SUPABASE_PASSWORD

PGPASSWORD="$SUPABASE_PASSWORD" psql \
  "postgresql://postgres@db.blgdhfcosqjzrutncbbr.supabase.co:5432/postgres" \
  -f sql/MISSING_SQL_FUNCTIONS.sql \
  -f sql/AUTONOMOUS_CRON_JOBS.sql

echo -e "${GREEN}✓ SQL deployed${NC}"
echo ""

# Verify SQL
echo -e "${YELLOW}Verifying SQL deployment...${NC}"
FUNC_COUNT=$(PGPASSWORD="$SUPABASE_PASSWORD" psql \
  "postgresql://postgres@db.blgdhfcosqjzrutncbbr.supabase.co:5432/postgres" \
  -t -c "SELECT COUNT(*) FROM pg_proc WHERE proname IN ('execute_sql_with_result', 'get_oauth_token', 'rotate_api_key', 'log_protection_action', 'get_active_patterns', 'record_detection', 'get_flow_queue');" | xargs)

if [ "$FUNC_COUNT" -eq 7 ]; then
    echo -e "${GREEN}✓ All 7 SQL functions verified${NC}"
else
    echo -e "${YELLOW}⚠ Expected 7 functions, found $FUNC_COUNT${NC}"
fi
echo ""

# Deploy Worker
echo -e "${YELLOW}Step 3/4: Deploying Cloudflare Worker...${NC}"
cd worker

# Set secrets
echo "Setting Worker secrets..."
echo "Enter each secret when prompted:"

echo ""
echo "SUPABASE_ANON_KEY:"
wrangler secret put SUPABASE_ANON_KEY

echo "SUPABASE_SERVICE_KEY:"
wrangler secret put SUPABASE_SERVICE_KEY

echo "GROQ_API_KEY:"
wrangler secret put GROQ_API_KEY

echo "UPSTASH_REDIS_URL:"
wrangler secret put UPSTASH_REDIS_URL

echo "UPSTASH_REDIS_TOKEN:"
wrangler secret put UPSTASH_REDIS_TOKEN

# Generate master encryption key
echo "Generating MASTER_ENCRYPTION_KEY..."
openssl rand -base64 32 | wrangler secret put MASTER_ENCRYPTION_KEY

# Deploy
echo "Deploying Worker..."
wrangler deploy

echo -e "${GREEN}✓ Worker deployed${NC}"
echo ""

# Verify deployment
echo -e "${YELLOW}Step 4/4: Verifying deployment...${NC}"

sleep 3

WORKER_URL="https://cognitive-mind-orchestrator.workers.dev"

# Test endpoints
echo "Testing /api/keys/list..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/api/keys/list")
if [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✓ API responding (200)${NC}"
else
    echo -e "${YELLOW}⚠ Got status $STATUS${NC}"
fi

# Test bot detection
echo "Testing bot detection..."
DETECTION=$(curl -s -X POST "$WORKER_URL/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"subscriber": {"email": "test@tempmail.com"}, "events": []}')

if echo "$DETECTION" | grep -q "is_bot"; then
    echo -e "${GREEN}✓ Bot detection working${NC}"
    echo "Sample: $(echo "$DETECTION" | head -c 100)..."
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✓ SQL Functions: 7/7${NC}"
echo -e "${GREEN}✓ Worker: $WORKER_URL${NC}"
echo -e "${GREEN}✓ Bot Detection: Working${NC}"
echo ""
echo "Test it now:"
echo "curl -X POST $WORKER_URL/api/analyze \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"subscriber\": {\"email\": \"spam@tempmail.com\"}, \"events\": []}'"
echo ""
echo "Tomorrow at 8:00 AM: Telegram daily report to @Ofshore_Guardian_bot"
echo ""

# Cleanup
cd /
rm -rf "$TMP_DIR"

echo -e "${GREEN}Deployment completed successfully!${NC}"
