/* customer-book.js - customer-book.html
   Booking form. The checks here are for a good user experience;
   the backend must repeat all of them, because a browser can be bypassed. */

const user = requireRole("customer");

// Bookings in these statuses no longer use hydrant water or the subsidy limit.
const NOT_COUNTED = ["Cancelled", "Rejected", "Failed"];

const form = document.getElementById("bookForm");
const fields = form.elements;
const bookError = document.getElementById("bookError");

let me = user;
let rates = [];
let hydrants = [];
let settings = {};
let quotaLeft = null;

async function init() {
  const [freshUser, allRates, zone, allHydrants, appSettings] = await Promise.all([
    api.get("users", user.id),
    api.list("rates", { _sort: "capacity" }),
    api.get("zones", user.zoneId),
    api.list("hydrants"),
    api.getSettings(),
  ]);
  me = freshUser;
  rates = allRates;
  settings = appSettings;
  // A customer can only book from hydrants that serve their zone.
  hydrants = allHydrants.filter((h) => zone.hydrantIds.includes(h.id));

  fields.capacity.replaceChildren(...rates.map((r) => el("option", { value: r.capacity }, gallons(r.capacity))));
  fields.hydrantId.replaceChildren(...hydrants.map((h) =>
    el("option", { value: h.id, disabled: !h.available },
      h.name + " (" + h.openTime + " to " + h.closeTime + ")" + (h.available ? "" : " - unavailable"))));
  fields.date.min = today();
  fields.date.value = today();
  fields.address.value = me.address;

  const approved = me.subsidyStatus === "approved";
  document.getElementById("typeSubsidised").disabled = !approved;
  document.getElementById("subsidyHint").textContent = approved
    ? "You can make " + settings.subsidyMonthlyLimit + " subsidised bookings per month."
    : "Subsidised booking is only for approved households. Apply on the Subsidy page.";

  fillSlots();
  showAmount();
  await showQuota();
}

function selectedHydrant() {
  return hydrants.find((h) => h.id === Number(fields.hydrantId.value));
}

/* One slot per hour inside the hydrant's operating hours.
   For today, hours that have already passed are left out. */
function fillSlots() {
  const hydrant = selectedHydrant();
  const options = [];
  if (hydrant) {
    const open = Number(hydrant.openTime.slice(0, 2));
    const close = Number(hydrant.closeTime.slice(0, 2));
    const currentHour = new Date().getHours();
    for (let hour = open; hour < close; hour++) {
      if (fields.date.value === today() && hour <= currentHour) continue;
      const label = String(hour).padStart(2, "0") + ":00";
      options.push(el("option", { value: label }, label));
    }
  }
  fields.slot.replaceChildren(el("option", { value: "" }, options.length ? "Select a time" : "No slots left on this day"), ...options);
}

function showAmount() {
  const rate = rates.find((r) => r.capacity === Number(fields.capacity.value));
  document.getElementById("amount").textContent = rate ? money(rate[fields.type.value]) : "-";
}

/* Hydrant quota left on the chosen date = daily quota - gallons already booked */
async function showQuota() {
  const hydrant = selectedHydrant();
  const line = document.getElementById("quotaLine");
  quotaLeft = null;
  if (!hydrant || !fields.date.value) return line.replaceChildren();

  const sameDay = await api.list("bookings", { hydrantId: hydrant.id, date: fields.date.value });
  const used = sameDay.filter((b) => !NOT_COUNTED.includes(b.status)).reduce((sum, b) => sum + b.capacity, 0);
  quotaLeft = hydrant.dailyQuota - used;
  line.textContent = hydrant.name + " has " + gallons(Math.max(quotaLeft, 0)) + " left on " + fields.date.value + ".";
}

async function submitBooking() {
  bookError.textContent = "";
  const hydrant = selectedHydrant();
  const capacity = Number(fields.capacity.value);
  const type = fields.type.value;
  const date = fields.date.value;

  // 1. Field checks
  const checks = [
    checkInput(fields.capacity, ["required"]),
    checkInput(fields.hydrantId, ["required"]),
    checkInput(fields.date, ["required"]),
    checkInput(fields.slot, ["required"]),
    checkInput(fields.address, ["required", "address"]),
  ];
  if (date && date < today()) {
    setError(fields.date, "The date cannot be in the past.");
    checks.push(false);
  }
  if (checks.includes(false)) return;

  // 2. Business rules
  if (!hydrant.available) throw new Error("This hydrant is currently unavailable.");
  if (type === "subsidised" && me.subsidyStatus !== "approved") {
    throw new Error("Your household is not approved for subsidised bookings.");
  }

  await showQuota();
  if (capacity > quotaLeft) {
    throw new Error("Not enough water left at this hydrant on " + date + ". Choose a smaller tanker, another hydrant or another day.");
  }

  const mine = await api.list("bookings", { customerId: user.id });
  const live = mine.filter((b) => !NOT_COUNTED.includes(b.status));
  if (live.some((b) => b.date === date && b.slot === fields.slot.value)) {
    throw new Error("You already have a booking at this date and time.");
  }
  if (type === "subsidised") {
    const month = date.slice(0, 7); // "2026-11"
    const usedThisMonth = live.filter((b) => b.type === "subsidised" && b.date.startsWith(month)).length;
    if (usedThisMonth >= settings.subsidyMonthlyLimit) {
      throw new Error("You have used your " + settings.subsidyMonthlyLimit + " subsidised bookings for this month.");
    }
  }

  // 3. Save. Commercial is approved straight away, subsidised waits for the officer.
  const rate = rates.find((r) => r.capacity === capacity);
  const booking = await api.create("bookings", {
    customerId: user.id,
    zoneId: user.zoneId,
    hydrantId: hydrant.id,
    type,
    capacity,
    date,
    slot: fields.slot.value,
    address: fields.address.value.trim(),
    amount: rate[type],
    status: type === "subsidised" ? "PendingApproval" : "Approved",
    createdAt: new Date().toISOString(),
  });
  notify("Booking #" + booking.id + " created.");
  setTimeout(() => (location.href = "customer.html"), 900);
}

if (user) {
  renderNav();
  run(init);

  form.addEventListener("change", (event) => {
    const changed = event.target.name;
    if (changed === "hydrantId" || changed === "date") {
      fillSlots();
      run(showQuota);
    }
    if (changed === "capacity" || changed === "type") showAmount();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitBooking();
    } catch (error) {
      bookError.textContent = error.message;
    }
  });
}
