/* ui.js
   Small helpers for building the page with the DOM. */

/* Creates an element.  el("button", { class: "btn", onclick: fn }, "Save") */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child.nodeType ? child : String(child));
  });
  return node;
}

const STATUS_LABELS = {
  PendingApproval: "Pending approval",
  OutForDelivery: "Out for delivery",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  none: "Not applied",
};

function badge(status) {
  return el("span", { class: "badge s-" + String(status).toLowerCase() }, STATUS_LABELS[status] || status);
}

function money(amount) {
  return "Rs " + Number(amount || 0).toLocaleString("en-PK");
}

function gallons(amount) {
  return Number(amount || 0).toLocaleString("en-PK") + " gal";
}

/* Today's date as YYYY-MM-DD in local time */
function today() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

/* [{id:1,...},{id:2,...}]  ->  {1:{...}, 2:{...}} for quick lookups */
function byId(list) {
  return Object.fromEntries(list.map((item) => [item.id, item]));
}

/* Builds a table. columns = [{ label: "Date", render: (row) => row.date }] */
function renderTable(target, columns, rows, emptyText = "Nothing to show yet.") {
  target.replaceChildren();
  if (!rows.length) {
    target.append(el("p", { class: "empty" }, emptyText));
    return;
  }
  const head = el("thead", {}, el("tr", {}, columns.map((c) => el("th", { scope: "col" }, c.label))));
  const body = el("tbody", {}, rows.map((row) =>
    el("tr", {}, columns.map((c) => el("td", { "data-label": c.label }, c.render(row))))
  ));
  target.append(el("table", { class: "table" }, head, body));
}

/* Grey placeholder shown while data is loading */
function showSkeleton(target, lines = 4) {
  target.replaceChildren(...Array.from({ length: lines }, () => el("div", { class: "skeleton" })));
}

function statCard(label, value) {
  return el("div", { class: "stat" }, el("span", { class: "stat-label" }, label), el("strong", { class: "stat-value" }, value));
}

/* Small message in the corner. type is "ok" or "error". */
function notify(text, type = "ok") {
  const area = document.getElementById("toast");
  const toast = el("div", { class: "toast " + type, role: type === "error" ? "alert" : "status" }, text);
  area.append(toast);
  setTimeout(() => toast.remove(), 4500);
}

/* Runs an async task and shows any error to the user */
async function run(task) {
  try {
    await task();
  } catch (error) {
    console.error(error);
    notify(error.message, "error");
  }
}

/* Tabs: <button class="tab" data-tab="x"> shows <section id="tab-x"> */
function initTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((other) => {
        const active = other === tab;
        other.classList.toggle("active", active);
        other.setAttribute("aria-selected", active);
        document.getElementById("tab-" + other.dataset.tab).hidden = !active;
      });
    });
  });
}

/* ---------- Form dialog ----------
   Opens a popup form built from a list of fields.
   field = { name, label, type, options, rules, validate, numeric }
   type: text | number | date | time | password | textarea | select | checkbox | checks
   onSubmit(data) may throw an Error to show a message inside the dialog. */

function buildField(field, value) {
  const id = "f_" + field.name;

  if (field.type === "checkbox") {
    return el("div", { class: "field check" },
      el("input", { type: "checkbox", id, name: field.name, checked: Boolean(value) }),
      el("label", { for: id }, field.label));
  }

  if (field.type === "checks") {
    const chosen = value || [];
    return el("fieldset", { class: "field" },
      el("legend", {}, field.label),
      field.options.map((option) => {
        const boxId = id + "_" + option.value;
        return el("div", { class: "check" },
          el("input", { type: "checkbox", id: boxId, name: field.name, value: option.value, checked: chosen.includes(option.value) }),
          el("label", { for: boxId }, option.label));
      }));
  }

  let input;
  if (field.type === "select") {
    input = el("select", { id, name: field.name },
      el("option", { value: "" }, "Select..."),
      field.options.map((option) =>
        el("option", { value: option.value, selected: String(option.value) === String(value ?? "") }, option.label)));
  } else if (field.type === "textarea") {
    input = el("textarea", { id, name: field.name, rows: 3 });
    input.value = value ?? "";
  } else {
    input = el("input", { id, name: field.name, type: field.type || "text" });
    input.value = value ?? "";
  }
  return el("div", { class: "field" }, el("label", { for: id }, field.label), input);
}

function readForm(form, fields) {
  const data = {};
  fields.forEach((field) => {
    if (field.type === "checkbox") {
      data[field.name] = form.elements[field.name].checked;
    } else if (field.type === "checks") {
      const boxes = form.querySelectorAll('input[name="' + field.name + '"]:checked');
      data[field.name] = [...boxes].map((box) => Number(box.value));
    } else {
      const raw = form.elements[field.name].value.trim();
      const isNumber = field.type === "number" || field.numeric;
      data[field.name] = isNumber && raw !== "" ? Number(raw) : raw;
    }
  });
  return data;
}

function formDialog(title, fields, values, onSubmit, submitLabel = "Save") {
  const dialog = el("dialog", { class: "dialog" });
  const errorBox = el("p", { class: "form-error", role: "alert" });
  const form = el("form", { novalidate: true },
    el("h2", {}, title),
    fields.map((field) => buildField(field, values[field.name])),
    errorBox,
    el("div", { class: "actions" },
      el("button", { type: "button", class: "btn ghost", onclick: () => dialog.close() }, "Cancel"),
      el("button", { type: "submit", class: "btn" }, submitLabel)));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    const data = readForm(form, fields);
    if (!validateFields(form, fields, data)) return;
    try {
      await onSubmit(data);
      dialog.close();
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });

  dialog.append(form);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
