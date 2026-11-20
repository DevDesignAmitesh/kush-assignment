# Bangkok rule set: zone ย.10 (high-density residential), condo

Status: research locked 2026-11-19. Machine-readable version: `research/rules/bangkok-y10.json`.
Every number below has a source and a verification level:

- **PRIMARY**: read by us in the official Thai text (Royal Gazette scan), page cited.
- **PRIMARY-EN**: read by us in the JICA English translation of the Ministerial Regulations (consolidated to 31 Jan 2008).
- **PRIMARY-BMA**: read by us in the Bangkok Building Control Ordinance 2001 text (OIC infocenter copy, 34 pp, PDF dated Dec 2016). Later amendments, if any, not checked.
- **SECONDARY**: only from blogs / industry sites; primary text not reachable from our network. Treat as provisional.

Source files (in `research/sources/`):

| File | What it is |
|---|---|
| `bkk-comprehensive-plan-2556-gazette.pdf` | กฎกระทรวงให้ใช้บังคับผังเมืองรวมกรุงเทพมหานคร พ.ศ. ๒๕๕๖, Royal Gazette เล่ม ๑๓๐ ตอนที่ ๔๑ ก, 16 May 2013, 82 pages (via download.asa.or.th; ratchakitcha.soc.go.th returned 403) |
| `jica-thai-building-control-MRs-en-2008.pdf` | "Existing Ministerial Regulations Based on the Building Control Act of Thailand", JICA expert translation, Nov 2007 / Jan 2008 (iibh.org) |
| `bma-building-control-ordinance-2544.pdf` | ข้อบัญญัติกรุงเทพมหานคร เรื่อง ควบคุมอาคาร พ.ศ. ๒๕๔๔, from infocenter.oic.go.th (link found by Amitesh; webportal.bangkok.go.th returned 403) |
| `thammasat-2024-thai-building-height-criteria.pdf` | Cherdsuriya & Tochaiwat 2024, BUILT journal: how Thai max-height criteria work |
| `data/bkk-zoning-2556.geojson` | 498 zone polygons of the 2013 plan, pulled from BMA ArcGIS `DOL/LupDolWms` layer 1 by the open repo Kanesuan/KNS.MAP (BMA server resets connections from outside Thailand, so we use that copy) |

---

## 0. Which plan is in force

The **2013 Bangkok Comprehensive Plan (3rd revision)** is in force. The 4th revision finished its 90-day public posting (10 Aug - 9 Nov 2026, ~5,000 petitions) and is expected around mid-2027. Draft numbers (e.g. ย.10 FAR 5.5, OSR 7.5%) are **not** law and are not used. (SECONDARY: Nation Thailand, Anderson Land Specialist updated 14 Oct 2026.)

## 1. Why ย.10

- ย.10 = ที่ดินประเภทที่อยู่อาศัยหนาแน่นมาก: very-high-density residential "next to the central commercial area and along mass transit" (ข้อ 17 purpose, gazette p.35). PRIMARY.
- It is where Bangkok condos are built: Asok-Phetchaburi, Thonglor-Ekkamai, Ari, Sathorn-Charoen Krung (13 polygons, 13.1 km² in the GeoJSON; spot check: Ari BTS → ย.10).
- Highest residential FAR (8), condos are not size-restricted in ย.10, and the surrounding OSM building data is dense, which the "real site" requirement needs.

## 2. Zone rules: city plan 2013, ข้อ 17 (ย.10)

| Rule | Value | Source |
|---|---|---|
| FAR (total floor area of all floors of all buildings ÷ plot area) | **≤ 8 : 1** | ข้อ 17 วรรคท้าย (1), p.37. Definition p.2. PRIMARY |
| OSR (open space with no roof/cover ÷ total floor area) | **≥ 4 %** of total floor area | ข้อ 17 (2), p.37. Definition p.2. PRIMARY |
| Permeable ground for planting | **≥ 50 %** of the required open space | ข้อ 17 (2), p.37. PRIMARY |
| OSR is "not less than the minimum open space under the Building Control law" | so OSR and the building-control open space both apply; take the larger | ข้อ 17 (2), p.37. PRIMARY |
| Subdivided plots: FAR/OSR computed over the original plot as a whole | | ข้อ 17 (1)(2). PRIMARY |
| Condo (อาคารอยู่อาศัยรวม) | **allowed, no size/road limit in ย.10** (ย.7 has one: >10,000 m² needs ≥30 m road or ≤500 m to a station, p.27) | ข้อ 17 prohibited-use list (1)-(29), pp.35-37. PRIMARY |
| Hotel > 80 rooms | only on a road ≥ 12 m right-of-way **or** within 500 m of a mass-transit station | ข้อ 17 (8), p.36. PRIMARY |
| Office > 10,000 m² | road ≥ 12 m or ≤ 500 m to a station | ข้อ 17 (10), p.36. PRIMARY |
| Commercial 5,000-10,000 m² / > 10,000 m² | road ≥ 12 m / ≥ 16 m, or ≤ 500 m to a station | ข้อ 17 (9), p.36. PRIMARY |

For comparison, also read in the gazette: ย.4 FAR 3, OSR 10% (p.20); ย.6 FAR 4.5, OSR 6.5% (p.26); ย.8 FAR 6, OSR 5% (p.32); ย.9 FAR 7, OSR 4.5% (p.35). The full table for other zones is in the JSON as SECONDARY.

### FAR bonus (city-wide, ข้อ 51-57, pp.77-79). PRIMARY

| Clause | Bonus | Condition |
|---|---|---|
| ข้อ 52 | ≤ +20 % FAR; extra floor area ≤ 4 × the affordable-housing area | affordable housing for low-income (income ≤ BMA median; price ≤ 80 % of project avg/m²) |
| ข้อ 53 (only ย.8-ย.10, พ.2-พ.5) | ≤ +20 %; extra floor area ≤ 5 × the public open space given | public open space / public park on the plot (does not count toward required open space) |
| ข้อ 54 | ≤ +20 %; 30 m² per public parking space | ≤ 500 m from one of 8 named stations: Thailand Cultural Centre, On Nut, Lat Krabang, Hua Mak, Bang Bamru, Taling Chan, Udom Suk, Bearing (p.78) |
| ข้อ 55 | +5 % per 1 m³ rainwater retention per 50 m² of land; ≤ +20 % | retention tank |
| ข้อ 56 | +5 / 10 / 15 / 20 % | energy-conservation certified building, levels 1-4 |
| **ข้อ 57** | **all bonuses combined ≤ +20 %** → ย.10 max FAR 9.6 | |

## 3. Building Control law (national Ministerial Regulations). PRIMARY-EN

### Definitions
| Term | Value | Source |
|---|---|---|
| High-rise building (อาคารสูง) | height **≥ 23 m**, measured ground → roof deck (or top of top-floor wall for gable/hip roofs) | MR 33 ข้อ 1 |
| Extra-large building (อาคารขนาดใหญ่พิเศษ) | **≥ 10,000 m²** total floor area, or any one floor ≥ 10,000 m² | MR 33 ข้อ 1 |
| Large building (อาคารขนาดใหญ่) | > 2,000 m², or ≥ 15 m high with 1,000-2,000 m² | MR 55 ข้อ 1 |
| Open space (ที่ว่าง) | no roof/cover; may include pool, parking lot outside a building; structures ≤ 1.20 m high count as open | MR 55 ข้อ 1 |

### If the design is high-rise OR extra-large (MR 33, amended by MR 50, 1997)
| Rule | Value | Clause |
|---|---|---|
| Road access | one plot side **≥ 12 m long** must front a public road **≥ 10 m** wide (≤ 30,000 m² total floor area); **≥ 18 m** road if > 30,000 m² | ข้อ 2 |
| Fire-truck road | clear **6 m** wide road all round the building (may sit inside setbacks) | ข้อ 3 |
| Distance to boundary | outermost part of building, above or below ground, **≥ 6 m** from neighbours' land and from the public road (foundations excluded) | ข้อ 4 |
| FAR cap (building law) | ≤ 10 : 1 (city plan's 8 is stricter, so 8 governs) | ข้อ 5 |
| Vacant land | residential: **≥ 30 % of the plot**; non-residential: ≥ 10 % (mixed with residential → 30 %) | ข้อ 6 |

### All buildings (MR 55, 2000)
| Rule | Value | Clause |
|---|---|---|
| Open space (residential/apartment) | ≥ 30 % of the largest floor; non-residential ≥ 10 % | ข้อ 33 |
| Front building line, road < 6 m | ≥ 3 m from road **centreline** | ข้อ 41 ¶1 |
| Front building line, building > 2 storeys or > 8 m, road < 10 m | ≥ 6 m from road **centreline** | ข้อ 41 (1) |
| … road 10-20 m | ≥ 1/10 of road width from road boundary | ข้อ 41 (2) |
| … road ≥ 20 m | ≥ 2 m from road boundary | ข้อ 41 (3) |
| **Height vs road (sky plane)** | height at any point ≤ **2 × horizontal distance** from that point to the **opposite** boundary of the nearest public road | ข้อ 44 |
| Two roads, ≤ 60 m apart | use the wider road (building width along it ≤ 60 m) | ข้อ 45 |
| Corner plot | use the wider road; length along narrower road ≤ 60 m | ข้อ 46 |
| Wall with openings → boundary | ≤ 9 m high: ≥ 2 m; 9-23 m: ≥ 3 m; solid wall ≥ 0.5 m (or on boundary with consent, ≤ 15 m high) | ข้อ 50 |
| Two buildings, same plot | ≤ 9 m: 4 m apart; 9-23 m: 6 m (relaxed later by MR 61/2007 per secondary source) | ข้อ 48 |

### Parking in Bangkok (MR 7 1974, amended by MR 41 1994)
| Rule | Value | Clause |
|---|---|---|
| Condo triggers parking | if units > 60 m², or the building is a "large building" | MR 7 ข้อ 2 (3), (7) |
| Condo | ≥ **1 space per unit** (Bangkok) | MR 7 ข้อ 3 (1)(C) |
| Large building | per-use total, or ≥ **1 per 120 m²** of floor area, whichever is greater | MR 7 ข้อ 3 (1)(H) |
| Office / Hotel | 1 per 60 m² / 10 spaces for first 30 rooms, then 1 per 5 rooms up to 100 rooms, then **1 per 10 rooms above 100** (fractions round up) | MR 7 ข้อ 3 (1)(F)(B), JICA p.5 |

(2026-11-19: the condo 60 m² trigger and the hotel ratios above are now also encoded in `rules/bangkok-y10.json` → `buildingControl.parkingBangkok`; no new research.)
| Stall size | 2.40 × 5.00 m perpendicular; 2.40 × 6.00 parallel; 2.40 × 5.50 angled | MR 41 ข้อ 2 |
| Clear height | ≥ 2.10 m | MR 41 ข้อ 4 |

## 4. Bangkok Building Control Ordinance 2001 (ข้อบัญญัติ กทม. ควบคุมอาคาร พ.ศ. 2544). PRIMARY-BMA

Inside Bangkok this ordinance is the local building law (it repealed the BMA's 1979/1978 ordinances, ข้อ 3). Read pp.1-3, 14-17. Where it is stricter than MR 55, **it governs**.

| Rule | Value | Clause (page) | vs. national MR |
|---|---|---|---|
| Road width (เขตทาง) | total width between the land lines on both sides: carriageway + footpath + planting strip + ditches | ข้อ 5 (4) (p.1) | confirms our interpretation |
| Building height | measured vertically from **road level** to the **highest part** of the building | ข้อ 5 (7) (p.1) | MR 33 measures to roof deck. See §7 |
| Open space (ที่ว่าง) | no roof/cover; may hold wells, ponds, wastewater tank, garbage area, **parking outside the building**; structures ≤ 1.20 m high without roof count | ข้อ 5 (36) (p.3) | same as MR 55 |
| **Height vs road** | height at any point ≤ **2 ×** horizontal distance to the **opposite edge of the nearest public road** | ข้อ 49 ¶1 (p.14) | same as MR 55 ข้อ 44 |
| Wide-road exception | if the building is on, or ≤ 100 m from, a public road **≥ 80 m** wide, with an access ≥ 12 m wide to it, use the **widest** road's width | ข้อ 49 ¶2 (p.14) | **new** (rare in ย.10, logged) |
| Road < 6 m | building line ≥ 3 m from road centre (fences ≤ 2 m exempt) | ข้อ 50 ¶1 (p.15) | same as MR 55 ข้อ 41 |
| Building > 2 storeys or > 8 m, large bldg, commercial… (not houses ≤ 3 storeys, ≤ 10 m, ≤ 1,000 m²) | road < 10 m → 6 m from centre; 10-20 m → 1/10 of width from road edge; > 20 m → 2 m from road edge | ข้อ 50 ¶2 (1)-(3) (p.15) | same bands, confirmed |
| Corner plot, roads 3-8 m, angle < 135° | chamfer the fence ≥ 4 m on each side | ข้อ 51 (p.15) | **new**, edge case |
| **Open space, residential building** | **≥ 30 % of the LAND area** | ข้อ 52 (1) (p.15) | **stricter**: MR 55 ข้อ 33 says 30 % of the largest floor |
| Open space, commercial/office/factory… | ≥ 10 % of land (30 % if partly residential) | ข้อ 52 (2) (p.15) | stricter |
| Buildings **not on** a public road, > 2 storeys / > 8 m | front open space ≥ 6 m; **> 3 storeys ≥ 12 m**; contiguous, ≥ **1/6 of the building's outer perimeter (L/6)**, joined to a ≥ 6 m road to the public road; ≥ 5 m clear height if under the building | ข้อ 52 (6) (p.15) | **new** |
| Buildings **on** a public road that don't need ข้อ 52 (3)/(6) | the road-facing side must be **more than 1/8 of the building's outer perimeter**, and that side ≤ **20 m** from the road | ข้อ 53 (p.16) | **new design check**. Resolves the "less/more than 1/8" conflict between the two blogs: the text says **มากกว่า** (more than) |
| Wall with openings → boundary | floors 1-2 or ≤ 9 m: ≥ 2 m; **floor 3 up or > 9 m: ≥ 3 m** | ข้อ 54 (p.16) | same idea, but also triggered by storey count |
| Space all round the building | ≤ 15 m high: ≥ 1 m (except houses ≤ 300 m²); **> 15 m: ≥ 2 m**; may overlap other open space **except for high-rise / extra-large buildings** | ข้อ 55 (p.16) | **new** below 23 m; above 23 m MR 33's 6 m governs |

## 5. Other plan-level constraints (PRIMARY, gazette)
- **ข้อ 40 (ล.2 roads):** plots on roads listed in the plan's annex must keep **≥ 2 m** from the road boundary as planted space. The list of roads is in the annex, not yet extracted. Shown as a warning, not enforced.
- **ข้อ 44 planned roads** ก-ช: right-of-way 12, 16, 20, 30, 40, 50, 60 m. Land inside a planned road is usable only for transport (ข้อ 45). The planned-road layer exists in the same BMA service (layer 0).

## 6. How the rules combine into the allowed space (our interpretation)

1. **Footprint polygon** = plot polygon, each edge pushed inward by its own setback:
   - road edge: max(BMA ข้อ 50 building line, 6 m if high-rise/extra-large [MR 33 ข้อ 4]);
   - other edges: by height band, 2 m (≤ 9 m and ≤ 2 storeys) / 3 m (> 9 m or ≥ 3 storeys) for walls with openings (BMA ข้อ 54), at least 2 m all round if > 15 m (BMA ข้อ 55), and **6 m** if high-rise/extra-large (MR 33 ข้อ 4).
2. **Height cap** at every point = 2 × (distance to the opposite edge of the road) (BMA ข้อ 49 = MR 55 ข้อ 44). This makes a sloping "sky plane" from the road, so the envelope is not a simple prism.
3. **High-rise gate:** if the road is < 10 m, or the plot's road frontage is < 12 m, the building must stay < 23 m tall **and** < 10,000 m² (MR 33 ข้อ 2).
4. **Floor area:** total ≤ 8 × plot area (≤ 9.6 with bonuses).
5. **Open space:** ≥ max(**30 % of the plot** [BMA ข้อ 52 (1), every residential building; same as MR 33 ข้อ 6 for high-rise], **4 % × total floor area** [OSR]). Half of the OSR area must be permeable. So **building coverage ≤ 70 %** of the plot, and near max FAR the OSR governs (4 % × 8 = 32 % > 30 %).
6. **Road face (BMA ข้อ 53):** the road-facing side of the footprint must be > 1/8 of the footprint perimeter and ≤ 20 m from the road. This is a design check, not an envelope cut.
7. **Parking:** ≥ max(units, total floor area ÷ 120) spaces at ~25-30 m² per space incl. aisles (assumption, not law).

## 7. Calls we made where the law is unclear (to write up)
- **Road width = right-of-way (เขตทาง)**, property line to property line, not the paved width. The city plan says "เขตทาง". MR 33 says "passage area".
- **Threshold edges** (exactly 10 m, 20 m, 23 m): we read "not less than" as ≥ and "less than" as <, as written.
- **Required open space counts unroofed ground-level area only.** Podium roofs do not count, which is conservative.
- **Floor area for FAR is gross floor area of all storeys**, including above-ground parking. The plan's definition says "all storeys of every building". Exemptions (e.g. underground parking) are not stated in the plan, so we count everything above ground and flag basements as an assumption.
- **Height has two definitions:** MR 33 measures to the roof deck (used for the 23 m high-rise threshold); the BMA ordinance measures from road level to the highest part (used for the 2× road rule). We model flat roofs and apply each definition to its own rule; roof structures (lift overruns, parapets) are ignored and noted as an assumption.
- **Bangkok ordinance over MR 55:** where both regulate the same thing, we apply the stricter one (e.g. open space 30 % of land, not 30 % of the largest floor).
- **"Mass-transit station" for the ข้อ 17 500 m conditions (hotel > 80 rooms, office > 10,000 m², commercial):** we count BTS and MRT (tile subclass subway / light_rail / monorail), stations on monorail track (Pink, Yellow and Gold Lines, from track geometry), and a named allowlist for the Airport Rail Link and the SRT Dark / Light Red Lines (`research/data/bkk-mass-transit-allowlist.json`, with sources). Ordinary SRT stations and halts (e.g. Sam Sen, Chitlada, Thonburi, Bangkok/Hua Lamphong SRT) do **not** count. Distance is measured from the plot boundary to the station point. (2026-11-19, coding session, on planning instruction.)
- **Wide-road exception (ข้อ 49 ¶2, ≥ 80 m road):** not checked which roads near ย.10 are ≥ 80 m wide; logged, not modelled in v1 (the tool will use the fronting road only).
