// app/dashboard/analytics/page.tsx - Comprehensive Analytics Dashboard for ChatCraft Studio

"use client"

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Users, 
  MessageCircle, 
  Clock, 
  Target,
  Activity,
  Zap,
  Globe,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  CheckCircle2,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  MoreHorizontal,
  PieChart,
  LineChart,
  BarChart,
  Settings,
  Share,
  Bookmark,
  Bell,
  Info
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { formatDistanceToNow, format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { toast } from '@/hooks/use-toast'

// Import hooks and real-time updates
import {
  useAnalyticsDashboard,
  useConversationAnalytics,
  usePerformanceAnalytics,
  useDeployments,
  useChatSessions
} from '@/hooks/api'
import { useAnalyticsWebSocket } from '@/hooks/use-websocket'
import type {
  AnalyticsDashboard as AnalyticsData,
  ConversationAnalytics,
  PerformanceAnalytics,
  TimeSeriesData,
  TopicMetrics,
  ChannelMetrics
} from '@/types'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
)

/**
 * ========================================================================
 * ANALYTICS CONFIGURATION & TYPES
 * ========================================================================
 */

type TimeRange = '24h' | '7d' | '30d' | '90d' | 'custom'
type MetricType = 'conversations' | 'messages' | 'users' | 'satisfaction' | 'response_time'
type ViewType = 'overview' | 'conversations' | 'performance' | 'insights'

interface AnalyticsFilters {
  timeRange: TimeRange
  deploymentId?: string
  customDateRange?: { from: Date; to: Date }
  metricType: MetricType
}

interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: React.ReactNode
  color?: string
  trend?: 'up' | 'down' | 'neutral'
  loading?: boolean
}

interface ChartCardProps {
  title: string
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
  loading?: boolean
}

interface TopicInsight {
  topic: string
  frequency: number
  satisfaction: number
  trend: 'up' | 'down' | 'neutral'
  change: number
}

interface UserJourney {
  step: string
  users: number
  conversion: number
  dropOff: number
}

/**
 * ========================================================================
 * CHART CONFIGURATIONS
 * ========================================================================
 */

const chartColors = {
  primary: '#2563eb',
  secondary: '#10b981',
  accent: '#f59e0b',
  danger: '#ef4444',
  warning: '#f97316',
  info: '#06b6d4',
  success: '#22c55e',
  muted: '#6b7280',
}

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    },
  },
  scales: {
    x: {
      display: true,
      grid: {
        display: false,
      },
    },
    y: {
      display: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.1)',
      },
    },
  },
  elements: {
    line: {
      tension: 0.4,
    },
    point: {
      radius: 4,
      hoverRadius: 6,
    },
  },
}

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    x: {
      display: true,
      grid: {
        display: false,
      },
    },
    y: {
      display: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.1)',
      },
    },
  },
}

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
  },
  cutout: '70%',
}

/**
 * ========================================================================
 * UTILITY FUNCTIONS
 * ========================================================================
 */

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

const formatPercentage = (num: number): string => {
  return (num * 100).toFixed(1) + '%'
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const getTrendIcon = (trend: 'up' | 'down' | 'neutral', change: number) => {
  if (trend === 'up') return <ArrowUpRight className="h-4 w-4 text-green-500" />
  if (trend === 'down') return <ArrowDownRight className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-gray-500" />
}

const getTimeRangeLabel = (range: TimeRange): string => {
  switch (range) {
    case '24h': return 'Last 24 Hours'
    case '7d': return 'Last 7 Days'
    case '30d': return 'Last 30 Days'
    case '90d': return 'Last 90 Days'
    case 'custom': return 'Custom Range'
    default: return 'Last 7 Days'
  }
}

/**
 * ========================================================================
 * SUB-COMPONENTS
 * ========================================================================
 */

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  icon,
  color = 'bg-primary',
  trend = 'neutral',
  loading = false
}) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn("p-2 rounded-lg", color)}>
          <div className="text-white">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-8 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {change !== undefined && (
              <div className="flex items-center text-xs text-muted-foreground">
                {getTrendIcon(trend, change)}
                <span className={cn(
                  "ml-1",
                  trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600'
                )}>
                  {Math.abs(change).toFixed(1)}% {changeLabel || 'vs last period'}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  description,
  children,
  actions,
  loading = false
}) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && (
              <CardDescription>{description}</CardDescription>
            )}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 bg-muted rounded animate-pulse" />
        ) : (
          <div className="h-64">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const InsightCard: React.FC<{
  insight: TopicInsight
}> = ({ insight }) => {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex-1">
        <h4 className="font-medium">{insight.topic}</h4>
        <div className="flex items-center space-x-4 mt-1 text-sm text-muted-foreground">
          <span>{insight.frequency} mentions</span>
          <span>{formatPercentage(insight.satisfaction)} satisfaction</span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {getTrendIcon(insight.trend, insight.change)}
        <span className={cn(
          "text-sm font-medium",
          insight.trend === 'up' ? 'text-green-600' : 
          insight.trend === 'down' ? 'text-red-600' : 'text-gray-600'
        )}>
          {Math.abs(insight.change).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

const UserJourneyVisualization: React.FC<{
  journey: UserJourney[]
}> = ({ journey }) => {
  return (
    <div className="space-y-4">
      {journey.map((step, index) => (
        <div key={step.step} className="relative">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-medium">
              {index + 1}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{step.step}</h4>
                <div className="text-sm text-muted-foreground">
                  {formatNumber(step.users)} users
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Conversion: {formatPercentage(step.conversion)}</span>
                  <span>Drop-off: {formatPercentage(step.dropOff)}</span>
                </div>
                <Progress value={step.conversion * 100} className="h-2" />
              </div>
            </div>
          </div>
          {index < journey.length - 1 && (
            <div className="ml-4 mt-2 w-0.5 h-4 bg-border" />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * ========================================================================
 * MAIN COMPONENT
 * ========================================================================
 */

export default function AnalyticsDashboard() {
  const [activeView, setActiveView] = useState<ViewType>('overview')
  const [filters, setFilters] = useState<AnalyticsFilters>({
    timeRange: '7d',
    metricType: 'conversations'
  })
  const [autoRefresh, setAutoRefresh] = useState(true)

  // API Hooks
  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useAnalyticsDashboard(filters.timeRange)
  const { data: conversations, isLoading: conversationsLoading } = useConversationAnalytics(filters.deploymentId, filters.timeRange)
  const { data: performance, isLoading: performanceLoading } = usePerformanceAnalytics(filters.timeRange)
  const { data: deployments } = useDeployments()

  // Real-time updates
  const { analyticsUpdates } = useAnalyticsWebSocket()

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refetchAnalytics()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, refetchAnalytics])

  // Update analytics when real-time data arrives
  useEffect(() => {
    if (analyticsUpdates) {
      // Could merge real-time updates with current data
      console.log('Real-time analytics update:', analyticsUpdates)
    }
  }, [analyticsUpdates])

  // Generate sample data for charts (replace with real data)
  const conversationChartData = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const data = [120, 190, 300, 500, 200, 300, 450]

    return {
      labels,
      datasets: [
        {
          label: 'Conversations',
          data,
          borderColor: chartColors.primary,
          backgroundColor: chartColors.primary + '20',
          fill: true,
        },
      ],
    }
  }, [])

  const channelDistributionData = useMemo(() => {
    const data = [65, 25, 10]
    const labels = ['Web Widget', 'API', 'Slack']

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            chartColors.primary,
            chartColors.secondary,
            chartColors.accent,
          ],
          borderWidth: 0,
        },
      ],
    }
  }, [])

  const satisfactionTrendData = useMemo(() => {
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
    const data = [4.2, 4.4, 4.3, 4.6]

    return {
      labels,
      datasets: [
        {
          label: 'Satisfaction Score',
          data,
          borderColor: chartColors.success,
          backgroundColor: chartColors.success + '20',
          fill: true,
        },
      ],
    }
  }, [])

  // Sample insights data
  const topicInsights: TopicInsight[] = [
    { topic: 'Password Reset', frequency: 125, satisfaction: 0.89, trend: 'up', change: 12.5 },
    { topic: 'Billing Questions', frequency: 89, satisfaction: 0.76, trend: 'down', change: -8.2 },
    { topic: 'Technical Support', frequency: 67, satisfaction: 0.82, trend: 'up', change: 5.1 },
    { topic: 'Product Information', frequency: 45, satisfaction: 0.94, trend: 'neutral', change: 0.3 },
  ]

  const userJourney: UserJourney[] = [
    { step: 'Chat Initiated', users: 1250, conversion: 1.0, dropOff: 0.0 },
    { step: 'First Response', users: 1100, conversion: 0.88, dropOff: 0.12 },
    { step: 'Engaged Conversation', users: 890, conversion: 0.71, dropOff: 0.17 },
    { step: 'Issue Resolved', users: 750, conversion: 0.60, dropOff: 0.11 },
    { step: 'Feedback Provided', users: 450, conversion: 0.36, dropOff: 0.24 },
  ]

  const handleFilterChange = useCallback((key: keyof AnalyticsFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleExportData = useCallback(() => {
    // Implementation for data export
    toast({
      title: 'Export Started',
      description: 'Your analytics data is being prepared for download.',
    })
  }, [])

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor performance, user engagement, and chatbot effectiveness
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm">Auto-refresh</Label>
          </div>
          
          <Button variant="outline" onClick={() => refetchAnalytics()}>
            <RefreshCw className={cn("h-4 w-4 mr-2", analyticsLoading && "animate-spin")} />
            Refresh
          </Button>
          
          <Button variant="outline" onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex items-center space-x-4 pt-6">
          <div className="flex items-center space-x-2">
            <Label>Time Range:</Label>
            <Select
              value={filters.timeRange}
              onValueChange={(value) => handleFilterChange('timeRange', value as TimeRange)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Label>Deployment:</Label>
            <Select
              value={filters.deploymentId || 'all'}
              onValueChange={(value) => handleFilterChange('deploymentId', value === 'all' ? undefined : value)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Deployments</SelectItem>
                {deployments?.map((deployment) => (
                  <SelectItem key={deployment.id} value={deployment.id}>
                    {deployment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Label>Metric:</Label>
            <Select
              value={filters.metricType}
              onValueChange={(value) => handleFilterChange('metricType', value as MetricType)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conversations">Conversations</SelectItem>
                <SelectItem value="messages">Messages</SelectItem>
                <SelectItem value="users">Users</SelectItem>
                <SelectItem value="satisfaction">Satisfaction</SelectItem>
                <SelectItem value="response_time">Response Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as ViewType)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Conversations"
              value={formatNumber(analytics?.overview.total_conversations || 0)}
              change={analytics?.overview.growth_metrics.conversations_growth}
              icon={<MessageCircle className="h-4 w-4" />}
              color="bg-blue-500"
              trend="up"
              loading={analyticsLoading}
            />
            
            <MetricCard
              title="Unique Users"
              value={formatNumber(analytics?.overview.unique_users || 0)}
              change={analytics?.overview.growth_metrics.users_growth}
              icon={<Users className="h-4 w-4" />}
              color="bg-green-500"
              trend="up"
              loading={analyticsLoading}
            />
            
            <MetricCard
              title="Avg Response Time"
              value={formatDuration(analytics?.overview.response_time_avg || 0)}
              change={-12.3}
              icon={<Clock className="h-4 w-4" />}
              color="bg-orange-500"
              trend="up"
              loading={analyticsLoading}
            />
            
            <MetricCard
              title="User Satisfaction"
              value={analytics?.overview.user_satisfaction ? `${(analytics.overview.user_satisfaction * 100).toFixed(1)}%` : '—'}
              change={analytics?.overview.growth_metrics.satisfaction_trend}
              icon={<Star className="h-4 w-4" />}
              color="bg-purple-500"
              trend="up"
              loading={analyticsLoading}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard
              title="Conversations Over Time"
              description="Daily conversation volume"
              loading={analyticsLoading}
            >
              <Line data={conversationChartData} options={lineChartOptions} />
            </ChartCard>

            <ChartCard
              title="Channel Distribution"
              description="Conversations by deployment channel"
              loading={analyticsLoading}
            >
              <Doughnut data={channelDistributionData} options={doughnutChartOptions} />
            </ChartCard>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest conversations and interactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
                        <div className="flex-1 space-y-1">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                          <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">User resolved billing question</p>
                        <p className="text-xs text-muted-foreground">2 minutes ago • Web Widget</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <MessageCircle className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">New conversation started</p>
                        <p className="text-xs text-muted-foreground">5 minutes ago • API Integration</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Escalation to human agent</p>
                        <p className="text-xs text-muted-foreground">12 minutes ago • Web Widget</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversations Tab */}
        <TabsContent value="conversations" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard
              title="Message Volume"
              description="Messages sent and received over time"
              loading={conversationsLoading}
            >
              <Bar data={conversationChartData} options={barChartOptions} />
            </ChartCard>

            <ChartCard
              title="User Satisfaction Trend"
              description="Average satisfaction score over time"
              loading={conversationsLoading}
            >
              <Line data={satisfactionTrendData} options={lineChartOptions} />
            </ChartCard>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>User Journey Analysis</CardTitle>
              <CardDescription>How users progress through conversations</CardDescription>
            </CardHeader>
            <CardContent>
              <UserJourneyVisualization journey={userJourney} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Avg Response Time"
              value={formatDuration(performance?.response_times.average || 0)}
              icon={<Clock className="h-4 w-4" />}
              color="bg-blue-500"
              loading={performanceLoading}
            />
            
            <MetricCard
              title="System Uptime"
              value={performance?.system_health.uptime_percentage ? `${performance.system_health.uptime_percentage.toFixed(2)}%` : '—'}
              icon={<Activity className="h-4 w-4" />}
              color="bg-green-500"
              loading={performanceLoading}
            />
            
            <MetricCard
              title="Error Rate"
              value={performance?.system_health.error_rate ? `${(performance.system_health.error_rate * 100).toFixed(2)}%` : '—'}
              icon={<AlertTriangle className="h-4 w-4" />}