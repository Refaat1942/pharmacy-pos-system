# Label printing (Xprinter XP-246B, 2-up roll)

- No label settings in FPS (user rejected them repeatedly) and no print bridge (removed).
- frontend/src/lib/labelPrint.ts: no @page size → Windows paper size is used. Each page =
  one gap-to-gap section of a 2-up roll (label, thin cut, label, gap) = two stacked labels
  (46% each, space at the cut). 4 barcodes = 2 pages.
- Windows stock: 1.50 × 0.98 in, Die-Cut, Chrome Layout = Landscape, Margins None, Scale 100.
- Bars snap to whole 203 dpi dots via container queries (.m<modules> rules).
