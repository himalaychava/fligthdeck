import { PieChart } from '@carbon/charts-react';
import '@carbon/charts-react/styles.css';
import type { ProductCaseInsights } from '@/demo-integration/salesforceCaseAdapter';

interface SalesforceCaseInsightsProps {
  productInsights: ProductCaseInsights;
}

export function SalesforceCaseInsights({ productInsights }: SalesforceCaseInsightsProps) {
  const { severityBreakdown, statusBreakdown, totalCases } = productInsights;

  // Prepare data for Severity pie chart
  const severityData = [
    { group: 'Sev1 - Critical', value: severityBreakdown.sev1 },
    { group: 'Sev2 - Significant', value: severityBreakdown.sev2 },
    { group: 'Sev3 - Moderate', value: severityBreakdown.sev3 },
    { group: 'Sev4 - Minimal', value: severityBreakdown.sev4 },
  ].filter(item => item.value > 0); // Only show non-zero values

  // Prepare data for Status pie chart
  const statusData = [
    { group: 'Open', value: statusBreakdown.open },
    { group: 'Closed', value: statusBreakdown.closed },
  ].filter(item => item.value > 0);

  const severityOptions = {
    title: 'Cases by Severity',
    resizable: true,
    height: '350px',
    pie: {
      alignment: 'center',
      labels: {
        enabled: true,
        formatter: (dataPoint: any) => {
          return `${dataPoint.value} (${((dataPoint.value / totalCases) * 100).toFixed(0)}%)`;
        },
      },
    },
    color: {
      scale: {
        'Sev1 - Critical': '#da1e28', // Red
        'Sev2 - Significant': '#ff832b', // Orange
        'Sev3 - Moderate': '#f1c21b', // Yellow
        'Sev4 - Minimal': '#24a148', // Green
      },
    },
    legend: {
      enabled: true,
      position: 'bottom',
      alignment: 'center',
    },
    toolbar: {
      enabled: false,
    },
    theme: 'white',
  };

  const statusOptions = {
    title: 'Cases by Status',
    resizable: true,
    height: '350px',
    pie: {
      alignment: 'center',
      labels: {
        enabled: true,
        formatter: (dataPoint: any) => {
          return `${dataPoint.value} (${((dataPoint.value / totalCases) * 100).toFixed(0)}%)`;
        },
      },
    },
    color: {
      scale: {
        'Open': '#0f62fe', // Blue
        'Closed': '#198038', // Green
      },
    },
    legend: {
      enabled: true,
      position: 'bottom',
      alignment: 'center',
    },
    toolbar: {
      enabled: false,
    },
    theme: 'white',
  };

  if (totalCases === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-600">No Salesforce case data available for this product</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Salesforce Case Insights</h4>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
          {totalCases} Total Cases
        </span>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {/* Severity Breakdown */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <style>{`
            .cds--cc--chart-wrapper .cds--cc--title {
              text-align: center !important;
            }
          `}</style>
          <PieChart data={severityData} options={severityOptions} />
        </div>

        {/* Status Breakdown */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <PieChart data={statusData} options={statusOptions} />
        </div>
      </div>
    </div>
  );
}

// Made with Bob
