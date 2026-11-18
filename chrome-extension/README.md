# Contexa Chrome connector

1. Start Contexa and sign in. Open **Connectors → Google Chrome** and generate its six-character pairing code.
2. Open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose this folder.
3. Open the extension popup and enter the code. The default API address is `http://127.0.0.1:4000`; change it if your Contexa installation uses another address.
4. Open a normal research page. The popup reports capture or delivery status; Contexa's diagnostics show the last received activity.

The connector captures tab/page titles, domain, search terms and a URL without query parameters. It skips incognito tabs, browser-internal URLs and Contexa's own pages. It never reads page bodies or form fields. Contexa's server also enforces global/app pauses, exclusions and cloud consent. "Enabled" means capture is allowed; it is not proof of delivery.

Existing options-based token setup remains supported. Reload this unpacked extension after source changes. Rebuild downloadable ZIPs with `npm run connectors:package` from the repository root.
