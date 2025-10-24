import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import styleContent from './cardwallet-style.css' assert { type: 'text' };

const DIGIT_ONLY_FORMATS = new Set([
  "EAN", "EAN13", "EAN8", "UPC", "ITF", "ITF14",
  "MSI", "MSI10", "MSI11", "MSI1010", "MSI1110", "pharmacode"
]);

function sanitizeCode(value, fmt) {
  let s = String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
  if (DIGIT_ONLY_FORMATS.has(fmt)) s = s.replace(/\D/g, "");
  return s;
}

function renderBarcodeCentral(target, code, fmt, opts = {}, errorTarget = null) {
  const clean = sanitizeCode(code, fmt);
  if (target instanceof HTMLCanvasElement) {
    const ctx = target.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, target.width, target.height);
  } else {
    while (target.firstChild) target.removeChild(target.firstChild);
  }
  if (errorTarget) errorTarget.style.display = "none";

  try {
    JsBarcode(target, clean, {
      format: fmt,
      width: 5,
      height: 80,
      ...opts
    });
    return { ok: true };
  } catch (err) {
    const msg = `Invalid input for ${fmt}.` + (err?.message ? ` (${err.message})` : "");
    if (errorTarget) {
      errorTarget.textContent = msg;
      errorTarget.style.display = "block";
    } else if (target && target.parentElement) {
      const div = document.createElement("div");
      div.className = "error";
      div.style.cssText = "color:red;font-size:0.9em;";
      div.textContent = msg;
      target.replaceWith(div);
    }

    //console.error("Barcode render error:", err);
    return { ok: false, message: msg };
  }
}

class CardWalletCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.viewModes = {};
    this.selectedCard = null;
    this.activeTab = "own";
    this._inputState = { name: "", code: "" };

    this.inputContainer = document.createElement("div");
    this.dynamicContainer = document.createElement("div");

    const style = document.createElement("style");
    style.textContent = styleContent;
    this.shadowRoot.appendChild(style);

	// Separate input fields to avoid losing user input on re-render
    this.inputContainer.innerHTML = `
      <form id="new-card-form" class="new-card-row">
        <input id="name" placeholder="Name" />
        <input id="code" placeholder="Code" />
        <button type="submit" title="Add Card">
          <ha-icon icon="mdi:plus"></ha-icon>
        </button>
      </form>
    `;
    this.shadowRoot.appendChild(this.inputContainer);
    this.shadowRoot.appendChild(this.dynamicContainer);

	// Attach input form handler
    this.inputContainer.querySelector("#new-card-form")
      .addEventListener("submit", this.addCard.bind(this));
  }

  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this.loadCards();
  }

  async loadCards() {
    const nameEl = this.shadowRoot.getElementById("name");
    const codeEl = this.shadowRoot.getElementById("code");
    const activeId = document.activeElement?.id;
    if (nameEl && codeEl) {
      this._inputState.name = nameEl.value;
      this._inputState.code = codeEl.value;
      this._inputState.focusId = activeId;
    }

    const all = await this._hass.callApi("get", "cardwallet");
    const uid = this._hass.user.id;

    // normalize format for old cards
    this.ownCards = all.filter(c => c.user_id === uid).map(c => ({ ...c, format: c.format || "CODE128" }));
    this.otherCards = all.filter(c => c.user_id !== uid).map(c => ({ ...c, format: c.format || "CODE128" }));
    this.render();
  }

  toggleCodeType(cardId) {
    this.viewModes[cardId] = this.viewModes[cardId] === "barcode" ? "qr" : "barcode";
    this.render();
  }

  openCard(cardId) {
    this.selectedCard = [...this.ownCards, ...this.otherCards].find(c => c.card_id === cardId);
    if (!this.viewModes[cardId]) {
      this.viewModes[cardId] = "barcode";
    }
    this.render();
  }

  closeCard() {
    this.selectedCard = null;
    this.render();
  }

  async addCard(e) {
    e.preventDefault();
    const name = this.shadowRoot.getElementById("name").value;
    const code = this.shadowRoot.getElementById("code").value;
    if (!name || !code) return alert("Missing fields");
    await this._hass.callApi("post", "cardwallet", {
      name,
      code,
      owner: this._hass.user.name,
      user_id: this._hass.user.id,
      format: "CODE128" // default for new cards
    });

    this._inputState = { name: "", code: "" };
    this.shadowRoot.getElementById("name").value = "";
    this.shadowRoot.getElementById("code").value = "";
    this.loadCards();
  }

  async deleteCard(card) {
    await this._hass.callApi("delete", `cardwallet/${card.card_id}`, {
      user_id: card.user_id
    });
    this.closeCard();
    this.loadCards();
  }

  async updateCard(card) {
    const supportedFormats = [
      "CODE128", "CODE128A", "CODE128B", "CODE128C",
      "EAN13", "EAN8",
      "UPC",
      "CODE39",
      "ITF14", "ITF",
      "MSI", "MSI10", "MSI11", "MSI1010", "MSI1110",
      "pharmacode", "codabar", "CODE93"
    ];

    const dialog = document.createElement("div");
    dialog.className = "edit-dialog";
    dialog.innerHTML = `
      <div class="dialog-content">
        <label>Name</label>
        <input id="edit-name" type="text" value="${card.name}" />
        <label>Default barcode format</label>
        <select id="edit-format">
          ${supportedFormats
            .map(
              (f) =>
                `<option value="${f}" ${f === (card.format || "CODE128") ? "selected" : ""}>${f}</option>`
            )
            .join("")}
        </select>

        <div id="preview-wrap" style="margin-top:10px; text-align:center;">
          <canvas id="preview-canvas"></canvas>
          <div id="preview-error" style="color:red; font-size:0.9em; display:none;"></div>
        </div>

        <div class="btn-row">
          <button id="save-btn"><ha-icon icon="mdi:content-save"></ha-icon> Save</button>
          <button id="cancel-btn"><ha-icon icon="mdi:close"></ha-icon> Cancel</button>
        </div>
      </div>
    `;

    // inline style (kept same as before)
    dialog.style.cssText = `
      position: fixed; top:0; left:0; right:0; bottom:0;
      background:rgba(0,0,0,0.4);
      display:flex; align-items:center; justify-content:center;
      z-index:1000;
    `;
    dialog.querySelector(".dialog-content").style.cssText = `
      background:#fff; padding:1em; border-radius:8px; width:260px;
      display:flex; flex-direction:column; gap:0.5em;
    `;

    this.shadowRoot.appendChild(dialog);

    const nameInput = dialog.querySelector("#edit-name");
    const formatSelect = dialog.querySelector("#edit-format");
    const previewCanvas = dialog.querySelector("#preview-canvas");
    const errorDiv = dialog.querySelector("#preview-error");

    // --- live preview ---
    const renderPreview = () => {
      const fmt = formatSelect.value;
      renderBarcodeCentral(previewCanvas, card.code, fmt, { width: 2, height: 60 }, errorDiv);
    };
    formatSelect.addEventListener("change", renderPreview);
    renderPreview(); // initial

    // --- buttons ---
    dialog.querySelector("#cancel-btn").addEventListener("click", () => dialog.remove());

    dialog.querySelector("#save-btn").addEventListener("click", async () => {
      const newName = nameInput.value;
      const newFormat = formatSelect.value;

      const updated = await this._hass.callApi("put", `cardwallet/${card.card_id}`, {
        user_id: card.user_id,
        name: newName,
        format: newFormat
      });

      // locally update caches
      this.ownCards = this.ownCards.map((c) =>
        c.card_id === card.card_id ? { ...c, ...updated } : c
      );
      this.otherCards = this.otherCards.map((c) =>
        c.card_id === card.card_id ? { ...c, ...updated } : c
      );

      // if card is open, refresh the live canvas + title
      if (this.selectedCard && this.selectedCard.card_id === card.card_id) {
        this.selectedCard = { ...this.selectedCard, ...updated };

        const container = this.dynamicContainer.querySelector("#code-preview");
        if (container) {
          const canvas = document.createElement("canvas");
          container.innerHTML = "";
          container.appendChild(canvas);

          const fmt = this.selectedCard.format || "CODE128";
          renderBarcodeCentral(canvas, this.selectedCard.code, fmt);
        }

        const titleEl = this.dynamicContainer.querySelector(".card-title");
        if (titleEl) titleEl.textContent = this.selectedCard.name;
      }

      dialog.remove();
    });
  }

  render() {
    const cardListEl = this.dynamicContainer.querySelector(".cardlist");
    const scrollPosition = cardListEl ? cardListEl.scrollTop : 0;

    this.dynamicContainer.innerHTML = `
      <div class="tabs">
        <div class="tab ${this.activeTab === "own" ? "active" : ""}" id="tab-own">My Cards</div>
        <div class="tab ${this.activeTab === "others" ? "active" : ""}" id="tab-others">Others' Cards</div>
      </div>
      <div class="cardlist">
        ${(this.activeTab === "own" ? this.ownCards : this.otherCards).map(card => `
          <div class="card" data-card-id="${card.card_id}">
            <strong>${card.name}</strong>
            ${this.activeTab === "others" ? `<br><small><ha-icon icon="mdi:account"></ha-icon> ${card.owner}</small>` : ""}
          </div>
        `).join("")}
      </div>
      ${this.selectedCard ? `
        <div class="popup">
          <h3 class="card-title">${this.selectedCard.name}</h3>
          <div class="code" id="code-preview"></div>
          <div class="button-group">
            <button id="toggle-code"><ha-icon icon="mdi:cached"></ha-icon> QR/Barcode</button>
            ${this.selectedCard.user_id === this._hass.user.id ? `
              <button id="edit"><ha-icon icon="mdi:pencil"></ha-icon> Edit</button>
              <button id="delete"><ha-icon icon="mdi:delete"></ha-icon> Delete</button>
            ` : ""}
          </div>
          <ha-icon icon="mdi:close" class="close-btn" id="close" title="Close"></ha-icon>
        </div>
      ` : ""}
    `;

    this.dynamicContainer.querySelector("#tab-own")
      ?.addEventListener("click", () => { this.activeTab = "own"; this.render(); });
    this.dynamicContainer.querySelector("#tab-others")
      ?.addEventListener("click", () => { this.activeTab = "others"; this.render(); });

    this.dynamicContainer.querySelectorAll("[data-card-id]").forEach(el =>
      el.addEventListener("click", () => this.openCard(el.getAttribute("data-card-id")))
    );

    if (this.selectedCard) {
      const mode = this.viewModes[this.selectedCard.card_id] || "barcode";
      const container = this.dynamicContainer.querySelector("#code-preview");
      container.innerHTML = "";

      if (mode === "qr") {
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);
        QRCode.toCanvas(
          canvas,
          this.selectedCard.code,
          { width: 160, margin: 1 },
          (error) => { if (error) console.error("QR generation error:", error); },
        );
      } else {
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);
        const fmt = this.selectedCard.format || "CODE128";
        // központi render (nincs duplikált try/catch)
        renderBarcodeCentral(canvas, this.selectedCard.code, fmt);
      }

      this.dynamicContainer.querySelector("#toggle-code")
        ?.addEventListener("click", () => this.toggleCodeType(this.selectedCard.card_id));
      this.dynamicContainer.querySelector("#close")
        ?.addEventListener("click", () => this.closeCard());

      if (this.selectedCard.user_id === this._hass.user.id) {
        this.dynamicContainer.querySelector("#delete")
          ?.addEventListener("click", () => this.deleteCard(this.selectedCard));
        this.dynamicContainer.querySelector("#edit")
          ?.addEventListener("click", () => this.updateCard(this.selectedCard));
      }
    }

    const newCardListEl = this.dynamicContainer.querySelector(".cardlist");
    if (newCardListEl) newCardListEl.scrollTop = scrollPosition;
  }
}

customElements.define("cardwallet-card", CardWalletCard);