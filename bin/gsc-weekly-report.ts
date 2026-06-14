#!/usr/bin/env node
/**
 * GSC Weekly Report — pulls Search Console data for trustandwillguide.com
 * and writes a summary note to the Obsidian vault.
 *
 * Reads credentials from 1Password ("GSC livegolden").
 * Scheduled weekly via Obsidian Claude Threads cron.
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const CLIENT_ID     = execSync(`op item get "GSC livegolden" --fields client_id --reveal`, { encoding: 'utf8' }).trim();
const CLIENT_SECRET = execSync(`op item get "GSC livegolden" --fields client_secret --reveal`, { encoding: 'utf8' }).trim();
const SITE_URL      = 'sc-domain:trustandwillguide.com';
const VAULT_DIR     = '/Users/rickbowman/Documents/Personal/Products/Trust & Will Guide';
const REPORT_FILE   = `${VAULT_DIR}/gsc-weekly.md`;

// ── Auth ──────────────────────────────────────────────────────────────────────

const refreshToken = execSync(
  `op item get "GSC livegolden" --fields refresh_token --reveal`,
  { encoding: 'utf8' }
).trim();

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: refreshToken, grant_type: 'refresh_token',
  }),
});
const { access_token } = await tokenRes.json() as any;
if (!access_token) throw new Error('Failed to get access token');

const gsc = async (path: string, body: object) => {
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as any;
};

// ── Date helpers ──────────────────────────────────────────────────────────────

const today = new Date();
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

const endDate   = fmt(daysAgo(3));   // GSC lags 2-3 days
const startDate = fmt(daysAgo(30));  // 28-day window

// ── Fetch data ────────────────────────────────────────────────────────────────

const [topQueries, topPages, rankingQueries] = await Promise.all([
  // Top queries by impressions
  gsc(`/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
    startDate, endDate,
    dimensions: ['query'],
    rowLimit: 20,
    dimensionFilterGroups: [],
  }),

  // Top pages by clicks
  gsc(`/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
    startDate, endDate,
    dimensions: ['page'],
    rowLimit: 15,
  }),

  // Queries in positions 1-20 (actually ranking)
  gsc(`/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
    startDate, endDate,
    dimensions: ['query'],
    rowLimit: 50,
    dimensionFilterGroups: [{
      filters: [{ dimension: 'position', operator: 'lessThan', expression: '21' }]
    }],
  }),
]);

// ── Totals ────────────────────────────────────────────────────────────────────

const rows = topQueries.rows ?? [];
const totals = (topPages.rows ?? []).reduce(
  (acc: any, r: any) => ({ clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions }),
  { clicks: 0, impressions: 0 }
);
const avgPosition = rows.length
  ? (rows.reduce((s: number, r: any) => s + r.position, 0) / rows.length).toFixed(1)
  : 'n/a';
const avgCtr = totals.impressions
  ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
  : '0.00';

// ── Format report ─────────────────────────────────────────────────────────────

const reportDate = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const windowLabel = `${startDate} → ${endDate}`;

const queryTable = (rows: any[]) => rows.length === 0
  ? "_No data yet — site may still be in Google's index queue._\n"
  : [
      '| Query | Impressions | Clicks | CTR | Position |',
      '|---|---|---|---|---|',
      ...rows.map((r: any) =>
        `| ${r.keys[0]} | ${r.impressions.toLocaleString()} | ${r.clicks} | ${(r.ctr * 100).toFixed(1)}% | ${r.position.toFixed(1)} |`
      ),
    ].join('\n') + '\n';

const pageTable = (rows: any[]) => rows.length === 0
  ? '_No page clicks yet._\n'
  : [
      '| Page | Clicks | Impressions | Position |',
      '|---|---|---|---|',
      ...rows.map((r: any) => {
        const slug = r.keys[0].replace('https://www.trustandwillguide.com', '') || '/';
        return `| ${slug} | ${r.clicks} | ${r.impressions.toLocaleString()} | ${r.position.toFixed(1)} |`;
      }),
    ].join('\n') + '\n';

const rankingRows = (rankingQueries.rows ?? [])
  .filter((r: any) => r.position <= 20)
  .sort((a: any, b: any) => a.position - b.position);

const report = `# GSC Weekly Report
*Generated ${reportDate} · Window: ${windowLabel}*

---

## Summary

| Metric | Value |
|---|---|
| Total clicks | ${totals.clicks.toLocaleString()} |
| Total impressions | ${totals.impressions.toLocaleString()} |
| Average CTR | ${avgCtr}% |
| Avg position (top queries) | ${avgPosition} |
| Queries with impressions | ${rows.length} |
| Queries in top 20 | ${rankingRows.length} |

---

## 🏆 Queries in Top 20 Positions

${rankingRows.length === 0
  ? '_None yet — pages are indexed but not ranking in top 20. Normal for a new site; check back in 4–8 weeks._\n'
  : queryTable(rankingRows)}

---

## Top Queries by Impressions (last 28 days)

${queryTable(rows.slice(0, 15))}

---

## Top Pages by Clicks

${pageTable((topPages.rows ?? []).slice(0, 15))}

---

## Notes

- GSC data lags 2–3 days; window ends ${endDate}
- Impressions = Google showed this page in results (even position 100+)
- Clicks = someone actually clicked through
- Position = average rank across all searches that triggered that page
- [[roadmap|Roadmap]] · [[attorney-data-process|Attorney Data Process]]
`;

// ── Write to vault ────────────────────────────────────────────────────────────

if (!existsSync(VAULT_DIR)) mkdirSync(VAULT_DIR, { recursive: true });
writeFileSync(REPORT_FILE, report);
console.log(`✅ Report written to ${REPORT_FILE}`);
console.log(`   Clicks: ${totals.clicks} | Impressions: ${totals.impressions} | Ranking queries: ${rankingRows.length}`);
