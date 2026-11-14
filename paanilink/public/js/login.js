/* login.js - index.html */

// Already logged in? Go straight to the right dashboard.
const existingUser = getSession();
if (existingUser) location.href = HOME[existingUser.role];

const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const fields = loginForm.elements;

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  const phoneOk = checkInput(fields.phone, ["required", "phone"]);
  const passwordOk = checkInput(fields.password, ["required"]);
  if (!phoneOk || !passwordOk) return;

  try {
    // Mock login: ask the API for a user with this phone and password.
    // The real backend will replace this with POST /auth/login.
    const matches = await api.list("users", {
      phone: fields.phone.value.trim(),
      password: fields.password.value,
    });

    if (!matches.length) {
      loginError.textContent = "Wrong phone number or password.";
      return;
    }
    if (!matches[0].active) {
      loginError.textContent = "This account has been deactivated. Contact the Water Board.";
      return;
    }
    setSession(matches[0]);
    location.href = HOME[matches[0].role];
  } catch (error) {
    loginError.textContent = error.message;
  }
});
