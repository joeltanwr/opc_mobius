---
name: "ocbc-designmd"
description: "OCBC website design"
---

# Design System Specification (`design.md`)

## 1. Overview & Brand Alignment
**Brand Target:** OCBC Bank (Overseas-Chinese Banking Corporation) – SME Partner Portal.  
**Visual Style:** Premium enterprise financial interface combined with clean, human-centric layouts. The system relies on OCBC’s signature red accenting, precise layout geometry, clean white carding, clear typographic hierarchy, and data-dense interactive visualization.

---

## 2. Color Palette & Tokens

### Primary Brand Palette
- **OCBC Red (Brand Accent / Primary Actions):** `#ED1C24` / `rgb(237, 28, 36)`
- **OCBC Red Hover:** `#D0121A`
- **OCBC Deep Crimson / Dark Red:** `#A60E14`
- **Navy Charcoal (Header & Dark Accents):** `#1A202C` or `#1E293B`

### Core Neutrals
- **Background Main (Light Gray Canvas):** `#F8FAFC` or `#F4F5F7`
- **Card Background:** `#FFFFFF`
- **Border Default:** `#E2E8F0`
- **Text Primary:** `#0F172A` (High-contrast slate black)
- **Text Secondary:** `#64748B` (Muted slate gray)
- **Text Light / Placeholder:** `#94A3B8`

### Semantic Status & Data Accents
- **Success / Positive Growth:** `#10B981` (Emerald) / Light BG: `#ECFDF5`
- **Warning / Alert:** `#F59E0B` (Amber) / Light BG: `#FEF3C7`
- **Info / Highlight Blue:** `#2563EB` (Royal Blue) / Light BG: `#EFF6FF`
- **Analytics Neutral:** `#6366F1` (Indigo for comparative metrics)

---

## 3. Typography & Text Hierarchy

### Font Family
- **Primary Font Stack:** `Open Sans`, `Helvetica Neue`, `Arial`, sans-serif
- **Data / Numeric Display:** Inter, system-ui, or tabular font variants for financial tables and metrics.

### Type Scale & Hierarchy
- **Display 1 (Hero Title):** `36px` - `44px` | SemiBold / Bold | Line-height: `1.2`
- **Heading 1 (Page Title):** `28px` - `32px` | Bold | Line-height: `1.25`
- **Heading 2 (Section Title):** `20px` - `24px` | SemiBold | Line-height: `1.3`
- **Heading 3 (Card Title):** `16px` - `18px` | SemiBold | Line-height: `1.4`
- **Body Regular:** `14px` - `15px` | Regular | Line-height: `1.5`
- **Caption / Meta:** `12px` - `13px` | Regular / Medium | Line-height: `1.4`

---

## 4. Design System Architecture & Rules

### Spacing & Grid System
- **Base Grid:** `8px` spatial scale (`8px`, `16px`, `24px`, `32px`, `48px`, `64px`).
- **Container Max Width:** `1280px` centered with variable horizontal padding (`16px` mobile, `32px` desktop).
- **Layout Spacing:** Section padding vertical `48px` to `64px`.

### Card & Elevation System
- **Standard Card:**
  - Background: `#FFFFFF`
  - Border: `1px solid #E2E8F0`
  - Border Radius: `12px` (rounded-xl)
  - Box Shadow: `0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)`
- **Hover Elevation (Interactive Cards):**
  - Transform: `translateY(-2px)`
  - Shadow: `0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.03)`
  - Border: `1px solid #CBD5E1`

### Button Specifications
1. **Primary Button (OCBC Red):**
   - Background: `#ED1C24`
   - Text: `#FFFFFF` (Font weight 600)
   - Border Radius: `8px`
   - Hover State: `#D0121A`
   - Active State: `#A60E14`
2. **Secondary Button (Outline):**
   - Background: `#FFFFFF`
   - Text: `#1E293B`
   - Border: `1px solid #CBD5E1`
   - Hover State: `#F8FAFC` with border `#94A3B8`
3. **Ghost / Tab Button:**
   - Background: Transparent
   - Active Background: `#ED1C24` with White text or `#F1F5F9` with Red text indicator

---

## 5. Screen Layout Specifications

### Page 1: Landing Page (`/`)
- **Top Navigation Bar:** Sticky navbar featuring OCBC Red primary logo, nav items (Solutions, Case Studies, ROI Estimator), and primary CTA button (*"Partner Sign Up"*).
- **Hero Section:** Two-column split layout. Left: High-impact headline on enterprise transaction intelligence, bulleted advantages, and dual CTAs. Right: Interactive preview card showing live merchant analytics preview.
- **Value Proposition Grid:** 4-card grid showcasing core advantages (Targeted Reach, AI Precision, Automated Rewards, Real-Time ROI Analytics).
- **Interactive ROI & Audience Estimator:** Live calculator widget allowing SMEs to select their sector (F&B, Retail, Beauty, Services) and average monthly revenue to preview estimated customer reach and projected revenue uplift.
- **Social Proof / Case Studies Section:** Testimonial cards featuring real-world SME success metrics (e.g., *"+34% Repeat Customer Spend"*).

### Page 2: SME Onboarding & AI Segment Discovery (`/signup`)
- **Step 1: SME Profiling Form:** Clean form input collecting business category, location, average transaction value, and target demographics.
- **Step 2: AI Transaction Data Intelligence Panel:** Real-time simulated data processing view displaying:
  - **Core Audience Segment Card:** Primary customer demographic (e.g., *"Tech Professionals aged 28–42, high weekend afternoon spenders"*).
  - **Customer Peak Timing Heatmap:** Interactive hourly/daily spending intensity matrix.
  - **Nearby Competitor & Benchmark Metrics:** Average spend per visitor comparative indicators.
- **Step 3: AI Campaign Recommendation:**
  - Automated reward campaign generator (e.g., *"10% cashback on OCBC 365 Cards for Saturday Dining"*).
  - One-click launch button to commit campaign.

### Page 3: EmB Business Impact & Analytics Dashboard (`/dashboard`)
- **Top Metrics Overview Row (KPI Cards):**
  - Total Campaign Revenue
  - Customer Conversion Rate
  - Total OCBC Cashback/Rewards Disbursed
  - ROI Lift Percentage (+% indicator)
- **Main Analytics Panel:**
  - **Comparative Sales Chart:** Toggleable line/bar chart displaying *Before vs. After* campaign sales trends.
  - **Audience Demographic Breakdown:** Donut chart illustrating customer age groups, gender distribution, and preferred OCBC card types (e.g., OCBC 365 vs OCBC Rewards).
  - **AI Spending Pattern Feed:** Real-time AI feed highlighting emerging consumer trends (e.g., *"Notice: 42% increase in contactless mobile payments during 12PM-2PM lunch hour"*).
- **Active Campaign Management Table:** Interactive table displaying running promotions, status badges, redemption count, and pause/edit toggles.

---

## 6. Iconography & Data Visualization Tokens
- **Icons:** Lucide Icon library (`BarChart3`, `PieChart`, `TrendingUp`, `Users`, `CreditCard`, `Award`, `Zap`, `CheckCircle2`, `Target`, `ShieldCheck`).
- **Charts:**
  - **Line Chart:** Primary series in `#ED1C24` (Post-Campaign) vs. Dashed `#94A3B8` (Pre-Campaign Baseline).
  - **Bar/Donut Chart Colors:** OCBC Red (`#ED1C24`), Royal Blue (`#2563EB`), Emerald (`#10B981`), Amber (`#F59E0B`), Slate (`#64748B`).

```