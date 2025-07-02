"use client"

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Rocket, 
  Globe, 
  MessageSquare,
  Settings,
  Copy,
  ExternalLink,
  Play,
  Pause,
  Square,
  BarChart3,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Edit,
  Trash2,
  Plus,
  RefreshCw,
  Code,
  Smartphone,
  Monitor,
  Tablet,
  Zap,
  Shield,
  Activity,
  TrendingUp,
  Download,
  Upload,
  Link,
  QrCode,
  Share,
  Bell,
  Wifi,
  WifiOff,
  Database,
  Server,
  CloudUpload
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { toast } from '@/hooks/use-toast'

// Import hooks and components
import { WidgetCustomizer } from '@/components/widget-customizer'
import {
  useDeployments,
  useDeployment,
  useCreateDeployment,
  useUpdateDeployment,
  useGetEmbedCode,
  useChatbotConfigs,
  useAnalyticsDashboard
} from '@/hooks/api'
import { useOnboarding } from '@/stores/auth-store'
import type {
  ChatbotDeployment,
  DeploymentType,
  DeploymentStatus,
  WidgetStyling,
  ChatbotConfig,
  AnalyticsDashboard as AnalyticsData
} from '@/types'

/**
 * ========================================================================
 * DEPLOYMENT CONFIGURATION
 * ========================================================================
 */

const DEPLOYMENT_CHANNELS = [
  {
    type: 'web_widget' as DeploymentType,
    name: 'Web Widget',
    description: 'Embeddable chat widget for websites',
    icon: <Globe className="h-6 w-6" />,
    color: 'bg-blue-500',
    features: ['Easy integration', 'Customizable design', 'Real-time chat'],
    status: 'available',
    setupTime: '5 minutes'
  },
  {
    type: 'slack' as DeploymentType,
    name: 'Slack App',
    description: 'Native Slack bot integration',
    icon: <MessageSquare className="h-6 w-6" />,
    color: 'bg-purple-500',
    features: ['Direct messages', 'Channel integration', 'Slash commands'],
    status: 'coming_soon',
    setupTime: '10 minutes'
  },
  {
    type: 'teams' as DeploymentType,
    name: 'Microsoft Teams',
    description: 'Teams bot for enterprise',
    icon: <Users className="h-6 w-6" />,
    color: 'bg-indigo-500',
    features: ['Team conversations', 'Enterprise SSO', 'File sharing'],
    status: 'coming_soon',
    setupTime: '15 minutes'
  },
  {
    type: 'api' as DeploymentType,
    name: 'REST API',
    description: 'Direct API integration',
    icon: <Database className="h-6 w-6" />,
    color: 'bg-green-500',
    features: ['Custom integration', 'Full control', 'Developer-friendly'],
    status: 'available',
    setupTime: '30 minutes'
  },
  {
    type: 'discord' as DeploymentType,
    name: 'Discord Bot',
    description: 'Community and gaming chat',
    icon: <Zap className="h-6 w-6" />,
    color: 'bg-orange-500',
    features: ['Server integration', 'Slash commands', 'Voice support'],
    status: 'planned',
    setupTime: '20 minutes'
  },
  {
    type: 'whatsapp' as DeploymentType,
    name: 'WhatsApp Business',
    description: 'Customer support via WhatsApp',
    icon: <Smartphone className="h-6 w-6" />,
    color: 'bg-emerald-500',
    features: ['Business API', 'Rich messages', 'Global reach'],
    status: 'planned',
    setupTime: '45 minutes'
  }
]

const STATUS_CONFIG = {
  draft: { color: 'bg-gray-500', label: 'Draft', icon: <Edit className="h-4 w-4" /> },
  active: { color: 'bg-green-500', label: 'Active', icon: <CheckCircle2 className="h-4 w-4" /> },
  paused: { color: 'bg-yellow-500', label: 'Paused', icon: <Pause className="h-4 w-4" /> },
  stopped: { color: 'bg-red-500', label: 'Stopped', icon: <Square className="h-4 w-4" /> },
  error: { color: 'bg-red-600', label: 'Error', icon: <XCircle className="h-4 w-4" /> },
}

/**
 * ========================================================================
 * COMPONENT INTERFACES
 * ========================================================================
 */

interface DeploymentChannelCardProps {
  channel: typeof DEPLOYMENT_CHANNELS[0]
  onDeploy: (type: DeploymentType) => void
  isDeployed: boolean
  deployment?: ChatbotDeployment
}

interface DeploymentRowProps {
  deployment: ChatbotDeployment
  onEdit: (deployment: ChatbotDeployment) => void
  onDelete: (deployment: ChatbotDeployment) => void
  onToggleStatus: (deployment: ChatbotDeployment) => void
  onViewAnalytics: (deployment: ChatbotDeployment) => void
}

interface CreateDeploymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deploymentType: DeploymentType | null
  chatbotConfigs: ChatbotConfig[]
}

interface QuickStatsProps {
  analytics?: AnalyticsData
  deployments: ChatbotDeployment[]
}

/**
 * ========================================================================
 * SUB-COMPONENTS
 * ========================================================================
 */

const DeploymentChannelCard: React.FC<DeploymentChannelCardProps> = ({
  channel,
  onDeploy,
  isDeployed,
  deployment
}) => {
  const statusBadge = () => {
    if (channel.status === 'available') {
      return <Badge className="bg-green-100 text-green-800">Available</Badge>
    } else if (channel.status === 'coming_soon') {
      return <Badge className="bg-blue-100 text-blue-800">Coming Soon</Badge>
    } else {
      return <Badge variant="secondary">Planned</Badge>
    }
  }

  const deploymentStatus = deployment ? STATUS_CONFIG[deployment.status] : null

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative overflow-hidden border rounded-lg transition-all duration-200",
        isDeployed ? "border-green-200 bg-green-50 dark:bg-green-950/30" : "border-border hover:border-primary/50"
      )}
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={cn("p-2 rounded-lg text-white", channel.color)}>
              {channel.icon}
            </div>
            <div>
              <h3 className="font-semibold">{channel.name}</h3>
              <p className="text-sm text-muted-foreground">{channel.description}</p>
            </div>
          </div>
          {statusBadge()}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {channel.features.map((feature, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {feature}
              </Badge>
            ))}
          </div>

          {isDeployed && deployment && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center space-x-2">
                <div className={cn("w-2 h-2 rounded-full", deploymentStatus?.color)} />
                <span className="text-sm font-medium">{deploymentStatus?.label}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(deployment.created_at), { addSuffix: true })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Setup: {channel.setupTime}</span>
            </div>

            {channel.status === 'available' ? (
              <Button
                onClick={() => onDeploy(channel.type)}
                disabled={isDeployed}
                size="sm"
                className={isDeployed ? "bg-green-600" : ""}
              >
                {isDeployed ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Deployed
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Deploy
                  </>
                )}
              </Button>
            ) : (
              <Button disabled size="sm" variant="outline">
                {channel.status === 'coming_soon' ? 'Coming Soon' : 'Planned'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {isDeployed && (
        <div className="absolute top-2 right-2">
          <div className="p-1 bg-green-500 rounded-full">
            <CheckCircle2 className="h-3 w-3 text-white" />
          </div>
        </div>
      )}
    </motion.div>
  )
}

const DeploymentRow: React.FC<DeploymentRowProps> = ({
  deployment,
  onEdit,
  onDelete,
  onToggleStatus,
  onViewAnalytics
}) => {
  const channel = DEPLOYMENT_CHANNELS.find(c => c.type === deployment.deployment_type)
  const status = STATUS_CONFIG[deployment.status]

  return (
    <TableRow className="group hover:bg-muted/50">
      <TableCell>
        <div className="flex items-center space-x-3">
          {channel && (
            <div className={cn("p-2 rounded text-white", channel.color)}>
              {React.cloneElement(channel.icon, { className: "h-4 w-4" })}
            </div>
          )}
          <div>
            <div className="font-medium">{deployment.name}</div>
            <div className="text-sm text-muted-foreground capitalize">
              {deployment.deployment_type.replace('_', ' ')}
            </div>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center space-x-2">
          <div className={cn("w-2 h-2 rounded-full", status.color)} />
          <Badge variant="outline" className="capitalize">
            {status.label}
          </Badge>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        <div className="space-y-1">
          <div>{deployment.stats?.total_conversations || 0} conversations</div>
          <div>{deployment.stats?.total_messages || 0} messages</div>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        <div className="space-y-1">
          <div>{deployment.stats?.unique_users || 0} users</div>
          <div>
            {deployment.stats?.user_satisfaction_score 
              ? `${(deployment.stats.user_satisfaction_score * 100).toFixed(1)}% satisfaction`
              : 'No feedback yet'
            }
          </div>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              {formatDistanceToNow(new Date(deployment.created_at), { addSuffix: true })}
            </TooltipTrigger>
            <TooltipContent>
              {format(new Date(deployment.created_at), 'PPpp')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onViewAnalytics(deployment)}>
              <BarChart3 className="h-4 w-4 mr-2" />
              View Analytics
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(deployment)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Configuration
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(deployment)}>
              {deployment.status === 'active' ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause Deployment
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Activate Deployment
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onDelete(deployment)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

const CreateDeploymentDialog: React.FC<CreateDeploymentDialogProps> = ({
  open,
  onOpenChange,
  deploymentType,
  chatbotConfigs
}) => {
  const [deploymentData, setDeploymentData] = useState({
    name: '',
    config_id: '',
    styling: {} as Partial<WidgetStyling>
  })

  const createDeployment = useCreateDeployment()
  const channel = DEPLOYMENT_CHANNELS.find(c => c.type === deploymentType)

  const handleCreate = useCallback(async () => {
    if (!deploymentType || !deploymentData.name || !deploymentData.config_id) return

    try {
      await createDeployment.mutateAsync({
        name: deploymentData.name,
        deployment_type: deploymentType,
        config_id: deploymentData.config_id,
        styling: deploymentData.styling,
        status: 'active'
      })

      onOpenChange(false)
      setDeploymentData({ name: '', config_id: '', styling: {} })

      toast({
        title: 'Deployment Created',
        description: `Your ${channel?.name} deployment is now active.`,
      })
    } catch (error) {
      toast({
        title: 'Deployment Failed',
        description: error instanceof Error ? error.message : 'Failed to create deployment',
        variant: 'destructive',
      })
    }
  }, [deploymentType, deploymentData, createDeployment, onOpenChange, channel])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {channel?.icon}
            <span>Deploy to {channel?.name}</span>
          </DialogTitle>
          <DialogDescription>
            Configure and deploy your chatbot to {channel?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deployment-name">Deployment Name</Label>
              <Input
                id="deployment-name"
                placeholder={`${channel?.name} Deployment`}
                value={deploymentData.name}
                onChange={(e) => setDeploymentData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chatbot-config">Chatbot Configuration</Label>
              <Select
                value={deploymentData.config_id}
                onValueChange={(value) => setDeploymentData(prev => ({ ...prev, config_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select chatbot configuration" />
                </SelectTrigger>
                <SelectContent>
                  {chatbotConfigs.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      <div>
                        <div className="font-medium">{config.name}</div>
                        <div className="text-xs text-muted-foreground">{config.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Widget Customization (only for web_widget) */}
          {deploymentType === 'web_widget' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Widget Customization</h3>
              <WidgetCustomizer
                onStyleChange={(styling) => setDeploymentData(prev => ({ ...prev, styling }))}
                className="border rounded-lg p-4"
              />
            </div>
          )}

          {/* Integration Instructions */}
          {deploymentType === 'api' && (
            <Alert>
              <Database className="h-4 w-4" />
              <AlertDescription>
                After deployment, you'll receive API endpoints and authentication details 
                for integrating with your application.
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={!deploymentData.name || !deploymentData.config_id || createDeployment.isPending}
            >
              {createDeployment.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy Now
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const QuickStats: React.FC<QuickStatsProps> = ({ analytics, deployments }) => {
  const stats = useMemo(() => {
    const activeDeployments = deployments.filter(d => d.status === 'active').length
    const totalConversations = deployments.reduce((sum, d) => sum + (d.stats?.total_conversations || 0), 0)
    const totalMessages = deployments.reduce((sum, d) => sum + (d.stats?.total_messages || 0), 0)
    const avgSatisfaction = deployments.reduce((sum, d) => sum + (d.stats?.user_satisfaction_score || 0), 0) / deployments.length || 0

    return {
      activeDeployments,
      totalConversations,
      totalMessages,
      avgSatisfaction: avgSatisfaction * 100
    }
  }, [deployments])

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Deployments</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeDeployments}</div>
          <p className="text-xs text-muted-foreground">
            {deployments.length} total deployments
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalConversations.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Across all channels
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalMessages.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Total message volume
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Satisfaction Score</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.avgSatisfaction > 0 ? `${stats.avgSatisfaction.toFixed(1)}%` : '—'}
          </div>
          <p className="text-xs text-muted-foreground">
            Average user rating
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * ========================================================================
 * MAIN COMPONENT
 * ========================================================================
 */

export default function DeploymentPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedDeploymentType, setSelectedDeploymentType] = useState<DeploymentType | null>(null)

  // API Hooks
  const { data: deployments, isLoading, refetch } = useDeployments()
  const { data: chatbotConfigs } = useChatbotConfigs()
  const { data: analytics } = useAnalyticsDashboard()
  const updateDeployment = useUpdateDeployment()
  const { features, updateOnboardingStep } = useOnboarding()

  // Deployed channels tracking
  const deployedChannels = useMemo(() => {
    if (!deployments) return new Set()
    return new Set(deployments.map(d => d.deployment_type))
  }, [deployments])

  // Event Handlers
  const handleDeploy = useCallback((type: DeploymentType) => {
    setSelectedDeploymentType(type)
    setCreateDialogOpen(true)
  }, [])

  const handleEditDeployment = useCallback((deployment: ChatbotDeployment) => {
    // TODO: Open edit dialog
    toast({
      title: 'Edit Deployment',
      description: 'Edit functionality coming soon',
    })
  }, [])

  const handleDeleteDeployment = useCallback(async (deployment: ChatbotDeployment) => {
    if (confirm(`Are you sure you want to delete "${deployment.name}"?`)) {
      // TODO: Implement delete
      toast({
        title: 'Deployment Deleted',
        description: `${deployment.name} has been deleted.`,
      })
    }
  }, [])

  const handleToggleStatus = useCallback(async (deployment: ChatbotDeployment) => {
    const newStatus = deployment.status === 'active' ? 'paused' : 'active'
    
    try {
      await updateDeployment.mutateAsync({
        id: deployment.id,
        data: { status: newStatus }
      })

      toast({
        title: 'Status Updated',
        description: `Deployment ${newStatus === 'active' ? 'activated' : 'paused'}.`,
      })
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update status',
        variant: 'destructive',
      })
    }
  }, [updateDeployment])

  const handleViewAnalytics = useCallback((deployment: ChatbotDeployment) => {
    // TODO: Navigate to analytics page with deployment filter
    toast({
      title: 'Analytics',
      description: 'Analytics page coming soon',
    })
  }, [])

  // Mark deployment as completed when first deployment is created
  useEffect(() => {
    if (deployments && deployments.length > 0 && !features.chatbot_deployed) {
      updateOnboardingStep('deployment')
    }
  }, [deployments, features.chatbot_deployed, updateOnboardingStep])

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deployment Center</h1>
          <p className="text-muted-foreground">
            Deploy your chatbot across multiple channels and monitor performance
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Deployment
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <QuickStats analytics={analytics} deployments={deployments || []} />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Deployment Status */}
          {deployments && deployments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Recent Deployments</CardTitle>
                <CardDescription>
                  Your latest chatbot deployments and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deployments.slice(0, 3).map((deployment) => {
                    const channel = DEPLOYMENT_CHANNELS.find(c => c.type === deployment.deployment_type)
                    const status = STATUS_CONFIG[deployment.status]
                    
                    return (
                      <div key={deployment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div>
                            <h3 className="font-medium">{deployment.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {channel?.name} • {formatDistanceToNow(new Date(deployment.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <div className={cn("w-2 h-2 rounded-full", status.color)} />
                            <span className="text-sm font-medium">{status.label}</span>
                          </div>
                          
                          <div className="text-sm text-muted-foreground">
                            {deployment.stats?.total_conversations || 0} conversations
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewAnalytics(deployment)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {deployments.length > 3 && (
                  <div className="mt-4 text-center">
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveTab('manage')}
                    >
                      View All Deployments
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Rocket className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Ready to Deploy?</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  Deploy your chatbot to start engaging with users across multiple channels.
                  Choose from web widgets, Slack, Teams, and more.
                </p>
                <Button onClick={() => setActiveTab('channels')}>
                  <Rocket className="h-4 w-4 mr-2" />
                  Explore Deployment Channels
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('channels')}>
              <CardContent className="flex items-center p-6">
                <Globe className="h-8 w-8 text-blue-500 mr-4" />
                <div>
                  <h3 className="font-semibold">Deploy Web Widget</h3>
                  <p className="text-sm text-muted-foreground">Add chat to your website</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('analytics')}>
              <CardContent className="flex items-center p-6">
                <BarChart3 className="h-8 w-8 text-green-500 mr-4" />
                <div>
                  <h3 className="font-semibold">View Analytics</h3>
                  <p className="text-sm text-muted-foreground">Monitor performance</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('manage')}>
              <CardContent className="flex items-center p-6">
                <Settings className="h-8 w-8 text-purple-500 mr-4" />
                <div>
                  <h3 className="font-semibold">Manage Deployments</h3>
                  <p className="text-sm text-muted-foreground">Configure and monitor</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Deployment Channels</h2>
              <p className="text-muted-foreground">
                Choose how and where you want to deploy your chatbot
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DEPLOYMENT_CHANNELS.map((channel) => (
              <DeploymentChannelCard
                key={channel.type}
                channel={channel}
                onDeploy={handleDeploy}
                isDeployed={deployedChannels.has(channel.type)}
                deployment={deployments?.find(d => d.deployment_type === channel.type)}
              />
            ))}
          </div>

          {/* Integration Guides */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Code className="h-5 w-5" />
                <span>Integration Guides</span>
              </CardTitle>
              <CardDescription>
                Step-by-step guides for setting up your chatbot on different platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Web Widget Integration</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add a customizable chat widget to any website with just a few lines of code.
                  </p>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Guide
                  </Button>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">API Integration</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Build custom integrations using our RESTful API and webhooks.
                  </p>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    API Docs
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Tab */}
        <TabsContent value="manage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Deployments</CardTitle>
              <CardDescription>
                Manage and monitor all your chatbot deployments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deployments && deployments.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Deployment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Activity</TableHead>
                        <TableHead>Performance</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deployments.map((deployment) => (
                        <DeploymentRow
                          key={deployment.id}
                          deployment={deployment}
                          onEdit={handleEditDeployment}
                          onDelete={handleDeleteDeployment}
                          onToggleStatus={handleToggleStatus}
                          onViewAnalytics={handleViewAnalytics}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Rocket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Deployments Yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Create your first deployment to start engaging with users.
                  </p>
                  <Button onClick={() => setActiveTab('channels')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Deployment
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Response Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">1.2s</div>
                <p className="text-xs text-muted-foreground">
                  Average response time
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">99.8%</div>
                <p className="text-xs text-muted-foreground">
                  Last 30 days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">87%</div>
                <p className="text-xs text-muted-foreground">
                  Issues resolved automatically
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">User Engagement</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">4.2</div>
                <p className="text-xs text-muted-foreground">
                  Messages per conversation
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Analytics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>
                Detailed analytics and insights for all your deployments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <BarChart3 className="h-4 w-4" />
                  <AlertDescription>
                    Detailed analytics dashboard with charts, trends, and insights is coming soon.
                    For now, you can view basic metrics in the deployment overview.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button variant="outline" className="h-20 flex-col space-y-2">
                    <TrendingUp className="h-6 w-6" />
                    <span className="text-sm">Usage Trends</span>
                  </Button>
                  
                  <Button variant="outline" className="h-20 flex-col space-y-2">
                    <Users className="h-6 w-6" />
                    <span className="text-sm">User Insights</span>
                  </Button>
                  
                  <Button variant="outline" className="h-20 flex-col space-y-2">
                    <MessageSquare className="h-6 w-6" />
                    <span className="text-sm">Conversation Analysis</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Deployment Dialog */}
      <CreateDeploymentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        deploymentType={selectedDeploymentType}
        chatbotConfigs={chatbotConfigs || []}
      />
    </div>
  )
}