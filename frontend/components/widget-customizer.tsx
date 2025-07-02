// components/widget-customizer.tsx - Comprehensive Widget Customizer for ChatCraft Studio

"use client"

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Palette, 
  Monitor, 
  Smartphone, 
  Tablet,
  Eye,
  Copy,
  Download,
  Settings,
  Paintbrush,
  Type,
  Layout,
  MessageCircle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Wand2,
  Code,
  ExternalLink,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Image,
  Upload,
  X,
  Check,
  Loader2,
  Sparkles,
  Globe,
  Zap
} from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/hooks/use-toast'

// Import types
import type { 
  WidgetStyling, 
  WidgetPosition, 
  WidgetSize,
  DeploymentConfig 
} from '@/types'

/**
 * ========================================================================
 * WIDGET CUSTOMIZATION TYPES & CONSTANTS
 * ========================================================================
 */

interface WidgetCustomizerProps {
  initialStyling?: Partial<WidgetStyling>
  onStyleChange?: (styling: WidgetStyling) => void
  onSave?: (styling: WidgetStyling) => void
  className?: string
}

interface ColorTheme {
  name: string
  primary: string
  secondary: string
  background: string
  text: string
  accent: string
  description: string
}

interface WidgetPreviewProps {
  styling: WidgetStyling
  isMinimized: boolean
  onToggleMinimize: () => void
  previewDevice: 'desktop' | 'tablet' | 'mobile'
}

const COLOR_THEMES: ColorTheme[] = [
  {
    name: 'Corporate Blue',
    primary: '#2563eb',
    secondary: '#f1f5f9',
    background: '#ffffff',
    text: '#1e293b',
    accent: '#3b82f6',
    description: 'Professional and trustworthy'
  },
  {
    name: 'Nature Green',
    primary: '#16a34a',
    secondary: '#f0f9ff',
    background: '#ffffff',
    text: '#0f172a',
    accent: '#22c55e',
    description: 'Fresh and eco-friendly'
  },
  {
    name: 'Sunset Orange',
    primary: '#ea580c',
    secondary: '#fef3c7',
    background: '#ffffff',
    text: '#1c1917',
    accent: '#f97316',
    description: 'Warm and energetic'
  },
  {
    name: 'Royal Purple',
    primary: '#7c3aed',
    secondary: '#f3e8ff',
    background: '#ffffff',
    text: '#1e1b4b',
    accent: '#8b5cf6',
    description: 'Creative and premium'
  },
  {
    name: 'Dark Mode',
    primary: '#6366f1',
    secondary: '#1e293b',
    background: '#0f172a',
    text: '#f1f5f9',
    accent: '#818cf8',
    description: 'Modern dark theme'
  },
  {
    name: 'Pink Passion',
    primary: '#ec4899',
    secondary: '#fdf2f8',
    background: '#ffffff',
    text: '#831843',
    accent: '#f472b6',
    description: 'Playful and vibrant'
  }
]

const POSITION_OPTIONS: { value: WidgetPosition; label: string; description: string }[] = [
  { value: 'bottom-right', label: 'Bottom Right', description: 'Most common placement' },
  { value: 'bottom-left', label: 'Bottom Left', description: 'Alternative corner' },
  { value: 'top-right', label: 'Top Right', description: 'Header area' },
  { value: 'top-left', label: 'Top Left', description: 'Navigation area' },
]

const SIZE_OPTIONS: { value: WidgetSize; label: string; dimensions: string }[] = [
  { value: 'small', label: 'Small', dimensions: '300×400px' },
  { value: 'medium', label: 'Medium', dimensions: '400×500px' },
  { value: 'large', label: 'Large', dimensions: '500×600px' },
]

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter', description: 'Modern and clean' },
  { value: 'Roboto', label: 'Roboto', description: 'Google\'s material font' },
  { value: 'Open Sans', label: 'Open Sans', description: 'Highly readable' },
  { value: 'Lato', label: 'Lato', description: 'Friendly and approachable' },
  { value: 'Poppins', label: 'Poppins', description: 'Geometric and modern' },
  { value: 'Montserrat', label: 'Montserrat', description: 'Elegant and professional' },
]

const ANIMATION_OPTIONS = [
  { value: 'slide-up', label: 'Slide Up', description: 'Smooth upward motion' },
  { value: 'fade-in', label: 'Fade In', description: 'Gentle appearance' },
  { value: 'scale-in', label: 'Scale In', description: 'Zoom effect' },
  { value: 'slide-right', label: 'Slide Right', description: 'Horizontal motion' },
  { value: 'bounce', label: 'Bounce', description: 'Playful bounce effect' },
]

/**
 * ========================================================================
 * DEFAULT STYLING CONFIGURATION
 * ========================================================================
 */

const DEFAULT_STYLING: WidgetStyling = {
  position: 'bottom-right',
  size: 'medium',
  primary_color: '#2563eb',
  secondary_color: '#f1f5f9',
  text_color: '#1e293b',
  background_color: '#ffffff',
  header_title: 'Chat with us',
  header_subtitle: 'We\'re here to help!',
  launcher_text: '💬',
  logo_url: undefined,
  auto_open: false,
  greeting_enabled: true,
  typing_indicator: true,
  sound_enabled: true,
  border_radius: '12px',
  shadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
  animation: 'slide-up',
  font_family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  font_size: '14px',
}

/**
 * ========================================================================
 * SUB-COMPONENTS
 * ========================================================================
 */

const ColorPicker: React.FC<{
  color: string
  onChange: (color: string) => void
  label: string
}> = ({ color, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full h-10 p-1 border-2"
            style={{ borderColor: color }}
          >
            <div className="flex items-center space-x-2 w-full">
              <div
                className="w-6 h-6 rounded border"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-mono">{color}</span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3">
          <HexColorPicker color={color} onChange={onChange} />
          <div className="mt-3">
            <Input
              value={color}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#000000"
              className="font-mono text-sm"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

const ThemeSelector: React.FC<{
  onApplyTheme: (theme: ColorTheme) => void
}> = ({ onApplyTheme }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Quick Themes</Label>
        <Tooltip>
          <TooltipTrigger>
            <Wand2 className="h-4 w-4 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>Apply pre-designed color themes</TooltipContent>
        </Tooltip>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {COLOR_THEMES.map((theme) => (
          <motion.div
            key={theme.name}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="relative overflow-hidden rounded-lg border cursor-pointer group"
            onClick={() => onApplyTheme(theme)}
          >
            <div className="p-3">
              <div className="flex items-center space-x-2 mb-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: theme.primary }}
                />
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: theme.secondary }}
                />
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: theme.accent }}
                />
              </div>
              <h4 className="text-sm font-medium">{theme.name}</h4>
              <p className="text-xs text-muted-foreground">{theme.description}</p>
            </div>
            
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button size="sm" variant="secondary">
                Apply Theme
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const WidgetPreview: React.FC<WidgetPreviewProps> = ({ 
  styling, 
  isMinimized, 
  onToggleMinimize, 
  previewDevice 
}) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: styling.header_title || 'Hello!' },
    { role: 'user', content: 'Hi there! I need some help.' },
    { role: 'assistant', content: 'I\'d be happy to help you! What can I assist you with today?' },
  ])

  const deviceStyles = {
    desktop: 'w-full max-w-md',
    tablet: 'w-80',
    mobile: 'w-64',
  }

  const sizePixels = {
    small: { width: 300, height: 400 },
    medium: { width: 400, height: 500 },
    large: { width: 500, height: 600 },
  }

  const currentSize = sizePixels[styling.size]

  return (
    <div className="relative">
      {/* Device Frame */}
      <div className={cn(
        "relative mx-auto transition-all duration-300",
        deviceStyles[previewDevice]
      )}>
        {/* Widget Container */}
        <div
          className={cn(
            "relative overflow-hidden transition-all duration-300 ease-in-out",
            styling.position.includes('right') ? 'ml-auto' : 'mr-auto'
          )}
          style={{
            width: Math.min(currentSize.width, previewDevice === 'mobile' ? 280 : currentSize.width),
            height: isMinimized ? 60 : Math.min(currentSize.height, 400),
            borderRadius: styling.border_radius,
            boxShadow: styling.shadow,
            backgroundColor: styling.background_color,
            fontFamily: styling.font_family,
            fontSize: styling.font_size,
          }}
        >
          {/* Widget Header */}
          <div
            className="flex items-center justify-between p-4 border-b"
            style={{ 
              backgroundColor: styling.primary_color,
              color: styling.background_color,
              borderColor: `${styling.primary_color}20`
            }}
          >
            <div className="flex items-center space-x-3">
              {styling.logo_url ? (
                <img 
                  src={styling.logo_url} 
                  alt="Logo" 
                  className="w-6 h-6 rounded"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-sm"
                  style={{ backgroundColor: styling.background_color + '20' }}
                >
                  {styling.launcher_text}
                </div>
              )}
              <div>
                <h3 className="font-semibold text-sm">{styling.header_title}</h3>
                {styling.header_subtitle && (
                  <p className="text-xs opacity-80">{styling.header_subtitle}</p>
                )}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMinimize}
              className="text-current hover:bg-white/20 h-6 w-6 p-0"
            >
              {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            </Button>
          </div>

          {/* Widget Body */}
          <AnimatePresence>
            {!isMinimized && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col h-full"
              >
                {/* Messages Area */}
                <ScrollArea className="flex-1 p-4" style={{ maxHeight: currentSize.height - 140 }}>
                  <div className="space-y-3">
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex",
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] p-2 rounded-lg text-sm",
                            message.role === 'user'
                              ? 'rounded-br-none'
                              : 'rounded-bl-none'
                          )}
                          style={{
                            backgroundColor: message.role === 'user' 
                              ? styling.primary_color 
                              : styling.secondary_color,
                            color: message.role === 'user' 
                              ? styling.background_color 
                              : styling.text_color,
                          }}
                        >
                          {message.content}
                        </div>
                      </div>
                    ))}
                    
                    {/* Typing Indicator */}
                    {styling.typing_indicator && (
                      <div className="flex justify-start">
                        <div
                          className="p-2 rounded-lg rounded-bl-none"
                          style={{ backgroundColor: styling.secondary_color }}
                        >
                          <div className="flex space-x-1">
                            <div 
                              className="w-2 h-2 rounded-full animate-bounce"
                              style={{ 
                                backgroundColor: styling.text_color + '60',
                                animationDelay: '0ms'
                              }}
                            />
                            <div 
                              className="w-2 h-2 rounded-full animate-bounce"
                              style={{ 
                                backgroundColor: styling.text_color + '60',
                                animationDelay: '150ms'
                              }}
                            />
                            <div 
                              className="w-2 h-2 rounded-full animate-bounce"
                              style={{ 
                                backgroundColor: styling.text_color + '60',
                                animationDelay: '300ms'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t" style={{ borderColor: styling.secondary_color }}>
                  <div className="flex space-x-2">
                    <div
                      className="flex-1 p-2 rounded-lg border text-sm"
                      style={{ 
                        borderColor: styling.secondary_color,
                        backgroundColor: styling.background_color,
                        color: styling.text_color + '60'
                      }}
                    >
                      Type your message...
                    </div>
                    <div
                      className="p-2 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: styling.primary_color }}
                    >
                      <MessageCircle 
                        className="h-4 w-4" 
                        style={{ color: styling.background_color }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Launcher Button (when minimized) */}
        {isMinimized && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute bottom-4 right-4"
          >
            <Button
              className="w-14 h-14 rounded-full shadow-lg"
              style={{ 
                backgroundColor: styling.primary_color,
                color: styling.background_color 
              }}
              onClick={onToggleMinimize}
            >
              <span className="text-lg">{styling.launcher_text}</span>
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

/**
 * ========================================================================
 * MAIN COMPONENT
 * ========================================================================
 */

export const WidgetCustomizer: React.FC<WidgetCustomizerProps> = ({
  initialStyling,
  onStyleChange,
  onSave,
  className,
}) => {
  const [styling, setStyling] = useState<WidgetStyling>(() => ({
    ...DEFAULT_STYLING,
    ...initialStyling,
  }))
  
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [isMinimized, setIsMinimized] = useState(false)
  const [activeTab, setActiveTab] = useState('appearance')
  const [showCodeDialog, setShowCodeDialog] = useState(false)

  // Update parent component when styling changes
  useEffect(() => {
    onStyleChange?.(styling)
  }, [styling, onStyleChange])

  // Style update handler
  const updateStyling = useCallback((updates: Partial<WidgetStyling>) => {
    setStyling(prev => ({ ...prev, ...updates }))
  }, [])

  // Apply theme handler
  const applyTheme = useCallback((theme: ColorTheme) => {
    updateStyling({
      primary_color: theme.primary,
      secondary_color: theme.secondary,
      background_color: theme.background,
      text_color: theme.text,
    })
    
    toast({
      title: 'Theme Applied',
      description: `${theme.name} theme has been applied to your widget.`,
    })
  }, [updateStyling])

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setStyling(DEFAULT_STYLING)
    toast({
      title: 'Reset Complete',
      description: 'Widget styling has been reset to defaults.',
    })
  }, [])

  // Generate embed code
  const embedCode = useMemo(() => {
    const config = {
      widgetId: 'your-widget-id',
      ...styling,
    }

    return `<!-- ChatCraft Studio Widget -->
<script>
  window.ChatCraftConfig = ${JSON.stringify(config, null, 2)};
</script>
<script src="https://widget.chatcraft.studio/embed.js" async></script>
<!-- End ChatCraft Studio Widget -->`
  }, [styling])

  return (
    <div className={cn("flex flex-col lg:flex-row gap-6", className)}>
      {/* Configuration Panel */}
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Widget Customizer</h2>
            <p className="text-muted-foreground">
              Customize the appearance and behavior of your chat widget
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={resetToDefaults}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button onClick={() => onSave?.(styling)}>
              <Check className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="appearance" className="flex items-center space-x-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="layout" className="flex items-center space-x-2">
              <Layout className="h-4 w-4" />
              <span className="hidden sm:inline">Layout</span>
            </TabsTrigger>
            <TabsTrigger value="behavior" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Behavior</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Branding</span>
            </TabsTrigger>
          </TabsList>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Paintbrush className="h-5 w-5" />
                  <span>Colors & Themes</span>
                </CardTitle>
                <CardDescription>
                  Customize the color scheme and visual theme
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ThemeSelector onApplyTheme={applyTheme} />
                
                <Separator />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Border Radius</Label>
                    <Select
                      value={styling.border_radius}
                      onValueChange={(value) => updateStyling({ border_radius: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0px">None (0px)</SelectItem>
                        <SelectItem value="4px">Small (4px)</SelectItem>
                        <SelectItem value="8px">Medium (8px)</SelectItem>
                        <SelectItem value="12px">Large (12px)</SelectItem>
                        <SelectItem value="16px">Extra Large (16px)</SelectItem>
                        <SelectItem value="50%">Pill Shape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Animation Style</Label>
                    <Select
                      value={styling.animation}
                      onValueChange={(value) => updateStyling({ animation: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANIMATION_OPTIONS.map((animation) => (
                          <SelectItem key={animation.value} value={animation.value}>
                            <div>
                              <div className="font-medium">{animation.label}</div>
                              <div className="text-xs text-muted-foreground">{animation.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Shadow Style</Label>
                  <Select
                    value={styling.shadow}
                    onValueChange={(value) => updateStyling({ shadow: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Shadow</SelectItem>
                      <SelectItem value="0 1px 3px rgba(0, 0, 0, 0.1)">Subtle</SelectItem>
                      <SelectItem value="0 4px 6px rgba(0, 0, 0, 0.1)">Light</SelectItem>
                      <SelectItem value="0 10px 25px rgba(0, 0, 0, 0.1)">Medium</SelectItem>
                      <SelectItem value="0 20px 40px rgba(0, 0, 0, 0.15)">Strong</SelectItem>
                      <SelectItem value="0 25px 50px rgba(0, 0, 0, 0.25)">Dramatic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Behavior Tab */}
          <TabsContent value="behavior" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Widget Behavior</span>
                </CardTitle>
                <CardDescription>
                  Configure how the widget behaves and interacts with users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Auto Open</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically open the widget when the page loads
                      </p>
                    </div>
                    <Switch
                      checked={styling.auto_open}
                      onCheckedChange={(checked) => updateStyling({ auto_open: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Greeting Message</Label>
                      <p className="text-sm text-muted-foreground">
                        Show a greeting message when the chat opens
                      </p>
                    </div>
                    <Switch
                      checked={styling.greeting_enabled}
                      onCheckedChange={(checked) => updateStyling({ greeting_enabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Typing Indicator</Label>
                      <p className="text-sm text-muted-foreground">
                        Show typing animation when the bot is responding
                      </p>
                    </div>
                    <Switch
                      checked={styling.typing_indicator}
                      onCheckedChange={(checked) => updateStyling({ typing_indicator: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Sound Effects</Label>
                      <p className="text-sm text-muted-foreground">
                        Play notification sounds for new messages
                      </p>
                    </div>
                    <Switch
                      checked={styling.sound_enabled}
                      onCheckedChange={(checked) => updateStyling({ sound_enabled: checked })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Sparkles className="h-5 w-5" />
                  <span>Branding & Content</span>
                </CardTitle>
                <CardDescription>
                  Customize the text and branding elements
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="header-title">Header Title</Label>
                      <Input
                        id="header-title"
                        value={styling.header_title}
                        onChange={(e) => updateStyling({ header_title: e.target.value })}
                        placeholder="Chat with us"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="header-subtitle">Header Subtitle</Label>
                      <Input
                        id="header-subtitle"
                        value={styling.header_subtitle || ''}
                        onChange={(e) => updateStyling({ header_subtitle: e.target.value })}
                        placeholder="We're here to help!"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="launcher-text">Launcher Text/Emoji</Label>
                    <Input
                      id="launcher-text"
                      value={styling.launcher_text}
                      onChange={(e) => updateStyling({ launcher_text: e.target.value })}
                      placeholder="💬"
                      className="w-20"
                    />
                    <p className="text-xs text-muted-foreground">
                      This appears on the launcher button. Use emoji or short text.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Logo Upload</Label>
                    <div className="flex items-center space-x-4">
                      {styling.logo_url ? (
                        <div className="relative">
                          <img
                            src={styling.logo_url}
                            alt="Logo"
                            className="w-12 h-12 rounded border object-cover"
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute -top-2 -right-2 h-6 w-6 p-0"
                            onClick={() => updateStyling({ logo_url: undefined })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="w-12 h-12 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                          <Image className="h-6 w-6" />
                        </div>
                      )}
                      
                      <div className="flex-1">
                        <Input
                          placeholder="Logo URL (optional)"
                          value={styling.logo_url || ''}
                          onChange={(e) => updateStyling({ logo_url: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter a URL to your logo image (recommended: 32x32px)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview Panel */}
      <div className="lg:w-96 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Eye className="h-5 w-5" />
                <span>Live Preview</span>
              </CardTitle>
              
              <div className="flex items-center space-x-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={previewDevice === 'desktop' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPreviewDevice('desktop')}
                      >
                        <Monitor className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Desktop View</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={previewDevice === 'tablet' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPreviewDevice('tablet')}
                      >
                        <Tablet className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Tablet View</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={previewDevice === 'mobile' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPreviewDevice('mobile')}
                      >
                        <Smartphone className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mobile View</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6 rounded-lg min-h-[400px]">
              <WidgetPreview
                styling={styling}
                isMinimized={isMinimized}
                onToggleMinimize={() => setIsMinimized(!isMinimized)}
                previewDevice={previewDevice}
              />
            </div>
          </CardContent>
        </Card>

        {/* Embed Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Code className="h-5 w-5" />
              <span>Embed Code</span>
            </CardTitle>
            <CardDescription>
              Copy this code to add the widget to your website
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <ScrollArea className="h-32 w-full">
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                  <code>{embedCode}</code>
                </pre>
              </ScrollArea>
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(embedCode)
                  toast({
                    title: 'Copied!',
                    description: 'Embed code copied to clipboard.',
                  })
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Code
              </Button>
              
              <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Full
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Widget Embed Code</DialogTitle>
                    <DialogDescription>
                      Copy and paste this code into your website's HTML, preferably before the closing &lt;/body&gt; tag.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <ScrollArea className="h-64 w-full border rounded">
                      <pre className="text-sm p-4">
                        <code>{embedCode}</code>
                      </pre>
                    </ScrollArea>
                    
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(embedCode)
                          toast({
                            title: 'Copied!',
                            description: 'Embed code copied to clipboard.',
                          })
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy to Clipboard
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5" />
              <span>Quick Actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-16 flex-col space-y-1"
                onClick={() => window.open('https://example.com/preview', '_blank')}
              >
                <Globe className="h-4 w-4" />
                <span className="text-xs">Test Live</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-16 flex-col space-y-1"
                onClick={() => {
                  const config = JSON.stringify(styling, null, 2)
                  const blob = new Blob([config], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'widget-config.json'
                  a.click()
                }}
              >
                <Download className="h-4 w-4" />
                <span className="text-xs">Export</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-16 flex-col space-y-1 col-span-2"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                <span className="text-xs">
                  {isMinimized ? 'Show Widget' : 'Hide Widget'}
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default WidgetCustomizer