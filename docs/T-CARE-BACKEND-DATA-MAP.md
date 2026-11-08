# T-CARE Backend Data Map — Frontend-to-Domain Trace

This map is derived from the current `T-care-optimized(2).zip` frontend and is used to prevent backend scope drift.

| Existing frontend workflow | Backend domain |
|---|---|
| Sign in / Create account | User, RefreshSession, authentication |
| Customer profile / saved preferences | CustomerProfile, User |
| Saved addresses | Address |
| My Plants | Plant, PlantPhoto, PlantCareRecord |
| Plant Detail / Care plan / History | Plant, PlantCareRecord, ServiceReport |
| Services catalog | Service, ServicePrice |
| Multi-step booking | Booking, BookingPlant, Address, ServicePrice |
| Booking confirmation | Booking, Payment |
| My Visits | Booking, BookingStatusHistory |
| Booking Detail | Booking, GardenerAssignment, Payment, ServiceReport |
| Tracking | BookingStatusHistory, GardenerAssignment |
| Gardener jobs | GardenerProfile, GardenerAssignment, Booking |
| Gardener accept/start/complete | GardenerAssignment, BookingStatusHistory |
| Checklist / observations / photos | ServiceReport, ServiceChecklistItem, ServiceReportPhoto |
| Health report | ServiceReport, PlantCareRecord |
| Subscriptions / Plan | SubscriptionPlan, Subscription |
| Billing / refunds | Payment, Refund |
| Inbox | Notification |
| Reviews | Review |
| Report issue | IssueReport |
| Admin customers | User, CustomerProfile |
| Admin gardeners / access / KYC | User, GardenerProfile |
| Admin booking assignment | Booking, GardenerAssignment |
| Admin services / pricing | Service, ServicePrice |
| Admin plans | SubscriptionPlan |
| Admin plant database | PlantKnowledge |
| Admin finance / payouts | Payment, Refund, Payout |
| Admin analytics | Derived queries across operational tables |
| Admin CMS | CmsContent |
| Cross-role booking state | Booking + BookingStatusHistory + GardenerAssignment |
