// hooks/use-websocket.ts - Comprehensive WebSocket Hook for ChatCraft Studio

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/hooks/use-toast'
import type { 
  WebSocketMessage, 
  WebSocketConfig,
  ChatMessage,
  ProcessingProgress,
  DeploymentStatus,
  AnalyticsData
} from '@/types'

/**
 * ========================================================================
 * WEBSOCKET CONFIGURATION & TYPES
 * ========================================================================
 */

const WS_CONFIG = {
  // Connection settings
  MAX_RECONNECT_ATTEMPTS: 5,
  INITIAL_RECONNECT_DELAY: 1000, // 1 second
  MAX_RECONNECT_DELAY: 30000, // 30 seconds
  BACKOFF_MULTIPLIER: 2,
  
  // Heartbeat settings
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  HEARTBEAT_TIMEOUT: 5000, // 5 seconds
  
  // Message settings
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1MB
  MESSAGE_QUEUE_SIZE: 100,
  
  // Connection timeout
  CONNECTION_TIMEOUT: 10000, // 10 seconds
} as const

export type WebSocketConnectionState = 
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'failed'
  | 'closed'

export type WebSocketEventType = 
  | 'chat_message'
  | 'chat_response'
  | 'typing_start'
  | 'typing_stop'
  | 'user_joined'
  | 'user_left'
  | 'processing_update'
  | 'deployment_status'
  | 'analytics_update'
  | 'system_notification'
  | 'error'
  | 'heartbeat'
  | 'presence_update'

export interface WebSocketEvent {
  type: WebSocketEventType
  data: any
  timestamp: string
  id?: string
  userId?: string
  tenantId?: string
  deploymentId?: string
  sessionId?: string
}

export interface WebSocketHookOptions {
  url?: string
  protocols?: string[]
  autoConnect?: boolean
  enableHeartbeat?: boolean
  enableReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelay?: number
  onConnect?: () => void
  onDisconnect?: (reason?: string) => void
  onError?: (error: Event) => void
  onMessage?: (event: WebSocketEvent) => void
  debug?: boolean
}

export interface WebSocketState {
  connectionState: WebSocketConnectionState
  isConnected: boolean
  isConnecting: boolean
  lastConnected: Date | null
  lastDisconnected: Date | null
  reconnectAttempts: number
  messageCount: number
  latency: number | null
  error: string | null
}

export interface WebSocketActions {
  connect: () => void
  disconnect: () => void
  reconnect: () => void
  send: (event: Partial<WebSocketEvent>) => boolean
  sendMessage: (type: WebSocketEventType, data: any, options?: { sessionId?: string; deploymentId?: string }) => boolean
  subscribe: (eventType: WebSocketEventType, handler: (data: any) => void) => () => void
  unsubscribe: (eventType: WebSocketEventType, handler?: (data: any) => void) => void
  clearSubscriptions: () => void
}

/**
 * ========================================================================
 * WEBSOCKET MANAGER CLASS
 * ========================================================================
 */

class WebSocketManager {
  private ws: WebSocket | null = null
  private url: string
  private protocols: string[]
  private token: string | null = null
  
  // State management
  private connectionState: WebSocketConnectionState = 'disconnected'
  private reconnectAttempts = 0
  private reconnectTimeoutId: NodeJS.Timeout | null = null
  private heartbeatIntervalId: NodeJS.Timeout | null = null
  private heartbeatTimeoutId: NodeJS.Timeout | null = null
  private connectionTimeoutId: NodeJS.Timeout | null = null
  
  // Event handling
  private eventListeners = new Map<WebSocketEventType, Set<(data: any) => void>>()
  private messageQueue: WebSocketEvent[] = []
  private lastHeartbeat: Date | null = null
  private latencyMeasurements: number[] = []
  
  // Configuration
  private config: Required<WebSocketHookOptions>
  private stateUpdateCallback: ((state: WebSocketState) => void) | null = null

  constructor(options: WebSocketHookOptions) {
    this.config = {
      url: options.url || this.getDefaultWebSocketUrl(),
      protocols: options.protocols || [],
      autoConnect: options.autoConnect ?? true,
      enableHeartbeat: options.enableHeartbeat ?? true,
      enableReconnect: options.enableReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? WS_CONFIG.MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: options.reconnectDelay ?? WS_CONFIG.INITIAL_RECONNECT_DELAY,
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError: options.onError || (() => {}),
      onMessage: options.onMessage || (() => {}),
      debug: options.debug ?? false,
    }
    
    this.url = this.config.url
    this.protocols = this.config.protocols
  }

  private getDefaultWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = process.env.NEXT_PUBLIC_WS_HOST || window.location.host
    return `${protocol}//${host}/ws`
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[WebSocket]', ...args)
    }
  }

  private updateState(): void {
    if (this.stateUpdateCallback) {
      const state: WebSocketState = {
        connectionState: this.connectionState,
        isConnected: this.connectionState === 'connected',
        isConnecting: this.connectionState === 'connecting' || this.connectionState === 'reconnecting',
        lastConnected: this.lastHeartbeat,
        lastDisconnected: null, // Could track this separately
        reconnectAttempts: this.reconnectAttempts,
        messageCount: this.messageQueue.length,
        latency: this.getAverageLatency(),
        error: null, // Could track last error
      }
      this.stateUpdateCallback(state)
    }
  }

  private getAverageLatency(): number | null {
    if (this.latencyMeasurements.length === 0) return null
    return this.latencyMeasurements.reduce((sum, lat) => sum + lat, 0) / this.latencyMeasurements.length
  }

  setStateUpdateCallback(callback: (state: WebSocketState) => void): void {
    this.stateUpdateCallback = callback
  }

  setAuthToken(token: string | null): void {
    this.token = token
    if (this.ws && this.connectionState === 'connected') {
      // Send auth update if connected
      this.send({
        type: 'system_notification',
        data: { action: 'auth_update', token },
        timestamp: new Date().toISOString(),
      })
    }
  }

  connect(): void {
    if (this.ws && (this.connectionState === 'connected' || this.connectionState === 'connecting')) {
      this.log('Already connected or connecting')
      return
    }

    this.log('Connecting to WebSocket...')
    this.connectionState = 'connecting'
    this.updateState()

    try {
      // Build WebSocket URL with auth token
      const wsUrl = new URL(this.url)
      if (this.token) {
        wsUrl.searchParams.set('token', this.token)
      }

      this.ws = new WebSocket(wsUrl.toString(), this.protocols)
      
      // Set connection timeout
      this.connectionTimeoutId = setTimeout(() => {
        if (this.connectionState === 'connecting') {
          this.log('Connection timeout')
          this.handleConnectionFailure('Connection timeout')
        }
      }, WS_CONFIG.CONNECTION_TIMEOUT)

      this.ws.onopen = this.handleOpen.bind(this)
      this.ws.onclose = this.handleClose.bind(this)
      this.ws.onerror = this.handleError.bind(this)
      this.ws.onmessage = this.handleMessage.bind(this)

    } catch (error) {
      this.log('Failed to create WebSocket connection:', error)
      this.handleConnectionFailure(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  private handleOpen(): void {
    this.log('WebSocket connected')
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId)
      this.connectionTimeoutId = null
    }

    this.connectionState = 'connected'
    this.reconnectAttempts = 0
    this.lastHeartbeat = new Date()
    
    this.updateState()
    this.config.onConnect()
    
    // Start heartbeat if enabled
    if (this.config.enableHeartbeat) {
      this.startHeartbeat()
    }
    
    // Process queued messages
    this.processMessageQueue()
    
    // Show connection success toast
    toast({
      title: 'Connected',
      description: 'Real-time connection established',
    })
  }

  private handleClose(event: CloseEvent): void {
    this.log('WebSocket closed:', event.code, event.reason)
    
    this.stopHeartbeat()
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId)
      this.connectionTimeoutId = null
    }

    const wasConnected = this.connectionState === 'connected'
    this.connectionState = 'disconnected'
    this.updateState()
    
    this.config.onDisconnect(event.reason)
    
    // Auto-reconnect if enabled and connection was previously established
    if (this.config.enableReconnect && wasConnected && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect()
    } else if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.connectionState = 'failed'
      this.updateState()
      
      toast({
        title: 'Connection Failed',
        description: 'Unable to establish real-time connection after multiple attempts',
        variant: 'destructive',
      })
    }
  }

  private handleError(event: Event): void {
    this.log('WebSocket error:', event)
    this.config.onError(event)
  }

  private handleMessage(event: MessageEvent): void {
    try {
      // Validate message size
      if (event.data.length > WS_CONFIG.MAX_MESSAGE_SIZE) {
        this.log('Message too large, discarding')
        return
      }

      const wsEvent: WebSocketEvent = JSON.parse(event.data)
      
      // Handle heartbeat responses
      if (wsEvent.type === 'heartbeat') {
        this.handleHeartbeatResponse(wsEvent)
        return
      }
      
      this.log('Received message:', wsEvent.type, wsEvent.data)
      
      // Update message count
      if (this.messageQueue.length >= WS_CONFIG.MESSAGE_QUEUE_SIZE) {
        this.messageQueue.shift() // Remove oldest message
      }
      this.messageQueue.push(wsEvent)
      
      // Notify global message handler
      this.config.onMessage(wsEvent)
      
      // Notify specific event listeners
      const listeners = this.eventListeners.get(wsEvent.type)
      if (listeners) {
        listeners.forEach(handler => {
          try {
            handler(wsEvent.data)
          } catch (error) {
            this.log('Error in event handler:', error)
          }
        })
      }
      
      this.updateState()
      
    } catch (error) {
      this.log('Failed to parse WebSocket message:', error)
    }
  }

  private handleConnectionFailure(reason: string): void {
    this.log('Connection failed:', reason)
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId)
      this.connectionTimeoutId = null
    }
    
    this.connectionState = 'disconnected'
    this.updateState()
    
    if (this.config.enableReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
    }
    
    this.reconnectAttempts++
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(WS_CONFIG.BACKOFF_MULTIPLIER, this.reconnectAttempts - 1),
      WS_CONFIG.MAX_RECONNECT_DELAY
    )
    
    this.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)
    this.connectionState = 'reconnecting'
    this.updateState()
    
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null
      this.connect()
    }, delay)
  }

  private startHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
    }
    
    this.heartbeatIntervalId = setInterval(() => {
      if (this.connectionState === 'connected') {
        const heartbeatStart = Date.now()
        
        this.send({
          type: 'heartbeat',
          data: { timestamp: heartbeatStart },
          timestamp: new Date().toISOString(),
        })
        
        // Set timeout for heartbeat response
        this.heartbeatTimeoutId = setTimeout(() => {
          this.log('Heartbeat timeout')
          if (this.ws) {
            this.ws.close(1000, 'Heartbeat timeout')
          }
        }, WS_CONFIG.HEARTBEAT_TIMEOUT)
      }
    }, WS_CONFIG.HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
    
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId)
      this.heartbeatTimeoutId = null
    }
  }

  private handleHeartbeatResponse(event: WebSocketEvent): void {
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId)
      this.heartbeatTimeoutId = null
    }
    
    // Calculate latency
    const sentTime = event.data?.timestamp
    if (sentTime) {
      const latency = Date.now() - sentTime
      this.latencyMeasurements.push(latency)
      
      // Keep only last 10 measurements
      if (this.latencyMeasurements.length > 10) {
        this.latencyMeasurements.shift()
      }
    }
    
    this.lastHeartbeat = new Date()
    this.updateState()
  }

  private processMessageQueue(): void {
    // Could implement message queue processing for offline messages
    this.log(`Processing ${this.messageQueue.length} queued messages`)
  }

  disconnect(): void {
    this.log('Manually disconnecting WebSocket')
    
    this.stopHeartbeat()
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId)
      this.connectionTimeoutId = null
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect')
      this.ws = null
    }
    
    this.connectionState = 'closed'
    this.updateState()
  }

  reconnect(): void {
    this.log('Manual reconnect requested')
    this.disconnect()
    setTimeout(() => this.connect(), 100)
  }

  send(event: Partial<WebSocketEvent>): boolean {
    if (!this.ws || this.connectionState !== 'connected') {
      this.log('Cannot send message: not connected')
      return false
    }

    try {
      const fullEvent: WebSocketEvent = {
        type: event.type || 'system_notification',
        data: event.data || {},
        timestamp: event.timestamp || new Date().toISOString(),
        id: event.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...event,
      }

      const message = JSON.stringify(fullEvent)
      
      if (message.length > WS_CONFIG.MAX_MESSAGE_SIZE) {
        this.log('Message too large to send')
        return false
      }

      this.ws.send(message)
      this.log('Sent message:', fullEvent.type, fullEvent.data)
      return true
      
    } catch (error) {
      this.log('Failed to send message:', error)
      return false
    }
  }

  sendMessage(type: WebSocketEventType, data: any, options?: { sessionId?: string; deploymentId?: string }): boolean {
    return this.send({
      type,
      data,
      sessionId: options?.sessionId,
      deploymentId: options?.deploymentId,
    })
  }

  subscribe(eventType: WebSocketEventType, handler: (data: any) => void): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set())
    }
    
    this.eventListeners.get(eventType)!.add(handler)
    this.log(`Subscribed to ${eventType} events`)
    
    // Return unsubscribe function
    return () => this.unsubscribe(eventType, handler)
  }

  unsubscribe(eventType: WebSocketEventType, handler?: (data: any) => void): void {
    const listeners = this.eventListeners.get(eventType)
    if (!listeners) return
    
    if (handler) {
      listeners.delete(handler)
      this.log(`Unsubscribed handler from ${eventType} events`)
    } else {
      listeners.clear()
      this.log(`Unsubscribed all handlers from ${eventType} events`)
    }
    
    if (listeners.size === 0) {
      this.eventListeners.delete(eventType)
    }
  }

  clearSubscriptions(): void {
    this.eventListeners.clear()
    this.log('Cleared all event subscriptions')
  }

  destroy(): void {
    this.log('Destroying WebSocket manager')
    this.clearSubscriptions()
    this.disconnect()
    this.stateUpdateCallback = null
  }
}

/**
 * ========================================================================
 * MAIN WEBSOCKET HOOK
 * ========================================================================
 */

export const useWebSocket = (options: WebSocketHookOptions = {}) => {
  const [state, setState] = useState<WebSocketState>({
    connectionState: 'disconnected',
    isConnected: false,
    isConnecting: false,
    lastConnected: null,
    lastDisconnected: null,
    reconnectAttempts: 0,
    messageCount: 0,
    latency: null,
    error: null,
  })

  const tokens = useAuthStore((state) => state.tokens)
  const wsManager = useRef<WebSocketManager | null>(null)

  // Initialize WebSocket manager
  useEffect(() => {
    wsManager.current = new WebSocketManager(options)
    wsManager.current.setStateUpdateCallback(setState)
    
    if (options.autoConnect !== false) {
      wsManager.current.connect()
    }
    
    return () => {
      wsManager.current?.destroy()
    }
  }, []) // Only run on mount

  // Update auth token when it changes
  useEffect(() => {
    if (wsManager.current) {
      wsManager.current.setAuthToken(tokens?.access_token || null)
    }
  }, [tokens?.access_token])

  // Actions
  const actions = useMemo<WebSocketActions>(() => ({
    connect: () => wsManager.current?.connect(),
    disconnect: () => wsManager.current?.disconnect(),
    reconnect: () => wsManager.current?.reconnect(),
    send: (event) => wsManager.current?.send(event) || false,
    sendMessage: (type, data, options) => wsManager.current?.sendMessage(type, data, options) || false,
    subscribe: (eventType, handler) => wsManager.current?.subscribe(eventType, handler) || (() => {}),
    unsubscribe: (eventType, handler) => wsManager.current?.unsubscribe(eventType, handler),
    clearSubscriptions: () => wsManager.current?.clearSubscriptions(),
  }), [])

  return {
    ...state,
    ...actions,
  }
}

/**
 * ========================================================================
 * SPECIALIZED WEBSOCKET HOOKS
 * ========================================================================
 */

// Hook for chat functionality
export const useChatWebSocket = (sessionId?: string, deploymentId?: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])

  const ws = useWebSocket({
    onConnect: () => {
      if (sessionId && deploymentId) {
        ws.sendMessage('user_joined', { sessionId, deploymentId })
      }
    },
  })

  // Subscribe to chat events
  useEffect(() => {
    const unsubscribers = [
      ws.subscribe('chat_message', (data) => {
        setMessages(prev => [...prev, data.message])
      }),
      
      ws.subscribe('chat_response', (data) => {
        setMessages(prev => [...prev, data.message])
        setIsTyping(false)
      }),
      
      ws.subscribe('typing_start', (data) => {
        if (data.userId !== 'current_user') { // Replace with actual user ID
          setTypingUsers(prev => [...prev.filter(id => id !== data.userId), data.userId])
        }
      }),
      
      ws.subscribe('typing_stop', (data) => {
        setTypingUsers(prev => prev.filter(id => id !== data.userId))
      }),
    ]

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [ws])

  const sendChatMessage = useCallback((content: string) => {
    const message: ChatMessage = {
      id: `msg_${Date.now()}`,
      conversation_id: sessionId || 'default',
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, message])
    setIsTyping(true)
    
    return ws.sendMessage('chat_message', { message }, { sessionId, deploymentId })
  }, [ws, sessionId, deploymentId])

  const sendTypingStart = useCallback(() => {
    ws.sendMessage('typing_start', { userId: 'current_user' }, { sessionId, deploymentId })
  }, [ws, sessionId, deploymentId])

  const sendTypingStop = useCallback(() => {
    ws.sendMessage('typing_stop', { userId: 'current_user' }, { sessionId, deploymentId })
  }, [ws, sessionId, deploymentId])

  return {
    ...ws,
    messages,
    isTyping,
    typingUsers,
    sendChatMessage,
    sendTypingStart,
    sendTypingStop,
  }
}

// Hook for content processing updates
export const useProcessingWebSocket = () => {
  const [processingUpdates, setProcessingUpdates] = useState<Map<string, ProcessingProgress>>(new Map())

  const ws = useWebSocket()

  useEffect(() => {
    const unsubscribe = ws.subscribe('processing_update', (data: ProcessingProgress) => {
      setProcessingUpdates(prev => new Map(prev.set(data.source_id, data)))
    })

    return unsubscribe
  }, [ws])

  return {
    ...ws,
    processingUpdates,
    getProcessingStatus: (sourceId: string) => processingUpdates.get(sourceId),
  }
}

// Hook for deployment status updates
export const useDeploymentWebSocket = () => {
  const [deploymentStatuses, setDeploymentStatuses] = useState<Map<string, DeploymentStatus>>(new Map())

  const ws = useWebSocket()

  useEffect(() => {
    const unsubscribe = ws.subscribe('deployment_status', (data) => {
      setDeploymentStatuses(prev => new Map(prev.set(data.deploymentId, data.status)))
    })

    return unsubscribe
  }, [ws])

  return {
    ...ws,
    deploymentStatuses,
    getDeploymentStatus: (deploymentId: string) => deploymentStatuses.get(deploymentId),
  }
}

// Hook for real-time analytics
export const useAnalyticsWebSocket = () => {
  const [analyticsUpdates, setAnalyticsUpdates] = useState<AnalyticsData | null>(null)

  const ws = useWebSocket()

  useEffect(() => {
    const unsubscribe = ws.subscribe('analytics_update', (data: AnalyticsData) => {
      setAnalyticsUpdates(data)
    })

    return unsubscribe
  }, [ws])

  return {
    ...ws,
    analyticsUpdates,
  }
}

export default useWebSocket