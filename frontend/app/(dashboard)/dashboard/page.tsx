'use client'

import { useState, useEffect } from 'react'
import { 
  FileText, 
  Bot, 
  Rocket, 
  BarChart, 
  CheckCircle2,
  Clock,
  ArrowRight,
  HardDrive,
  MessageSquare,
  Plus,
  Eye,
  MoreVertical,
  Upload,
  Zap,
  TrendingUp,
  Users,
  Activity
} from 'lucide-react'

// Mock data - replace with actual API calls later
const mockTenantData = {
  organizationName: "Acme Corporation",
  currentStep: 1, // 0: questionnaire, 1: content, 2: chatbot, 3: deployment, 4: live
  setupProgress: 25, // Overall setup percentage
  usage: {
    documents: { current: 3, max: 50 },
    storage: { current: 156, max: 1000 }, // MB
    queries: { current: 47, max: 1000 }
  },
  contentSources: [
    { 
      id: '1', 
      name: 'Product Documentation', 
      type: 'document', 
      status: 'completed', 
      chunks: 45,
      uploadedAt: '2 hours ago'
    },
    { 
      id: '2', 
      name: 'FAQ Database', 
      type: 'document', 
      status: 'processing', 
      chunks: 23,
      uploadedAt: '30 minutes ago'
    },
    { 
      id: '3', 
      name: 'Company Website', 
      type: 'website', 
      status: 'pending', 
      chunks: 0,
      uploadedAt: '5 minutes ago'
    }
  ],
  recentActivity: [
    { 
      id: 1, 
      message: "Content processing completed for Product Documentation", 
      type: "success", 
      time: "2 min ago",
      icon: CheckCircle2
    },
    { 
      id: 2, 
      message: "New content source added: FAQ Database", 
      type: "info", 
      time: "30 min ago",
      icon: Upload
    },
    { 
      id: 3, 
      message: "Chatbot configuration wizard started", 
      type: "info", 
      time: "1 hour ago",
      icon: Bot
    }
  ],
  quickStats: {
    totalConversations: 0,
    avgResponseTime: '0s',
    satisfactionScore: 0,
    activeDeployments: 0
  }
}

const DashboardPage = () => {
  const [data, setData] = useState(mockTenantData)
  const [isLoading, setIsLoading] = useState(true)

  // Simulate loading data
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  // Setup steps configuration
  const setupSteps = [
    { 
      id: 1, 
      name: 'Add Content', 
      description: 'Upload documents and data sources', 
      icon: FileText, 
      completed: data.currentStep > 1,
      current: data.currentStep === 1,
      href: '/dashboard/content'
    },
    { 
      id: 2, 
      name: 'Configure Chatbot', 
      description: 'Set personality and behavior', 
      icon: Bot, 
      completed: data.currentStep > 2,
      current: data.currentStep === 2,
      href: '/dashboard/chatbot'
    },
    { 
      id: 3, 
      name: 'Deploy', 
      description: 'Launch your chatbot', 
      icon: Rocket, 
      completed: data.currentStep > 3,
      current: data.currentStep === 3,
      href: '/dashboard/deployment'
    },
    { 
      id: 4, 
      name: 'Monitor', 
      description: 'Track performance and analytics', 
      icon: BarChart, 
      completed: data.currentStep > 4,
      current: data.currentStep === 4,
      href: '/dashboard/analytics'
    }
  ]

  // Usage Card Component
  const UsageCard = ({ title, current, max, unit = '', icon: Icon, color = 'blue' }) => {
    const percentage = Math.min((current / max) * 100, 100)
    const isNearLimit = percentage > 80
    
    const colorClasses = {
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        progress: 'bg-blue-500'
      },
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        progress: 'bg-green-500'
      },
      purple: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        progress: 'bg-purple-500'
      }
    }

    const colors = colorClasses[color]

    return (
      <div className={`p-6 rounded-xl border-2 ${colors.bg} ${colors.border} ${colors.text} transition-all hover:shadow-lg`}>
        <div className="flex items-center justify-between mb-4">
          <Icon className="h-8 w-8" />
          <span className="text-2xl font-bold">
            {current.toLocaleString()}{unit}
          </span>
        </div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <div className="w-full bg-white/50 rounded-full h-2 mb-2">
          <div 
            className={`${colors.progress} h-2 rounded-full transition-all duration-500 ${isNearLimit ? 'animate-pulse' : ''}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between items-center">
          <p className="text-sm opacity-75">
            {current.toLocaleString()} of {max.toLocaleString()} {unit}
          </p>
          {isNearLimit && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Near limit
            </span>
          )}
        </div>
      </div>
    )
  }

  // Step Card Component
  const StepCard = ({ step }) => {
    const Icon = step.icon
    
    return (
      <a
        href={step.href}
        className={`block p-6 rounded-xl border-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
          step.completed 
            ? 'bg-green-50 border-green-200 hover:border-green-300' 
            : step.current 
              ? 'bg-blue-50 border-blue-200 hover:border-blue-300' 
              : 'bg-gray-50 border-gray-200 hover:border-gray-300'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${
              step.completed 
                ? 'bg-green-100 text-green-600' 
                : step.current 
                  ? 'bg-blue-100 text-blue-600' 
                  : 'bg-gray-100 text-gray-600'
            }`}>
              {step.completed ? <CheckCircle2 className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">{step.name}</h3>
              <p className="text-sm text-gray-600">{step.description}</p>
              {step.current && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 mt-2">
                  <Clock className="h-3 w-3" />
                  Current step
                </span>
              )}
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
      </a>
    )
  }

  // Content Source Row Component
  const ContentSourceRow = ({ source }) => {
    const statusConfig = {
      completed: { 
        color: 'bg-green-100 text-green-700',
        icon: CheckCircle2,
        iconColor: 'text-green-500'
      },
      processing: { 
        color: 'bg-yellow-100 text-yellow-700',
        icon: Clock,
        iconColor: 'text-yellow-500'
      },
      pending: { 
        color: 'bg-gray-100 text-gray-700',
        icon: Clock,
        iconColor: 'text-gray-500'
      },
      failed: { 
        color: 'bg-red-100 text-red-700',
        icon: FileText,
        iconColor: 'text-red-500'
      }
    }

    const config = statusConfig[source.status]
    const StatusIcon = config.icon

    return (
      <div className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors">
        <div className="flex items-center gap-3">
          <StatusIcon className={`h-5 w-5 ${config.iconColor}`} />
          <div>
            <p className="font-medium text-gray-900">{source.name}</p>
            <p className="text-sm text-gray-500">
              {source.chunks} chunks • {source.uploadedAt}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
            {source.status}
          </span>
          <button className="p-1 hover:bg-gray-100 rounded transition-colors">
            <MoreVertical className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>
    )
  }

  // Activity Item Component
  const ActivityItem = ({ activity }) => {
    const Icon = activity.icon
    const typeColors = {
      success: 'text-green-500',
      info: 'text-blue-500',
      warning: 'text-yellow-500',
      error: 'text-red-500'
    }

    return (
      <div className="flex gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
        <Icon className={`h-5 w-5 mt-0.5 ${typeColors[activity.type]}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900">{activity.message}</p>
          <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-2xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/90 to-purple-600/90" />
        <div className="relative">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Welcome back to {data.organizationName}! 👋
          </h1>
          <p className="text-blue-100 text-lg mb-6">
            Your intelligent chatbot platform is {data.setupProgress}% complete and ready to deploy.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors flex items-center gap-2">
              <Eye className="h-5 w-5" />
              View Setup Progress
            </button>
            <button className="bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-400 transition-colors flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Content
            </button>
          </div>
        </div>
      </div>

      {/* Setup Progress */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Setup Progress</h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            Step {data.currentStep} of 4
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {setupSteps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      </div>

      {/* Usage Overview */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Usage Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UsageCard
            title="Documents"
            current={data.usage.documents.current}
            max={data.usage.documents.max}
            icon={FileText}
            color="blue"
          />
          <UsageCard
            title="Storage"
            current={data.usage.storage.current}
            max={data.usage.storage.max}
            unit="MB"
            icon={HardDrive}
            color="green"
          />
          <UsageCard
            title="Monthly Queries"
            current={data.usage.queries.current}
            max={data.usage.queries.max}
            icon={MessageSquare}
            color="purple"
          />
        </div>
      </div>

      {/* Recent Content & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Content */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Recent Content</h3>
            <a 
              href="/dashboard/content" 
              className="text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
            >
              View All
            </a>
          </div>
          <div className="space-y-2">
            {data.contentSources.map(source => (
              <ContentSourceRow key={source.id} source={source} />
            ))}
          </div>
          <a
            href="/dashboard/content/upload"
            className="w-full mt-4 p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors flex flex-col items-center justify-center group"
          >
            <Plus className="h-6 w-6 mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-medium">Add New Content</span>
            <span className="text-xs text-gray-500">Documents, websites, or APIs</span>
          </a>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Recent Activity</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm text-gray-500">Live</span>
            </div>
          </div>
          <div className="space-y-1">
            {data.recentActivity.map(activity => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <a 
              href="/dashboard/analytics" 
              className="text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors flex items-center gap-2"
            >
              <Activity className="h-4 w-4" />
              View All Activity
            </a>
          </div>
        </div>
      </div>

      {/* Quick Stats (if chatbot is deployed) */}
      {data.currentStep >= 4 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Performance Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-gray-900">{data.quickStats.totalConversations}</div>
              <div className="text-sm text-gray-500">Total Conversations</div>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-gray-900">{data.quickStats.avgResponseTime}</div>
              <div className="text-sm text-gray-500">Avg Response Time</div>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-gray-900">{data.quickStats.satisfactionScore}%</div>
              <div className="text-sm text-gray-500">Satisfaction Score</div>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-gray-900">{data.quickStats.activeDeployments}</div>
              <div className="text-sm text-gray-500">Active Deployments</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardPage