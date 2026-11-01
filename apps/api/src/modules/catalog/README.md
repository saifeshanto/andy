# catalog

Categories, merchant listings and the public marketplace (listing only; customers pay at the outlet until OPEN-11 is answered).

- **Categories:** admin-managed (`catalog.manage`). Six starter categories are created when the table is empty. Slugs never change.
- **Listings:** `DRAFT → PENDING → APPROVED / REJECTED`, plus `ARCHIVED`. A draft needs at least one photo and one open outlet before it can be sent.
- **Edits to live listings (OPEN-21 default):** type, category, title, description, price, member price and photos go into one pending
  `ListingRevision`; the live listing is unchanged until an admin approves it. Stock, availability, duration and outlets apply at once.
- **Public visibility:** listing APPROVED + available, merchant APPROVED. Suspending a merchant hides everything at once.
- **Money:** prices are integer sen; member price may not exceed the normal price (checked on create, on edit, and against pending changes).
