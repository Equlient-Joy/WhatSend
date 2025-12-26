# Shopify App Deployment Requirements & Verification Checklist

> **Last Updated:** December 2024  
> **Applies to:** Shopify App Store (Public Apps) & Custom/Private Apps

This document outlines all requirements and best practices for deploying a Shopify app, compiled from official Shopify documentation and platform guidelines. Use this checklist to verify your app is correctly configured before deployment.

---

## Table of Contents

1. [Partner Program Setup](#1-partner-program-setup)
2. [Technical Requirements](#2-technical-requirements)
3. [Authentication & Security](#3-authentication--security)
4. [GDPR Compliance Webhooks](#4-gdpr-compliance-webhooks)
5. [API Usage Requirements](#5-api-usage-requirements)
6. [Billing API Requirements](#6-billing-api-requirements)
7. [Performance Requirements](#7-performance-requirements)
8. [Hosting & Deployment](#8-hosting--deployment)
9. [User Experience & Design](#9-user-experience--design)
10. [App Store Listing](#10-app-store-listing)
11. [Pre-Submission Checklist](#11-pre-submission-checklist)
12. [Common Rejection Reasons](#12-common-rejection-reasons)

---

## 1. Partner Program Setup

### Requirements

- [ ] Registered for the [Shopify Partner Program](https://partners.shopify.com)
- [ ] Familiar with the Shopify Partner Dashboard
- [ ] Agreed to the [Partner Program Agreement](https://www.shopify.com/ca/partners/terms)
- [ ] Created app in Partner Dashboard with correct configuration

### Partner Dashboard Configuration

- [ ] App name configured correctly
- [ ] App URLs set correctly (Application URL, Redirect URLs)
- [ ] API credentials (API Key, API Secret) secured
- [ ] Emergency developer contact information up-to-date

---

## 2. Technical Requirements

### API Configuration

- [ ] **GraphQL Admin API**: As of April 1, 2025, all new public apps must use GraphQL Admin API exclusively
- [ ] **REST Admin API**: Deprecated as of October 1, 2024 - migrate to GraphQL
- [ ] Using stable API version (not preview/unstable)
- [ ] Proper error handling for API responses

### Webhooks Configuration

- [ ] Webhooks configured in `shopify.app.toml`
- [ ] All required webhook topics subscribed
- [ ] Webhook endpoints return 200-series status codes
- [ ] HMAC signature validation implemented for webhook security

### App Configuration File (`shopify.app.toml`)

```toml
# Required fields
client_id = "your_client_id"
name = "Your App Name"
application_url = "https://your-app-url.com"
embedded = true  # For embedded apps

[build]
automatically_update_urls_on_dev = true

[webhooks]
api_version = "2025-01"

[access_scopes]
scopes = "read_products,write_products"  # Only request what you need

[auth]
redirect_urls = ["https://your-app.com/auth/callback"]
```

### Session Token Requirements (Embedded Apps)

- [ ] App functions properly without third-party cookies
- [ ] App works in Chrome incognito mode
- [ ] Using session tokens for authentication (not local storage)
- [ ] Shopify App Bridge integrated for embedded experience

---

## 3. Authentication & Security

### OAuth 2.0 Implementation

- [ ] **OAuth Flow**: Authorization Code Grant implemented correctly
- [ ] **Token Exchange**: Recommended for embedded apps (no redirects needed)
- [ ] **HMAC Validation**: All incoming requests validated
- [ ] **Token Storage**: Access tokens stored securely (never client-side)

### OAuth Flow Checklist

1. [ ] App redirects to Shopify's permission screen on install
2. [ ] Merchant grants requested access scopes
3. [ ] Authorization callback handles temporary code
4. [ ] Secure exchange of code for access token
5. [ ] Access token stored securely in database
6. [ ] Session management using Shopify session tokens

### Security Requirements

- [ ] **TLS/SSL Certificate**: Valid certificate, HTTPS enforced
- [ ] **Encryption**: Data encrypted in transit (TLS) and at rest (AES-256 recommended)
- [ ] **Access Scopes**: Only minimum necessary permissions requested
- [ ] **Scope Justification**: Can justify every requested scope
- [ ] **Token Refresh**: Handle token refresh/rotation appropriately

### Access Scope Best Practices

| Scope Type                       | Requirement                                  |
| -------------------------------- | -------------------------------------------- |
| `read_all_orders`                | Must demonstrate specific need               |
| `write_payment_mandate`          | Must demonstrate specific need               |
| `write_checkout_extensions_apis` | Must demonstrate specific need               |
| `read_advanced_dom_pixel_events` | Only for heatmaps/session recording          |
| Optional scopes                  | Use for features not needed by all merchants |

---

## 4. GDPR Compliance Webhooks

> **MANDATORY**: All public Shopify apps must implement these webhooks.

### Required GDPR Webhooks

#### 4.1 `customers/data_request`

- [ ] Endpoint configured
- [ ] Returns customer data when requested
- [ ] Responds with 200-series status code

**Purpose**: Customer requests to view their personal data.

#### 4.2 `customers/redact`

- [ ] Endpoint configured
- [ ] Deletes customer's personal information
- [ ] Responds with 200-series status code

**Purpose**: Store owner requests deletion of customer data.

#### 4.3 `shop/redact`

- [ ] Endpoint configured
- [ ] Deletes all customer data for the shop
- [ ] Responds with 200-series status code

**Purpose**: Sent 48 hours after app uninstall - must delete all shop data.

### GDPR Configuration in `shopify.app.toml`

```toml
[[webhooks.subscriptions]]
topics = ["customers/data_request"]
uri = "/webhooks/gdpr/customers-data-request"
compliance_topics = true

[[webhooks.subscriptions]]
topics = ["customers/redact"]
uri = "/webhooks/gdpr/customers-redact"
compliance_topics = true

[[webhooks.subscriptions]]
topics = ["shop/redact"]
uri = "/webhooks/gdpr/shop-redact"
compliance_topics = true
```

### GDPR Testing

- [ ] `customers/data_request`: Test from Shopify Admin (Customers > Customer > "Request customer data")
- [ ] `customers/redact`: Test from Shopify Admin (Customers > Customer > "Erase personal data")
- [ ] `shop/redact`: Test by uninstalling app from development store

---

## 5. API Usage Requirements

### GraphQL Admin API (Required)

- [ ] All new functionality uses GraphQL Admin API
- [ ] REST endpoints migrated where possible
- [ ] Proper query structure with required fields
- [ ] Mutations handle errors gracefully

### API Rate Limits

- [ ] Rate limit handling implemented
- [ ] Exponential backoff for retries
- [ ] Throttle requests to respect limits
- [ ] Monitor API usage in Partner Dashboard

### App Bridge Integration

- [ ] Latest Shopify App Bridge version used
- [ ] App Bridge script added before other scripts:
  ```html
  <script src="https://cdn.shopify.com/shopify-app-bridge.js"></script>
  ```
- [ ] Navigation integrated with Shopify Admin
- [ ] Toast notifications use App Bridge
- [ ] Modal dialogs use App Bridge

---

## 6. Billing API Requirements

> **Note**: All apps distributed via Shopify App Store must use Shopify Billing API.

### Billing Types Supported

| Type                        | Description                          |
| --------------------------- | ------------------------------------ |
| **Recurring (Time-based)**  | Fixed rate every 30 days or annually |
| **Recurring (Usage-based)** | Charges based on consumption         |
| **Hybrid**                  | Base subscription + usage charges    |
| **One-time**                | Single payment for specific features |

### Billing Implementation Checklist

- [ ] Billing API endpoints implemented
- [ ] Merchant approval flow working
- [ ] `confirmationUrl` redirect implemented
- [ ] Subscription activation after approval
- [ ] Upgrades/downgrades handled gracefully
- [ ] Free trial period configured (if offering)
- [ ] Billing webhooks handled for sync

### Billing Best Practices

- [ ] Simple, intuitive pricing
- [ ] Limited number of plans (avoid confusion)
- [ ] Store subscription data in database
- [ ] Handle cancellation flow properly
- [ ] Test with Shopify's test credit cards

---

## 7. Performance Requirements

### Response Time Requirements

- [ ] **95% of requests**: Under 500ms response time
- [ ] **Lighthouse score**: App should not reduce store performance by more than 10 points
- [ ] Optimized database queries
- [ ] Efficient API usage (batching where possible)

### Performance Best Practices

- [ ] Use async operations where appropriate
- [ ] Implement caching strategies
- [ ] Optimize frontend bundle size
- [ ] Use CDN for static assets
- [ ] Minimize JavaScript blocking
- [ ] Lazy load non-critical resources

### Monitoring

- [ ] Performance monitoring in place
- [ ] Error tracking implemented
- [ ] API usage monitoring
- [ ] Uptime monitoring configured

---

## 8. Hosting & Deployment

### Environment Variables (Required)

| Variable             | Description                           | Example                         |
| -------------------- | ------------------------------------- | ------------------------------- |
| `SHOPIFY_API_KEY`    | App API key from Partner Dashboard    | `abc123...`                     |
| `SHOPIFY_API_SECRET` | App API secret from Partner Dashboard | `xyz789...`                     |
| `HOST`               | Your deployed app URL                 | `https://your-app.onrender.com` |
| `SHOPIFY_APP_URL`    | Same as HOST                          | `https://your-app.onrender.com` |
| `DATABASE_URL`       | Database connection string            | `postgresql://...`              |
| `PORT`               | Port for the app (set by hosting)     | `3000`                          |
| `NODE_ENV`           | Environment setting                   | `production`                    |

### Render Deployment Checklist

- [ ] Web service created on Render
- [ ] All environment variables configured in Render secrets
- [ ] Build command configured: `npm run build`
- [ ] Start command configured: `npm run start`
- [ ] Health check endpoint responding
- [ ] Auto-deploy from Git enabled (optional)

### Render Configuration (`render.yaml`)

```yaml
services:
  - type: web
    name: your-app-name
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start
    envVars:
      - key: NODE_ENV
        value: production
      - key: SHOPIFY_API_KEY
        sync: false
      - key: SHOPIFY_API_SECRET
        sync: false
      # Add other env vars as needed
```

### Post-Deployment

- [ ] Update URLs in Partner Dashboard to match deployment
- [ ] Deploy app configuration: `shopify app deploy`
- [ ] Test OAuth flow on deployed app
- [ ] Verify webhooks are receiving events
- [ ] Check database connectivity

---

## 9. User Experience & Design

### Polaris Design System

- [ ] Using Shopify Polaris components
- [ ] Consistent with Shopify Admin design
- [ ] Accessible UI (WCAG compliance)
- [ ] Responsive across devices

### Embedded App Experience

- [ ] App Bridge navigation working
- [ ] No full-page redirects outside Shopify Admin
- [ ] Max modal only launches on user interaction
- [ ] Loading states implemented

### Onboarding

- [ ] Clear onboarding instructions
- [ ] Setup wizard if needed
- [ ] In-app documentation/help
- [ ] Quick start guide

### User Flow

- [ ] OAuth completes before any UI interaction
- [ ] After install, user lands in app UI
- [ ] Settings easily accessible
- [ ] Clear error messages

---

## 10. App Store Listing

### Required Assets

| Asset                 | Requirements                                  |
| --------------------- | --------------------------------------------- |
| **App Icon**          | 1200x1200px, JPEG or PNG, no text/screenshots |
| **Screenshots**       | 3-6 desktop (1600x900px, 16:9 ratio)          |
| **Promotional Video** | Optional but recommended                      |

### Listing Content

- [ ] **App Name**: Matches across Dev Dashboard and listing
- [ ] **Tagline**: Concise value proposition
- [ ] **Description**: Clear explanation of features
- [ ] **Pricing**: Complete and accurate
- [ ] **Languages**: Only list fully supported languages
- [ ] **Support URL**: Valid and accessible
- [ ] **Privacy Policy**: Linked and accessible

### Content Guidelines

- [ ] No statistics or data claims in listing
- [ ] No guarantees or superlatives ("the best", "the only")
- [ ] No reviews/testimonials in listing
- [ ] No pricing in images
- [ ] No Shopify trademarks in graphics
- [ ] Accurate tags matching app functionality

### Required URLs

- [ ] **App URL**: Points to deployed application
- [ ] **Redirect URLs**: All OAuth redirect URLs listed
- [ ] **Privacy Policy URL**: Accessible privacy policy
- [ ] **Support URL**: Working support page/contact

---

## 11. Pre-Submission Checklist

### Functionality Testing

- [ ] Install flow works on development store
- [ ] OAuth authentication completes
- [ ] All core features functional
- [ ] No 404, 500, or 300 errors
- [ ] No JavaScript console errors
- [ ] Works on different browsers
- [ ] Works in Chrome incognito mode

### Compliance Testing

- [ ] GDPR webhooks responding correctly
- [ ] Privacy policy accessible
- [ ] Data handling documented
- [ ] Access scopes justified

### Billing Testing

- [ ] Billing flow works with test cards
- [ ] Upgrades/downgrades function
- [ ] Cancellation handled
- [ ] Free trial works (if applicable)

### Documentation

- [ ] Help documentation complete
- [ ] Support channels configured
- [ ] FAQ section available
- [ ] In-app help available

### Partner Dashboard

- [ ] All app setup sections completed
- [ ] URLs configured correctly
- [ ] Webhooks registered
- [ ] API contact email updated
- [ ] Emergency contact current

---

## 12. Common Rejection Reasons

### Technical Issues

| Issue                         | Solution                           |
| ----------------------------- | ---------------------------------- |
| Missing GDPR webhooks         | Implement all 3 mandatory webhooks |
| Broken OAuth flow             | Test install/reinstall thoroughly  |
| HTTP errors (404, 500)        | Fix all error pages                |
| JavaScript errors             | Clear console of all errors        |
| App doesn't work in incognito | Use session tokens, not cookies    |

### Listing Issues

| Issue                          | Solution                              |
| ------------------------------ | ------------------------------------- |
| Pricing not in designated area | Move pricing to Pricing Details only  |
| Statistics in listing          | Remove data/stats from listing        |
| Testimonials in listing        | Remove reviews from listing           |
| Missing privacy policy         | Add accessible privacy policy link    |
| Incomplete descriptions        | Provide comprehensive feature details |

### Compliance Issues

| Issue                            | Solution                                |
| -------------------------------- | --------------------------------------- |
| Unjustified scopes               | Only request necessary permissions      |
| Missing scope justification      | Document why each scope is needed       |
| Geographic requirements unlisted | Specify in listing if location-specific |

---

## Quick Reference: WhatSend App Configuration

Based on your current `shopify.app.toml`:

### Current Configuration Status

| Item            | Status        | Notes                                |
| --------------- | ------------- | ------------------------------------ |
| Client ID       | ✅ Configured | `823c4ac0ed0c9aa9aec7a44543fc782e`   |
| App Name        | ✅ Set        | `WhatSend`                           |
| Application URL | ✅ Set        | `https://whatsend-lq9d.onrender.com` |
| Embedded        | ✅ True       | Embedded app configuration           |
| API Version     | ✅ Set        | `2025-01`                            |
| OAuth Redirects | ✅ Configured | Auth callback URLs set               |
| GDPR Webhooks   | ✅ Configured | All 3 mandatory webhooks implemented |

### ✅ Completed Action Items

- [x] **GDPR Webhooks Added** (December 26, 2024)
  - `customers/data_request` - Returns customer data on request
  - `customers/redact` - Deletes customer personal data
  - `shop/redact` - Deletes all shop data 48 hours after uninstall
- [ ] Verify all environment variables in Render
- [ ] Test OAuth flow on production URL
- [ ] Ensure webhook endpoints are accessible
- [ ] Deploy configuration with `shopify app deploy`

---

## Resources

- [Shopify App Store Requirements](https://shopify.dev/docs/apps/store/requirements)
- [Shopify Partner Program](https://partners.shopify.com)
- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge)
- [Polaris Design System](https://polaris.shopify.com)
- [OAuth Implementation](https://shopify.dev/docs/apps/auth/oauth)
- [GDPR Webhooks](https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks)
- [Billing API](https://shopify.dev/docs/apps/billing)

---

> **Note**: This checklist is based on Shopify's official documentation as of December 2024. Requirements may change - always refer to the latest [Shopify Developer Documentation](https://shopify.dev) for updates.
