# PaaniLink - Water Tanker Booking and Dispatch System

Web Engineering project, Phase 1 (frontend). Built with plain HTML, CSS and JavaScript (DOM + Fetch). All data comes from a mock REST API, which the Phase 2 backend will replace.

## How to run

You need Node.js installed.

```
npm install
npm start
```

Then open **http://localhost:3000** in the browser.

`npm start` runs json-server, which does two jobs: it turns `db.json` into a REST API, and it serves the pages in the `public/` folder. Every change you make in the app is written to `db.json`. To reset the data, restore the original `db.json`.

## Demo accounts

| Role | Phone | Password | Notes |
|---|---|---|---|
| Administrator | 03000000001 | admin123 | |
| Zone Officer | 03000000002 | officer123 | Orangi Town |
| Zone Officer | 03000000003 | officer123 | Korangi |
| Hydrant Operator | 03000000004 | operator123 | Manghopir Hydrant |
| Hydrant Operator | 03000000005 | operator123 | Landhi Hydrant |
| Driver | 03000000006 | driver123 | Manghopir Hydrant |
| Driver | 03000000007 | driver123 | Manghopir Hydrant |
| Driver | 03000000008 | driver123 | Landhi Hydrant |
| Customer | 03000000009 | customer123 | Subsidy approved |
| Customer | 03000000010 | customer123 | Subsidy pending |
| Customer | 03000000011 | customer123 | No subsidy |

## Folder structure

```
paanilink/
  db.json                 mock data (the "database" for Phase 1)
  package.json
  public/
    index.html            login
    register.html         customer registration
    customer.html         my bookings, bills, confirm / dispute / cancel
    customer-book.html    booking form
    customer-subsidy.html subsidy application
    officer.html          zone officer desk
    operator.html         hydrant operator dispatch
    driver.html           driver trips (phone first)
    admin.html            reports and master data
    css/style.css         one stylesheet, mobile first
    js/
      api.js              every fetch call lives here
      auth.js             session, role guard, navigation bar
      ui.js               DOM helpers: el(), renderTable(), formDialog(), notify()
      validate.js         validation rules
      <page>.js           one script per page
```

## How one action flows (click to Fetch to render)

Example: the customer cancels a booking.

1. `customer.js` draws the table with `renderTable()`. For a booking whose status is `PendingApproval` or `Approved`, `actionsFor()` adds a Cancel button with a click listener.
2. The click opens `formDialog()`, which builds a form with the DOM and validates it with the rules in `validate.js`.
3. On submit, `api.transition()` in `api.js` first does `GET /bookings/:id` to check the status is still allowed, then `PATCH /bookings/:id` with `{ status: "Cancelled", cancelReason }` using `fetch()`.
4. `load()` runs again: it fetches the bookings and `render()` rebuilds the table, so the row now shows the Cancelled badge and no buttons.

Every page follows the same pattern: `requireRole()` -> `load()` (Fetch) -> `render()` (DOM) -> event listener -> Fetch -> `load()` again.

## Booking life cycle

```
Commercial:  Approved -> Assigned -> OutForDelivery -> Delivered -> Confirmed
Subsidised:  PendingApproval -> Approved -> (same as above)
Other ends:  Rejected (officer), Cancelled (customer), Failed (driver),
             Delivered -> Disputed -> Resolved (officer)
```

Trip life cycle: `Assigned -> Filled -> Dispatched -> Arrived -> Delivered | Failed`

## Who can do what

| Action | Customer | Zone Officer | Operator | Driver | Admin |
|---|---|---|---|---|---|
| Register, book, cancel own booking | Yes | | | | |
| Confirm or dispute own delivery | Yes | | | | |
| Apply for subsidy | Yes | | | | |
| Verify subsidy applications (own zone) | | Yes | | | |
| Approve / reject subsidised bookings (own zone) | | Yes | | | |
| Resolve disputes (own zone) | | Yes | | | |
| View all bookings in a zone | | View only | | | |
| Assign tanker and driver (own hydrant) | | | Yes | | |
| Mark filled / left, mark tanker or hydrant unavailable | | | Yes | | |
| Mark trip Arrived / Delivered / Failed (own trips) | | | | Yes | |
| Manage zones, hydrants, tankers, rates, users | | | | | Yes |
| City-wide reports | | | | | Yes |

## API contract

Base URL: `http://localhost:3000` (set once in `public/js/api.js`).

All resources support the same five calls:

| Method | Path | Purpose | Body |
|---|---|---|---|
| GET | `/{resource}` | List, with filters as query parameters | - |
| GET | `/{resource}/{id}` | One record | - |
| POST | `/{resource}` | Create | JSON record without `id` |
| PATCH | `/{resource}/{id}` | Change some fields | JSON with the changed fields |
| DELETE | `/{resource}/{id}` | Delete | - |

Query parameters used: any field name as a filter (`?zoneId=1`, `?id=3&id=4`), `_sort` and `_order`.

Resources and their fields:

| Resource | Fields |
|---|---|
| `users` | id, name, cnic, phone, password, role (customer, officer, operator, driver, admin), zoneId, hydrantId, address, subsidyStatus (none, pending, approved, rejected), active |
| `zones` | id, name, hydrantIds[] |
| `hydrants` | id, name, dailyQuota, openTime, closeTime, available |
| `tankers` | id, regNo, capacity (1000, 3000, 6000), hydrantId, available |
| `rates` | id, capacity, commercial, subsidised |
| `subsidyApplications` | id, customerId, zoneId, category, proofType, proofNumber, householdSize, details, status (pending, approved, rejected), remarks, createdAt |
| `bookings` | id, customerId, zoneId, hydrantId, type (commercial, subsidised), capacity, date, slot, address, amount, status, createdAt, cancelReason, rejectReason, failReason, disputeReason, disputeResolution |
| `trips` | id, bookingId, hydrantId, tankerId, driverId, date, slot, status, filledAt, leftAt, arrivedAt, completedAt, failReason |
| `settings` | single object: subsidyMonthlyLimit. `GET /settings`, `PATCH /settings` |

Calls each screen makes:

| Screen | Calls |
|---|---|
| Login | `GET /users?phone=&password=` |
| Register | `GET /zones`, `GET /users?phone=`, `GET /users?cnic=`, `POST /users` |
| Customer bookings | `GET /users/:id`, `GET /bookings?customerId=`, `GET /trips?bookingId=`, `GET /tankers`, `GET /hydrants`, `PATCH /bookings/:id` |
| Book a tanker | `GET /rates`, `GET /zones/:id`, `GET /hydrants`, `GET /settings`, `GET /bookings?hydrantId=&date=`, `GET /bookings?customerId=`, `POST /bookings` |
| Subsidy | `GET /subsidyApplications?customerId=`, `POST /subsidyApplications`, `PATCH /users/:id` |
| Zone Officer | `GET /subsidyApplications?zoneId=`, `GET /bookings?zoneId=`, `GET /users?role=customer&zoneId=`, `GET /trips?bookingId=`, `PATCH /subsidyApplications/:id`, `PATCH /users/:id`, `PATCH /bookings/:id` |
| Hydrant Operator | `GET /hydrants/:id`, `GET /bookings?hydrantId=`, `GET /trips?hydrantId=`, `GET /tankers?hydrantId=`, `GET /users?role=driver&hydrantId=`, `GET /trips?hydrantId=&date=&slot=`, `POST /trips`, `PATCH /bookings/:id`, `PATCH /trips/:id`, `PATCH /tankers/:id`, `PATCH /hydrants/:id` |
| Driver | `GET /trips?driverId=`, `GET /bookings?id=`, `GET /users?id=`, `GET /tankers?hydrantId=`, `PATCH /trips/:id`, `PATCH /bookings/:id` |
| Admin | GET, POST, PATCH, DELETE on `zones`, `hydrants`, `tankers`, `rates`, `users`; `GET /bookings`; `GET` and `PATCH /settings` |

## Rules checked in the frontend

- CNIC is 13 digits, phone is 11 digits starting with 03, password is at least 6 characters, CNIC and phone are unique.
- A customer can only book from hydrants that serve their zone, and only if the hydrant is available.
- The date cannot be in the past, and the time slot must be inside the hydrant's operating hours.
- Gallons already booked at the hydrant on that date plus the new tanker cannot be more than the daily quota.
- Subsidised booking is only for customers whose subsidy is approved, and only up to the monthly limit.
- A customer cannot have two bookings at the same date and time.
- A booking can be cancelled only before a tanker is assigned.
- The operator can only pick an available tanker of the booked size, and a tanker or driver that already has an open trip in the same slot is refused.
- A tanker with an open trip cannot be marked unavailable.
- A failed trip must have a reason.
- Before every status change the record is read again, and the change is refused if the status has moved on.

## Assumptions

1. A delivery slot is one hour. A tanker and a driver can do one trip per slot.
2. The hydrant daily quota is used by every booking that is not Cancelled, Rejected or Failed, from the moment it is booked.
3. The tanker assigned must be exactly the booked size (1,000, 3,000 or 6,000 gallons).
4. The subsidised monthly limit counts bookings per calendar month of the delivery date. The default is 2 and the Administrator can change it.
5. A commercial booking is approved automatically. A subsidised booking waits for the Zone Officer of the customer's zone.
6. "Uploading proof details" is done as text fields (document type and number). Real file upload is left for the backend phase.
7. Payment is cash on delivery. The "bill" is the amount of each delivered booking.
8. Each customer has one address and one zone. Each operator and driver belongs to one hydrant, and each Zone Officer to one zone.
9. Users are deactivated instead of deleted, so that old bookings keep their history.
10. A dispute can be raised only after the driver marks the trip Delivered, and it is closed by the Zone Officer with a written decision.

## Known limits of Phase 1 (to be solved by the backend)

- Login is a mock: the password is stored as plain text in `db.json` and compared with a query. The backend will hash passwords and issue a token.
- Roles are enforced only in the browser. The mock API will answer anyone, so the backend must check the role on every request.
- Assigning a tanker is two requests (update the booking, create the trip). The backend must do this in one database transaction so two operators can never double-book.
- Searching and filtering are done in the browser. The backend will do them in the database with pagination.
- The use case diagram is not included in this folder and still has to be drawn for the documentation marks.
