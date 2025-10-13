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
  ProgressBar,
} from '@tremor/react';
import { Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { useMMIAnalysis } from '@/hooks/use-script-execution';
import { useModel } from '@/hooks/use-models';
import { useProjectBEP, mmiLevelToTremorColor, getMaxMMILevel } from '@/hooks/use-bep';

interface MMIDashboardProps {
  modelId: string;
}

// Type definitions for MMI analysis data
interface MMIDistributionItem {
  mmi: number;
  count: number;
  percentage: number;
}

interface MMIByTypeItem {
  name: string;
  count: number;
  avg_mmi: number;
  avg_geometry_score: number;
  avg_information_score: number;
}

interface MMIByStoreyItem {
  name: string;
  count: number;
  avg_mmi: number;
}

interface MMIBySystemItem {
  name: string;
  count: number;
  avg_mmi: number;
}

interface MMIGapItem {
  guid: string;
  name: string;
  type: string;
  storey: string;
  mmi: number;
  missing: string[];
}

export function MMIDashboard({ modelId }: MMIDashboardProps) {
  // Fetch model to get project ID
  const { data: model } = useModel(modelId);

  // Fetch project BEP to get MMI scale
  const { data: bep } = useProjectBEP(model?.project || '');

  // Get MMI scale from BEP
  const mmiScale = bep?.mmi_scale || [];
  const maxMMI = getMaxMMILevel(mmiScale);

  // Fetch MMI analysis data
  const { data, isLoading, isError, isExecuting, error, execution } = useMMIAnalysis(modelId);

  const [selectedTab, setSelectedTab] = useState(0);

  // Loading state
  if (isLoading || isExecuting) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <Title>MMI Analysis - Norwegian Model Maturity Index</Title>
          <Badge color="blue" icon={RefreshCw}>
            {isExecuting ? 'Analyzing...' : 'Loading...'}
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
        <Title>MMI Analysis - Norwegian Model Maturity Index</Title>
        <Card>
          <div className="text-center py-12">
            <Text className="text-red-500">
              {error?.message || 'Failed to load MMI analysis'}
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

  const overallMMI = data.overall_mmi || 1;
  const overallDescription = data.overall_description || '';
  const targetMMI = data.target_mmi || 6;
  const elementsBelowTarget = data.elements_below_target || 0;
  const progressPercentage = data.progress_percentage || 0;
  const mmiDistribution = (data.mmi_distribution || []) as MMIDistributionItem[];
  const byType = (data.by_type || []) as MMIByTypeItem[];
  const byStorey = (data.by_storey || []) as MMIByStoreyItem[];
  const bySystem = (data.by_system || []) as MMIBySystemItem[];
  const gaps = (data.gaps || []) as MMIGapItem[];

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mmi-analysis-${modelId}-${new Date().toISOString()}.json`;
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
          <Title>MMI Analysis - Norwegian Model Maturity Index</Title>
          <Text className="mt-1">
            {bep
              ? `Model maturity based on ${bep.name} (MMI ${Math.min(...mmiScale.map(d => d.mmi_level))}-${Math.max(...mmiScale.map(d => d.mmi_level))})`
              : 'Model maturity based on buildingSMART Norge standards'}
          </Text>
        </div>
        <Button
          icon={Download}
          variant="secondary"
          onClick={handleExportJSON}
        >
          Export JSON
        </Button>
      </Flex>

      {/* Overall MMI and Distribution */}
      <Grid numItemsMd={2} className="gap-6">
        {/* Overall MMI Gauge */}
        <Card decoration="top" decorationColor={mmiLevelToTremorColor(overallMMI, mmiScale)}>
          <Flex alignItems="center" justifyContent="between">
            <div>
              <Text>Overall Model Maturity</Text>
              <Metric className="mt-2">MMI {overallMMI}</Metric>
              <Text className="mt-1 text-gray-400">{overallDescription}</Text>
              <div className="mt-4">
                <Text className="text-sm">Scores:</Text>
                <Text className="text-sm text-gray-400">
                  Geometry: {data.avg_geometry_score?.toFixed(1)}/350
                </Text>
                <Text className="text-sm text-gray-400">
                  Information: {data.avg_information_score?.toFixed(1)}/350
                </Text>
              </div>
            </div>
            <DonutChart
              data={mmiDistribution.map(item => ({ mmi: `MMI ${item.mmi}`, count: item.count }))}
              category="count"
              index="mmi"
              colors={mmiDistribution.map(item => mmiLevelToTremorColor(item.mmi, mmiScale))}
              className="w-40"
            />
          </Flex>
        </Card>

        {/* Progress to Target */}
        <Card decoration="top" decorationColor={progressPercentage >= 90 ? 'green' : 'orange'}>
          <Title>Progress to MMI {targetMMI} (Detailed Design)</Title>
          <Metric className="mt-2">{progressPercentage.toFixed(1)}%</Metric>

          <ProgressBar
            value={progressPercentage}
            color={progressPercentage >= 90 ? 'green' : progressPercentage >= 70 ? 'yellow' : 'red'}
            className="mt-4"
          />

          <Flex className="mt-4" justifyContent="between">
            <Text className="text-sm text-gray-400">
              {elementsBelowTarget} elements below target
            </Text>
            <Text className="text-sm text-gray-400">
              {data.total_elements - elementsBelowTarget} elements at target
            </Text>
          </Flex>

          {elementsBelowTarget > 0 && (
            <Badge icon={AlertTriangle} color="orange" className="mt-4">
              {elementsBelowTarget} elements need improvement
            </Badge>
          )}
        </Card>
      </Grid>

      {/* MMI Distribution Chart */}
      <Card>
        <Title>MMI Distribution Across Model</Title>
        <Flex className="mt-4 space-x-4">
          <div className="flex-1">
            <BarChart
              data={mmiDistribution}
              index="mmi"
              categories={["count"]}
              colors={["blue"]}
              valueFormatter={(value) => `${value} elements`}
              yAxisWidth={48}
              showLegend={false}
            />
          </div>
          <div className="w-1/3">
            <div className="space-y-2">
              {mmiDistribution.map((item) => (
                <Flex key={item.mmi} justifyContent="between" alignItems="center">
                  <Badge color={mmiLevelToTremorColor(item.mmi, mmiScale)}>
                    MMI {item.mmi}
                  </Badge>
                  <Text>{item.count} ({item.percentage}%)</Text>
                </Flex>
              ))}
            </div>
          </div>
        </Flex>
      </Card>

      {/* Tabbed Breakdowns */}
      <Card>
        <TabGroup index={selectedTab} onIndexChange={setSelectedTab}>
          <TabList>
            <Tab>By Type</Tab>
            <Tab>By Floor</Tab>
            <Tab>By System</Tab>
            <Tab>Gap Analysis</Tab>
          </TabList>

          <TabPanels>
            {/* By Type */}
            <TabPanel>
              <div className="space-y-6 mt-6">
                <Title>Average MMI by Element Type</Title>
                <BarChart
                  className="mt-4"
                  data={byType.slice(0, 15)}
                  index="name"
                  categories={["avg_mmi"]}
                  colors={["green"]}
                  valueFormatter={(value) => `MMI ${value.toFixed(1)}`}
                  yAxisWidth={120}
                  showLegend={false}
                  layout="horizontal"
                  minValue={0}
                  maxValue={maxMMI}
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
                          Avg MMI
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Geometry Score
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Info Score
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
                          <td className="px-4 py-3 text-sm text-right">
                            <Badge color={mmiLevelToTremorColor(Math.round(item.avg_mmi), mmiScale)}>
                              MMI {item.avg_mmi}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.avg_geometry_score}/350
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-300">
                            {item.avg_information_score}/350
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
                <Title>Average MMI by Floor Level</Title>
                <BarChart
                  className="mt-4"
                  data={byStorey}
                  index="name"
                  categories={["avg_mmi"]}
                  colors={["purple"]}
                  valueFormatter={(value) => `MMI ${value.toFixed(1)}`}
                  yAxisWidth={80}
                  showLegend={false}
                  minValue={0}
                  maxValue={maxMMI}
                />

                <div className="mt-6 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Floor
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Count
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Avg MMI
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
                            {item.count}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <Badge color={mmiLevelToTremorColor(Math.round(item.avg_mmi), mmiScale)}>
                              MMI {item.avg_mmi}
                            </Badge>
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
                <Title>Average MMI by System</Title>
                {bySystem.length > 0 ? (
                  <>
                    <BarChart
                      className="mt-4"
                      data={bySystem}
                      index="name"
                      categories={["avg_mmi"]}
                      colors={["orange"]}
                      valueFormatter={(value) => `MMI ${value.toFixed(1)}`}
                      yAxisWidth={120}
                      showLegend={false}
                      layout="horizontal"
                      minValue={0}
                      maxValue={maxMMI}
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
                              Avg MMI
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
                              <td className="px-4 py-3 text-sm text-right">
                                <Badge color={mmiLevelToTremorColor(Math.round(item.avg_mmi), mmiScale)}>
                                  MMI {item.avg_mmi}
                                </Badge>
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

            {/* Gap Analysis */}
            <TabPanel>
              <div className="space-y-6 mt-6">
                <Flex justifyContent="between" alignItems="center">
                  <div>
                    <Title>Elements Below Target MMI {targetMMI}</Title>
                    <Text className="mt-1 text-gray-400">
                      {gaps.length} elements need improvement to reach {targetMMI}
                    </Text>
                  </div>
                  {gaps.length > 0 && (
                    <Badge icon={AlertTriangle} color="orange" size="xl">
                      {gaps.length} gaps identified
                    </Badge>
                  )}
                </Flex>

                {gaps.length > 0 ? (
                  <div className="mt-6 overflow-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Element
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Floor
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Current MMI
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Missing
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {gaps.map((gap, index) => (
                          <tr key={gap.guid || index} className="hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-200 max-w-xs truncate">
                              {gap.name}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {gap.type}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {gap.storey}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <Badge color={mmiLevelToTremorColor(gap.mmi, mmiScale)}>
                                MMI {gap.mmi}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-400">
                              <div className="flex gap-1 flex-wrap">
                                {gap.missing.map((item: string) => (
                                  <Badge key={item} color="red" size="sm">
                                    {item.replace('_', ' ')}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {gaps.length >= 50 && (
                      <Text className="mt-4 text-center text-gray-400">
                        Showing first 50 of {elementsBelowTarget} elements below target
                      </Text>
                    )}
                  </div>
                ) : (
                  <Card>
                    <div className="text-center py-12">
                      <Text className="text-green-500 text-lg">
                        ✅ All elements meet or exceed MMI {targetMMI}!
                      </Text>
                      <Text className="mt-2 text-gray-400">
                        Your model has excellent maturity across all elements.
                      </Text>
                    </div>
                  </Card>
                )}
              </div>
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </Card>

      {/* MMI Scale Reference */}
      <Card>
        <Title>
          {bep ? `${bep.name} - MMI Scale` : 'MMI Scale Reference (buildingSMART Norge)'}
        </Title>
        {mmiScale.length > 0 ? (
          <dl className="mt-4 space-y-2">
            {mmiScale.slice(0, 10).map((def) => (
              <div key={def.id} className="flex items-start justify-between p-3 bg-gray-800/30 rounded">
                <div className="flex items-center gap-2">
                  <Badge color={mmiLevelToTremorColor(def.mmi_level, mmiScale)}>
                    MMI {def.mmi_level}
                  </Badge>
                  <div>
                    <Text className="font-medium">{def.name}</Text>
                    {def.name_en && (
                      <Text className="text-xs text-gray-500">{def.name_en}</Text>
                    )}
                  </div>
                </div>
                <Text className="text-sm text-gray-400 max-w-md text-right">
                  {def.description.split('.')[0] || def.description}
                </Text>
              </div>
            ))}
            {mmiScale.length > 10 && (
              <Text className="text-center text-sm text-gray-500 pt-2">
                Showing 10 of {mmiScale.length} MMI levels
              </Text>
            )}
          </dl>
        ) : (
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded">
              <Text className="text-gray-400">
                No BEP configuration found for this project. Using default MMI scale.
              </Text>
            </div>
          </dl>
        )}
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
