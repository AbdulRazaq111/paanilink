/* admin.js - admin.html
   Administrator: reports for the whole city, and add / edit / delete for
   zones, hydrants, tankers, rates and users.

   The five management tabs all work the same way, so each one is described
   by a small config object in `sections` and drawn by one function. */

const user = requireRole("admin");

const NOT_COUNTED = ["Cancelled", "Rejected", "Failed"];
const PAID = ["Delivered", "Confirmed", "Resolved", "Disputed"];

let data = { zones: [], hydrants: [], tankers: [], rates: [], users: [], bookings: [], settings: {} };

async function load() {
  const [zones, hydrants, tankers, rates, users, bookings, settings] = await Promise.all([
    api.list("zones"),
    api.list("hydrants"),
    api.list("tankers", { _sort: "hydrantId,capacity" }),
    api.list("rates", { _sort: "capacity" }),
    api.list("users", { _sort: "role,name" }),
    api.list("bookings"),
    api.getSettings(),
  ]);
  data = { zones, hydrants, tankers, rates, users, bookings, settings };
  renderReports();
  Object.keys(sections).forEach(renderSection);
}

/* ---------- Reports ---------- */

function renderReports() {
  const { bookings, hydrants, zones, settings } = data;
  const paid = bookings.filter((b) => PAID.includes(b.status));

  document.getElementById("stats").replaceChildren(
    statCard("Total bookings", bookings.length),
    statCard("Water delivered", gallons(paid.reduce((sum, b) => sum + b.capacity, 0))),
    statCard("Revenue", money(paid.reduce((sum, b) => sum + b.amount, 0))),
    statCard("Subsidised share", bookings.length
      ? Math.round((bookings.filter((b) => b.type === "subsidised").length / bookings.length) * 100) + "%" : "0%")
  );

  renderTable(document.getElementById("quotaReport"), [
    { label: "Hydrant", render: (h) => h.name },
    { label: "Booked today", render: (h) => gallons(usedToday(h.id)) },
    { label: "Daily quota", render: (h) => gallons(h.dailyQuota) },
    {
      label: "Usage", render: (h) => el("progress", {
        max: h.dailyQuota, value: Math.min(usedToday(h.id), h.dailyQuota),
        "aria-label": h.name + " quota used",
      }),
    },
    { label: "Status", render: (h) => badge(h.available ? "Available" : "Unavailable") },
  ], hydrants);

  // Count bookings per status: { Approved: 2, Delivered: 5, ... }
  const counts = {};
  bookings.forEach((b) => (counts[b.status] = (counts[b.status] || 0) + 1));
  renderTable(document.getElementById("statusReport"), [
    { label: "Status", render: ([status]) => badge(status) },
    { label: "Bookings", render: ([, count]) => count },
  ], Object.entries(counts));

  renderTable(document.getElementById("zoneReport"), [
    { label: "Zone", render: (z) => z.name },
    { label: "Bookings", render: (z) => bookings.filter((b) => b.zoneId === z.id).length },
    { label: "Subsidised", render: (z) => bookings.filter((b) => b.zoneId === z.id && b.type === "subsidised").length },
    { label: "Failed", render: (z) => bookings.filter((b) => b.zoneId === z.id && b.status === "Failed").length },
  ], zones);

  document.getElementById("zoneReport").append(
    el("p", { class: "hint" }, "Subsidised limit: " + settings.subsidyMonthlyLimit + " booking(s) per household per month. ",
      el("button", { class: "btn small ghost", type: "button", onclick: editLimit }, "Change")));
}

function usedToday(hydrantId) {
  return data.bookings
    .filter((b) => b.hydrantId === hydrantId && b.date === today() && !NOT_COUNTED.includes(b.status))
    .reduce((sum, b) => sum + b.capacity, 0);
}

function editLimit() {
  formDialog("Monthly subsidised limit",
    [{ name: "subsidyMonthlyLimit", label: "Bookings per household per month", type: "number", rules: ["required", "positive"] }],
    data.settings,
    async (values) => {
      await api.updateSettings(values);
      notify("Limit updated.");
      await load();
    });
}

/* ---------- Management tabs ---------- */

const options = (list, labelKey) => list.map((item) => ({ value: item.id, label: item[labelKey] }));
const nameOf = (list, id) => list.find((item) => item.id === id)?.name || "-";
const ROLE_OPTIONS = Object.entries(ROLE_NAMES).map(([value, label]) => ({ value, label }));

const sections = {
  zones: {
    title: "Zones", canAdd: true, canDelete: true,
    columns: [
      { label: "Zone", render: (z) => z.name },
      { label: "Served by", render: (z) => z.hydrantIds.map((id) => nameOf(data.hydrants, id)).join(", ") || "No hydrant" },
    ],
    fields: () => [
      { name: "name", label: "Zone name", rules: ["required"] },
      { name: "hydrantIds", label: "Served by hydrants", type: "checks", options: options(data.hydrants, "name") },
    ],
    check: (values) => { if (!values.hydrantIds.length) throw new Error("A zone must be served by at least one hydrant."); },
    blockDelete: (z) => data.users.some((u) => u.zoneId === z.id) && "Users are still registered in this zone.",
  },

  hydrants: {
    title: "Hydrants", canAdd: true, canDelete: true,
    columns: [
      { label: "Hydrant", render: (h) => h.name },
      { label: "Daily quota", render: (h) => gallons(h.dailyQuota) },
      { label: "Hours", render: (h) => h.openTime + " to " + h.closeTime },
      { label: "Status", render: (h) => badge(h.available ? "Available" : "Unavailable") },
    ],
    fields: () => [
      { name: "name", label: "Hydrant name", rules: ["required"] },
      { name: "dailyQuota", label: "Daily quota (gallons)", type: "number", rules: ["required", "positive"] },
      { name: "openTime", label: "Opens at", type: "time", rules: ["required", "time"] },
      { name: "closeTime", label: "Closes at", type: "time", rules: ["required", "time"], validate: (value, values) => (value <= values.openTime ? "Closing time must be after opening time." : "") },
      { name: "available", label: "Available for bookings", type: "checkbox" },
    ],
    defaults: { available: true },
    blockDelete: (h) => data.tankers.some((t) => t.hydrantId === h.id) && "Move or delete this hydrant's tankers first.",
  },

  tankers: {
    title: "Tankers", canAdd: true, canDelete: true,
    columns: [
      { label: "Registration", render: (t) => t.regNo },
      { label: "Size", render: (t) => gallons(t.capacity) },
      { label: "Hydrant", render: (t) => nameOf(data.hydrants, t.hydrantId) },
      { label: "Status", render: (t) => badge(t.available ? "Available" : "Unavailable") },
    ],
    fields: () => [
      { name: "regNo", label: "Registration number", rules: ["required"], validate: (value) => (/^[A-Z]{2,4}-\d{3,5}$/.test(value) ? "" : "Use a format like KHI-1234.") },
      { name: "capacity", label: "Size", type: "select", numeric: true, rules: ["required"], options: data.rates.map((r) => ({ value: r.capacity, label: gallons(r.capacity) })) },
      { name: "hydrantId", label: "Hydrant", type: "select", numeric: true, rules: ["required"], options: options(data.hydrants, "name") },
      { name: "available", label: "In service", type: "checkbox" },
    ],
    defaults: { available: true },
    check: (values, existing) => {
      if (data.tankers.some((t) => t.regNo === values.regNo && t.id !== existing?.id)) throw new Error("This registration number already exists.");
    },
  },

  rates: {
    title: "Rates", canAdd: false, canDelete: false,
    columns: [
      { label: "Tanker size", render: (r) => gallons(r.capacity) },
      { label: "Commercial", render: (r) => money(r.commercial) },
      { label: "Subsidised", render: (r) => money(r.subsidised) },
    ],
    fields: () => [
      { name: "commercial", label: "Commercial rate (Rs)", type: "number", rules: ["required", "positive"] },
      { name: "subsidised", label: "Subsidised rate (Rs)", type: "number", rules: ["required", "positive"], validate: (value, values) => (value >= values.commercial ? "The subsidised rate must be lower than the commercial rate." : "") },
    ],
  },

  users: {
    title: "Users", canAdd: true, canDelete: false,
    columns: [
      { label: "Name", render: (u) => [u.name, el("span", { class: "note" }, u.phone)] },
      { label: "CNIC", render: (u) => u.cnic },
      { label: "Role", render: (u) => ROLE_NAMES[u.role] },
      { label: "Zone / Hydrant", render: (u) => (u.zoneId ? nameOf(data.zones, u.zoneId) : u.hydrantId ? nameOf(data.hydrants, u.hydrantId) : "-") },
      { label: "Account", render: (u) => badge(u.active ? "Active" : "Inactive") },
    ],
    fields: () => [
      { name: "name", label: "Full name", rules: ["required", "name"] },
      { name: "cnic", label: "CNIC", rules: ["required", "cnic"] },
      { name: "phone", label: "Phone", rules: ["required", "phone"] },
      { name: "password", label: "Password", type: "password", rules: ["required", "password"] },
      { name: "role", label: "Role", type: "select", rules: ["required"], options: ROLE_OPTIONS },
      { name: "zoneId", label: "Zone (customer, zone officer)", type: "select", numeric: true, options: options(data.zones, "name"), validate: (value, values) => (["customer", "officer"].includes(values.role) && !value ? "This role needs a zone." : "") },
      { name: "hydrantId", label: "Hydrant (operator, driver)", type: "select", numeric: true, options: options(data.hydrants, "name"), validate: (value, values) => (["operator", "driver"].includes(values.role) && !value ? "This role needs a hydrant." : "") },
      { name: "active", label: "Account active", type: "checkbox" },
    ],
    defaults: { active: true, address: "", subsidyStatus: "none" },
    check: (values, existing) => {
      values.cnic = formatCnic(values.cnic);
      // Keep only the link that matters for the role.
      values.zoneId = ["customer", "officer"].includes(values.role) ? values.zoneId : null;
      values.hydrantId = ["operator", "driver"].includes(values.role) ? values.hydrantId : null;
      if (data.users.some((u) => u.phone === values.phone && u.id !== existing?.id)) throw new Error("This phone number is already used.");
      if (data.users.some((u) => u.cnic === values.cnic && u.id !== existing?.id)) throw new Error("This CNIC is already used.");
      if (existing?.id === user.id && !values.active) throw new Error("You cannot deactivate your own account.");
    },
  },
};

/* Draws one management tab from its config */
function renderSection(key) {
  const section = sections[key];
  const box = document.getElementById("tab-" + key);
  const tableBox = el("div");

  box.replaceChildren(
    el("div", { class: "page-head" },
      el("h2", {}, section.title),
      section.canAdd ? el("button", { class: "btn small", type: "button", onclick: () => openForm(key) }, "Add new") : null),
    tableBox);

  renderTable(tableBox, [
    ...section.columns,
    {
      label: "Actions", render: (record) => el("div", { class: "btn-row" },
        el("button", { class: "btn small ghost", type: "button", onclick: () => openForm(key, record) }, "Edit"),
        section.canDelete ? el("button", { class: "btn small danger", type: "button", onclick: () => removeRecord(key, record) }, "Delete") : null),
    },
  ], data[key]);
}

/* Add (no record) or edit (with record) */
function openForm(key, record) {
  const section = sections[key];
  formDialog((record ? "Edit " : "Add to ") + section.title, section.fields(), record || section.defaults || {}, async (values) => {
    if (section.check) section.check(values, record);
    if (record) await api.update(key, record.id, values);
    else await api.create(key, { ...section.defaults, ...values });
    notify("Saved.");
    await load();
  });
}

function removeRecord(key, record) {
  const section = sections[key];
  const blocked = section.blockDelete && section.blockDelete(record);
  if (blocked) return notify(blocked, "error");

  formDialog("Delete this record from " + section.title + "?", [], {}, async () => {
    await api.remove(key, record.id);
    notify("Deleted.");
    await load();
  }, "Delete");
}

if (user) {
  renderNav();
  initTabs();
  showSkeleton(document.getElementById("quotaReport"), 3);
  run(load);
}
