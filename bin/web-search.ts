#!/usr/bin/env node
/**
 * web-search: Google Custom Search via gws OAuth credentials.
 *
 * NOTE: this file MUST keep its .ts extension. Node (v22.6+) only strips
 * TypeScript types from files it can identify by extension, so an
 * extensionless copy of this script dies with
 * "SyntaxError: Unexpected strict mode reserved word" on the first
 * `interface` declaration. A `#!/usr/bin/env tsx` shebang does NOT fix that:
 * tsx's loader hook doesn't match extensionless paths either. The
 * extensionless `bin/web-search` is a POSIX sh launcher that execs this file.
 *
 * Usage: web-search "query" [--num N] [--site domain] [--start N] [--json]
 *
 * Requires:
 *   - GOOGLE_SEARCH_CX env var set to your Programmable Search Engine ID
 *     Create one at https://programmablesearchengine.google.com/ (set to search entire web)
 *   - Plus ONE of:
 *       * GOOGLE_SEARCH_API_KEY  (preferred -- simple API key, no OAuth scopes)
 *       * gws CLI authenticated WITH the .../auth/cse scope. Without that scope
 *         the API returns 403 "Request had insufficient authentication scopes."
 */

import { execSync } from "node:child_process";

interface GwsCreds {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

interface SearchItem {
  title: string;
  link: string;
  snippet?: string;
}

interface SearchResponse {
  items?: SearchItem[];
  error?: { code: number; message: string };
}

function parseArgs(): {
  query: string;
  num: number;
  site: string | null;
  start: number;
  jsonOutput: boolean;
} {
  const args = process.argv.slice(2);
  let query = "";
  let num = 10;
  let site: string | null = null;
  let start = 1;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--num":
        num = parseInt(args[++i], 10);
        break;
      case "--site":
        site = args[++i];
        break;
      case "--start":
        start = parseInt(args[++i], 10);
        break;
      case "--json":
        jsonOutput = true;
        break;
      default:
        query = args[i];
    }
  }

  if (!query) {
    console.error('Usage: web-search "query" [--num N] [--site domain] [--start N] [--json]');
    process.exit(1);
  }

  return { query, num, site, start, jsonOutput };
}

async function getAccessToken(): Promise<string> {
  let credsJson: string;
  try {
    // --unmasked is REQUIRED. Plain `gws auth export` masks client_secret and
    // refresh_token down to 11-char placeholders, which the token endpoint
    // rejects with `invalid_client: The provided client secret is invalid.`
    credsJson = execSync("gws auth export --unmasked", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"], // gws logs its keyring backend to stderr
    });
  } catch {
    console.error("Error: gws auth export failed. Run 'gws auth login' first.");
    process.exit(1);
  }

  const creds: GwsCreds = JSON.parse(credsJson);

  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token",
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
  });

  const data = await resp.json() as Record<string, unknown>;
  if (!data.access_token) {
    console.error("Error: could not get access token:", data);
    process.exit(1);
  }

  return data.access_token as string;
}

async function main() {
  const cx = process.env.GOOGLE_SEARCH_CX;
  if (!cx) {
    console.error("Error: GOOGLE_SEARCH_CX is not set.");
    console.error(
      'Add it to the `env` block of the settings file that ~/.claude/settings.json\n' +
      "points at (see: realpath ~/.claude/settings.json), so it is present in every\n" +
      "session regardless of shell:"
    );
    console.error('  "env": { "GOOGLE_SEARCH_CX": "your-search-engine-id" }');
    console.error("Create one at: https://programmablesearchengine.google.com/");
    process.exit(1);
  }

  const { query, num, site, start, jsonOutput } = parseArgs();

  const fullQuery = site ? `${query} site:${site}` : query;

  const params = new URLSearchParams({
    q: fullQuery,
    cx,
    num: String(Math.min(num, 10)),
    start: String(start),
  });

  // Prefer a plain API key: the Custom Search JSON API accepts one directly and
  // it sidesteps OAuth scopes entirely. Only fall back to the gws OAuth token,
  // which additionally requires the .../auth/cse scope on the stored grant.
  const headers: Record<string, string> = {};
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  if (apiKey) {
    params.set("key", apiKey);
  } else {
    headers.Authorization = `Bearer ${await getAccessToken()}`;
  }

  const resp = await fetch(
    `https://www.googleapis.com/customsearch/v1?${params}`,
    { headers }
  );

  const data = await resp.json() as SearchResponse;

  if (!resp.ok) {
    console.error(`Error ${resp.status} from Custom Search API:`, data.error?.message ?? data);
    if (resp.status === 403) {
      console.error(
        "\nHint: set GOOGLE_SEARCH_API_KEY (easiest fix -- create a key at\n" +
        "https://console.cloud.google.com/apis/credentials and make sure the\n" +
        "Custom Search API is enabled for the project).\n" +
        "Alternatively re-auth gws with the cse scope added:\n" +
        "  gws auth login  (add https://www.googleapis.com/auth/cse to scopes)"
      );
    }
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const items = data.items ?? [];
  if (items.length === 0) {
    console.log("No results found.");
    return;
  }

  for (const [i, item] of items.entries()) {
    const snippet = (item.snippet ?? "").replace(/\n/g, " ");
    console.log(`${i + 1}. ${item.title}`);
    console.log(`   ${item.link}`);
    console.log(`   ${snippet}`);
    console.log();
  }
}

main();
