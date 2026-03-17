# pipedrive-mcp

Full-featured Pipedrive MCP server for Claude Desktop. Supports deals, leads, persons, organizations, notes, activities, pipelines, and more — all controllable via natural language.

## Installation

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pipedrive": {
      "command": "npx",
      "args": ["-y", "pipedrive-mcp"],
      "env": {
        "PIPEDRIVE_API_TOKEN": "your_api_token_here",
        "PIPEDRIVE_COMPANY_DOMAIN": "your_company_subdomain"
      }
    }
  }
}
```

**Where to find your credentials:**

- **`PIPEDRIVE_API_TOKEN`**: Pipedrive → Settings → Personal preferences → API → Your personal API token
- **`PIPEDRIVE_COMPANY_DOMAIN`**: Just the subdomain of your Pipedrive URL. If your URL is `https://mycompany.pipedrive.com`, use `mycompany`

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

After saving, restart Claude Desktop.

---

## Available Tools

### Deals (6 tools)
| Tool | Description |
|------|-------------|
| `pipedrive_list_deals` | List deals with advanced filters — status, stage, pipeline, owner, value range, days back, title search |
| `pipedrive_get_deal` | Get full deal details including resolved custom fields |
| `pipedrive_create_deal` | Create a new deal |
| `pipedrive_update_deal` | Update deal fields (title, value, stage, status, owner, etc.) |
| `pipedrive_delete_deal` | Permanently delete a deal |
| `pipedrive_search_deals` | Search deals by keyword |

### Leads (8 tools)
| Tool | Description |
|------|-------------|
| `pipedrive_list_leads` | List leads with optional filters (owner, person, org, archived status) |
| `pipedrive_get_lead` | Get full lead details by UUID |
| `pipedrive_create_lead` | Create a new lead with value, labels, and linked contacts |
| `pipedrive_update_lead` | Update lead fields or archive/unarchive |
| `pipedrive_delete_lead` | Permanently delete a lead |
| `pipedrive_search_leads` | Search leads by keyword |
| `pipedrive_get_lead_labels` | List all available lead labels (for use with label_ids) |
| `pipedrive_get_lead_sources` | List all available lead sources |

### Persons / Contacts (6 tools)
| Tool | Description |
|------|-------------|
| `pipedrive_list_persons` | List contacts with pagination |
| `pipedrive_get_person` | Get full contact details including resolved custom fields |
| `pipedrive_create_person` | Create a new contact with email, phone, and org |
| `pipedrive_update_person` | Update contact fields |
| `pipedrive_delete_person` | Permanently delete a contact |
| `pipedrive_search_persons` | Search contacts by name, email, or phone |

### Organizations (5 tools)
| Tool | Description |
|------|-------------|
| `pipedrive_list_organizations` | List organizations with pagination |
| `pipedrive_get_organization` | Get full org details including resolved custom fields |
| `pipedrive_create_organization` | Create a new organization |
| `pipedrive_delete_organization` | Permanently delete an organization |
| `pipedrive_search_organizations` | Search organizations by name or address |

### Notes (2 tools)
| Tool | Description |
|------|-------------|
| `pipedrive_list_notes` | List notes filtered by deal, person, or organization |
| `pipedrive_add_note` | Add a note to a deal, contact, or organization |

### Activities (3 tools)
| Tool | Description |
|------|-------------|
| `pipedrive_list_activities` | List activities filtered by deal, person, org, or completion status |
| `pipedrive_create_activity` | Create a new activity (call, meeting, email, task, etc.) |
| `pipedrive_update_activity` | Update or mark an activity as done |

### Pipelines & Stages (2 tools)
| Tool | Description |
|------|-------------|
| `pipedrive_list_pipelines` | List all sales pipelines |
| `pipedrive_list_stages` | List stages, optionally filtered by pipeline |

### Users (1 tool)
| Tool | Description |
|------|-------------|
| `pipedrive_get_users` | List all users with ID, name, email, and active status |

### Search (1 tool)
| Tool | Description |
|------|-------------|
| `pipedrive_search_all` | Global search across all item types simultaneously |

**Total: 34 tools**

---

## Available Prompts

Pre-built conversation starters available in Claude Desktop:

| Prompt | Description |
|--------|-------------|
| `list-all-deals` | Complete overview of all deals organized by status with total pipeline value |
| `list-all-persons` | Full contact list grouped by organization |
| `analyze-deals` | Deep pipeline analysis: values, stages, win rates, overdue deals, top deals by owner |
| `analyze-contacts` | Contact and org overview with deal activity, engagement stats, cold prospects |
| `find-high-value-deals` | Prioritized list of highest-value open deals with activity flags |
| `analyze-leads` | Leads analysis: volume, owners, labels, values, upcoming close dates |
| `compare-pipelines` | Side-by-side comparison of all pipelines with conversion rates |

---

## Key Features

- **Rate limiting** — Bottleneck-based rate limiting stays safely under Pipedrive's API limits (70 req/2s)
- **Custom fields** — `get_deal`, `get_person`, `get_organization` automatically resolve custom field hash keys to human-readable names and option labels
- **Full leads CRUD** — Complete lead lifecycle: create, read, update, delete, search, label, archive
- **Advanced deal filtering** — Filter by pipeline, value range, age, title keyword on top of standard filters
- **Delete operations** — Permanently delete deals, leads, persons, and organizations
- **Global search** — Search across all CRM record types in one call
- **Structured responses** — All tools return both markdown text and structured JSON data

---

## Requirements

- Node.js 18 or higher
- A Pipedrive account with API access
- Claude Desktop

---

## Development (local build)

```bash
git clone <repo>
cd pipedrive-mcp-server
npm install
npm run build

# Run locally
PIPEDRIVE_API_TOKEN=xxx PIPEDRIVE_COMPANY_DOMAIN=mycompany node dist/index.js
```

For local use, update `claude_desktop_config.json` to point to the built file:

```json
{
  "mcpServers": {
    "pipedrive": {
      "command": "node",
      "args": ["/absolute/path/to/pipedrive-mcp-server/dist/index.js"],
      "env": {
        "PIPEDRIVE_API_TOKEN": "your_token",
        "PIPEDRIVE_COMPANY_DOMAIN": "your_subdomain"
      }
    }
  }
}
```

---

## Publishing to npm

```bash
npm login
npm publish
```

After publishing, anyone can use it via the `npx` config shown at the top — no local installation needed.
