/* validate.js
   Form validation rules. Each rule returns "" when the value is fine,
   or an error message when it is not. */

const validators = {
  required: (value) => (String(value ?? "").trim() !== "" ? "" : "This field is required."),
  cnic: (value) => (/^\d{5}-?\d{7}-?\d$/.test(String(value).trim()) ? "" : "CNIC must be 13 digits, e.g. 42101-1234567-1."),
  phone: (value) => (/^03\d{9}$/.test(String(value).trim()) ? "" : "Phone must be 11 digits and start with 03."),
  password: (value) => (String(value).length >= 6 ? "" : "Password must be at least 6 characters."),
  name: (value) => (/^[A-Za-z .'-]{3,}$/.test(String(value).trim()) ? "" : "Enter a real name (letters only, at least 3)."),
  address: (value) => (String(value).trim().length >= 10 ? "" : "Address must be at least 10 characters."),
  positive: (value) => (Number(value) > 0 ? "" : "Enter a number greater than 0."),
  time: (value) => (/^\d{2}:\d{2}$/.test(String(value)) ? "" : "Enter a time like 08:00."),
};

/* Stores CNIC in one format: 42101-1234567-1 */
function formatCnic(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
}

function setError(input, message) {
  const field = input.closest(".field") || input.parentElement;
  let note = field.querySelector(".field-error");
  if (!note) {
    note = el("small", { class: "field-error", id: input.id + "_error" });
    field.append(note);
  }
  note.textContent = message;
  input.classList.toggle("invalid", Boolean(message));
  input.setAttribute("aria-invalid", Boolean(message));
  if (message) input.setAttribute("aria-describedby", note.id);
}

/* Checks one input against a list of rule names. Returns true when valid. */
function checkInput(input, ruleNames) {
  for (const ruleName of ruleNames) {
    const message = validators[ruleName](input.value);
    if (message) {
      setError(input, message);
      return false;
    }
  }
  setError(input, "");
  return true;
}

/* Used by formDialog: checks every field's rules and custom validate(). */
function validateFields(form, fields, data) {
  let valid = true;
  fields.forEach((field) => {
    if (field.type === "checkbox" || field.type === "checks") return;
    const input = form.elements[field.name];
    let message = "";
    for (const ruleName of field.rules || []) {
      message = validators[ruleName](data[field.name]);
      if (message) break;
    }
    if (!message && field.validate) message = field.validate(data[field.name], data) || "";
    setError(input, message);
    if (message) valid = false;
  });
  return valid;
}
