/* auth.js
   Keeps the logged-in user in localStorage, protects pages by role,
   and draws the top navigation bar. */

const SESSION_KEY = "paanilink_user";

const HOME = {
  customer: "customer.html",
  officer: "officer.html",
  operator: "operator.html",
  driver: "driver.html",
  admin: "admin.html",
};

const ROLE_NAMES = {
  customer: "Customer",
  officer: "Zone Officer",
  operator: "Hydrant Operator",
  driver: "Driver",
  admin: "Administrator",
};

const NAV_LINKS = {
  customer: [
    { href: "customer.html", label: "My bookings" },
    { href: "customer-book.html", label: "Book a tanker" },
    { href: "customer-subsidy.html", label: "Subsidy" },
  ],
  officer: [{ href: "officer.html", label: "Zone desk" }],
  operator: [{ href: "operator.html", label: "Dispatch" }],
  driver: [{ href: "driver.html", label: "My trips" }],
  admin: [{ href: "admin.html", label: "Administration" }],
};

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch (error) {
    return null;
  }
}

/* The password is never kept in the browser session */
function setSession(user) {
  const { password, ...safeUser } = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  location.href = "index.html";
}

/* Call at the top of every protected page.
   Returns the user, or sends the browser away and returns null. */
function requireRole(role) {
  const user = getSession();
  if (!user) {
    location.href = "index.html";
    return null;
  }
  if (user.role !== role) {
    location.href = HOME[user.role];
    return null;
  }
  return user;
}

function renderNav() {
  const user = getSession();
  const current = location.pathname.split("/").pop();
  const nav = document.getElementById("nav");
  nav.replaceChildren(
    el("a", { class: "brand", href: HOME[user.role] }, "PaaniLink"),
    el("nav", { class: "nav-links", "aria-label": "Main" },
      NAV_LINKS[user.role].map((link) =>
        el("a", { href: link.href, class: link.href === current ? "active" : "", "aria-current": link.href === current ? "page" : null }, link.label))),
    el("div", { class: "nav-user" },
      el("span", {}, user.name, el("small", {}, ROLE_NAMES[user.role])),
      el("button", { class: "btn ghost small", type: "button", onclick: logout }, "Log out"))
  );
}
