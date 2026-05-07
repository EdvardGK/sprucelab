import { DashboardGrid, DashboardTile } from '@/components/Layout';

const layout = {
  rows: 3,
  cols: 4,
  layout: [
    ['kpi-a', 'kpi-b', 'kpi-c', 'kpi-d'],
    ['chart',  'chart',  'side',  'side' ],
    ['table',  'table',  'table', 'detail'],
  ],
};

export default function GridDemo() {
  return (
    <div className="h-screen w-screen p-6 bg-background">
      <h1 className="mb-3 text-xl font-semibold text-text-primary">DashboardGrid demo</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Resize the window: ≥1024px = 4-col grid, 768–1023px = 2-col, &lt;768px = stacked.
      </p>
      <div className="h-[calc(100%-6rem)]">
        <DashboardGrid layout={layout} debug>
          <DashboardTile id="kpi-a"><Pad>KPI A</Pad></DashboardTile>
          <DashboardTile id="kpi-b"><Pad>KPI B</Pad></DashboardTile>
          <DashboardTile id="kpi-c" variant="highlight"><Pad>KPI C (highlight)</Pad></DashboardTile>
          <DashboardTile id="kpi-d"><Pad>KPI D</Pad></DashboardTile>
          <DashboardTile id="chart"><Pad>Chart (2x1)</Pad></DashboardTile>
          <DashboardTile id="side" variant="accent"><Pad>Side (2x1, accent)</Pad></DashboardTile>
          <DashboardTile id="table"><Pad>Table (3x1)</Pad></DashboardTile>
          <DashboardTile id="detail"><Pad>Detail (1x1)</Pad></DashboardTile>
        </DashboardGrid>
      </div>
    </div>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-4 text-sm font-mono text-text-secondary">
      {children}
    </div>
  );
}
