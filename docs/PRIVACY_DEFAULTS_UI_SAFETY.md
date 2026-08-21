# Privacy Defaults and UI Safety

This hardening batch closes the remaining application-code findings from the August 2026 security/privacy audit.

## Station name publication

The configured station/callsign label is private configuration by default.

A new server-side setting, `publishStationName`, controls whether `settings.stationName` may appear in the public snapshot. The default is `false` when the setting is absent.

Admin shows a dedicated **Publish station / callsign label publicly** checkbox. This is different from presentation-only `name=0` URL parameters:

- `publishStationName=false` means the label is absent from `/api/public`, therefore the embed/static renderer cannot recover it.
- `publishStationName=true` permits the label into the public snapshot.
- `name=0` can still hide an already-public label visually, but is not itself a privacy control.

When the label is private, public renderers use the generic product label `QSO Trails` where a heading is needed.

The rounded public home position remains necessary to draw a public path map and is governed separately by the existing home-position precision setting.

## DXCC aggregates

DXCC aggregate statistics are now privacy-opt-in when no explicit setting exists.

`showDxccStats` is interpreted as enabled only when its stored value is exactly `true`. A brand-new installation therefore starts with DXCC aggregate publishing disabled.

Existing installations that already stored `showDxccStats: true` keep that choice. Existing stored `false` also remains unchanged.

The final public snapshot layer independently clears `stats.dxcc` unless the explicit stored setting is true.

## Dynamic select construction

The Admin and embed code historically used `innerHTML` to construct some `<option>` lists, including band names derived from public QSO data.

`public/dom-safety.js` is loaded before the existing UI code and replaces the `HTMLSelectElement.innerHTML` setter with a narrow option-only parser. It accepts only plain `<option>` elements with optional quoted `value` attributes and converts them to `Option` objects. Any other markup is rejected.

This means data-derived strings are no longer interpreted as arbitrary HTML in selects even where legacy code still assigns to `innerHTML`.

Future UI code should prefer `new Option()`, `textContent`, and `replaceChildren()` directly rather than relying on the compatibility guard.

## Data flow

Private configuration:

```text
stationName
publishStationName
showDxccStats
```

Public snapshot when both permissions are off:

```text
settings.stationName   -> omitted
stats.dxcc             -> null
```

Public snapshot when explicitly enabled:

```text
settings.stationName   -> configured label
stats.dxcc             -> sanitized aggregate object
```

No change is made to the existing rule that per-QSO DXCC/country/continent values remain private.

## Tests

`test/privacy-defaults.js` verifies:

- absent privacy settings default to false;
- settings persistence records those defaults;
- a station label is stripped when publication is disabled;
- DXCC aggregates are cleared when disabled;
- explicitly enabled station label and DXCC aggregates survive the privacy layer.

The normal production Docker/Compose/public-endpoint smoke suite remains required as well.
