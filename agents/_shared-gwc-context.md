# Gujarat Watch Company Shared Context

## Business Goal
Company: Gujarat Watch Company, gujaratwatch.in.
Current planning date: May 2026.
Primary goal: INR 100,000 revenue in 90 days.
Daily target: INR 1,111 average.
Weekly target: INR 7,777.
Monthly target: INR 33,333.

## Business Model
Three-tier watch marketplace:
- Tier 1, Style-Inspired: 20% margin, international design inspiration, affordable pricing.
- Tier 2, Local Brands: 15% margin, regional Indian brands and heritage focus.
- Tier 3, Original/Luxury: 10% margin, premium and exclusive collections.

## Platform Stack
- Website: gujaratwatch.in
- Hosting: InfinityFree free tier, PHP/MySQL.
- Database host: sql311.infinityfree.com
- Database name: if0_41421200_gwcdb
- Payment: Razorpay. Test keys exist; live keys required for real revenue.
- Shipping: Shiprocket API, ymvgroups@gmail.com account.
- Seller portal: gujaratwatch.in/seller
- Admin panel: seller/product approval system.

## Revenue Roadmap
Month 1: foundation and quick wins. Target INR 33,333. Focus on daily content rhythm, early influencer partnerships, ads testing, credibility, and identifying winning products.
Month 2: growth and optimization. Target INR 33,333. Focus on scaling winning ads, micro-influencers, email list, repeat customers, and 2-3% conversion.
Month 3: optimization and sustainability. Target INR 33,334. Focus on premium segment, brand authority, sustainable systems, and INR 100,000 milestone.

## Daily CEO Dashboard KPIs
- Revenue: target INR 1,111/day.
- Orders: target 3-5/day.
- Website traffic: target 100+ visitors/day.
- Instagram reach: target 5,000+/day.
- Conversion rate: target 2-3%.
- Average order value: target INR 2,200.

## Weekly KPIs
- Revenue: target INR 7,777/week.
- Orders: target 20-35/week.
- Website traffic: target 700+/week.
- Instagram followers: target +50/week.
- Influencer sales: target 15-20% of revenue.
- Ad spend: target INR 3,500/week.
- Ad ROAS: target 3:1+.
- Customer satisfaction: target 4.5+/5.

## Monthly KPIs
- Revenue: target INR 33,333/month.
- Orders: target 60-100/month.
- Repeat customer rate: target 10-15%.
- Email subscriber growth: +100/month.
- Instagram follower growth: +200/month.
- Influencer count growth: +5-10/month.
- CAC: target below INR 500.
- CLV: target above INR 5,000.
- Gross margin: target 30-35%.
- Net profit: target 5-10%.

## Daily Operating Rhythm
- 8:00 AM: CEO checks overnight orders, revenue, urgent issues, and priorities.
- 9:00 AM: 15 minute team standup with department heads.
- 9:30 AM: marketing content approval.
- 10:00 AM: sales check-in and objection pattern review.
- 12:00 PM: operations status check.
- 3:00 PM: analytics and ad performance check.
- 5:00 PM: revenue review and tomorrow content approval.
- 7:00 PM: social engagement and VIP DM check.
- 9:00 PM: night content post and engagement monitoring.

## Cross-Functional Rules
- CEO is final approver for strategy, seller approvals, content approval, and procurements above INR 5,000.
- Marketing owns traffic, reach, creative, influencers, and paid campaigns.
- Sales owns WhatsApp/Instagram DM conversion and revenue closure.
- Support owns customer satisfaction, tickets, returns, and FAQ updates.
- Operations owns inventory, dispatch, Shiprocket process, packaging, QC, and delivery performance.
- Procurement owns vendor sourcing, POs, supplier scorecards, and stock purchase follow-up.
- Tech owns uptime, PHP/MySQL system health, Razorpay, Shiprocket, automation, data reports, and backups.
- Finance owns Razorpay reconciliation, ad spend, vendor payments, influencer commissions, cashflow, GST records, and monthly reporting.

## Brand And Content Guidelines
- Brand colors: Black #1a1a1a, Gold #FFD700, Silver #C0C0C0, Navy #001F3F, Copper #B87333.
- Fonts: Poppins for headings, Inter for body.
- Core hashtags: #GujaratWatchCo #WatchesOfIndia #LuxuryWatches #Timepieces #WatchLovers #StyleStatement #IndianCrafts #AffordableLuxury #WatchOfTheDay #TimeToShine #GujaratMade
- Instagram optimal posting times: 9 AM, 1 PM, 6 PM, 9 PM.

## Technical Notes For Website Work
- Always use document root for PHP include paths: $_SERVER['DOCUMENT_ROOT'] . '/includes/auth.php'
- API files should start with output buffering, disable display errors, and return clean JSON.
- Helper functions such as e() should be declared once with function_exists guards.
- InfinityFree API calls should use POST JSON, not GET query strings.
- Shiprocket token should be cached in sr_token_cache and refreshed every 24 hours.
