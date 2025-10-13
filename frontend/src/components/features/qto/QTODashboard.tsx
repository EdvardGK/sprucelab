import { useState } from 'react';
import {
  Card,
  Metric,
  Text,
  Title,
  BarChart,
  DonutChart,
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Grid,
  Flex,
  Button,
  Badge,
} from '@tremor/react';
import { Download, RefreshCw } from 'lucide-react';
import { useQTOAnalysis } from '@/hooks/use-script-execution';

interface QTODashboardProps {
  modelId: string;
}

// Type definitions for QTO analysis data
interface QTOByMaterialItem {
  name: string;
  volume_m3: number;
  area_m2: number;
  length_m: number;
  count: number;
}

interface QTOByTypeItem {
  name: string;
  count: number;
  volume_m3: number;
  area_m2: number;
}

interface QTOByStoreyItem {
  name: string;
  volume_m3: number;
  area_m2: number;
  count: number;
}

interface QTOBySystemItem {
  name: string;
  count: number;
  length_m: number;
  volume_m3: number;
}

export function QTODashboard({ modelId }: QTODashboardProps) {
  const { data, isLoading, isError, isExecuting, error, execution } = useQTOAnalysis(modelId);

  const [selectedTab, setSelectedTab] = useState(0);

  // Loading state
  if (isLoading || isExecuting) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <Title>Quantity Take-Off Analysis</Title>
          <Badge color="blue" icon={RefreshCw}>
            {isExecuting ? 'Calculating...' : 'Loading...'}
          </Badge>
        </div>

        <Grid numItemsMd={2} numItemsLg={4} className="gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <Text>Loading...</Text>
              <div className="mt-2 h-8 w-24 rounded bg-gray-700"></div>
            </Card>
          ))}
        </Grid>

        <Card className="mt-4">
          <div className="h-64 animate-pulse rounded bg-gray-700"></div>
        </Card>
      </div>
    );
  }

  // Error state
  if (isError || !data) {
    return (
      <div className="space-y-6 p-6">
        <Title>Quantity Take-Off Analysis</Title>
        <Card>
          <div className="text-center py-12">
            <Text className="text-red-500">
              {error?.message || 'Failed to load QTO analysis'}
            </Text>
            {execution?.error_message && (
              <Text className="mt-2 text-sm text-gray-400">
                {execution.error_message}
              </Text>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const summary = data.summary || {};
  const byMaterial = (data.by_material || []) as QTOByMaterialItem[];
  const byType = (data.by_type || []) as QTOByTypeItem[];
  const byStorey = (data.by_storey || []) as QTOByStoreyItem[];
  const bySystem = (data.by_system || []) as QTOBySystemItem[];

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qto-analysis-${modelId}-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <Flex justifyContent="between" alignItems="center">
        <div>
          <Title>Quantity Take-Off Analysis</Title>
          <Text className="mt-1">Construction estimation quantities by material, type, floor, and system</Text>
        </div>
        <Button
          icon={Download}
          variant="secondary"
          onClick={handleExportJSON}
        >
          Export JSON
        </Button>
      </Flex>

      {/* KPI Cards */}
      <Grid numItemsMd={2} numItemsLg={4} className="gap-4">
        <Card decoration="top" decorationColor="blue">
          <Text>Total Volume</Text>
          <Metric>{summary.total_volume_m3?.toFixed(1) || 0} m³</Metric>
          <Text className="mt-1 text-sm text-gray-400">
            {summary.elements_with_geometry || 0} elements with geometry
          </Text>
        </Card>

        <Card decoration="top" decorationColor="green">
          <Text>Total Area</Text>
          <Metric>{summary.total_area_m2?.toFixed(1) || 0} m²</Metric>
          <Text className="mt-1 text-sm text-gray-400">
            Surface and coverage elements
          </Text>
        </Card>

        <Card decoration="top" decorationColor="purple">
          <Text>Total Length</Text>
          <Metric>{summary.total_length_m?.toFixed(1) || 0} m</Metric>
          <Text className="mt-1 text-sm text-gray-400">
            MEP and linear elements
          </Text>
        </Card>

        <Card decoration="top" decorationColor="orange">
          <Text>Total Elements</Text>
          <Metric>{summary.total_count || 0}</Metric>
          <Text className="mt-1 text-sm text-gray-400">
            {summary.total_types || 0} unique types
          </Text>
        </Card>
      </Grid>

      {/* Tabbed Charts */}
      <Card>
        <TabGroup index={selectedTab} onIndexChange={setSelectedTab}>
          <TabList>
            <Tab>By Material</Tab>
            <Tab>By Type</Tab>
            <Tab>By Floor</Tab>
            <Tab>By System</Tab>
          </TabList>

          <TabPanels>
            {/* By Material */}
            <TabPanel>
              <div className="space-y-6 mt-6">
                <Flex>
                  <div className="w-2/3">
                    <Title>Volume by Material</Title>
                    <BarChart
                      className="mt-4"
                      data={byMaterial.slice(0, 10)}
                      index="name"
                      categories={["volume_m3"]}
                      colors={["blue"]}
                      valueFormatter={(value) => `${value.toFixed(1)} m³`}
                      yAxisWidth={48}
                      showLegend={false}
                    />
                  </div>
                  <div className="w-1/3 pl-6">
                    <Title>Distribution</Title>
                    <DonutChart
                      className="mt-4"
                      data={byMaterial.slice(0, 5)}
                      category="volume_m3"
                      index="name"
                      colors={["blue", "cyan", "indigo", "violet", "purple"]}
                      valueFormatter={(value) => `${value.toFixed(1)} m³`}
                    />
                  </div>
                </Flex>

                {/* Table */}
                <div className="mt-6 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Material
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Volume (m³)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Area (m²)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Length (m)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {byMaterial.map((item) => (
                        <tr key={item.name} className="hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-200">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.volume_m3.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.area_m2.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.length_m.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabPanel>

            {/* By Type */}
            <TabPanel>
              <div className="space-y-6 mt-6">
                <Title>Count by IFC Type</Title>
                <BarChart
                  className="mt-4"
                  data={byType.slice(0, 15)}
                  index="name"
                  categories={["count"]}
                  colors={["green"]}
                  valueFormatter={(value) => `${value}`}
                  yAxisWidth={120}
                  showLegend={false}
                  layout="horizontal"
                />

                <div className="mt-6 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          IFC Type
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Count
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Volume (m³)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Area (m²)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {byType.map((item) => (
                        <tr key={item.name} className="hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-200">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.count}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.volume_m3.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.area_m2.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabPanel>

            {/* By Storey */}
            <TabPanel>
              <div className="space-y-6 mt-6">
                <Title>Quantities by Floor Level</Title>
                <BarChart
                  className="mt-4"
                  data={byStorey}
                  index="name"
                  categories={["volume_m3"]}
                  colors={["purple"]}
                  valueFormatter={(value) => `${value.toFixed(1)} m³`}
                  yAxisWidth={80}
                  showLegend={false}
                />

                <div className="mt-6 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Floor
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Volume (m³)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Area (m²)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {byStorey.map((item) => (
                        <tr key={item.name} className="hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-200">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.volume_m3.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.area_m2.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabPanel>

            {/* By System */}
            <TabPanel>
              <div className="space-y-6 mt-6">
                <Title>Quantities by System</Title>
                {bySystem.length > 0 ? (
                  <>
                    <BarChart
                      className="mt-4"
                      data={bySystem}
                      index="name"
                      categories={["count"]}
                      colors={["orange"]}
                      valueFormatter={(value) => `${value} elements`}
                      yAxisWidth={120}
                      showLegend={false}
                      layout="horizontal"
                    />

                    <div className="mt-6 overflow-auto">
                      <table className="min-w-full divide-y divide-gray-700">
                        <thead>
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                              System
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Count
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Length (m)
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Volume (m³)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {bySystem.map((item) => (
                            <tr key={item.name} className="hover:bg-gray-800/50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-200">
                                {item.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-300">
                                {item.count}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-300">
                                {item.length_m.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-300">
                                {item.volume_m3.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <Card>
                    <Text className="text-center py-8 text-gray-400">
                      No system data available. Elements are not assigned to systems.
                    </Text>
                  </Card>
                )}
              </div>
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </Card>

      {/* Summary Statistics */}
      <Card>
        <Title>Analysis Summary</Title>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-400">Total Elements</dt>
            <dd className="text-2xl font-semibold text-gray-200">{summary.total_count}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">With Geometry</dt>
            <dd className="text-2xl font-semibold text-green-500">
              {summary.elements_with_geometry}
              <span className="text-sm text-gray-400 ml-2">
                ({((summary.elements_with_geometry / summary.total_count) * 100).toFixed(1)}%)
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Without Geometry</dt>
            <dd className="text-2xl font-semibold text-orange-500">
              {summary.elements_without_geometry}
              <span className="text-sm text-gray-400 ml-2">
                ({((summary.elements_without_geometry / summary.total_count) * 100).toFixed(1)}%)
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Unique Types</dt>
            <dd className="text-2xl font-semibold text-gray-200">{summary.total_types}</dd>
          </div>
        </dl>
      </Card>

      {/* Execution Info */}
      {execution && (
        <Card>
          <Flex justifyContent="between" alignItems="center">
            <Text className="text-sm text-gray-400">
              Analysis completed in {execution.duration_ms}ms
            </Text>
            <Text className="text-sm text-gray-400">
              {new Date(execution.completed_at || '').toLocaleString()}
            </Text>
          </Flex>
        </Card>
      )}
    </div>
  );
}
