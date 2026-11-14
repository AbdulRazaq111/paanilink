/* customer-subsidy.js - customer-subsidy.html
   Apply for subsidised status and see past applications. */

const user = requireRole("customer");

const form = document.getElementById("subsidyForm");
const fields = form.elements;
const subsidyError = document.getElementById("subsidyError");

const STATUS_TEXT = {
  none: "You have not applied yet.",
  pending: "Your application is waiting for the Zone Officer.",
  approved: "Your household is approved. You can make subsidised bookings.",
  rejected: "Your last application was rejected. You can apply again.",
};

async function load() {
  const [me, applications] = await Promise.all([
    api.get("users", user.id),
    api.list("subsidyApplications", { customerId: user.id, _sort: "id", _order: "desc" }),
  ]);
  setSession(me);

  document.getElementById("statusLine").replaceChildren(badge(me.subsidyStatus), " ", STATUS_TEXT[me.subsidyStatus]);
  // The form is only shown when applying makes sense.
  form.hidden = me.subsidyStatus === "pending" || me.subsidyStatus === "approved";

  renderTable(document.getElementById("applications"), [
    { label: "Applied on", render: (a) => formatDateTime(a.createdAt) },
    { label: "Type", render: (a) => a.category },
    { label: "Proof", render: (a) => a.proofType + " " + a.proofNumber },
    { label: "Status", render: (a) => badge(a.status) },
    { label: "Officer remarks", render: (a) => a.remarks || "-" },
  ], applications, "No applications yet.");
}

if (user) {
  renderNav();
  run(load);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    subsidyError.textContent = "";

    const checks = [
      checkInput(fields.category, ["required"]),
      checkInput(fields.proofType, ["required"]),
      checkInput(fields.proofNumber, ["required"]),
      checkInput(fields.householdSize, ["required", "positive"]),
      checkInput(fields.details, ["required"]),
    ];
    if (fields.details.value.trim() && fields.details.value.trim().length < 15) {
      setError(fields.details, "Please explain your situation in at least 15 characters.");
      checks.push(false);
    }
    if (fields.proofNumber.value.trim() && fields.proofNumber.value.trim().length < 5) {
      setError(fields.proofNumber, "Document number must be at least 5 characters.");
      checks.push(false);
    }
    if (checks.includes(false)) return;

    try {
      // Check again on the server side that there is no open application.
      const open = await api.list("subsidyApplications", { customerId: user.id, status: "pending" });
      if (open.length) throw new Error("You already have a pending application.");

      await api.create("subsidyApplications", {
        customerId: user.id,
        zoneId: user.zoneId,
        category: fields.category.value,
        proofType: fields.proofType.value,
        proofNumber: fields.proofNumber.value.trim(),
        householdSize: Number(fields.householdSize.value),
        details: fields.details.value.trim(),
        status: "pending",
        remarks: "",
        createdAt: new Date().toISOString(),
      });
      await api.update("users", user.id, { subsidyStatus: "pending" });
      form.reset();
      notify("Application submitted.");
      await load();
    } catch (error) {
      subsidyError.textContent = error.message;
    }
  });
}
