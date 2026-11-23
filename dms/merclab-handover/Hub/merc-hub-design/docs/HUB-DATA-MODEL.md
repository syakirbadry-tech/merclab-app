# Merc HUB: data model (proposal)

The API stays the same (`/api/faults…`). These are **additive** fields on the existing fault entry. Old entries keep working: if the new structured fields are empty, show the old text fields.

## Entry (`faults` row)

| Field | Type | Notes |
| --- | --- | --- |
| id | existing | |
| **topic_no** | text, unique | `MLH-0001` our cases, `MBM-0001` forum, `GEN-0001` general. Assigned on create |
| **version** | int, default 1 | +1 on every save of content fields |
| **reason** | text | "Reason for" this version, asked on save |
| **function_group** | text | e.g. "Engine · fuel system". Short pick-list + free text |
| title, source, source_ref | existing | source: `our` / `mbm` / `gen` |
| make_model, engine | existing | chassis code is pulled out of make_model; allow several (`models`: text[] e.g. ["W205","W213"]) |
| **vin** | text | Full VIN, owner only. Never sent to clients |
| **vin_prefix** | text (computed) | First 11 chars. The only VIN data a client response may contain |
| mileage, hours, date | existing | Client response: mileage rounded to 5,000; hours removed |
| symptom, codes, cause | existing | |
| **tests** | JSON array | `[{check, spec, measured, then}]` in order. Falls back to `tests_done` text |
| **remedies** | JSON array | `[{label:"A", title, when, steps:[…], parts:[{name, part_no, qty}], no_parts:"none"|"depends"}]`. Falls back to `fix` + `parts_used` text |
| details, tags, verified, files, job_id | existing | |
| **audience** | enum | `private` (default) / `members` / `preview`. Forced to `private` when source = `mbm` |
| **helpful_up / helpful_down** | int | "Did this help?" counts (owner votes now; one vote per member later) |
| **favourite** | bool | Owner's star (later per user) |
| **updated_at** | existing or new | Shown as "updated" in the topic header |

## Rules the server should enforce (later, when members exist)
- A member response never includes: `source = mbm` rows, `vin`, `hours`, `job_id`, customer names, plates or prices.
- `vin` is replaced by `vin_prefix` + "••••••"; `mileage` is rounded to the nearest 5,000 km.
- Export ("Export our cases") uses the same member-safe shape and excludes MBM.

## Suggested later tables (not needed now)
- `members` (workshop name, contact, plan, status, renew date) and `hub_votes` (entry_id, member_id, up/down) for the paid subscription.
- `hub_views` (entry_id, member_id, at) to see which tips matter most.
