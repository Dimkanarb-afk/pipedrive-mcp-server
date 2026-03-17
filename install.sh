#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   pipedrive-mcp-ultimate  installer    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}[1/4] Checking Homebrew...${NC}"
if ! command -v brew &>/dev/null; then
  echo "    Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
else
  echo -e "    ${GREEN}✓ Homebrew already installed${NC}"
fi

echo ""
echo -e "${YELLOW}[2/4] Checking Node.js...${NC}"
if ! command -v node &>/dev/null; then
  echo "    Node.js not found. Installing..."
  brew install node
else
  NODE_VERSION=$(node --version)
  MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [[ "$MAJOR" -lt 18 ]]; then
    echo "    Node.js $NODE_VERSION is too old. Upgrading..."
    brew upgrade node
  else
    echo -e "    ${GREEN}✓ Node.js $NODE_VERSION${NC}"
  fi
fi

echo ""
echo -e "${YELLOW}[3/4] Pipedrive credentials${NC}"
echo ""
echo -e "    Where to find your API token:"
echo -e "    Pipedrive > profile photo > Personal Preferences > API tab"
echo ""

while true; do
  read -rp "    Enter your PIPEDRIVE_API_TOKEN: " API_TOKEN
  if [[ -n "$API_TOKEN" ]]; then break; fi
  echo -e "    ${RED}Token cannot be empty. Try again.${NC}"
done

echo ""
echo -e "    Your subdomain is the first part of your Pipedrive URL."
echo -e "    Example: if your URL is mycompany.pipedrive.com, enter mycompany"
echo ""

while true; do
  read -rp "    Enter your PIPEDRIVE_COMPANY_DOMAIN (subdomain only): " COMPANY_DOMAIN
  if [[ -n "$COMPANY_DOMAIN" ]]; then
    COMPANY_DOMAIN="${COMPANY_DOMAIN%.pipedrive.com}"
    break
  fi
  echo -e "    ${RED}Domain cannot be empty. Try again.${NC}"
done

echo ""
echo -e "${YELLOW}[4/4] Configuring Claude Desktop...${NC}"

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

mkdir -p "$CONFIG_DIR"

if [[ ! -f "$CONFIG_FILE" ]]; then
  cat > "$CONFIG_FILE" <<EOF
{
  "mcpServers": {
    "pipedrive": {
      "command": "npx",
      "args": ["-y", "pipedrive-mcp-ultimate"],
      "env": {
        "PIPEDRIVE_API_TOKEN": "$API_TOKEN",
        "PIPEDRIVE_COMPANY_DOMAIN": "$COMPANY_DOMAIN"
      }
    }
  }
}
EOF
  echo -e "    ${GREEN}✓ Created new config file${NC}"
else
  TMP=$(mktemp)
  python3 - <<PYEOF
import json
with open('$CONFIG_FILE') as f:
    data = json.load(f)
if 'mcpServers' not in data:
    data['mcpServers'] = {}
data['mcpServers']['pipedrive'] = {
    'command': 'npx',
    'args': ['-y', 'pipedrive-mcp-ultimate'],
    'env': {
        'PIPEDRIVE_API_TOKEN': '$API_TOKEN',
        'PIPEDRIVE_COMPANY_DOMAIN': '$COMPANY_DOMAIN'
    }
}
with open('$TMP', 'w') as f:
    json.dump(data, f, indent=2)
PYEOF
  mv "$TMP" "$CONFIG_FILE"
  echo -e "    ${GREEN}✓ Updated existing config${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Installation complete!          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}Next step:${NC} Fully quit Claude Desktop and reopen it."
echo -e "  (Cmd+Q, not just close the window)"
echo ""
echo -e "  Then open a new chat and type:"
echo -e "  ${BLUE}\"show me my recent deals from Pipedrive\"${NC}"
echo ""
