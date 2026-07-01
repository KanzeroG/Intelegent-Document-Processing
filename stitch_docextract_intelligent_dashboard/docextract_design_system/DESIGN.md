---
name: DocExtract Design System
colors:
  surface: '#f7f9fc'
  surface-dim: '#d8dadd'
  surface-bright: '#f7f9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f7'
  surface-container: '#eceef1'
  surface-container-high: '#e6e8eb'
  surface-container-highest: '#e0e3e6'
  on-surface: '#191c1e'
  on-surface-variant: '#44474f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f4'
  outline: '#747780'
  outline-variant: '#c4c6d0'
  surface-tint: '#425e91'
  primary: '#002452'
  on-primary: '#ffffff'
  primary-container: '#1b3a6b'
  on-primary-container: '#89a5dd'
  inverse-primary: '#acc7ff'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#162635'
  on-tertiary: '#ffffff'
  tertiary-container: '#2c3c4b'
  on-tertiary-container: '#96a6b9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#acc7ff'
  on-primary-fixed: '#001a40'
  on-primary-fixed-variant: '#294678'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#d3e4f8'
  tertiary-fixed-dim: '#b8c8dc'
  on-tertiary-fixed: '#0c1d2b'
  on-tertiary-fixed-variant: '#394858'
  background: '#f7f9fc'
  on-background: '#191c1e'
  surface-variant: '#e0e3e6'
  text-primary: '#1A2433'
  border-base: '#E3E8EF'
  surface-white: '#FFFFFF'
  status-success: '#15803D'
  status-warning: '#B45309'
  status-error: '#B91C1C'
  status-review: '#1D4ED8'
  status-neutral: '#64748B'
typography:
  display:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '450'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 260px
  topbar-height: 64px
  gutter: 24px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
  table-cell-padding: 12px 16px
---

## Brand & Style

The design system is engineered for **DocExtract**, an intelligent document processing dashboard where precision, reliability, and speed are paramount. The brand personality is **authoritative yet unobtrusive**, functioning as a high-performance tool for finance and operations professionals who manage high volumes of sensitive Indonesian financial data.

### Design Style: Corporate / Modern
This design system utilizes a structured, "Enterprise-Grade" aesthetic. It prioritizes information density and clarity over decorative elements. 
- **Professionalism:** Rooted in a deep navy and slate palette to evoke trust and stability.
- **Data-Density:** Compact spacing and refined typography allow users to view complex extraction results (line items, tax breakdowns, and validation rules) without excessive scrolling.
- **Trustworthiness:** Clear status indicators and structured surfaces ensure that the "Human-in-the-Loop" feels in total control of the AI's output.
- **Tactile Utility:** Subtle shadows and 8px rounded corners provide just enough depth to distinguish interactive surfaces from the application shell without distracting from the data.

## Colors

The color palette is optimized for a **Light Mode** enterprise environment, focusing on long-term legibility and clear semantic signaling.

- **Primary (#1B3A6B):** Used for the sidebar, primary branding, and main action buttons. It provides the "anchor" for the professional aesthetic.
- **Interactive Accent (#2563EB):** Reserved for links, active states, and focus indicators.
- **Neutrals:** The background (#F5F7FA) provides a soft contrast against pure white (#FFFFFF) cards, reducing eye strain during extended review sessions.
- **Status Colors:** These are strictly reserved for document states and validation results. 
    - **Success:** Validated/Approved.
    - **Warning:** Validation warnings (e.g., OCR confidence low).
    - **Error:** Total mismatch or missing required fields.
    - **In-Review:** Staff intervention required.

## Typography

This design system uses **Inter** (or System Sans) for its neutral, highly legible qualities at small sizes. 

### Implementation Notes:
- **Hierarchy:** Use `label-sm` for table headers and section overlines to maintain a compact footprint. 
- **Data Display:** For financial figures (IDR amounts) and extracted JSON strings, use a monospace font (suggested: JetBrains Mono) to ensure character alignment and ease of auditing.
- **Indonesian Localization:** Numbers should always be formatted with dot separators for thousands (e.g., `Rp 12.450.000`) and commas for decimals.
- **Line Heights:** We utilize a "tight" line-height scale to maximize the amount of visible data in the review screen without sacrificing readability.

## Layout & Spacing

The layout follows a **Fixed App Shell** model designed for desktop-first productivity.

### App Shell Structure
1.  **Left Sidebar (260px):** Fixed position. Contains the DocExtract logo, navigation items, and user role indicator.
2.  **Top Bar (64px):** Contains breadcrumbs (e.g., Documents > Invoice #8821), notification bell, and a role switcher for testing.
3.  **Main Content Area:** A fluid container that fills the remaining space, typically split into a 2-column "Review View" (PDF Preview on left, Extraction Form on right).

### Spacing Rhythm
- We use an **8px grid system**.
- **Page Margins:** 24px around the main content.
- **Gaps:** 16px between cards.
- **Tables:** Use a compact row height (approx. 40px) to handle large line-item lists from PT/CV vendor invoices.

## Elevation & Depth

To maintain a professional, flat-ish enterprise aesthetic, this design system uses **Tonal Layers** combined with **Low-Contrast Outlines**.

- **Level 0 (Background):** #F5F7FA (No shadow).
- **Level 1 (Cards/Surfaces):** #FFFFFF with a 1px solid border (#E3E8EF) and a very subtle ambient shadow: `0 1px 3px 0 rgba(0, 0, 0, 0.05)`.
- **Level 2 (Dropdowns/Modals):** #FFFFFF with a more pronounced shadow: `0 10px 15px -3px rgba(0, 0, 0, 0.1)`.

**Interaction Depth:** Elements do not "lift" on hover; instead, they change fill color or border color (e.g., buttons darken slightly, input borders turn to Accent Blue). This maintains the "sturdy" feel required for high-accuracy work.

## Shapes

The shape language is disciplined and consistent to reinforce the "Intelligent Tool" metaphor.

- **Cards & Containers:** 0.5rem (8px) roundedness. This provides a modern touch while still feeling "constructed."
- **Inputs & Buttons:** 0.5rem (8px) to match the containers.
- **Status Badges:** Use **Pill-shaped (999px)** roundedness to clearly distinguish status metadata from interactive buttons or input fields.
- **Selection States:** Use a 4px left-border accent on active sidebar items or active table rows to provide a clear visual indicator of focus.

## Components

### Buttons
- **Primary:** Filled #1B3A6B with white text. Used for "Approve" or "Export."
- **Secondary:** Outline button with #E3E8EF border and #1A2433 text. Used for "Cancel" or "Save Draft."
- **Tertiary:** Ghost button (no border/fill) for low-priority actions like "Add Row."

### Status Badges (Pills)
- Use a light background (10% opacity of the status color) with high-contrast text.
- Example: *Success* = Light green background with #15803D text.

### Data Tables
- **Zebra Padding:** Use a very light tint (#F9FAFB) on even rows.
- **Alignment:** Currency and numeric values must be **Right-Aligned**. Vendor names and descriptions are **Left-Aligned**.
- **Actions:** Use small icon-only buttons for "Delete Row" or "Edit" within the table to save horizontal space.

### Input Fields
- Standard 40px height for primary fields.
- Use a clear "Error" state where the border changes to #B91C1C and an error message appears in `body-sm`.
- **Formatting:** Dates must follow YYYY-MM-DD. Currencies should auto-format as the user types.

### Document Preview
- The PDF viewer should have a dark gray container background to contrast with the document paper, featuring zoom and rotate controls in a floating bottom-center bar.