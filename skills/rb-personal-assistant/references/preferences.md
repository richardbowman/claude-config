# User Preferences for rb-personal-assistant

## Important Senders & Contacts
- **Partner**: High priority. (Name in local-preferences.md)
  - *Preference*: If an invoice is received, ask if it's already been paid or if it needs to be paid now.
  - *Invitations*: Automatically accept and archive invitations.
  - *Note*: Transcripts showing "Erin" should be interpreted as the partner (voice-to-text correction).

## Categories & Handling Rules

### 1. Calendar & Invitation Protocol
- **Priority Invites**: Automatically accept and archive invitations from high-priority contacts (defined in local-preferences.md).
- **Work Visibility**: Always invite the user's work email (defined in local-preferences.md) to travel, significant personal events, or OOO events to ensure visibility on the work calendar.
- **Deduplication**: When accepting a detailed invitation (e.g., for a trip or event), proactively identify and remove overlapping manually created "placeholder" events (like "Travel Day" or "OOO").

### 2. Newsletters & Updates
- **Strategy**: Scan for interesting topics and summarize.
- **Interests (Synced from Obsidian)**:
  - **Culinary & Nutrition**: Smoked meats (Brisket/Pulled Pork), bread making (Baguettes), functional nutrition (Protein optimization, Keto), and food preservation (Jam/Candle making).
  - **Health & Performance**: Cycling, Swimming, Weight Training, Bio-optimization (wellbeing protocols, skincare), and Mental performance.
  - **Home & Design**: Renovations (specifically building address and Shady Pines in local-preferences.md), Home Automation, Audio Systems, and Gardening.
  - **Tech**: Linux (Fedora), Dev Setup, and Home Automation.
  - **Travel & Local**: Trips to Costa Rica, Portugal, Copenhagen. SW Michigan local guides.
  - **Intellectual**: Product Development, Leadership, Sci-Fi (Orwell/Atwood).
- **Action**: Do not archive immediately. Bring interesting snippets to the user's attention based on these specific themes.

### 3. Tech/Dev Alerts
- **Strategy**: Option B (Archive by default).
- **Exceptions**: Keep in inbox if it indicates a production issue, security breach, or billing/payment failure that might take a site down.
- **Action**: Archive routine deployment successes, TestFlight notifications, and bot comments unless they meet exception criteria.

### 4. Building/Home Notices
- **Strategy**: Option B (Move to "Home" folder).
- **Action**: Identify emails from the building address (in local-preferences.md) or "Condominium Association" and move/archive to a specific label.

### 5. Travel & Shipping
- **Strategy**: Associate with work trips for "Trip Reports".
- **Action**: Identify Marriott, AC Hotels, UPS, and airline emails. Keep until trip completion.
- **Future Integration**: Need to check Outlook Calendar to sync dates and create trip reports.

## Auto-Archive (Junk/Noise)
The following should be archived immediately without asking:
- **Experian**: Promotional credit monitoring emails.
- **TaxSlayer**: Tax reminders and promotions.
- **Google Security Alerts**: For known accounts (personal account in local-preferences.md).

## Response Style
- **Tone**: Professional yet concise.
- **Protocol**: Never confirm a payment or click a payment link without explicit confirmation from the user.
