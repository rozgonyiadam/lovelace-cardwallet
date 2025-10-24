# Lovelace CardWallet Card

A custom Lovelace card for Home Assistant to display your wallet cards visually (e.g., loyalty cards, membership cards) in QR code or barcode format.

### 🔗 Backend Integration
You must have the [CardWallet backend integration](https://github.com/rozgonyiadam/hass-cardwallet) installed for this card to function properly.

---

## ✨ Features

- ✅ View and manage your own cards in a single dashboard card
- 👥 See cards added by other users
- 🔄 Switch between QR code and barcode views
- 📝 Edit or delete your cards
- ➕ Add new cards directly from the UI
- 📱 Responsive design
- 🔐 Per-user data isolation

---

## 📦 Installation

### HACS (Recommended)

Add this repository to HACS as a custom frontend:

- HACS → Frontend → "+" → "Custom repositories"
- Add this repository URL: `https://github.com/rozgonyiadam/lovelace-cardwallet`
- Type: Dashboard
- Install and reload Home Assistant.

### Manual Installation

#### 1. Copy frontend files (JS, libs)

Copy the `cardwallet-card.js` file into your Home Assistant `www/cardwallet/` directory.

Home Assistant serves `www/` as `/local/`, so `www/cardwallet/qrcode.min.js` becomes available at `/local/cardwallet/qrcode.min.js`.

📚 [More info on serving local files in HA](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources)

No restart is needed for `www/cardwallet/`, but you may need to clear your browser cache if changes don't appear.


#### 2. Register frontend in Lovelace

To use the custom card, register the JS file in Lovelace:

#### Option A – via UI (recommended)
- Go to **Settings → Dashboards → Resources**
- Click **"Add Resource"**
- URL: `/local/cardwallet/cardwallet-card.js`  
- Type: `JavaScript Module`

#### Option B – via `configuration.yaml`
```yaml
lovelace:
  resources:
    - url: /local/cardwallet/cardwallet-card.js
      type: module
```

## ⚙️ Usage
Manually add a Manual card with the following config:

```yaml
type: 'custom:cardwallet-card'
```

The card will automatically fetch and display your cards from the CardWallet backend integration.

## 📸 Screenshots

### My Cards
Displays a list of cards added by the current user.

![My Cards](/assets/mycards.png)

---

### Others' Cards
Shows cards shared by other users, with their names.

![Others' Cards](/assets/otherscards.png)

---

### Pop-up Barcode / QR
Clicking a card opens a larger view of the code with actions.

![Popup Barcode](/assets/barcode.png)


## 🙏 Credits

- [node-qrcode](https://github.com/soldair/node-qrcode) — Used for QR code generation
- [JsBarcode](https://github.com/lindell/JsBarcode) — Used for barcode rendering