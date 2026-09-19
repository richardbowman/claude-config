#!/usr/bin/env node
/**
 * GSC Weekly Report — pulls Search Console data for trustandwillguide.com
 * and writes a summary note to the vault.
 *
 * Reads credentials from env vars (managed by the Claude harness secret manager):
 *   GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN
 * Scheduled weekly via Geode Claude Threads cron.
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const CLIENT_ID     = process.env.GSC_CLIENT_ID;
const CLIENT_SECRET = process.env.GSC_CLIENT_SECRET;
const SITE_URL      = 'sc-domain:trustandwillguide.com';
const VAULT_DIR     = '/Users/rickbowman/Library/Mobile Documents/com~apple~CloudDocs/Documents/Personal/Products/Trust & Will Guide';
const REPORT_FILE   = `${VAULT_DIR}/gsc-weekly.md`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Missing GSC_CLIENT_ID or GSC_CLIENT_SECRET env vars');
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const refreshToken = process.env.GSC_REFRESH_TOKEN;
if (!refreshToken) throw new Error('Missing GSC_REFRESH_TOKEN env var');

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

// URL Inspection API — the only programmatic way to read index coverage (there is
// no bulk coverage endpoint). Quota: 2000/day, 600/min per site.
const inspectUrl = async (url: string) => {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL }),
  });
  const json = await res.json() as any;
  const r = json?.inspectionResult?.indexStatusResult ?? {};
  return {
    url,
    verdict: r.verdict ?? 'ERROR',
    coverageState: r.coverageState ?? (json?.error?.message ?? 'unknown'),
    lastCrawlTime: r.lastCrawlTime ?? null,
  };
};

// Bounded-concurrency map so we stay well under the 600/min rate limit.
const mapPool = async <T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
};

// ── Date helpers ──────────────────────────────────────────────────────────────

const today = new Date();
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

const endDate   = fmt(daysAgo(3));   // GSC lags 2-3 days
const startDate = fmt(daysAgo(30));  // 28-day window

// ── Fetch data ────────────────────────────────────────────────────────────────

const [topQueries, topPages, rankingQueries, siteTotals, priorSiteTotals] = await Promise.all([
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

  // TRUE site-wide totals — no dimensions, so GSC returns one aggregate row.
  // (The old "Total clicks/impressions" summed only the top 15 pages, which
  // silently undercounts and makes week-over-week comparison meaningless.)
  gsc(`/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
    startDate, endDate, dimensions: [],
  }),

  // Same window, shifted back 28 days — gives a real trend instead of a snapshot.
  gsc(`/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
    startDate: fmt(daysAgo(58)), endDate: fmt(daysAgo(31)), dimensions: [],
  }),
]);

// ── Index coverage (URL Inspection) ─────────────────────────────────────────────
// Diagnose: are pages actually indexed, or crawled-not-indexed / unknown to Google?

const sitemapXml = await fetch('https://trustandwillguide.com/sitemap-0.xml').then(r => r.text()).catch(() => '');
const allUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

const isGuide     = (u: string) => /\/guides\/[^/]+\/$/.test(u) && !/\/guides\/topic\//.test(u);
const isAttorney  = (u: string) => /\/attorneys\//.test(u);

const guideUrls    = allUrls.filter(isGuide);
const attorneyUrls = allUrls.filter(isAttorney);
// Even, deterministic sample of attorney pages (cap ~25) to gauge directory health
// without burning quota on all ~400 of them.
const attorneySampleSize = Math.min(25, attorneyUrls.length);
const attorneyStep = attorneyUrls.length ? Math.max(1, Math.floor(attorneyUrls.length / attorneySampleSize)) : 1;
const attorneySample = attorneyUrls.filter((_, i) => i % attorneyStep === 0).slice(0, attorneySampleSize);

const guideCoverage    = guideUrls.length    ? await mapPool(guideUrls, 8, inspectUrl)    : [];
const attorneyCoverage = attorneySample.length ? await mapPool(attorneySample, 8, inspectUrl) : [];

const indexedState = 'Submitted and indexed';
const summarize = (rows: { coverageState: string }[]) => {
  const indexed = rows.filter(r => r.coverageState === indexedState).length;
  const byState: Record<string, number> = {};
  for (const r of rows) byState[r.coverageState] = (byState[r.coverageState] ?? 0) + 1;
  return { total: rows.length, indexed, byState };
};
const guideCov    = summarize(guideCoverage);
const attorneyCov = summarize(attorneyCoverage);

// ── Totals ────────────────────────────────────────────────────────────────────

const rows = topQueries.rows ?? [];

// True site-wide totals (dimensionless aggregate row), with a fallback to the
// old top-15-pages sum if GSC returns nothing.
function agg(res: any) {
  const r = res?.rows?.[0];
  return r ? { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 } : null;
}
const totals = agg(siteTotals) ?? (topPages.rows ?? []).reduce(
  (acc: any, r: any) => ({ clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions }),
  { clicks: 0, impressions: 0 }
);
const prior = agg(priorSiteTotals);

// Week-over-week deltas. A large negative swing is the signal that matters most
// and was invisible in every prior report.
function delta(now: number, before: number | undefined) {
  if (before === undefined || before === null) return '—';
  if (before === 0) return now === 0 ? 'no change' : `+${now} (from 0)`;
  const pct = ((now - before) / before) * 100;
  const arrow = pct > 5 ? '🟢 ▲' : pct < -5 ? '🔴 ▼' : '⚪️';
  return `${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% (was ${before.toLocaleString()})`;
}
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

const coverageBreakdown = (cov: { total: number; indexed: number; byState: Record<string, number> }) =>
  Object.entries(cov.byState)
    .sort((a, b) => b[1] - a[1])
    .map(([state, n]) => `| ${state} | ${n} |`)
    .join('\n');

const notIndexedGuides = guideCoverage
  .filter(r => r.coverageState !== indexedState)
  .map(r => `| ${r.url.replace('https://trustandwillguide.com', '')} | ${r.coverageState} |`)
  .join('\n');

const report = `# GSC Weekly Report
*Generated ${reportDate} · Window: ${windowLabel}*

---

## Summary

| Metric | Value | vs. prior 28 days |
|---|---|---|
| Total clicks (site-wide) | ${totals.clicks.toLocaleString()} | ${delta(totals.clicks, prior?.clicks)} |
| Total impressions (site-wide) | ${totals.impressions.toLocaleString()} | ${delta(totals.impressions, prior?.impressions)} |
| Average CTR | ${avgCtr}% | — |
| Avg position (top queries) | ${avgPosition} | — |
| Queries with impressions | ${rows.length} | — |
| Queries in top 20 | ${rankingRows.length} | — |

---

## 🏆 Queries in Top 20 Positions

${rankingRows.length === 0
  ? '_None yet — pages are indexed but not ranking in top 20. Normal for a new site; check back in 4–8 weeks._\n'
  : queryTable(rankingRows)}

---

## 🔎 Index Coverage (URL Inspection)

**Guides indexed:** ${guideCov.indexed} / ${guideCov.total}${guideCov.total ? ` (${((guideCov.indexed / guideCov.total) * 100).toFixed(0)}%)` : ''}
**Attorney pages indexed (sample of ${attorneyCov.total}):** ${attorneyCov.indexed} / ${attorneyCov.total}${attorneyCov.total ? ` (${((attorneyCov.indexed / attorneyCov.total) * 100).toFixed(0)}%)` : ''}

| Guide coverage state | Count |
|---|---|
${coverageBreakdown(guideCov)}

${notIndexedGuides
  ? `**Guides NOT indexed:**\n\n| Page | State |\n|---|---|\n${notIndexedGuides}\n`
  : '_All sampled guides are indexed._'}

> **Read:** If guides are indexed but absent from the impressions table below, they are ranking too deep (100+) to earn impressions — an off-page **authority** problem (backlinks / domain age), not an indexing or content problem. More guides won't move this; links will.

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
console.log(`   Guides indexed: ${guideCov.indexed}/${guideCov.total} | Attorney sample indexed: ${attorneyCov.indexed}/${attorneyCov.total}`);
