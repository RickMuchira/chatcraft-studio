// app/(dashboard)/chatbot/page.tsx - Comprehensive Chatbot Configuration Page for ChatCraft Studio

"use client"

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bot,
  MessageSquare,
  Settings,
  Zap,
  TestTube,
  Play,
  Pause,
  Save,
  RefreshCw,
  Copy,
  Eye,
  Edit3,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Sparkles,
  Brain,
  Smile,
  Target,
  Shield,
  Globe,
  Mic,
  Volume2,
  Users,
  MessageCircleMore,
  Palette,
  Code,
  Download,
  Upload,
  BarChart3,
  HelpCircle,
  Info
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
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/hooks/use-toast'

// Import hooks and components
import { 
  useChatbotConfigs,
  useChatbotConfig,
  useCreateChatbotConfig,
  useUpdateChatbotConfig,
  useTestChatbot,
  useAnalyzeQuestionnaire,
  useContentSources
} from '@/hooks/api'
import type {
  ChatbotConfig,
  ChatbotConfigCreate,
  ChatbotConfigUpdate,
  ChatbotTestRequest,
  ChatbotTestResponse,
  PersonalityType,
  ResponseStyle,
  LLMProvider,
  QuestionnaireResponse
} from '@/types'

/**
 * ========================================================================
 * CONFIGURATION OPTIONS
 * ========================================================================
 */

const PERSONALITY_TYPES = [
  {
    value: 'professional' as PersonalityType,
    label: 'Professional',
    description: 'Formal, business-focused communication',
    icon: <Users className="h-4 w-4" />,
    examples: ['How may I assist you today?', 'I understand your concern.', 'Let me help you resolve this.']
  },
  {
    value: 'friendly' as PersonalityType,
    label: 'Friendly',
    description: 'Warm, approachable, and conversational',
    icon: <Smile className="h-4 w-4" />,
    examples: ['Hi there! How can I help?', 'Great question!', 'I\'m happy to assist you!']
  },
  {
    value: 'helpful' as PersonalityType,
    label: 'Helpful',
    description: 'Solution-oriented and supportive',
    icon: <Target className="h-4 w-4" />,
    examples: ['Let me walk you through this.', 'Here\'s what I recommend.', 'I can help you with that.']
  },
  {
    value: 'expert' as PersonalityType,
    label: 'Expert',
    description: 'Knowledgeable and authoritative',
    icon: <Brain className="h-4 w-4" />,
    examples: ['Based on my analysis...', 'The optimal solution is...', 'Research shows that...']
  }
]

const RESPONSE_STYLES = [
  {
    value: 'concise' as ResponseStyle,
    label: 'Concise',
    description: 'Brief, to-the-point answers',
    example: 'Direct answers in 1-2 sentences'
  },
  {
    value: 'detailed' as ResponseStyle,
    label: 'Detailed',
    description: 'Comprehensive, thorough explanations',
    example: 'In-depth responses with examples and context'
  },
  {
    value: 'conversational' as ResponseStyle,
    label: 'Conversational',
    description: 'Natural, flowing dialogue',
    example: 'Responses that feel like talking to a friend'
  },
  {
    value: 'structured' as ResponseStyle,
    label: 'Structured',
    description: 'Organized with bullet points and sections',
    example: 'Formatted responses with clear organization'
  }
]

const LLM_PROVIDERS = [
  {
    value: 'openai' as LLMProvider,
    label: 'OpenAI',
    models: ['gpt-4', 'gpt-3.5-turbo'],
    recommended: true,
    description: 'High-quality responses, best for production'
  },
  {
    value: 'anthropic' as LLMProvider,
    label: 'Anthropic',
    models: ['claude-3-sonnet', 'claude-3-haiku'],
    recommended: true,
    description: 'Great reasoning and safety features'
  },
  {
    value: 'local' as LLMProvider,
    label: 'Local LLM',
    models: ['llama-2-7b', 'llama-2-13b', 'mistral-7b'],
    recommended: false,
    description: 'Self-hosted models for privacy'
  }
]

/**
 * ========================================================================
 * INTERFACES & TYPES
 * ========================================================================
 */

interface ChatbotConfigWithStatus extends ChatbotConfig {
  status?: 'draft' | 'testing' | 'active' | 'archived'
  lastTested?: string
  testResults?: {
    averageResponseTime: number
    qualityScore: number
    knowledgeAccuracy: number
  }
}

interface TestMessage {
  id: string
  message: string
  response?: string
  responseTime?: number
  timestamp: Date
  status: 'pending' | 'completed' | 'failed'
}

interface ChatPreviewProps {
  config: ChatbotConfigWithStatus
  onTest: (message: string) => void
  messages: TestMessage[]
  isLoading: boolean
}

/**
 * ========================================================================
 * CHAT PREVIEW COMPONENT
 * ========================================================================
 */

const ChatPreview: React.FC<ChatPreviewProps> = ({ config, onTest, messages, isLoading }) => {
  const [testMessage, setTestMessage] = useState('')

  const handleSendTest = () => {
    if (testMessage.trim()) {
      onTest(testMessage)
      setTestMessage('')
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <MessageSquare className="h-5 w-5" />
          <span>Chat Preview</span>
        </CardTitle>
        <CardDescription>
          Test your chatbot configuration with sample messages
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col h-96">
        {/* Chat Messages */}
        <ScrollArea className="flex-1 mb-4 p-4 border rounded-lg bg-gray-50">
          <div className="space-y-4">
            {/* Welcome Message */}
            <div className="flex items-start space-x-3">
              <div className="bg-blue-500 rounded-full p-2">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm max-w-xs">
                <p className="text-sm">{config.greeting_message || 'Hello! How can I help you today?'}</p>
              </div>
            </div>

            {/* Test Messages */}
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                {/* User Message */}
                <div className="flex justify-end">
                  <div className="bg-blue-500 text-white p-3 rounded-lg max-w-xs">
                    <p className="text-sm">{msg.message}</p>
                  </div>
                </div>

                {/* Bot Response */}
                {msg.status === 'completed' && msg.response && (
                  <div className="flex items-start space-x-3">
                    <div className="bg-blue-500 rounded-full p-2">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm max-w-xs">
                      <p className="text-sm">{msg.response}</p>
                      {msg.responseTime && (
                        <p className="text-xs text-gray-500 mt-1">
                          Response time: {msg.responseTime}ms
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {msg.status === 'pending' && (
                  <div className="flex items-start space-x-3">
                    <div className="bg-blue-500 rounded-full p-2">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-gray-500">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                {msg.status === 'failed' && (
                  <div className="flex items-start space-x-3">
                    <div className="bg-red-500 rounded-full p-2">
                      <XCircle className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg shadow-sm">
                      <p className="text-sm text-red-600">Failed to get response</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Test Input */}
        <div className="flex space-x-2">
          <Input
            placeholder="Type a test message..."
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendTest()}
            disabled={isLoading}
          />
          <Button 
            onClick={handleSendTest} 
            disabled={!testMessage.trim() || isLoading}
            size="sm"
          >
            <Play className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * ========================================================================
 * MAIN CHATBOT PAGE COMPONENT
 * ========================================================================
 */

const ChatbotPage = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [testMessages, setTestMessages] = useState<TestMessage[]>([])

  // API Hooks
  const { data: configs, isLoading: configsLoading, refetch: refetchConfigs } = useChatbotConfigs()
  const { data: selectedConfigData } = useChatbotConfig(selectedConfig!)
  const { data: contentSources } = useContentSources()
  const createConfig = useCreateChatbotConfig()
  const updateConfig = useUpdateChatbotConfig()
  const testChatbot = useTestChatbot()

  // Current configuration state
  const [configForm, setConfigForm] = useState<Partial<ChatbotConfigCreate>>({
    name: '',
    description: '',
    personality_type: 'friendly',
    response_style: 'conversational',
    llm_provider: 'openai',
    llm_model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_response_length: 500,
    use_emojis: false,
    include_sources: true,
    greeting_message: '',
    fallback_message: '',
    escalation_keywords: [],
    restricted_topics: []
  })

  // Initialize form with selected config
  useEffect(() => {
    if (selectedConfigData) {
      setConfigForm({
        name: selectedConfigData.name,
        description: selectedConfigData.description,
        personality_type: selectedConfigData.personality_type,
        response_style: selectedConfigData.response_style,
        llm_provider: selectedConfigData.llm_provider,
        llm_model: selectedConfigData.llm_model,
        temperature: selectedConfigData.temperature,
        max_response_length: selectedConfigData.max_response_length,
        use_emojis: selectedConfigData.use_emojis,
        include_sources: selectedConfigData.include_sources,
        greeting_message: selectedConfigData.greeting_message,
        fallback_message: selectedConfigData.fallback_message,
        escalation_keywords: selectedConfigData.escalation_keywords || [],
        restricted_topics: selectedConfigData.restricted_topics || []
      })
    }
  }, [selectedConfigData])

  // Handle form changes
  const handleFormChange = useCallback((field: string, value: any) => {
    setConfigForm(prev => ({ ...prev, [field]: value }))
  }, [])

  // Handle test message
  const handleTestMessage = useCallback(async (message: string) => {
    if (!selectedConfig) return

    const testId = Date.now().toString()
    const newMessage: TestMessage = {
      id: testId,
      message,
      timestamp: new Date(),
      status: 'pending'
    }

    setTestMessages(prev => [...prev, newMessage])

    try {
      const result = await testChatbot.mutateAsync({
        config_id: selectedConfig,
        message,
        include_analytics: true
      })

      setTestMessages(prev => 
        prev.map(msg => 
          msg.id === testId 
            ? {
                ...msg,
                response: result.response,
                responseTime: result.response_time_ms,
                status: 'completed'
              }
            : msg
        )
      )
    } catch (error) {
      setTestMessages(prev => 
        prev.map(msg => 
          msg.id === testId 
            ? { ...msg, status: 'failed' }
            : msg
        )
      )
      toast({
        title: "Test failed",
        description: "Failed to get response from chatbot",
        variant: "destructive"
      })
    }
  }, [selectedConfig, testChatbot, toast])

  // Handle save configuration
  const handleSaveConfig = useCallback(async () => {
    try {
      if (selectedConfig) {
        await updateConfig.mutateAsync({
          id: selectedConfig,
          data: configForm as ChatbotConfigUpdate
        })
        toast({
          title: "Configuration saved",
          description: "Chatbot configuration updated successfully"
        })
      } else {
        const result = await createConfig.mutateAsync(configForm as ChatbotConfigCreate)
        setSelectedConfig(result.id)
        setIsCreating(false)
        toast({
          title: "Configuration created",
          description: "New chatbot configuration created successfully"
        })
      }
      refetchConfigs()
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Failed to save configuration",
        variant: "destructive"
      })
    }
  }, [selectedConfig, configForm, updateConfig, createConfig, refetchConfigs, toast])

  // Configuration stats
  const configStats = useMemo(() => {
    if (!configs) return { total: 0, active: 0, draft: 0 }
    
    return {
      total: configs.length,
      active: configs.filter(c => c.status === 'active').length,
      draft: configs.filter(c => c.status === 'draft').length
    }
  }, [configs])

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chatbot Configuration</h1>
          <p className="text-muted-foreground">
            Configure your chatbot's personality, behavior, and capabilities
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => refetchConfigs()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Configuration
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center p-6">
            <Bot className="h-8 w-8 text-blue-500 mr-4" />
            <div>
              <h3 className="text-2xl font-bold">{configStats.total}</h3>
              <p className="text-sm text-muted-foreground">Total Configurations</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center p-6">
            <CheckCircle2 className="h-8 w-8 text-green-500 mr-4" />
            <div>
              <h3 className="text-2xl font-bold">{configStats.active}</h3>
              <p className="text-sm text-muted-foreground">Active Configs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center p-6">
            <Clock className="h-8 w-8 text-orange-500 mr-4" />
            <div>
              <h3 className="text-2xl font-bold">{configStats.draft}</h3>
              <p className="text-sm text-muted-foreground">Draft Configs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="configure">Configure</TabsTrigger>
          <TabsTrigger value="test">Test & Preview</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {configsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded mb-4"></div>
                    <div className="h-8 bg-gray-200 rounded"></div>
                  </CardContent>
                </Card>
              ))
            ) : configs && configs.length > 0 ? (
              configs.map((config) => (
                <Card 
                  key={config.id} 
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-gray-50",
                    selectedConfig === config.id && "ring-2 ring-blue-500"
                  )}
                  onClick={() => setSelectedConfig(config.id)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{config.name}</span>
                      <Badge variant={config.status === 'active' ? 'default' : 'secondary'}>
                        {config.status || 'draft'}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{config.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Personality:</span>
                        <Badge variant="outline">{config.personality_type}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Response Style:</span>
                        <Badge variant="outline">{config.response_style}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>LLM Provider:</span>
                        <Badge variant="outline">{config.llm_provider}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Updated {formatDistanceToNow(new Date(config.updated_at))} ago
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bot className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No chatbot configurations</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Get started by creating your first chatbot configuration
                  </p>
                  <Button onClick={() => setIsCreating(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Configuration
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Configure Tab */}
        <TabsContent value="configure" className="space-y-6">
          {(selectedConfig || isCreating) ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Configuration Form */}
              <div className="space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>
                      Set the basic details for your chatbot configuration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Configuration Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Customer Support Bot"
                        value={configForm.name}
                        onChange={(e) => handleFormChange('name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Describe what this chatbot is designed to do..."
                        value={configForm.description}
                        onChange={(e) => handleFormChange('description', e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Personality & Style */}
                <Card>
                  <CardHeader>
                    <CardTitle>Personality & Style</CardTitle>
                    <CardDescription>
                      Define how your chatbot communicates and behaves
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <Label>Personality Type</Label>
                      <RadioGroup
                        value={configForm.personality_type}
                        onValueChange={(value) => handleFormChange('personality_type', value)}
                      >
                        {PERSONALITY_TYPES.map((type) => (
                          <div key={type.value} className="flex items-center space-x-2">
                            <RadioGroupItem value={type.value} id={type.value} />
                            <Label htmlFor={type.value} className="flex-1 cursor-pointer">
                              <div className="flex items-center space-x-3">
                                {type.icon}
                                <div>
                                  <div className="font-medium">{type.label}</div>
                                  <div className="text-sm text-muted-foreground">{type.description}</div>
                                </div>
                              </div>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>

                    <div className="space-y-3">
                      <Label>Response Style</Label>
                      <Select
                        value={configForm.response_style}
                        onValueChange={(value) => handleFormChange('response_style', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RESPONSE_STYLES.map((style) => (
                            <SelectItem key={style.value} value={style.value}>
                              <div>
                                <div className="font-medium">{style.label}</div>
                                <div className="text-sm text-muted-foreground">{style.description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* LLM Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle>Language Model Configuration</CardTitle>
                    <CardDescription>
                      Choose the AI model and configure its behavior
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>LLM Provider</Label>
                      <Select
                        value={configForm.llm_provider}
                        onValueChange={(value) => handleFormChange('llm_provider', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LLM_PROVIDERS.map((provider) => (
                            <SelectItem key={provider.value} value={provider.value}>
                              <div className="flex items-center space-x-2">
                                <span>{provider.label}</span>
                                {provider.recommended && (
                                  <Badge variant="secondary" className="text-xs">Recommended</Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Model</Label>
                      <Select
                        value={configForm.llm_model}
                        onValueChange={(value) => handleFormChange('llm_model', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LLM_PROVIDERS
                            .find(p => p.value === configForm.llm_provider)
                            ?.models.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Temperature: {configForm.temperature}</Label>
                      <Slider
                        value={[configForm.temperature || 0.7]}
                        onValueChange={([value]) => handleFormChange('temperature', value)}
                        max={2}
                        min={0}
                        step={0.1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>More focused</span>
                        <span>More creative</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxLength">Max Response Length</Label>
                      <Input
                        id="maxLength"
                        type="number"
                        min={50}
                        max={2000}
                        value={configForm.max_response_length}
                        onChange={(e) => handleFormChange('max_response_length', parseInt(e.target.value))}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Messages & Responses */}
                <Card>
                  <CardHeader>
                    <CardTitle>Messages & Responses</CardTitle>
                    <CardDescription>
                      Customize greeting and fallback messages
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="greeting">Greeting Message</Label>
                      <Textarea
                        id="greeting"
                        placeholder="Hello! How can I help you today?"
                        value={configForm.greeting_message}
                        onChange={(e) => handleFormChange('greeting_message', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fallback">Fallback Message</Label>
                      <Textarea
                        id="fallback"
                        placeholder="I'm sorry, I don't understand. Could you please rephrase your question?"
                        value={configForm.fallback_message}
                        onChange={(e) => handleFormChange('fallback_message', e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Behavior Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle>Behavior Settings</CardTitle>
                    <CardDescription>
                      Configure additional chatbot behaviors
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Use Emojis</Label>
                        <div className="text-sm text-muted-foreground">
                          Allow the chatbot to use emojis in responses
                        </div>
                      </div>
                      <Switch
                        checked={configForm.use_emojis}
                        onCheckedChange={(checked) => handleFormChange('use_emojis', checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Include Sources</Label>
                        <div className="text-sm text-muted-foreground">
                          Show source references in responses
                        </div>
                      </div>
                      <Switch
                        checked={configForm.include_sources}
                        onCheckedChange={(checked) => handleFormChange('include_sources', checked)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Configuration Preview */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration Preview</CardTitle>
                    <CardDescription>
                      See how your configuration settings will affect the chatbot
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 border rounded-lg bg-gray-50">
                      <h4 className="font-medium mb-3">Sample Response Preview</h4>
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3">
                          <div className="bg-blue-500 rounded-full p-2">
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                          <div className="bg-white p-3 rounded-lg shadow-sm">
                            <p className="text-sm">
                              {configForm.greeting_message || 'Hello! How can I help you today?'}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>• Personality: {configForm.personality_type}</div>
                          <div>• Style: {configForm.response_style}</div>
                          <div>• Model: {configForm.llm_model}</div>
                          <div>• Temperature: {configForm.temperature}</div>
                        </div>
                      </div>
                    </div>

                    {/* Knowledge Base Integration */}
                    <div className="space-y-3">
                      <h4 className="font-medium">Knowledge Base Integration</h4>
                      <div className="space-y-2">
                        {contentSources && contentSources.data ? (
                          contentSources.data.slice(0, 3).map((source) => (
                            <div key={source.id} className="flex items-center justify-between p-2 border rounded">
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-blue-500" />
                                <span className="text-sm">{source.name}</span>
                              </div>
                              <Badge variant={source.status === 'completed' ? 'default' : 'secondary'}>
                                {source.status}
                              </Badge>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground p-3 border rounded border-dashed">
                            No content sources available. Add content in the Content tab to enhance your chatbot's knowledge.
                          </div>
                        )}
                      </div>
                      {contentSources?.data && contentSources.data.length > 3 && (
                        <div className="text-sm text-muted-foreground">
                          +{contentSources.data.length - 3} more sources
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Save Actions */}
                <div className="flex space-x-2">
                  <Button 
                    onClick={handleSaveConfig} 
                    disabled={!configForm.name || createConfig.isPending || updateConfig.isPending}
                    className="flex-1"
                  >
                    {createConfig.isPending || updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {selectedConfig ? 'Update Configuration' : 'Create Configuration'}
                  </Button>
                  {(selectedConfig || isCreating) && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSelectedConfig(null)
                        setIsCreating(false)
                        setConfigForm({
                          name: '',
                          description: '',
                          personality_type: 'friendly',
                          response_style: 'conversational',
                          llm_provider: 'openai',
                          llm_model: 'gpt-3.5-turbo',
                          temperature: 0.7,
                          max_response_length: 500,
                          use_emojis: false,
                          include_sources: true,
                          greeting_message: '',
                          fallback_message: '',
                          escalation_keywords: [],
                          restricted_topics: []
                        })
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a configuration to edit</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Choose a configuration from the Overview tab or create a new one
                </p>
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Configuration
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Test & Preview Tab */}
        <TabsContent value="test" className="space-y-4">
          {selectedConfig ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Chat Preview */}
              <ChatPreview
                config={selectedConfigData as ChatbotConfigWithStatus}
                onTest={handleTestMessage}
                messages={testMessages}
                isLoading={testChatbot.isPending}
              />

              {/* Test Results & Analytics */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <TestTube className="h-5 w-5" />
                      <span>Test Results</span>
                    </CardTitle>
                    <CardDescription>
                      Performance metrics from your test conversations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {testMessages.length > 0 ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="text-center p-3 border rounded">
                            <div className="text-2xl font-bold text-green-600">
                              {testMessages.filter(m => m.status === 'completed').length}
                            </div>
                            <div className="text-sm text-muted-foreground">Successful Tests</div>
                          </div>
                          <div className="text-center p-3 border rounded">
                            <div className="text-2xl font-bold text-blue-600">
                              {testMessages.filter(m => m.responseTime).reduce((avg, m) => avg + (m.responseTime || 0), 0) / testMessages.filter(m => m.responseTime).length || 0}ms
                            </div>
                            <div className="text-sm text-muted-foreground">Avg Response Time</div>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <h4 className="font-medium">Recent Test Messages</h4>
                          <ScrollArea className="h-48">
                            <div className="space-y-2">
                              {testMessages.slice(-5).reverse().map((msg) => (
                                <div key={msg.id} className="p-3 border rounded text-sm">
                                  <div className="font-medium mb-1">{msg.message}</div>
                                  <div className="text-muted-foreground">
                                    {msg.status === 'completed' ? `Response: ${msg.response?.substring(0, 100)}...` : `Status: ${msg.status}`}
                                  </div>
                                  {msg.responseTime && (
                                    <div className="text-xs text-green-600 mt-1">
                                      {msg.responseTime}ms
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <MessageCircleMore className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h4 className="font-medium mb-2">No tests run yet</h4>
                        <p className="text-muted-foreground text-sm">
                          Start testing your chatbot by sending messages in the chat preview
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Test Suggestions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Test Suggestions</CardTitle>
                    <CardDescription>
                      Try these sample messages to test different aspects of your chatbot
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        "Hello, I need help with...",
                        "What services do you offer?",
                        "Can you help me find information about...",
                        "I'm having trouble with...",
                        "What are your business hours?",
                        "How do I contact support?"
                      ].map((suggestion, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-left"
                          onClick={() => handleTestMessage(suggestion)}
                          disabled={!selectedConfig || testChatbot.isPending}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TestTube className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a configuration to test</h3>
                <p className="text-muted-foreground text-center">
                  Choose a configuration from the Overview tab to start testing
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-4">
          {selectedConfig ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Advanced Settings */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Advanced Settings</CardTitle>
                    <CardDescription>
                      Fine-tune advanced behavior and safety settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Escalation Keywords</Label>
                      <Textarea
                        placeholder="Enter keywords that should trigger escalation (one per line)"
                        value={configForm.escalation_keywords?.join('\n') || ''}
                        onChange={(e) => handleFormChange('escalation_keywords', e.target.value.split('\n').filter(k => k.trim()))}
                      />
                      <div className="text-xs text-muted-foreground">
                        Keywords like "urgent", "complaint", "manager" will trigger escalation to human support
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Restricted Topics</Label>
                      <Textarea
                        placeholder="Enter topics the chatbot should avoid (one per line)"
                        value={configForm.restricted_topics?.join('\n') || ''}
                        onChange={(e) => handleFormChange('restricted_topics', e.target.value.split('\n').filter(t => t.trim()))}
                      />
                      <div className="text-xs text-muted-foreground">
                        The chatbot will politely decline to discuss these topics
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* System Prompt Template */}
                <Card>
                  <CardHeader>
                    <CardTitle>System Prompt Template</CardTitle>
                    <CardDescription>
                      Customize the system prompt that guides the chatbot's behavior
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="Enter custom system prompt template..."
                      value={configForm.system_prompt_template || ''}
                      onChange={(e) => handleFormChange('system_prompt_template', e.target.value)}
                      className="min-h-32"
                    />
                    <div className="text-xs text-muted-foreground">
                      Use variables like {'{organization_name}'}, {'{personality_type}'}, {'{response_style}'} that will be automatically replaced
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Configuration Export/Import */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration Management</CardTitle>
                    <CardDescription>
                      Export, import, or duplicate configurations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export Config
                      </Button>
                      <Button variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-2" />
                        Import Config
                      </Button>
                      <Button variant="outline" size="sm">
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </Button>
                      <Button variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reset to Default
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Performance Monitoring */}
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Monitoring</CardTitle>
                    <CardDescription>
                      Monitor your chatbot's performance metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">Response Time</div>
                          <div className="text-sm text-muted-foreground">Average: 0ms</div>
                        </div>
                        <BarChart3 className="h-5 w-5 text-blue-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">Success Rate</div>
                          <div className="text-sm text-muted-foreground">0% successful responses</div>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">Knowledge Accuracy</div>
                          <div className="text-sm text-muted-foreground">0% accurate answers</div>
                        </div>
                        <Target className="h-5 w-5 text-purple-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* API Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle>API Configuration</CardTitle>
                    <CardDescription>
                      Advanced API and integration settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Webhook URL</Label>
                      <Input placeholder="https://your-api.com/webhook" />
                      <div className="text-xs text-muted-foreground">
                        Receive notifications when conversations are escalated
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Custom Headers</Label>
                      <Textarea
                        placeholder={`{\n  "Authorization": "Bearer your-token",\n  "Content-Type": "application/json"\n}`}
                        className="font-mono text-sm"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a configuration for advanced settings</h3>
                <p className="text-muted-foreground text-center">
                  Choose a configuration from the Overview tab to access advanced options
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default ChatbotPage