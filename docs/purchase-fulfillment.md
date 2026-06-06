# Purchase and Fulfillment Workflow

## Current semi-automatic flow

1. User clicks `购买 Pro` in the extension.
2. User pays through the chosen external channel.
3. Seller confirms the paid order in the payment platform dashboard.
4. Seller issues a signed local license code:

```bash
node scripts/license/issue-manual-license.mjs \
  --email=user@example.com \
  --order=order_001 \
  --channel=lemonsqueezy \
  --amount=69
```

5. Send the printed `AICK1...` license code to the customer.
6. Customer clicks `激活` in the extension and pastes the license code.

## Recommended payment platform setup

For the first paid test, use Lemon Squeezy or Gumroad as the checkout and order source.

- Create one lifetime Pro product.
- Set the checkout success message to tell users that a Pro license code will be sent after order confirmation.
- Keep the payment platform order ID as the `--order` value when issuing a license.
- Keep `license-orders.jsonl` as the private operational ledger.

## Private ledger fields

`issue-manual-license.mjs` writes JSONL records with:

- `issuedAt`
- `orderId`
- `email`
- `paymentChannel`
- `amount`
- `plan`
- `status`
- `licenseId`
- `licenseCode`
- `note`

These records are not committed to Git. Back them up separately.

## Future webhook flow

After paid demand is proven:

1. Payment platform sends `order paid` webhook.
2. Webhook handler verifies the platform signature/secret.
3. Handler generates the same signed `AICK1...` license code.
4. Handler emails the code or displays it on the success page.
5. Refund and reissue events update a private ledger or database.

The current license payload already contains `licenseId`, `orderId`, and `emailHash`, so old paid users can be migrated by old license code, order ID, or purchase email.
