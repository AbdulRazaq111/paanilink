/* driver.js - driver.html
   Driver: sees only own trips and marks them Arrived, Delivered or Failed.
   Built as big cards and big buttons so it is easy to use on a phone. */

const user = requireRole("driver");

const FAIL_REASONS = ["House locked", "Road blocked", "Customer not reachable", "Tanker breakdown", "Other"];

let trips = [];
let bookings = {};
let customers = {};
let tankers = {};

async function load() {
  // The query itself is limited to this driver's trips.
  const myTrips = await api.list("trips", { driverId: user.id, _sort: "date,slot", _order: "desc,asc" });
  const myBookings = myTrips.length ? await api.list("bookings", { id: myTrips.map((t) => t.bookingId) }) : [];
  const customerIds = [...new Set(myBookings.map((b) => b.customerId))];
  const [people, hydrantTankers] = await Promise.all([
    customerIds.length ? api.list("users", { id: customerIds }) : [],
    api.list("tankers", { hydrantId: user.hydrantId }),
  ]);

  trips = myTrips;
  bookings = byId(myBookings);
  customers = byId(people);
  tankers = byId(hydrantTankers);
  render();
}

function render() {
  const active = trips.filter((t) => ["Assigned", "Filled", "Dispatched", "Arrived"].includes(t.status));
  const done = trips.filter((t) => ["Delivered", "Failed"].includes(t.status));
  fill(document.getElementById("activeTrips"), active, "No active trips right now.");
  fill(document.getElementById("doneTrips"), done, "No finished trips yet.");
}

function fill(target, list, emptyText) {
  target.replaceChildren(...(list.length ? list.map(tripCard) : [el("p", { class: "empty" }, emptyText)]));
}

function tripCard(trip) {
  const booking = bookings[trip.bookingId] || {};
  const customer = customers[booking.customerId] || {};
  return el("article", { class: "card trip" },
    el("div", { class: "trip-head" }, el("strong", {}, "Trip #" + trip.id), badge(trip.status)),
    el("dl", {},
      el("dt", {}, "When"), el("dd", {}, trip.date + " at " + trip.slot),
      el("dt", {}, "Tanker"), el("dd", {}, (tankers[trip.tankerId]?.regNo || "-") + ", " + gallons(booking.capacity)),
      el("dt", {}, "Customer"), el("dd", {}, customer.name || "-"),
      el("dt", {}, "Phone"), el("dd", {}, customer.phone ? el("a", { href: "tel:" + customer.phone }, customer.phone) : "-"),
      el("dt", {}, "Address"), el("dd", {}, booking.address || "-"),
      trip.failReason ? [el("dt", {}, "Reason"), el("dd", {}, trip.failReason)] : null),
    tripButtons(trip));
}

/* Buttons depend on the trip status */
function tripButtons(trip) {
  if (trip.status === "Assigned" || trip.status === "Filled") {
    return el("p", { class: "hint" }, "Waiting at the hydrant. The operator will mark the tanker as filled and released.");
  }
  if (trip.status === "Dispatched") {
    return el("button", { class: "btn big", type: "button", onclick: () => markArrived(trip) }, "I have arrived");
  }
  if (trip.status === "Arrived") {
    return el("div", { class: "btn-row" },
      el("button", { class: "btn big success", type: "button", onclick: () => markDelivered(trip) }, "Delivered"),
      el("button", { class: "btn big danger", type: "button", onclick: () => markFailed(trip) }, "Could not deliver"));
  }
  return null;
}

function markArrived(trip) {
  run(async () => {
    await api.transition("trips", trip.id, ["Dispatched"], { status: "Arrived", arrivedAt: new Date().toISOString() });
    notify("Marked as arrived.");
    await load();
  });
}

function markDelivered(trip) {
  run(async () => {
    await api.transition("trips", trip.id, ["Arrived"], { status: "Delivered", completedAt: new Date().toISOString() });
    await api.update("bookings", trip.bookingId, { status: "Delivered" });
    notify("Delivery recorded. The customer will confirm it.");
    await load();
  });
}

function markFailed(trip) {
  formDialog("Could not deliver trip #" + trip.id,
    [
      { name: "reason", label: "Reason", type: "select", rules: ["required"], options: FAIL_REASONS.map((text) => ({ value: text, label: text })) },
      {
        name: "note", label: "Note (required for Other)", type: "textarea",
        validate: (value, data) => (data.reason === "Other" && !value ? "Please describe what happened." : ""),
      },
    ],
    {},
    async (data) => {
      const failReason = data.note ? data.reason + ": " + data.note : data.reason;
      await api.transition("trips", trip.id, ["Arrived"], { status: "Failed", failReason, completedAt: new Date().toISOString() });
      await api.update("bookings", trip.bookingId, { status: "Failed", failReason });
      notify("Trip marked as failed.");
      await load();
    }, "Mark failed");
}

if (user) {
  renderNav();
  showSkeleton(document.getElementById("activeTrips"), 2);
  document.getElementById("refresh").addEventListener("click", () => run(load));
  run(load);
}
