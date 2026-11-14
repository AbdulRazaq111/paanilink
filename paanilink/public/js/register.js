/* register.js - register.html */

const registerForm = document.getElementById("registerForm");
const registerError = document.getElementById("registerError");
const fields = registerForm.elements; // fields.name, fields.cnic, ...

// Fill the zone dropdown from the API (nothing hardcoded).
run(async () => {
  const zones = await api.list("zones");
  fields.zoneId.replaceChildren(
    el("option", { value: "" }, "Select your zone"),
    ...zones.map((zone) => el("option", { value: zone.id }, zone.name))
  );
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerError.textContent = "";

  // Run every check (not just the first) so the user sees all problems at once.
  const checks = [
    checkInput(fields.name, ["required", "name"]),
    checkInput(fields.cnic, ["required", "cnic"]),
    checkInput(fields.phone, ["required", "phone"]),
    checkInput(fields.zoneId, ["required"]),
    checkInput(fields.address, ["required", "address"]),
    checkInput(fields.password, ["required", "password"]),
    checkInput(fields.confirm, ["required"]),
  ];
  if (fields.confirm.value !== fields.password.value) {
    setError(fields.confirm, "Passwords do not match.");
    checks.push(false);
  }
  if (checks.includes(false)) return;

  const cnic = formatCnic(fields.cnic.value);
  const phone = fields.phone.value.trim();

  try {
    // CNIC and phone must be unique.
    const [samePhone, sameCnic] = await Promise.all([
      api.list("users", { phone }),
      api.list("users", { cnic }),
    ]);
    if (samePhone.length) return setError(fields.phone, "This phone number is already registered.");
    if (sameCnic.length) return setError(fields.cnic, "This CNIC is already registered.");

    const user = await api.create("users", {
      name: fields.name.value.trim(),
      cnic,
      phone,
      password: fields.password.value,
      role: "customer",
      zoneId: Number(fields.zoneId.value),
      hydrantId: null,
      address: fields.address.value.trim(),
      subsidyStatus: "none",
      active: true,
    });
    setSession(user);
    location.href = HOME.customer;
  } catch (error) {
    registerError.textContent = error.message;
  }
});
