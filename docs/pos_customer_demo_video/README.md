# Arabic / English POS customer demo for `test`

This folder contains a rendered customer demo video for the Arabic POS flow only.
The visible POS/customer identity is `test` throughout the video.

## Files

- `pos_customer_demo_ar_en.mp4` - generated MP4 demo video.
- `slides.html` - Arabic-first bilingual slide deck used for the video.
- `generate_video.py` - local renderer that captures the slides and builds the MP4.
- `voiceover_script.md` - optional bilingual narration script matching the slides.

## Scope covered

1. POS opening, `test` header, shift guard, new POS window, refund shortcut.
2. Product search and barcode scan with stock status.
3. Cart editing, quantity changes, remove, and clear cart.
4. Pack/sub-unit selling and expiry guard messaging.
5. Item discounts and invoice discounts by amount or percent.
6. Seller selection, seller-card scan, and customer `test`.
7. Suspend, held sales, recall, and delete held sale.
8. Optional clinic prescriptions into the POS cart.
9. Checkout with cash, card, hybrid, InstaPay, Vodafone Cash, account, digital, and delivery.
10. Delivery details, platform settlement, on-account, and partial payment.
11. Receipt preview, print receipt, new sale, and previous receipt refund.

## Regenerate

From the repository root:

```bash
python3 docs/pos_customer_demo_video/generate_video.py
```

The script requires local Chrome/Chromium and ffmpeg.
