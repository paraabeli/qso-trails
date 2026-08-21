# LoTW confirmations in QSO Trails

QSO Trails can use Wavelog API v2 confirmation data to show LoTW progress and optionally limit the published map to LoTW-confirmed QSOs.

## User-facing controls

The Admin page adds two controls under **Public view & privacy**:

- **QSO map filter**
  - `Show all selected QSOs` keeps the existing band/mode-selected QSO set on the map.
  - `Show only LoTW-confirmed QSOs` publishes and renders only QSOs that Wavelog reports as confirmed by LoTW.
- **Embed count display**
  - `QSO count only`
  - `LoTW confirmed count only`
  - `QSO + LoTW confirmed counts`

The existing **Show QSO count** checkbox remains the master presentation switch. If it is disabled, no QSO/LoTW count is displayed in the embed.

The public snapshot includes aggregate `allQsoCount`, `lotwCount`, and the post-filter `qsoCount`. It does not expose LoTW confirmation dates or private Wavelog identifiers per QSO.

## Wavelog token scopes

Create a Wavelog API v2 token with these read-only scopes:

- `qso:read`
- `confirmation:read`

QSO Trails does not require Wavelog write or delete scopes for this feature.

## Synchronization model

A QSO can be created today and receive an LoTW confirmation later. Therefore LoTW status cannot safely rely on the existing QSO `since_id` cursor alone.

QSO Trails keeps the two streams separate:

1. `/api/v2/qso` continues to use `since_id` for new QSO synchronization.
2. `/api/v2/confirmation?type=lotw` supplies received LoTW confirmations.

On the first confirmation sync, and whenever **Full resync** is used, QSO Trails fetches the complete LoTW confirmation set for the selected Wavelog station IDs. Later incremental QSO syncs request recent confirmation changes with a two-day overlap based on the previous successful confirmation sync date. The overlap protects against date-boundary timing differences while avoiding a complete confirmation download every few minutes.

Confirmation state is stored privately in:

`/app/data/lotw-confirmations.json`

A **Full resync** is authoritative: it replaces the cached LoTW confirmation set with Wavelog's current full result. Incremental refreshes merge newly received confirmations, so use Full resync if a confirmation was corrected or removed upstream and you need that removal reflected immediately.

The private QSO cache also stores `lotwConfirmed` and `lotwConfirmedAt` so later public-snapshot builds can filter correctly. `lotwConfirmedAt` stays private.

## Public snapshot behavior

Band and mode selection happens first. LoTW counts are calculated from that selected set.

- `allQsoCount` = all QSOs matching the current server-side band/mode selection.
- `lotwCount` = LoTW-confirmed QSOs inside that same selection.
- `qsoCount` = QSOs actually eligible for publication after the LoTW map filter.
- `returnedQsos` = the number of public records returned after `maxPaths` truncation.

If **Only LoTW-confirmed QSOs** is enabled, the LoTW filter runs before `maxPaths`, so an old unconfirmed QSO cannot consume a public path slot ahead of a confirmed QSO.

DXCC aggregate statistics are also recalculated from the post-LoTW-filter set, preserving the existing rule that aggregate statistics describe the selected public set before `maxPaths` truncation.

## Embed counts

The embed count mode is presentation-only:

- `qso` displays the post-filter QSO count.
- `lotw` displays the LoTW-confirmed count.
- `both` displays both values.

The filter itself is server-side and cannot be widened through iframe query parameters.

## Privacy and failure behavior

LoTW confirmation status is treated as private source data. The public API gets only the aggregate counts needed for display and the already-sanitized QSO records that survive the configured filter. Confirmation timestamps, Wavelog QSO IDs, and the private confirmation cache are not served publicly.

If the Wavelog token lacks `confirmation:read`, or the confirmation endpoint fails, normal QSO synchronization remains usable. The Admin page reports the LoTW confirmation warning and retains the last successfully cached confirmation state rather than silently deleting previous confirmations.

After enabling the feature for the first time, run **Full resync** once to establish the initial LoTW confirmation cache.

## Static image behavior

The static PNG renderer reads the same sanitized `public-snapshot.json`, so the LoTW map filter also applies to `/static/qrz.png`. The dedicated LoTW/QSO count-display selector currently targets the interactive embed; the existing static-image `stats` option continues to render the snapshot QSO count.
