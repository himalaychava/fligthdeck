# Manual test checklist

Use this to check, in a browser, that a new version of FlightDeck behaves
exactly like the current one. Run the **current** and the **new** version side
by side on the **same copy of the data**, do each step in both, and compare.

Only mark a step ✓ if both look and behave the same. For anything different,
write down what you did, what you expected and what you saw, with a screenshot
of both versions.

**Do not** upload data or run Run Reports on a shared environment unless the
FlightDeck admin has given you a test copy of the data for it.

## Before you start

- [ ] Ask the FlightDeck admin for the two addresses (current and new) and the
      sign-in emails to use for each test user.
- [ ] Use the same browser for both versions; open each in its own window.

## Customers to check

The FlightDeck admin gives you one customer name for each type below. Customer
names are not kept in this repo.

| #   | Type of customer                                       | What to look for                                                    |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| C1  | End customer of a reseller (two of them)               | Contract page shows "Contracted through …" with the reseller's name |
| C2  | Customer with contracts but no CSP cases               | Pages load; case sections say there is no case data                 |
| C3  | Large customer with many cases                         | Charts, Sev1 table and opportunities fill in                        |
| C4  | Customer with verified products and health checks      | Verified products and health-check history show                     |
| C5  | Customer with saved contract edits                     | The edited owner / project manager shows on the Contract page       |
| C6  | One customer in APAC and one in EMEA (not Middle East) | Shown or hidden correctly for each test user in section 3           |
| C7  | The reseller itself                                    | Must **not** appear anywhere in the customer list                   |

## 1. Sign-in and home page

| #   | Steps                                             | Expected (same in both)                                        | ✓/✗ | Notes |
| --- | ------------------------------------------------- | -------------------------------------------------------------- | --- | ----- |
| 1.1 | Open the app, sign in as the admin user           | Lands on the home page; header reads "Subscription FlightDeck" |     |       |
| 1.2 | Look at the opportunity overview on the home page | Same tiles, numbers and products                               |     |       |
| 1.3 | Filter by Geo, then Market, then Division         | Same numbers after each filter                                 |     |       |
| 1.4 | Download the opportunity report (Excel)           | Opens; same sheets and rows                                    |     |       |
| 1.5 | Search the customer list for C1 and for C7        | C1 found; C7 not found                                         |     |       |
| 1.6 | Sort the customer list by "Most opportunities"    | Same order                                                     |     |       |

## 2. Customer pages (do for each customer in the table above)

| #   | Page                                 | Check                                                                                      | ✓/✗ | Notes |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------ | --- | ----- |
| 2.1 | Client Overview                      | Header, contract summary, commercial numbers, product portfolio; no Download Report button |     |       |
| 2.2 | Account Overview                     | Account team, health-check section                                                         |     |       |
| 2.3 | Contract                             | Contract list, ACV/TCV, end dates; "Contracted through" label for the two C1 customers     |     |       |
| 2.4 | Insights                             | Account Case Summary text, Sev1 table, case charts, filters; the date line under the title |     |       |
| 2.5 | Insights → Offerings                 | Same offerings listed (needs the IBM VPN)                                                  |     |       |
| 2.6 | Global View                          | Same tiles and charts; Download Report works and the PDF opens                             |     |       |
| 2.7 | External, CSAT, Initiatives, Renewal | Same content (some are "Under development")                                                |     |       |

## 3. Access for each user type

Sign in as each test user and check the customer list and one customer page.

| #   | User                               | Expected (same in both)                                           | ✓/✗ | Notes |
| --- | ---------------------------------- | ----------------------------------------------------------------- | --- | ----- |
| 3.1 | Delivery user with named customers | Sees only their customers; others show "no access"                |     |       |
| 3.2 | Delivery user with all geos        | Sees customers in all geos                                        |     |       |
| 3.3 | Sales user (EMEA / Middle East)    | Sees only Middle East customers (C1 yes, the EMEA C6 customer no) |     |       |
| 3.4 | Signed out                         | Sent to the sign-in page                                          |     |       |
| 3.5 | Non-admin opens /admin             | Not allowed in                                                    |     |       |

## 4. Admin (admin user)

| #   | Tab            | Check                                                                    | ✓/✗ | Notes |
| --- | -------------- | ------------------------------------------------------------------------ | --- | ----- |
| 4.1 | Users & Access | Same users, roles, geos and markets                                      |     |       |
| 4.2 | Data Uploads   | Same last-upload details                                                 |     |       |
| 4.3 | Run Reports    | Same last run details                                                    |     |       |
| 4.4 | Upload History | Same list; open "View" on one Clarizen and one CSP entry; Download works |     |       |

## 5. Changes (only on a test copy of the data)

| #   | Steps                                           | Expected (same in both)                                      | ✓/✗ | Notes |
| --- | ----------------------------------------------- | ------------------------------------------------------------ | --- | ----- |
| 5.1 | Contract page: change a contract owner and save | Saved; shown after reload                                    |     |       |
| 5.2 | Client Overview: verify a product               | Saved; shown after reload                                    |     |       |
| 5.3 | Account Overview: request a health check        | Request file created                                         |     |       |
| 5.4 | Admin → Data Uploads: upload the Clarizen dump  | Same upload summary (rows, stored, new pages, reseller line) |     |       |
| 5.5 | Admin → Run Reports: run for changed customers  | Completes; same counts                                       |     |       |

## Report

Send the filled-in checklist to the FlightDeck admin, with screenshots for
every ✗.
