/* customer.js - customer.html
   The customer's own bookings, bills and delivery actions. */

const user = requireRole("customer");

const ACTIVE = ["PendingApproval", "Approved", "Assigned", "OutForDelivery"];
const BILLED = ["Delivered", "Confirmed", "Disputed", "Resolved"];

let bookings = [];
let tripByBooking = {};
let tankers = {};
let hydrants = {};

const listBox = document.getElementById("bookings");
const statusFilter = document.getElementById("statusFilter");

async function load() {
  const [me, myBookings, allTankers, allHydrants] = await Promise.all([
    api.get("users", user.id),
    api.list("bookings", { customerId: user.id, _sort: "id", _order: "desc" }),
    api.list("tankers"),
    api.list("hydrants"),
  ]);
  setSession(me); // subsidy status may have changed since login

  // Only the trips of this customer's own bookings are requested.
  const trips = myBookings.length ? await api.list("trips", { bookingId: myBookings.map((b) => b.id) }) : [];

  bookings = myBookings;
  tripByBooking = Object.fromEntries(trips.map((trip) => [trip.bookingId, trip]));
  tankers = byId(allTankers);
  hydrants = byId(allHydrants);

  document.getElementById("subsidyLine").replaceChildren("Subsidy status: ", badge(me.subsidyStatus));
  render();
}

function render() {
  const billed = bookings.filter((b) => BILLED.includes(b.status));
  document.getElementById("stats").replaceChildren(
    statCard("Total bookings", bookings.length),
    statCard("Active", bookings.filter((b) => ACTIVE.includes(b.status)).length),
    statCard("Delivered", billed.length),
    statCard("Total billed", money(billed.reduce((sum, b) => sum + b.amount, 0)))
  );

  const filter = statusFilter.value;
  const rows = bookings.filter((b) =>
    filter === "all" ? true : filter === "active" ? ACTIVE.includes(b.status) : !ACTIVE.includes(b.status));

  renderTable(listBox, [
    { label: "Booking", render: (b) => "#" + b.id },
    { label: "Date and time", render: (b) => b.date + " at " + b.slot },
    { label: "Type", render: (b) => (b.type === "subsidised" ? "Subsidised" : "Commercial") },
    { label: "Size", render: (b) => gallons(b.capacity) },
    { label: "Hydrant", render: (b) => hydrants[b.hydrantId]?.name || "-" },
    { label: "Tanker", render: (b) => tankers[tripByBooking[b.id]?.tankerId]?.regNo || "Not assigned" },
    { label: "Bill", render: (b) => money(b.amount) },
    { label: "Status", render: statusCell },
    { label: "Actions", render: actionsFor },
  ], rows, "No bookings here. Use \"Book a tanker\" to make one.");
}

function statusCell(b) {
  const notes = {
    Failed: b.failReason && "Reason: " + b.failReason,
    Cancelled: b.cancelReason && "Reason: " + b.cancelReason,
    Rejected: b.rejectReason && "Reason: " + b.rejectReason,
    Disputed: "Under review by the Zone Officer",
    Resolved: b.disputeResolution && "Decision: " + b.disputeResolution,
  };
  return [badge(b.status), notes[b.status] ? el("span", { class: "note" }, notes[b.status]) : null];
}

/* Buttons depend on the booking status */
function actionsFor(b) {
  if (b.status === "PendingApproval" || b.status === "Approved") {
    return el("button", { class: "btn small danger", type: "button", onclick: () => cancelBooking(b) }, "Cancel");
  }
  if (b.status === "Delivered") {
    return el("div", { class: "btn-row" },
      el("button", { class: "btn small success", type: "button", onclick: () => confirmDelivery(b) }, "Confirm"),
      el("button", { class: "btn small ghost", type: "button", onclick: () => disputeDelivery(b) }, "Dispute"));
  }
  return null;
}

function cancelBooking(b) {
  formDialog("Cancel booking #" + b.id,
    [{ name: "cancelReason", label: "Why are you cancelling?", type: "textarea", rules: ["required"] }],
    {},
    async (data) => {
      await api.transition("bookings", b.id, ["PendingApproval", "Approved"], { status: "Cancelled", ...data });
      notify("Booking #" + b.id + " cancelled.");
      await load();
    }, "Cancel booking");
}

function confirmDelivery(b) {
  run(async () => {
    await api.transition("bookings", b.id, ["Delivered"], { status: "Confirmed" });
    notify("Thank you. Delivery confirmed.");
    await load();
  });
}

function disputeDelivery(b) {
  formDialog("Dispute delivery #" + b.id,
    [{
      name: "disputeReason", label: "What went wrong?", type: "textarea", rules: ["required"],
      validate: (value) => (value.length < 10 ? "Please describe the problem in at least 10 characters." : ""),
    }],
    {},
    async (data) => {
      await api.transition("bookings", b.id, ["Delivered"], { status: "Disputed", ...data });
      notify("Dispute sent to your Zone Officer.");
      await load();
    }, "Send dispute");
}

if (user) {
  renderNav();
  showSkeleton(listBox);
  statusFilter.addEventListener("change", render);
  run(load);
}
