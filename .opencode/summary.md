## Goal
Implement Facebook group publishing via the VPS Selenium scraper, replacing the deprecated Graph API approach.

## Constraints & Preferences
- Facebook Groups API (`publish_to_groups`) removed in Graph API v19 (April 2024); cloud tools no longer work.
- Only viable approach is browser automation using the existing scraper's ChromeDriver + session on the VPS.
- Must reuse existing infrastructure: Flask sync server (:3001), cookies, anti-detection, group config.
- Keep posting to Facebook Page via Graph API (still works).
- Rate limit: 20-30/day, 30-60s delays between groups, spintax for anti-detection.

## Progress
### Done
- Analyzed `server/services/facebookPublisher.js` (535 lines): publishes to Page (Graph API) and groups (Graph API $\\rightarrow$ replaced).
- Added `publishToGroupsViaScraper()` in `facebookPublisher.js` — calls `POST /publish-to-groups` on the VPS scraper, sends all groups + message + image URLs in one request. Timeout: 300s. On failure, marks `page_is_member = false`.
- Updated `replicateInstagramToFacebook()` — collects eligible groups (neighborhood filter) into a batch, calls `publishToGroupsViaScraper()` once instead of per-group Graph API loop.
- Updated `publishPetToGroups()` — same batch approach, removed per-group Graph API calls.
- Removed `publishToGroup()` (Graph API per-group function). No remaining imports.
- Flask endpoint `POST /publish-to-groups` on scraper (`scraper.py:903`) receives `{groups, message, image_urls}`, iterates groups with 30-60s delays, calls `post_to_group()`.

### In Progress
- (none — code changes complete)

### Blocked
- Requires deploy to VPS (git push + restart scraper service).
- `post_to_group()` XPath selectors may break if Facebook DOM changes.

## Key Decisions
- Batch groups server-side, send once to scraper — scraper handles sequential posting with delays.
- `publishToPage()` stays on Graph API (still works for Pages).
- Image URLs are public (`sigotuhuella.online/api/images/pet/...`), scraper downloads to temp dir via `urlopen`.
- Spintax resolved inside `post_to_group()` via `resolve_spintax()`.
- Separate `_post_driver` with its own lock, same session/cookies as fetch driver.

## Relevant Files
- `external/scraper/scraper.py:676-808` — `post_to_group()` (Selenium DOM posting).
- `external/scraper/scraper.py:903-934` — `POST /publish-to-groups` Flask endpoint.
- `server/services/facebookPublisher.js` — `publishToGroupsViaScraper()`, updated `replicateInstagramToFacebook()`, updated `publishPetToGroups()`.
- `server/services/vpsSyncService.js` — reference for VPS_HOST pattern.
- `src/lib/api.ts:226` — frontend `publishPetToGroups` API call.
- `server/routes/facebook.js:11,646,679` — routes calling the publisher functions.

## Next Steps
1. Git commit + push.
2. VPS: git pull, restart scraper service (`systemctl restart sihuella-scraper`).
3. VPS: restart Next.js server (if publisher runs server-side).
4. Test: create a pet, trigger auto-publish, check scraper logs (`journalctl -u sihuella-scraper -f`).
5. If DOM selectors fail, update XPaths in `post_to_group()` based on Facebook's current HTML.
