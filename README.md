# Google Review Card

Dynamic QR + NFC redirect platform for pre-printed review cards.

## Customer flow
Each QR and NFC tag stores one permanent URL, for example:
`https://YOUR-WORKER.workers.dev/r/GR-001`

The Worker reads `GR-001` from Cloudflare KV and sends an HTTP 302 redirect directly to the shop's Google Review URL. Customers do not see an intermediate landing page. Editing a shop URL does not change the printed QR or NFC tag.

## Deploy on Cloudflare Free plan
1. Create a Cloudflare account.
2. In Workers & Pages, create a KV namespace named `CARDS`.
3. Copy the namespace ID.
4. Replace `PASTE_YOUR_KV_NAMESPACE_ID_HERE` in `wrangler.toml`.
5. Create a Worker named `google-review-card` and connect this GitHub repository, or deploy with Wrangler.
6. In Worker Settings > Variables and Secrets, add:
   - `ADMIN_PASSWORD`: a long, unique admin password.
   - `SESSION_SECRET`: a separate random secret with at least 32 random characters.
7. Confirm the KV binding name is exactly `CARDS`, then deploy.

Never put either secret in this repository or share it in chat.

## Admin usage
Open the Worker root URL and sign in using your admin password. Create a card such as `GR-001`, add the shop name and Google Review URL, and save. The dashboard displays a QR for the permanent card URL. Write that exact URL to the NFC tag.

## Notes
- The app accepts HTTPS Google review links on the configured Google host allowlist.
- QR generation uses a browser-loaded QRCode.js library from cdnjs. The encoded URL remains your own Worker URL.
- NFC requires an NFC-capable phone or writer to program and test tags.
- Test the redirect and printed QR before producing cards in quantity.
- Free-tier limits and provider terms apply; free hosting is not an unlimited-service guarantee.
