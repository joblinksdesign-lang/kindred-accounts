# Responsive POS with a fixed, always-visible cart

## Goal
Keep the cart visible while products and cart items scroll independently, without the POS growing wider or taller as more products are added.

## Changes
- Use a fixed-height POS workspace below the top bar on desktop.
- Keep the cart as a fixed-width right column while only its item list scrolls.
- Make the product catalogue scroll independently and use smaller, stable product cards.
- On phones, keep a compact cart panel fixed in the lower part of the screen, with products scrolling behind/above it.
- Keep checkout totals and the Charge button pinned inside the cart while long order lists scroll separately.
- Prevent horizontal page expansion and ensure long names and prices wrap or truncate safely.

## Validation
- Test phone and desktop widths with many products and many cart items.
- Confirm product scrolling never moves the cart, cart scrolling never moves the catalogue, and no horizontal zoom-out is needed.
