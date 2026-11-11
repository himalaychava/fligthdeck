# Changelog

All notable changes to the IBM Expert Labs Control Plane project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-05-27

### 🎉 Initial Release

First production-ready release of the IBM Expert Labs System Health Assurance Control Plane.

### ✨ Added

#### Geographic Hierarchy System
- Complete Geo/Market structure with 4 Geos and 15 Markets
- GeoMarkets Excel sheet for centralized market management
- Cascading filters: Geo → Market → Tier in client selector
- Data validation ensuring market belongs to correct geo
- Market filter in Global View dashboard
- All markets available in filters (not just markets with active clients)
- Geographic constants in `src/constants/markets.ts` with helper functions

#### Tier-Based KPI System
- Separate KPI score sheets per tier (BronzeKPIScores, SilverKPIScores, GoldKPIScores)
- Mandatory vs Optional KPIs per tier:
  - **Bronze**: 4 mandatory (product_adoption, value_realization, engagement, csat), 2 optional
  - **Silver**: 5 mandatory (all Bronze + risk_awareness), 4 optional
  - **Gold**: 6 mandatory (all Silver + sla_compliance, feature_adoption), all optional available
- KPIClientConfig sheet for tracking enabled optional KPIs per client
- Historical data preservation when KPIs are disabled
- Complete audit trail with all checkpoint history
- Tier-specific KPI rules in `src/lib/kpiTierRules.ts`

#### Product Health Monitoring
- Standardized Product Risk Intelligence KPIs:
  - Product Version tracking
  - Pending Fixpack/Patches monitoring
  - OS version/Patches status
  - Pending Security Vulnerabilities assessment
- Health Check Tool integration with external link
- Live integration metrics display
- Product-specific recommendations engine
- Case volume tracking with monthly trends
- Stability and performance metrics

#### UI/UX Enhancements
- Current Account badge on all client pages showing active client context
- Improved client selector with Geo and Tier filters (Market removed from nav)
- Enhanced KPI trend visualization with historical charts
- Better empty state handling for markets with no clients
- Responsive layout improvements
- Loading states and error handling

#### PDF Export Functionality
- Single-page export for any client view
- Full multi-section client reports
- High-quality output with 2x pixel ratio
- Automatic multi-page pagination for long content
- WYSIWYG rendering matching screen appearance
- Smart element hiding with `data-hide-in-report` attribute
- Export library: jsPDF + html-to-image

#### Global View Dashboard
- Portfolio-wide metrics aggregation
- Total customers, revenue (ARR/ACV/TCV), NRR% tracking
- Tier breakdown visualization
- KPI averages across 7 key metrics
- Sortable, searchable client table
- Geo and Market filtering
- Empty state handling for filtered views

#### Data Management
- Excel data integration with XLSX library (SheetJS)
- JSON data source support
- API-ready architecture with data adapters
- Data validation and integrity checks
- Migration scripts for data updates
- Demo data generation script

#### Authentication & Authorization
- Role-based access control (management, delivery, customer)
- Route protection with TanStack Router
- Context-based authentication state
- Demo credentials for testing
- SSO-ready architecture

#### Documentation
- Comprehensive README with all features
- IBM GitHub Enterprise setup guide
- General Git setup guide
- Demo script for presentations
- Inline code documentation
- Architecture diagrams and explanations

### 🔧 Technical Improvements

#### Performance
- Optimized React rendering with useMemo and useCallback
- Efficient data filtering and aggregation
- Lazy loading for heavy components
- Code splitting with TanStack Router

#### Code Quality
- TypeScript strict mode enabled
- ESLint configuration with IBM standards
- Prettier for consistent formatting
- Comprehensive type definitions
- Error boundaries and error handling

#### Developer Experience
- Hot module replacement with Vite
- Fast build times
- Clear project structure
- Reusable component library
- Utility functions and helpers

### 📦 Dependencies

#### Core
- React 19.2.0
- TypeScript 5.8.3
- Vite 7.3.1
- TanStack Router 1.168.25
- TanStack React Query 5.83.0

#### UI & Design
- @carbon/react 1.107.1
- @carbon/icons-react 11.80.0
- @carbon/styles 1.106.0
- Tailwind CSS 4.2.1
- Radix UI components

#### Data & Visualization
- xlsx 0.18.5 (SheetJS)
- recharts 3.8.1
- date-fns 4.1.0

#### PDF Export
- jspdf 4.2.1
- html-to-image 1.11.13
- html2canvas 1.4.1

#### Forms & Validation
- react-hook-form 7.71.2
- zod 3.24.2
- @hookform/resolvers 5.2.2

### 🗂️ File Structure

```
control-plane/
├── public/data/              # Excel and JSON data sources
├── scripts/                  # Data generation and migration
├── src/
│   ├── components/          # React components
│   ├── constants/           # Configuration constants
│   ├── contexts/            # React Context providers
│   ├── data/                # Type definitions
│   ├── demo-integration/    # Data source adapters
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utility functions
│   ├── routes/              # TanStack Router pages
│   ├── server/              # Server-side logic
│   └── services/            # Business logic
├── README.md                # Main documentation
├── CHANGELOG.md             # This file
├── DEMO_SCRIPT.md           # Demo walkthrough
├── GIT_SETUP_GUIDE.md       # Git setup instructions
└── IBM_GITHUB_SETUP.md      # IBM GitHub guide
```

### 🔒 Security

- No credentials in codebase
- .gitignore configured for sensitive files
- Environment variables support with .env.example
- Role-based access control
- Data validation and sanitization

### 🐛 Known Issues

None at this time.

### 📝 Notes

- This is the first production-ready release
- All core features are implemented and tested
- Ready for deployment to IBM infrastructure
- Backend integration points are clearly defined
- Documentation is comprehensive and up-to-date

---

## [Unreleased]

### Planned Features

- [ ] Real-time notifications system
- [ ] Advanced analytics dashboard
- [ ] Custom report builder
- [ ] Mobile responsive improvements
- [ ] Dark mode support
- [ ] Multi-language support
- [ ] Advanced search and filtering
- [ ] Bulk data import/export
- [ ] Audit log viewer
- [ ] User preferences and settings

### Future Integrations

- [ ] IBM Db2 database connection
- [ ] SAP integration for financial data
- [ ] Salesforce CRM integration
- [ ] IBM w3ID SSO authentication
- [ ] Customer portal Auth0 integration
- [ ] Slack notifications
- [ ] Email alerts and reports
- [ ] API documentation with Swagger

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-05-27 | Initial production release |

---

## Migration Guide

### From Mock Data to Live Backend

When connecting to a real backend:

1. **Update Data Source**:
   ```typescript
   // In src/demo-integration/useDemoData.ts
   export const DEMO_SOURCE = 'api';
   ```

2. **Implement API Calls**:
   ```typescript
   // In src/services/clientService.ts
   export async function fetchClients() {
     const response = await fetch('/api/clients');
     return response.json();
   }
   ```

3. **No UI Changes Required**: All components use the service layer

### From Excel to Database

1. **Map Excel Sheets to Database Tables**:
   - ClientOverview → clients table
   - KPIScores → kpi_scores table
   - GeoMarkets → geo_markets table
   - etc.

2. **Update Data Adapters**:
   - Modify `src/demo-integration/dataAdapters.ts`
   - Transform API responses to match expected format

3. **Test Thoroughly**: Use the same mock data for comparison

---

## Support

For questions, issues, or contributions:

- **Repository**: https://github.ibm.com/Niranjan-K6/expert-labs-control-plane
- **Issues**: Create an issue on IBM GitHub
- **Email**: niranjan.k6@ibm.com

---

**Maintained by**: IBM Expert Labs Team  
**Last Updated**: May 27, 2026