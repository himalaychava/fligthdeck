# Control Plane — The Application Side

Speaking notes for the "how it's done / what went behind it" segment.
Target **5–6 minutes**.

Sequence: lead gives the *why* → Rajeev walks an account (*how to use it*) → **you** → Sreejith covers access.

You sit between two practical segments, so keep this practical too. The room has just
seen the tool do something useful. Your job is to make them **trust it** and know
**who to talk to when it's wrong**. Architecture detail is in the appendix — use it only
if asked.

The whole segment answers five questions the audience is already silently asking.

---

## Q1. Where does this data come from? (90 sec)

Open here. It's the question underneath all the others.

> "Nothing on these screens is typed in by hand. Everything you saw comes out of four IBM systems that already exist."

| Source | What it gives us |
|---|---|
| **CSP** | Every support case — product, version, severity, dates |
| **Clarizen** | Contracts — work orders, project names, dates, ACV, owner and TAM |
| **OCC** | The product hierarchy that turns contract codes into readable product names |
| **IBM Product Lifecycle Catalog** | Official end-of-support dates for every product version |

Plus one that's live rather than uploaded:

> "The Offerings section talks to the Solution Builder API directly, in real time. So what you see there is whatever Solution Builder says right now — it can't go stale."

**The scale line, if you want one:**

> "The case data alone is about 1.15 million cases across roughly 24,000 IBM customers. Around 880 of those are accounts we actually serve, so a lot of what the app does is narrowing that down to what's relevant to us."

---

## Q2. How current is it? (45 sec)

> "The insights are recalculated every time you open the page — nothing is pre-computed or cached overnight. So the app is always exactly as current as the last data upload.
>
> Case data gets refreshed monthly. Contracts and the lifecycle catalog get refreshed when they change. The moment a new file is uploaded, every account's page reflects it — there's no rebuild or deployment step."

If asked *how would I know how fresh it is*: the admin panel shows the last upload date for every source.

---

## Q3. What's automatic, and what does a human maintain? (90 sec)

This is the heart of your segment.

> "Almost all of it is automatic. Nobody maintains a spreadsheet behind this."

**Automatic:**
- Which products are expansion opportunities vs. already under contract
- Which products are expired or expiring, and when
- Subscription offerings, pulled live
- All KPI rollups and account summaries

**Human, in the admin panel:**
- Uploading the four data files
- Telling the app which column is which — once per source
- Occasionally: matching a product name the app couldn't resolve on its own

The column-mapping point is worth making, because it explains why this stays alive:

> "When you upload a file, the app shows you its column headers and asks which of yours maps to which field it needs. It remembers that. So when IBM renames a column in an export — which does happen — nobody needs a code change. Somebody just re-points it in the admin screen."

---

## Q4. Can I trust the numbers? (90 sec)

The most important 90 seconds. This is where you earn credibility.

Start with the real problem:

> "We know what every customer runs, and we know IBM's support dates. But the two systems don't share a product ID — the only thing linking them is the product name, and they spell them differently. CSP calls something 'QRadar SIEM'; the catalog calls it 'IBM Security QRadar SIEM'."

Then how it's handled:

> "The app works through a series of matching rules — exact name, then partial, then some standard IBM naming patterns. That resolves about three-quarters of products on its own, with nothing configured."

Then the decision that matters:

> "The interesting question was the rest. 'zSecure' matches 27 different things in the catalog. 'WebSphere' matches 441. We deliberately made the app **refuse to guess** in those cases — because a confidently wrong end-of-support date in front of a customer is much worse than admitting we don't know.
>
> So when you see a line saying a product couldn't be checked, that's not a bug. That's the app telling you it won't make something up. Those go into a queue in the admin panel, and once someone maps it, it's fixed for every account at once."

---

## Q5. What do I do when something looks wrong? (30 sec)

> "Two cases. If a product shows as unchecked, that's a mapping gap — flag it and it gets mapped once, centrally. If a number looks wrong, it's almost always the underlying data rather than the app, and the admin panel shows exactly which upload it came from and when.
>
> Either way, tell us — there's nothing you can break by reporting it."

---

## Close (20 sec)

> "The short version: four IBM data sources, no manual data entry, recalculated on every page load, and built to say 'I don't know' rather than guess. As the underlying data improves, this improves with it — without anyone rebuilding anything."

---

## Appendix — only if asked

Keep these in your back pocket. Don't volunteer them.

**"What's it built with?"**
React and TypeScript, IBM Carbon for the UI so it looks like an IBM product. Node on the server. About 27,000 lines. Data lives in files today; Db2 is planned, and the code is structured so that's a contained change rather than a rewrite.

**"How does login work?"**
w3id SSO. Access is per-account, not all-or-nothing — a delivery consultant sees only their accounts, management sees everything. Sreejith covers the request process.

**"Those CSP files are huge — how does it handle them?"**
They're big enough to break standard spreadsheet libraries — beyond a limit Node has on how much text it can hold at once. We wrote a reader that streams through the file a row at a time instead of loading it whole. Uploads also run in the background in batches, so a large upload doesn't freeze the app for anyone else.

**"Is it slow?"**
It was — the admin panel took about sixteen seconds because it re-read the whole case store every visit. It now checks file timestamps to see whether anything actually changed, and only recalculates when it has. It's about a quarter of a second now.

**"How long did this take / what was hard?"**
The matching engine was rebuilt three times. The first version looked right in code but returned one offering where the real Solution Builder UI showed nine — we only caught it by checking against the live system. Most of the effort went into validating output against real data rather than writing features; nearly every correctness fix came from that, not from code review.

**"Can a client see this?"**
No. Internal only, behind w3id, scoped per account.

---

## Delivery notes

- **Lead with provenance, not technology.** "Where the data comes from" earns more trust than any stack detail.
- **The refuse-to-guess point is the one that lands.** It reframes the "couldn't be checked" lines from a weakness into a deliberate choice — do not skip it.
- **Have the admin panel open** on a second tab. The Pending Products list with real suggestions is the most concrete thing you can point at, and it makes Q3 and Q4 tangible.
- **If you're short on time**, cut Q2 and Q5. Q1, Q3 and Q4 carry the segment.
- Resist going deeper unless asked. The appendix exists so you can answer confidently without having led with it.
