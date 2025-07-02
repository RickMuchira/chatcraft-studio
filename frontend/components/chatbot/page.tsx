// app/dashboard/chatbot/page.tsx - Comprehensive Chatbot Configuration Page

"use client"

import React, { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bot, 
  MessageCircle, 
  Settings, 
  Wand2, 
  Play, 
  Save, 
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Lightbulb,
  Zap,
  Brain,
  Heart,
  Shield,
  Users,
  Sparkles,
  Target,
  Globe,
  Clock,
  BarChart3,
  Sliders,
  TestTube,
  MessageSquare,
  User,
  ChevronRight,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

// Import hooks and types
import { 
  useChatbotConfigs,
  useChatbotConfig, 
  useCreateChatbotConfig,
  useUpdateChatbotConfig,
  useTestChatbot,
  useAnalyzeQuestionnaire
} from '@/hooks/api'
import { useChatbotService } from '@/services/chatbot-service'
import { useOnboarding } from '@/stores/auth-store'
import type { 
  ChatbotConfig,
  ChatbotPersonality,
  ResponseStyle,
  FallbackBehavior,
  LLMProvider,
  ChatbotTestRequest,
  ChatMessage
} from '@/types'

/**
 * ========================================================================
 * CONFIGURATION CONSTANTS
 * ========================================================================
 */

const PERSONALITY_OPTIONS = [
  {
    value: 'professional' as ChatbotPersonality,
    label: 'Professional',
    description: 'Formal, precise, and business-focused',
    icon: <Shield className="h-5 w-5" />,
    example: "I'd be happy to assist you with your inquiry. Let me provide you with the information you need.",
    color: 'bg-blue-500'
  },
  {
    value: 'friendly' as ChatbotPersonality,
    label: 'Friendly',
    description: 'Warm, approachable, and conversational',
    icon: <Heart className="h-5 w-5" />,
    example: "Hi there! I'm here to help you out. What can I do for you today? 😊",
    color: 'bg-green-500'
  },
  {
    value: 'technical' as ChatbotPersonality,
    label: 'Technical',
    description: 'Detailed, accurate, and technically precise',
    icon: <Brain className="h-5 w-5" />,
    example: "Based on the documentation, here's the technical implementation approach you'll need to follow.",
    color: 'bg-purple-500'
  },
  {
    value: 'empathetic' as ChatbotPersonality,
    label: 'Empathetic',
    description: 'Understanding, supportive, and emotionally aware',
    icon: <Users className="h-5 w-5" />,
    example: "I understand this might be frustrating. Let me help you resolve this step by step.",
    color: 'bg-pink-500'
  },
  {
    value: 'concise' as ChatbotPersonality,
    label: 'Concise',
    description: 'Brief, direct, and to-the-point',
    icon: <Target className="h-5 w-5" />,
    example: "Reset password: Settings > Security > Change Password. Done.",
    color: 'bg-orange-500'
  },
]

const RESPONSE_STYLES = [
  {
    value: 'conversational' as ResponseStyle,
    label: 'Conversational',
    description: 'Natural, flowing dialogue',
    icon: <MessageCircle className="h-4 w-4" />,
  },
  {
    value: 'structured' as ResponseStyle,
    label: 'Structured',
    description: 'Organized with clear sections',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    value: 'bullet_points' as ResponseStyle,
    label: 'Bullet Points',
    description: 'Key information in lists',
    icon: <Target className="h-4 w-4" />,
  },
  {
    value: 'step_by_step' as ResponseStyle,
    label: 'Step by Step',
    description: 'Sequential instructions',
    icon: <ChevronRight className="h-4 w-4" />,
  },
]

const LLM_PROVIDERS = [
  {
    value: 'ollama' as LLMProvider,
    label: 'Ollama',
    description: 'Local models for privacy',
    models: ['llama2', 'codellama', 'mistral'],
  },
  {
    value: 'huggingface' as LLMProvider,
    label: 'HuggingFace',
    description: 'Open-source transformer models',
    models: ['microsoft/DialoGPT-large', 'facebook/blenderbot-400M'],
  },
  {
    value: 'localai' as LLMProvider,
    label: 'LocalAI',
    description: 'Self-hosted OpenAI-compatible API',
    models: ['gpt-3.5-turbo-compatible', 'llama-7b'],
  },
]

/**
 * ========================================================================
 * COMPONENT INTERFACES
 * ========================================================================
 */

interface PersonalityCardProps {
  personality: typeof PERSONALITY_OPTIONS[0]
  selected: boolean
  onSelect: (value: ChatbotPersonality) => void
}

interface TestChatProps {
  config: Partial<ChatbotConfig>
  onTest: (messages: string[]) => void
  isLoading: boolean
}

interface ConfigFormProps {
  config: Partial<ChatbotConfig>
  onChange: (config: Partial<ChatbotConfig>) => void
  onSave: () => void
  onTest: () => void
  isSaving: boolean
  isTesting: boolean
}

/**
 * ========================================================================
 * SUB-COMPONENTS
 * ========================================================================
 */

const PersonalityCard: React.FC<PersonalityCardProps> = ({ 
  personality, 
  selected, 
  onSelect 
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative overflow-hidden rounded-lg border-2 cursor-pointer transition-all duration-200",
        selected 
          ? "border-primary bg-primary/5 shadow-md" 
          : "border-border hover:border-primary/50 hover:bg-muted/50"
      )}
      onClick={() => onSelect(personality.value)}
    >
      <div className="p-4">
        <div className="flex items-start space-x-3">
          <div className={cn(
            "flex-shrink-0 p-2 rounded-lg text-white",
            personality.color
          )}>
            {personality.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">{personality.label}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {personality.description}
            </p>
            <div className="mt-3 p-2 bg-muted/50 rounded text-xs italic">
              "{personality.example}"
            </div>
          </div>
        </div>
      </div>
      
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-2 right-2"
        >
          <div className="p-1 bg-primary rounded-full">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

const TestChat: React.FC<TestChatProps> = ({ config, onTest, isLoading }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [testResults, setTestResults] = useState<any>(null)

  const testMessages = [
    "Hello, how can I help you today?",
    "What are your business hours?",
    "I need to reset my password",
    "Can you explain your refund policy?",
    "I'm having trouble with my account"
  ]

  const handleSendMessage = useCallback(() => {
    if (!currentMessage.trim()) return

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      conversation_id: 'test',
      role: 'user',
      content: currentMessage,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, newMessage])
    onTest([currentMessage])
    setCurrentMessage('')
  }, [currentMessage, onTest])

  const handleQuickTest = useCallback((message: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      conversation_id: 'test',
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, newMessage])
    onTest([message])
  }, [onTest])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <TestTube className="h-5 w-5" />
          <span>Test Your Chatbot</span>
        </CardTitle>
        <CardDescription>
          Try different messages to see how your chatbot responds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Test Messages */}
        <div>
          <Label className="text-sm font-medium">Quick Tests</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {testMessages.map((message, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleQuickTest(message)}
                disabled={isLoading}
                className="text-xs"
              >
                {message}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Chat Interface */}
        <div className="space-y-3">
          <ScrollArea className="h-40 w-full border rounded-md p-3">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm">
                No messages yet. Try sending a test message!
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] p-2 rounded-lg text-sm",
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted p-2 rounded-lg text-sm">
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                        </div>
                        <span className="text-xs text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Message Input */}
          <div className="flex space-x-2">
            <Input
              placeholder="Type a test message..."
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!currentMessage.trim() || isLoading}
              size="sm"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const ConfigForm: React.FC<ConfigFormProps> = ({
  config,
  onChange,
  onSave,
  onTest,
  isSaving,
  isTesting
}) => {
  const handleChange = useCallback((field: keyof ChatbotConfig, value: any) => {
    onChange({ ...config, [field]: value })
  }, [config, onChange])

  return (
    <div className="space-y-6">
      {/* Basic Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bot className="h-5 w-5" />
            <span>Basic Configuration</span>
          </CardTitle>
          <CardDescription>
            Set up your chatbot's basic information and behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Chatbot Name</Label>
              <Input
                id="name"
                placeholder="e.g., Customer Support Bot"
                value={config.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief description of your chatbot"
                value={config.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="greeting">Greeting Message</Label>
            <Textarea
              id="greeting"
              placeholder="Hello! How can I help you today?"
              value={config.greeting_message || ''}
              onChange={(e) => handleChange('greeting_message', e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Personality Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5" />
            <span>Personality</span>
          </CardTitle>
          <CardDescription>
            Choose how your chatbot communicates with users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PERSONALITY_OPTIONS.map((personality) => (
              <PersonalityCard
                key={personality.value}
                personality={personality}
                selected={config.personality_type === personality.value}
                onSelect={(value) => handleChange('personality_type', value)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Response Style */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="h-5 w-5" />
            <span>Response Style</span>
          </CardTitle>
          <CardDescription>
            Configure how responses are structured and presented
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {RESPONSE_STYLES.map((style) => (
              <div
                key={style.value}
                className={cn(
                  "p-3 border rounded-lg cursor-pointer transition-all",
                  config.response_style === style.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => handleChange('response_style', style.value)}
              >
                <div className="flex items-center space-x-2 mb-1">
                  {style.icon}
                  <span className="text-sm font-medium">{style.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {style.description}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Use Emojis</Label>
                <p className="text-xs text-muted-foreground">
                  Add emojis to make responses more engaging
                </p>
              </div>
              <Switch
                checked={config.use_emojis || false}
                onCheckedChange={(checked) => handleChange('use_emojis', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Include Sources</Label>
                <p className="text-xs text-muted-foreground">
                  Show source references in responses
                </p>
              </div>
              <Switch
                checked={config.include_sources || false}
                onCheckedChange={(checked) => handleChange('include_sources', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Sliders className="h-5 w-5" />
            <span>Advanced Settings</span>
          </CardTitle>
          <CardDescription>
            Fine-tune your chatbot's behavior and performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Response Length</Label>
                <span className="text-sm text-muted-foreground">
                  {config.max_response_length || 500} tokens
                </span>
              </div>
              <Slider
                value={[config.max_response_length || 500]}
                onValueChange={([value]) => handleChange('max_response_length', value)}
                max={2000}
                min={100}
                step={50}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Creativity Level</Label>
                <span className="text-sm text-muted-foreground">
                  {(config.temperature || 0.7).toFixed(1)}
                </span>
              </div>
              <Slider
                value={[config.temperature || 0.7]}
                onValueChange={([value]) => handleChange('temperature', value)}
                max={1}
                min={0}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Conservative</span>
                <span>Creative</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>LLM Provider</Label>
              <Select
                value={config.llm_provider || 'ollama'}
                onValueChange={(value) => handleChange('llm_provider', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose LLM provider" />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      <div className="flex items-center space-x-2">
                        <span>{provider.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {provider.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={config.llm_model || ''}
                onValueChange={(value) => handleChange('llm_model', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose model" />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDERS
                    .find(p => p.value === config.llm_provider)
                    ?.models.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    )) || (
                    <SelectItem value="" disabled>
                      Select a provider first
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6">
        <Button
          variant="outline"
          onClick={onTest}
          disabled={isTesting}
          className="flex items-center space-x-2"
        >
          {isTesting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span>Test Configuration</span>
        </Button>

        <Button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center space-x-2"
        >
          {isSaving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span>Save Configuration</span>
        </Button>
      </div>
    </div>
  )
}

/**
 * ========================================================================
 * MAIN COMPONENT
 * ========================================================================
 */

export default function ChatbotConfigurationPage() {
  const [currentConfig, setCurrentConfig] = useState<Partial<ChatbotConfig>>({
    personality_type: 'friendly',
    response_style: 'conversational',
    temperature: 0.7,
    max_response_length: 500,
    use_emojis: true,
    include_sources: true,
    llm_provider: 'ollama',
  })
  const [activeTab, setActiveTab] = useState('configure')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // API Hooks
  const { data: configs, isLoading: configsLoading } = useChatbotConfigs()
  const createConfig = useCreateChatbotConfig()
  const updateConfig = useUpdateChatbotConfig()
  const testChatbot = useTestChatbot()
  const { features, updateOnboardingStep } = useOnboarding()

  // Chatbot Service
  const { sendMessage, isConnected } = useChatbotService({
    debug: true,
  })

  // Load existing config if available
  useEffect(() => {
    if (configs && configs.length > 0) {
      setCurrentConfig(configs[0])
    }
  }, [configs])

  // Event Handlers
  const handleSaveConfig = useCallback(async () => {
    try {
      if (currentConfig.id) {
        await updateConfig.mutateAsync({
          id: currentConfig.id,
          data: currentConfig,
        })
      } else {
        await createConfig.mutateAsync(currentConfig)
      }

      // Mark chatbot configuration as completed
      updateOnboardingStep('chatbot_config')

      toast({
        title: 'Configuration Saved',
        description: 'Your chatbot configuration has been saved successfully.',
      })
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Failed to save configuration',
        variant: 'destructive',
      })
    }
  }, [currentConfig, createConfig, updateConfig, updateOnboardingStep])

  const handleTestConfig = useCallback(async () => {
    try {
      const testRequest: ChatbotTestRequest = {
        config_id: currentConfig.id,
        test_messages: [
          'Hello, how can you help me?',
          'What are your business hours?',
          'I need technical support',
        ],
      }

      const result = await testChatbot.mutateAsync(testRequest)

      toast({
        title: 'Test Completed',
        description: `Average response time: ${result.performance_metrics.average_response_time}ms`,
      })
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Failed to test chatbot',
        variant: 'destructive',
      })
    }
  }, [currentConfig, testChatbot])

  const handleTestMessage = useCallback(async (messages: string[]) => {
    try {
      for (const message of messages) {
        await sendMessage(message)
      }
    } catch (error) {
      console.error('Test message failed:', error)
    }
  }, [sendMessage])

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chatbot Configuration</h1>
          <p className="text-muted-foreground">
            Customize your chatbot's personality, behavior, and responses
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {isConnected ? (
            <Badge variant="default" className="bg-green-500">
              <div className="w-2 h-2 bg-white rounded-full mr-2" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary">
              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2" />
              Disconnected
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Indicator */}
      {!features.questionnaire_completed && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Complete the questionnaire first to get AI-powered configuration suggestions.
            <Button variant="link" className="ml-2 p-0 h-auto">
              Go to Questionnaire
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="configure" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Configure</span>
          </TabsTrigger>
          <TabsTrigger value="test" className="flex items-center space-x-2">
            <TestTube className="h-4 w-4" />
            <span>Test & Preview</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configure" className="space-y-6">
          <ConfigForm
            config={currentConfig}
            onChange={setCurrentConfig}
            onSave={handleSaveConfig}
            onTest={handleTestConfig}
            isSaving={createConfig.isPending || updateConfig.isPending}
            isTesting={testChatbot.isPending}
          />
        </TabsContent>

        <TabsContent value="test" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TestChat
              config={currentConfig}
              onTest={handleTestMessage}
              isLoading={false}
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>Configuration Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Personality</span>
                    <Badge variant="outline" className="capitalize">
                      {currentConfig.personality_type || 'Not set'}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Response Style</span>
                    <Badge variant="outline" className="capitalize">
                      {currentConfig.response_style?.replace('_', ' ') || 'Not set'}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">LLM Provider</span>
                    <Badge variant="outline" className="capitalize">
                      {currentConfig.llm_provider || 'Not set'}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Model</span>
                    <Badge variant="outline">
                      {currentConfig.llm_model || 'Not set'}
                    </Badge>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Max Response Length</span>
                    <span className="text-sm text-muted-foreground">
                      {currentConfig.max_response_length || 500} tokens
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Creativity</span>
                    <span className="text-sm text-muted-foreground">
                      {(currentConfig.temperature || 0.7).toFixed(1)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Use Emojis</span>
                    <Badge variant={currentConfig.use_emojis ? "default" : "secondary"}>
                      {currentConfig.use_emojis ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Include Sources</span>
                    <Badge variant={currentConfig.include_sources ? "default" : "secondary"}>
                      {currentConfig.include_sources ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Current Greeting</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {currentConfig.greeting_message || 
                     "Hello! How can I help you today? 😊"}
                  </div>
                </div>
                
                <Alert>
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Test different scenarios to ensure your chatbot responds appropriately 
                    to various types of user questions.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
          
          {/* Advanced Testing Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <span>Advanced Testing</span>
              </CardTitle>
              <CardDescription>
                Test specific scenarios and edge cases
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button 
                  variant="outline" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => handleTestMessage(['What topics can you help me with?'])}
                >
                  <Globe className="h-5 w-5" />
                  <span className="text-xs">Knowledge Test</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => handleTestMessage(['I am very frustrated and angry!'])}
                >
                  <Heart className="h-5 w-5" />
                  <span className="text-xs">Emotional Response</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => handleTestMessage(['Can you help me with quantum physics?'])}
                >
                  <Brain className="h-5 w-5" />
                  <span className="text-xs">Out of Scope</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Smart Suggestions Panel */}
      {features.questionnaire_completed && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-primary">
              <Wand2 className="h-5 w-5" />
              <span>AI Suggestions</span>
            </CardTitle>
            <CardDescription>
              Based on your questionnaire responses, here are some recommendations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-primary">
                  Recommended Personality
                </Label>
                <div className="flex items-center space-x-2">
                  <Heart className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Friendly & Empathetic</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentConfig(prev => ({
                        ...prev,
                        personality_type: 'friendly'
                      }))
                    }}
                  >
                    Apply
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Perfect for customer service and support interactions
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-primary">
                  Suggested Greeting
                </Label>
                <div className="p-2 bg-white/50 rounded text-xs">
                  "Hi there! I'm here to help with any questions about our products 
                  and services. What can I assist you with today? 😊"
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCurrentConfig(prev => ({
                      ...prev,
                      greeting_message: "Hi there! I'm here to help with any questions about our products and services. What can I assist you with today? 😊"
                    }))
                  }}
                >
                  Use This Greeting
                </Button>
              </div>
            </div>
            
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription className="text-sm">
                These suggestions are generated based on your organization type, 
                industry, and communication preferences from the questionnaire.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Quick Actions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="h-16 flex-col space-y-1"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(currentConfig, null, 2))
                toast({ title: 'Copied', description: 'Configuration copied to clipboard' })
              }}
            >
              <Copy className="h-4 w-4" />
              <span className="text-xs">Export Config</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-16 flex-col space-y-1"
              onClick={() => {
                setCurrentConfig({
                  personality_type: 'friendly',
                  response_style: 'conversational',
                  temperature: 0.7,
                  max_response_length: 500,
                  use_emojis: true,
                  include_sources: true,
                  llm_provider: 'ollama',
                })
              }}
            >
              <RefreshCw className="h-4 w-4" />
              <span className="text-xs">Reset to Default</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-16 flex-col space-y-1"
              onClick={() => setActiveTab('test')}
            >
              <Play className="h-4 w-4" />
              <span className="text-xs">Test Now</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-16 flex-col space-y-1"
              onClick={() => {
                // TODO: Navigate to deployment page
                toast({ title: 'Coming Soon', description: 'Deployment page will open here' })
              }}
            >
              <Globe className="h-4 w-4" />
              <span className="text-xs">Deploy Bot</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}