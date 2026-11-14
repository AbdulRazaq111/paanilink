/* officer.js - officer.html
   Zone Officer: verify subsidy applications, approve subsidised bookings,
   handle disputes. Can see every booking in the zone but cannot dispatch. */

const user = requireRole("officer");

const ALL_STATUSES = ["PendingApproval", "Approved", "Rejected", "Assigned", "OutForDelivery",
  "Delivered", "Confirmed", "Disputed", "Resolved", "Failed", "Cancelled"];

let applications = [];
let bookings = [];
let customers = {};
let hydrants = {};
let tankers = {};
let tripByBooking = {};

const statusFilter = document.getElementById("statusFilter");
const search = document.getElementById("search");

async function load() {
  const [zone, zoneApplications, zoneBookings, zoneCustomers, allHydrants, allTankers] = await Promise.all([
    api.get("zones", user.zoneId),
    api.list("subsidyApplications", { zoneId: user.zoneId, _sort: "id", _order: "desc" }),
    api.list("bookings", { zoneId: user.zoneId, _sort: "id", _order: "desc" }),
    api.list("users", { role: "customer", zoneId: user.zoneId }),
    api.list("hydrants"),
    api.list("tankers"),
  ]);
  const trips = zoneBookings.length ? await api.list("trips", { bookingId: zoneBookings.map((b) => b.id) }) : [];

  applications = zoneApplications;
  bookings = zoneBookings;
  customers = byId(zoneCustomers);
  hydrants = byId(allHydrants);
  tankers = byId(allTankers);
  tripByBooking = Object.fromEntries(trips.map((trip) => [trip.bookingId, trip]));

  document.getElementById("zoneLine").textContent = "Zone: " + zone.name;
  render();
}

const customerCell = (record) => {
  const customer = customers[record.customerId];
  return customer ? [customer.name, el("span", { class: "note" }, customer.phone)] : "Unknown";
};

function render() {
  const pendingApplications = applications.filter((a) => a.status === "pending");
  const pendingBookings = bookings.filter((b) => b.status === "PendingApproval");
  const disputes = bookings.filter((b) => b.status === "Disputed");

  document.getElementById("stats").replaceChildren(
    statCard("Applications waiting", pendingApplications.length),
    statCard("Bookings to approve", pendingBookings.length),
    statCard("Open disputes", disputes.length),
    statCard("Zone bookings", bookings.length)
  );

  renderTable(document.getElementById("applications"), [
    { label: "Customer", render: customerCell },
    { label: "CNIC", render: (a) => customers[a.customerId]?.cnic || "-" },
    { label: "Type", render: (a) => a.category },
    { label: "Proof", render: (a) => a.proofType + " " + a.proofNumber },
    { label: "People", render: (a) => a.householdSize },
    { label: "Details", render: (a) => a.details },
    { label: "Status", render: (a) => [badge(a.status), a.remarks ? el("span", { class: "note" }, a.remarks) : null] },
    {
      label: "Actions", render: (a) => a.status !== "pending" ? null : el("div", { class: "btn-row" },
        el("button", { class: "btn small success", type: "button", onclick: () => decideApplication(a, "approved") }, "Verify"),
        el("button", { class: "btn small danger", type: "button", onclick: () => decideApplication(a, "rejected") }, "Reject")),
    },
  ], applications, "No subsidy applications in this zone.");

  renderTable(document.getElementById("approvals"), [
    { label: "Booking", render: (b) => "#" + b.id },
    { label: "Customer", render: customerCell },
    { label: "Date and time", render: (b) => b.date + " at " + b.slot },
    { label: "Size", render: (b) => gallons(b.capacity) },
    { label: "Subsidised this month", render: (b) => usedThisMonth(b) + " booking(s)" },
    {
      label: "Actions", render: (b) => el("div", { class: "btn-row" },
        el("button", { class: "btn small success", type: "button", onclick: () => approveBooking(b) }, "Approve"),
        el("button", { class: "btn small danger", type: "button", onclick: () => rejectBooking(b) }, "Reject")),
    },
  ], pendingBookings, "No subsidised bookings are waiting for approval.");

  renderTable(document.getElementById("disputes"), [
    { label: "Booking", render: (b) => "#" + b.id },
    { label: "Customer", render: customerCell },
    { label: "Delivered on", render: (b) => b.date + " at " + b.slot },
    { label: "Tanker", render: (b) => tankers[tripByBooking[b.id]?.tankerId]?.regNo || "-" },
    { label: "Complaint", render: (b) => b.disputeReason },
    { label: "Actions", render: (b) => el("button", { class: "btn small", type: "button", onclick: () => resolveDispute(b) }, "Resolve") },
  ], disputes, "No open disputes.");

  renderAll();
}

/* Count of this customer's other subsidised bookings in the same month */
function usedThisMonth(booking) {
  const month = booking.date.slice(0, 7);
  return bookings.filter((b) =>
    b.customerId === booking.customerId && b.type === "subsidised" && b.id !== booking.id &&
    b.date.startsWith(month) && !["Cancelled", "Rejected", "Failed"].includes(b.status)).length;
}

/* Search and filter for the view-only list */
function renderAll() {
  const text = search.value.trim().toLowerCase();
  const rows = bookings.filter((b) => {
    const customer = customers[b.customerId] || {};
    const matchesStatus = !statusFilter.value || b.status === statusFilter.value;
    const matchesText = !text || (customer.name || "").toLowerCase().includes(text) || (customer.phone || "").includes(text);
    return matchesStatus && matchesText;
  });

  renderTable(document.getElementById("allBookings"), [
    { label: "Booking", render: (b) => "#" + b.id },
    { label: "Customer", render: customerCell },
    { label: "Date and time", render: (b) => b.date + " at " + b.slot },
    { label: "Type", render: (b) => (b.type === "subsidised" ? "Subsidised" : "Commercial") },
    { label: "Size", render: (b) => gallons(b.capacity) },
    { label: "Hydrant", render: (b) => hydrants[b.hydrantId]?.name || "-" },
    { label: "Tanker", render: (b) => tankers[tripByBooking[b.id]?.tankerId]?.regNo || "-" },
    { label: "Status", render: (b) => badge(b.status) },
  ], rows, "No bookings match.");
}

function decideApplication(application, decision) {
  const approving = decision === "approved";
  formDialog((approving ? "Verify" : "Reject") + " application",
    [{ name: "remarks", label: "Remarks", type: "textarea", rules: approving ? [] : ["required"] }],
    {},
    async (data) => {
      await api.transition("subsidyApplications", application.id, ["pending"], { status: decision, remarks: data.remarks });
      await api.update("users", application.customerId, { subsidyStatus: decision });
      notify("Application " + decision + ".");
      await load();
    }, approving ? "Verify" : "Reject");
}

function approveBooking(booking) {
  run(async () => {
    await api.transition("bookings", booking.id, ["PendingApproval"], { status: "Approved", approvedBy: user.id });
    notify("Booking #" + booking.id + " approved.");
    await load();
  });
}

function rejectBooking(booking) {
  formDialog("Reject booking #" + booking.id,
    [{ name: "rejectReason", label: "Reason", type: "textarea", rules: ["required"] }],
    {},
    async (data) => {
      await api.transition("bookings", booking.id, ["PendingApproval"], { status: "Rejected", ...data });
      notify("Booking #" + booking.id + " rejected.");
      await load();
    }, "Reject");
}

function resolveDispute(booking) {
  formDialog("Resolve dispute #" + booking.id,
    [
      {
        name: "outcome", label: "Decision", type: "select", rules: ["required"],
        options: ["Delivery accepted as correct", "Refund to customer", "Free redelivery"].map((text) => ({ value: text, label: text })),
      },
      { name: "note", label: "Note to customer", type: "textarea", rules: ["required"] },
    ],
    {},
    async (data) => {
      await api.transition("bookings", booking.id, ["Disputed"], {
        status: "Resolved",
        disputeResolution: data.outcome + ". " + data.note,
      });
      notify("Dispute resolved.");
      await load();
    }, "Resolve");
}

if (user) {
  renderNav();
  initTabs();
  statusFilter.append(...ALL_STATUSES.map((status) => el("option", { value: status }, STATUS_LABELS[status] || status)));
  statusFilter.addEventListener("change", renderAll);
  search.addEventListener("input", renderAll);
  showSkeleton(document.getElementById("applications"));
  run(load);
}
