---
name: Command Precision
colors:
  surface: '#FFFFFF'
  surface-dim: '#d7dae0'
  surface-bright: '#f7f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f9'
  surface-container: '#ebeef3'
  surface-container-high: '#e5e8ee'
  surface-container-highest: '#e0e3e8'
  on-surface: '#181c20'
  on-surface-variant: '#414752'
  inverse-surface: '#2d3135'
  inverse-on-surface: '#eef1f6'
  outline: '#727783'
  outline-variant: '#c1c6d4'
  surface-tint: '#005eb5'
  primary: '#004e99'
  on-primary: '#ffffff'
  primary-container: '#0a66c2'
  on-primary-container: '#dbe6ff'
  inverse-primary: '#a8c8ff'
  secondary: '#5e5e5c'
  on-secondary: '#ffffff'
  secondary-container: '#e1dfdc'
  on-secondary-container: '#636360'
  tertiary: '#833900'
  on-tertiary: '#ffffff'
  tertiary-container: '#a94b00'
  on-tertiary-container: '#ffe0d1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a8c8ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#00468a'
  secondary-fixed: '#e4e2de'
  secondary-fixed-dim: '#c8c6c3'
  on-secondary-fixed: '#1b1c1a'
  on-secondary-fixed-variant: '#474744'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#773300'
  background: '#f7f9ff'
  on-background: '#181c20'
  surface-variant: '#e0e3e8'
  canvas: '#F4F2EE'
  text-primary: '#1B1F23'
  text-secondary: '#666666'
  border-hairline: '#E0E0E0'
  border-muted: '#E8E6E1'
  status-waiting: '#D97706'
  status-success: '#057642'
typography:
  headline-lg:
    fontFamily: Source Sans 3
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Source Sans 3
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Source Sans 3
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Source Sans 3
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Source Sans 3
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Source Sans 3
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Source Sans 3
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Source Sans 3
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-desktop: 24px
  margin-mobile: 12px
  max-width: 1128px
---

## Brand & Style

The design system is built on the philosophy of **Quiet Authority**. It targets professionals who value efficiency over flash, positioning the tool as a reliable "command center" for career management. 

The aesthetic is **Corporate Modern**, drawing heavily from the structured, familiar patterns of LinkedIn and enterprise SaaS, but with a sharper focus on local-first performance and data density. It prioritizes clarity and utility through high-quality typography, a restrained palette, and a rigorous adherence to a grid. The emotional response should be one of calm control—minimizing "interface noise" so the user can focus on their job application pipeline.

## Colors

The palette is rooted in professional stability. The **LinkedIn Blue (#0A66C2)** is used exclusively for primary actions and active navigational states to provide a familiar mental model for professional networking.

- **Background Strategy:** We use a layered approach. The base canvas is `#F4F2EE`, while all content containers (cards, rails, feeds) are pure `#FFFFFF`. This creates a subtle but clear distinction between the workspace and the background.
- **Typography:** Primary text uses a deep navy ink to ensure high legibility without the harshness of pure black. Secondary text uses a soft graphite for metadata and captions.
- **Functional Accents:** Muted Amber is reserved for "in-progress" or "waiting" states in the pipeline, ensuring they catch the eye without signaling an error.

## Typography

This design system utilizes **Source Sans 3**, a professional humanist sans-serif that excels in UI environments. It provides the "Segoe UI" feel requested—neutral, approachable, and highly legible at small sizes.

Hierarchy is enforced through weight and color rather than dramatic size shifts. 
- **Headlines:** Reserved for page titles and card headers, using SemiBold (600) weights.
- **Body:** The workhorse for job descriptions and messages, primarily set at 14px for optimal information density.
- **Labels:** Small caps or bolded 11-12px type are used for metadata, status tags, and table headers to provide a "data-rich" feel without clutter.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. The main content area is capped at `1128px` (matching the standard professional networking width) and centered on the screen. 

- **The Grid:** A 12-column grid is used for the main dashboard. Typically, this is divided into a 3-column "Identity Rail" (left), a 6-column "Primary Feed/Workspace" (center), and a 3-column "Context/Utility Rail" (right).
- **Rhythm:** We use a 4px baseline shift. All components should use multiples of 8px for internal padding (8px, 16px, 24px).
- **Density:** To achieve the "Command-center" feel, vertical margins between cards are kept tight (8px or 12px) to allow more information to be visible above the fold.

## Elevation & Depth

This design system avoids heavy drop shadows in favor of **Structural Tonal Layers**. 

- **Low-Contrast Outlines:** The primary method of separation is the `#E0E0E0` hairline border. Every card and input field must have a 1px solid border.
- **Soft Elevation:** Only the primary content cards (like job cards) receive a shadow. This shadow should be extremely subtle: `0 0 0 1px rgba(0,0,0,0.02), 0 2px 4px rgba(0,0,0,0.06)`. This mimics the "stacked paper" look of the LinkedIn feed.
- **Active State:** When a user interacts with a card or input, the border color shifts to the Primary Blue, rather than increasing shadow depth.

## Shapes

The shape language is disciplined and professional. A standard radius of **8px** is applied to all primary containers (cards, modals, identity rails). Smaller components like buttons and input fields use the same 8px radius for consistency.

- **Status Tags/Chips:** These use a slightly increased radius (16px) to distinguish them as interactive or informative "pills" within the otherwise rectangular grid.
- **Icons:** Icons should be 20px or 24px, using a 1.5px or 2px stroke weight to match the professional, hairline-focused aesthetic.

## Components

- **Pipeline Stage Rows:** Horizontal layouts with `border-bottom: 1px solid #E8E6E1`. Icons for stages (e.g., "Applied," "Interviewing") should use the Success Green or Muted Amber depending on status.
- **Identity Rails:** Fixed-width sidebars that contain user profile summaries. Use the Primary Blue for the header background and `#FFFFFF` for the body.
- **Job Cards:** White background, 8px radius, 1px border. The company logo should be a 48x48px square with a subtle 4px radius. Primary title in Navy, metadata in Soft Graphite.
- **Bridge Status Banners:** Full-width alerts at the top of the workspace. Use `#E5EDF4` (light blue tint) for info and `#FDF1E8` for 'waiting' states, with a 1px stroke of the darker equivalent.
- **Checklists & Data Tables:** Tables use a "zebra-striping" approach with the Canvas color (#F4F2EE) for alternating rows. No vertical borders; only horizontal hairlines.
- **Gmail-style Drafts:** Minimalist text editors with a clean white surface and a fixed bottom action bar. The "Send" button is always the Primary Blue, while secondary actions are ghost buttons with Navy text.