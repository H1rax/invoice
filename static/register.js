(function () {
  const form = document.getElementById("registerForm");
  const errorBox = document.getElementById("registerError");
  const submitBtn = document.getElementById("registerSubmit");
  const googleBtn = document.getElementById("googleBtn");

  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg) => { if (cfg.google_enabled) googleBtn.hidden = false; })
    .catch(() => {});

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.remove("show");

    const password = document.getElementById("password").value;
    const passwordConfirm = document.getElementById("passwordConfirm").value;
    if (password !== passwordConfirm) {
      errorBox.textContent = "Hesla se neshodují.";
      errorBox.classList.add("show");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Vytvářím účet…";
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("email").value,
          password,
          display_name: document.getElementById("displayName").value,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Registraci se nepodařilo dokončit.");
      }
      window.location.href = "/";
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "Vytvořit účet";
    }
  });
})();
