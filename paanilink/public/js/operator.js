/* operator.js - operator.html
   Hydrant Operator: assign a tanker and driver to approved bookings,
   record filling and departure, mark tankers or the hydrant unavailable. */

const user = requireRole("operator");

const TRIP_OPEN = ["Assigned", "Filled", "Dispatched", "Arrived"]; // tanker and driver are busy
const NOT_COUNTED = ["Cancelled", "Rejected", "Failed"];

let hydrant = {};
let bookings = [];
let trips = [];
let tankers = [];
let drivers = [];
let customers = {};

const tripDate = document.getElementById("tripDate");

async function load() {
  const [myHydrant, hydrantBookings, hydrantTrips, hydrantTankers, hydrantDrivers] = await Promise.all([
    api.get("hydrants", user.hydrantId),
    api.list("bookings", { hydrantId: user.hydrantId, _sort: "date,slot" }),
    api.list("trips", { hydrantId: user.hydrantId, _sort: "date,slot" }),
    api.list("tankers", { hydrantId: user.hydrantId }),
    api.list("users", { role: "driver", hydrantId: user.hydrantId }),
  ]);
  const customerIds = [...new Set(hydrantBookings.map((b) => b.customerId))];
  const people = customerIds.length ? await api.list("users", { id: customerIds }) : [];

  hydrant = myHydrant;
  bookings = hydrantBookings;
  trips = hydrantTrips;
  tankers = hydrantTankers;
  drivers = hydrantDrivers;
  customers = byId(people);
  render();
}

function render() {
  const toAssign = bookings.filter((b) => b.status === "Approved");
  const usedToday = bookings
    .filter((b) => b.date === today() && !NOT_COUNTED.includes(b.status))
    .reduce((sum, b) => sum + b.capacity, 0);

  document.getElementById("hydrantLine").replaceChildren(
    hydrant.name + " (" + hydrant.openTime + " to " + hydrant.closeTime + ") ",
    badge(hydrant.available ? "Available" : "Unavailable"));
  document.getElementById("hydrantToggle").textContent = hydrant.available ? "Mark hydrant unavailable" : "Mark hydrant available";

  document.getElementById("stats").replaceChildren(
    statCard("Waiting for assignment", toAssign.length),
    statCard("Open trips", trips.filter((t) => TRIP_OPEN.includes(t.status)).length),
    statCard("Water booked today", gallons(usedToday)),
    statCard("Daily quota", gallons(hydrant.dailyQuota))
  );

  const bookingById = byId(bookings);
  const tankerById = byId(tankers);
  const driverById = byId(drivers);

  renderTable(document.getElementById("toAssign"), [
    { label: "Booking", render: (b) => "#" + b.id },
    { label: "Date and time", render: (b) => b.date + " at " + b.slot },
    { label: "Size", render: (b) => gallons(b.capacity) },
    { label: "Type", render: (b) => (b.type === "subsidised" ? "Subsidised" : "Commercial") },
    { label: "Customer", render: (b) => customers[b.customerId]?.name || "-" },
    { label: "Address", render: (b) => b.address },
    { label: "Actions", render: (b) => el("button", { class: "btn small", type: "button", onclick: () => assign(b) }, "Assign tanker") },
  ], toAssign, "No approved bookings are waiting.");

  const dayTrips = trips.filter((t) => !tripDate.value || t.date === tripDate.value);
  renderTable(document.getElementById("trips"), [
    { label: "Booking", render: (t) => "#" + t.bookingId },
    { label: "Date and time", render: (t) => t.date + " at " + t.slot },
    { label: "Tanker", render: (t) => tankerById[t.tankerId]?.regNo || "-" },
    { label: "Driver", render: (t) => driverById[t.driverId]?.name || "-" },
    { label: "Address", render: (t) => bookingById[t.bookingId]?.address || "-" },
    { label: "Filled", render: (t) => formatDateTime(t.filledAt) },
    { label: "Left", render: (t) => formatDateTime(t.leftAt) },
    { label: "Status", render: (t) => [badge(t.status), t.failReason ? el("span", { class: "note" }, t.failReason) : null] },
    { label: "Actions", render: tripActions },
  ], dayTrips, "No trips on this date.");

  renderTable(document.getElementById("tankers"), [
    { label: "Tanker", render: (t) => t.regNo },
    { label: "Size", render: (t) => gallons(t.capacity) },
    { label: "Status", render: (t) => badge(t.available ? "Available" : "Unavailable") },
    {
      label: "Actions", render: (t) => el("button", { class: "btn small ghost", type: "button", onclick: () => toggleTanker(t) },
        t.available ? "Mark unavailable" : "Mark available"),
    },
  ], tankers, "No tankers are registered at this hydrant.");
}

/* The next step of a trip decides which button is shown */
function tripActions(trip) {
  if (trip.status === "Assigned") {
    return el("button", { class: "btn small", type: "button", onclick: () => markFilled(trip) }, "Mark filled");
  }
  if (trip.status === "Filled") {
    return el("button", { class: "btn small success", type: "button", onclick: () => markLeft(trip) }, "Mark left");
  }
  return null;
}

function assign(booking) {
  if (!hydrant.available) return notify("The hydrant is marked unavailable. Make it available first.", "error");

  // Only tankers of the booked size that are in service can be chosen.
  const fitting = tankers.filter((t) => t.available && t.capacity === booking.capacity);
  const activeDrivers = drivers.filter((d) => d.active);

  formDialog("Assign booking #" + booking.id + " (" + gallons(booking.capacity) + ", " + booking.date + " " + booking.slot + ")",
    [
      { name: "tankerId", label: "Tanker", type: "select", numeric: true, rules: ["required"], options: fitting.map((t) => ({ value: t.id, label: t.regNo + " (" + gallons(t.capacity) + ")" })) },
      { name: "driverId", label: "Driver", type: "select", numeric: true, rules: ["required"], options: activeDrivers.map((d) => ({ value: d.id, label: d.name })) },
    ],
    {},
    async (data) => {
      // A tanker or driver must never be promised twice for the same time.
      const sameSlot = await api.list("trips", { hydrantId: hydrant.id, date: booking.date, slot: booking.slot });
      const busy = sameSlot.filter((t) => TRIP_OPEN.includes(t.status));
      if (busy.some((t) => t.tankerId === data.tankerId)) throw new Error("This tanker already has a trip at " + booking.slot + ".");
      if (busy.some((t) => t.driverId === data.driverId)) throw new Error("This driver already has a trip at " + booking.slot + ".");

      // Two writes. In the backend phase these become one database transaction.
      await api.transition("bookings", booking.id, ["Approved"], { status: "Assigned" });
      await api.create("trips", {
        bookingId: booking.id,
        hydrantId: hydrant.id,
        tankerId: data.tankerId,
        driverId: data.driverId,
        date: booking.date,
        slot: booking.slot,
        status: "Assigned",
      });
      notify("Booking #" + booking.id + " assigned.");
      await load();
    }, "Assign");
}

function markFilled(trip) {
  run(async () => {
    await api.transition("trips", trip.id, ["Assigned"], { status: "Filled", filledAt: new Date().toISOString() });
    notify("Tanker filled.");
    await load();
  });
}

function markLeft(trip) {
  run(async () => {
    await api.transition("trips", trip.id, ["Filled"], { status: "Dispatched", leftAt: new Date().toISOString() });
    await api.update("bookings", trip.bookingId, { status: "OutForDelivery" });
    notify("Tanker has left the hydrant.");
    await load();
  });
}

function toggleTanker(tanker) {
  run(async () => {
    const hasOpenTrip = trips.some((t) => t.tankerId === tanker.id && TRIP_OPEN.includes(t.status));
    if (tanker.available && hasOpenTrip) throw new Error("This tanker has an open trip. Finish it first.");
    await api.update("tankers", tanker.id, { available: !tanker.available });
    await load();
  });
}

if (user) {
  renderNav();
  initTabs();
  tripDate.value = today();
  tripDate.addEventListener("change", render);
  document.getElementById("hydrantToggle").addEventListener("click", () => run(async () => {
    await api.update("hydrants", hydrant.id, { available: !hydrant.available });
    await load();
  }));
  showSkeleton(document.getElementById("toAssign"));
  run(load);
}
