(function () {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");
  const submitBtn = document.getElementById("loginSubmit");
  const googleBtn = document.getElementById("googleBtn");

  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg) => { if (cfg.google_enabled) googleBtn.hidden = false; })
    .catch(() => {});

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.remove("show");
    submitBtn.disabled = true;
    submitBtn.textContent = "Přihlašuji…";
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Přihlášení se nezdařilo.");
      }
      window.location.href = "/";
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "Přihlásit se";
    }
  });
})();
