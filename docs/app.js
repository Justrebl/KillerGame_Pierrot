const config = window.KILLER_GAME_CONFIG;
const loginSection = document.querySelector("#login");
const gameSection = document.querySelector("#game");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const progress = document.querySelector("#progress");
const targetList = document.querySelector("#target-list");
const targetTemplate = document.querySelector("#target-template");
const globalError = document.querySelector("#global-error");

let password = "";
let sessionToken = "";
let session = null;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  if (options.body && !(options.body instanceof Blob)) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${config.apiOrigin}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Erreur serveur");
  }
  return response.status === 204 ? null : response.json();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  password = document.querySelector("#password").value;
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ credential: password })
    });
    sessionToken = result.token;
    session = result.session;
    loginSection.hidden = true;
    gameSection.hidden = false;
    renderTargets();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

function renderTargets() {
  targetList.replaceChildren();
  session.targets.forEach((target, index) => {
    const fragment = targetTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".target-card");
    const status = fragment.querySelector(".target-status");
    const victoryButton = fragment.querySelector(".victory-button");
    const photoForm = fragment.querySelector(".photo-form");
    const victoryState = fragment.querySelector(".victory-state");

    fragment.querySelector(".target-position").textContent = `Cible ${index + 1}`;
    fragment.querySelector(".target-name").textContent = target.name;
    fragment.querySelector(".target-condition").textContent = target.condition;
    updateTargetStatus(card, status, target);

    victoryButton.addEventListener("click", async () => {
      victoryButton.disabled = true;
      globalError.textContent = "";
      try {
        const result = await api(`/api/victories/${target.id}`, {
          method: "POST",
          body: JSON.stringify({ confirmed: true })
        });
        target.victoryId = result.victoryId;
        target.completedAt = result.createdAt;
        updateTargetStatus(card, status, target);
        victoryState.textContent = `Validée le ${new Date(result.createdAt).toLocaleString("fr-FR")}.`;
        photoForm.hidden = false;
        updateProgress();
      } catch (error) {
        victoryState.textContent = error.message;
      } finally {
        victoryButton.disabled = false;
      }
    });

    photoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      globalError.textContent = "";
      const file = photoForm.querySelector(".photo-input").files[0];
      if (!file || !target.victoryId) return;
      try {
        const ciphertext = await encryptPhoto(file, target.victoryId);
        await api(`/api/photos/${target.victoryId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: ciphertext
        });
        victoryState.textContent = "Photo chiffrée enregistrée.";
      } catch (error) {
        victoryState.textContent = error.message;
      }
    });

    if (target.victoryId) {
      photoForm.hidden = false;
      victoryState.textContent = `Validée le ${new Date(target.completedAt).toLocaleString("fr-FR")}.`;
    }
    targetList.append(fragment);
  });
  updateProgress();
}

function updateTargetStatus(card, status, target) {
  if (target.victoryId) {
    card.classList.add("completed");
    status.textContent = "Validée";
  } else {
    card.classList.remove("completed");
    status.textContent = "En cours";
  }
}

function updateProgress() {
  const completed = session.targets.filter((target) => target.victoryId).length;
  progress.textContent = `${completed}/${session.targets.length} validées`;
}

async function encryptPhoto(file, victoryId) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choisis une image JPEG, PNG ou WebP.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("La photo dépasse 5 Mo.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob || blob.size > 5 * 1024 * 1024) throw new Error("Impossible de préparer cette photo.");

  const keyMaterial = await deriveEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await blob.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(victoryId) },
    keyMaterial,
    plaintext
  );
  return new Blob([iv, ciphertext], { type: "application/octet-stream" });
}

async function deriveEncryptionKey() {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(atob(session.encryptionSalt), (char) => char.charCodeAt(0)),
      iterations: session.kdfIterations,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
