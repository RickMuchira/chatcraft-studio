// services/chatbot-service.ts - Comprehensive Chatbot Service for ChatCraft Studio

import { EventEmitter } from 'events'
import { useAuthStore } from '@/stores/auth-store'
import { useApiClient } from '@/hooks/api'
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatSession,
  ChatbotConfig,
  ContentChunk,
  ChatbotPersonality,
  ResponseStyle,
  FallbackBehavior,
  LLMProvider,
  ApiResponse
} from '@/types'

/**
 * ========================================================================
 * CHATBOT SERVICE CONFIGURATION
 * ========================================================================
 */

const CHATBOT_CONFIG = {
  // Response timing
  MAX_RESPONSE_TIME: 30000, // 30 seconds
  TYPING_DELAY: 1000, // 1 second typing indicator
  
  // RAG Configuration
  MAX_CONTEXT_CHUNKS: 8,
  SIMILARITY_THRESHOLD: 0.7,
  MAX_CONTEXT_LENGTH: 4000, // tokens
  
  // Conversation Management
  MAX_CONVERSATION_HISTORY: 20,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  
  // Rate Limiting
  MAX_REQUESTS_PER_MINUTE: 30,
  MAX_REQUESTS_PER_HOUR: 500,
  
  // Retry Configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  
  // WebSocket Configuration
  WS_RECONNECT_ATTEMPTS: 5,
  WS_RECONNECT_DELAY: 2000,
} as const

/**
 * ========================================================================
 * TYPES & INTERFACES
 * ========================================================================
 */

export interface ChatbotServiceConfig {
  deploymentId?: string
  sessionId?: string
  userId?: string
  debug?: boolean
  autoReconnect?: boolean
}

export interface ConversationContext {
  sessionId: string
  messages: ChatMessage[]
  metadata: {
    userAgent?: string
    pageUrl?: string
    referrer?: string
    timestamp: string
  }
  userPreferences?: {
    language?: string
    preferredStyle?: ResponseStyle
    timezone?: string
  }
}

export interface RAGContext {
  chunks: ContentChunk[]
  totalSources: number
  confidenceScore: number
  searchQuery: string
  filters: {
    contentTypes?: string[]
    sources?: string[]
    dateRange?: { start: string; end: string }
  }
}

export interface ResponseGeneration {
  prompt: string
  context: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  model: string
  provider: LLMProvider
}

export interface ChatbotResponse extends ChatResponse {
  processingTime: {
    retrieval: number
    generation: number
    total: number
  }
  debug?: {
    searchQuery: string
    chunksRetrieved: number
    prompt: string
    modelUsed: string
  }
}

export interface StreamingResponse {
  type: 'start' | 'chunk' | 'end' | 'error'
  content?: string
  error?: string
  metadata?: any
}

/**
 * ========================================================================
 * CHATBOT SERVICE CLASS
 * ========================================================================
 */

export class ChatbotService extends EventEmitter {
  private apiClient: ReturnType<typeof useApiClient>
  private config: ChatbotServiceConfig
  private websocket: WebSocket | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private rateLimitCounter = new Map<string, number[]>()
  private activeRequests = new Map<string, AbortController>()
  
  constructor(config: ChatbotServiceConfig = {}) {
    super()
    this.config = config
    this.apiClient = useApiClient()
    
    // Initialize WebSocket connection if needed
    if (config.autoReconnect !== false) {
      this.initializeWebSocket()
    }
  }

  /**
   * ========================================================================
   * CORE CHAT FUNCTIONALITY
   * ========================================================================
   */

  async sendMessage(
    message: string,
    context?: Partial<ConversationContext>
  ): Promise<ChatbotResponse> {
    const startTime = Date.now()
    
    try {
      // Validate rate limits
      this.checkRateLimit()
      
      // Prepare request
      const request = await this.prepareRequest(message, context)
      
      // Generate response
      const response = await this.generateResponse(request)
      
      // Process and enhance response
      const enhancedResponse = await this.enhanceResponse(response, startTime)
      
      // Emit success event
      this.emit('message:sent', { request, response: enhancedResponse })
      
      return enhancedResponse
      
    } catch (error) {
      this.emit('message:error', { message, error })
      throw error
    }
  }

  async sendMessageStreaming(
    message: string,
    context?: Partial<ConversationContext>,
    onChunk?: (chunk: StreamingResponse) => void
  ): Promise<ChatbotResponse> {
    const startTime = Date.now()
    
    try {
      this.checkRateLimit()
      
      const request = await this.prepareRequest(message, context)
      
      // Start streaming response
      onChunk?.({ type: 'start', metadata: { timestamp: new Date().toISOString() } })
      
      const response = await this.generateStreamingResponse(request, onChunk)
      
      onChunk?.({ type: 'end', metadata: { processingTime: Date.now() - startTime } })
      
      const enhancedResponse = await this.enhanceResponse(response, startTime)
      
      this.emit('message:sent', { request, response: enhancedResponse })
      
      return enhancedResponse
      
    } catch (error) {
      onChunk?.({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })
      this.emit('message:error', { message, error })
      throw error
    }
  }

  /**
   * ========================================================================
   * REQUEST PREPARATION
   * ========================================================================
   */

  private async prepareRequest(
    message: string,
    context?: Partial<ConversationContext>
  ): Promise<ChatRequest> {
    const sessionId = context?.sessionId || this.config.sessionId || this.generateSessionId()
    
    // Get conversation history
    const conversationHistory = await this.getConversationHistory(sessionId)
    
    // Prepare the request
    const request: ChatRequest = {
      message: message.trim(),
      session_id: sessionId,
      conversation_id: context?.sessionId,
      context: conversationHistory.slice(-CHATBOT_CONFIG.MAX_CONVERSATION_HISTORY),
      page_url: context?.metadata?.pageUrl || window?.location?.href,
      user_metadata: {
        userAgent: context?.metadata?.userAgent || navigator?.userAgent,
        referrer: context?.metadata?.referrer || document?.referrer,
        timestamp: new Date().toISOString(),
        ...context?.userPreferences,
      },
    }

    return request
  }

  /**
   * ========================================================================
   * RESPONSE GENERATION
   * ========================================================================
   */

  private async generateResponse(request: ChatRequest): Promise<ChatResponse> {
    const requestId = this.generateRequestId()
    const abortController = new AbortController()
    this.activeRequests.set(requestId, abortController)

    try {
      // Set timeout
      const timeoutId = setTimeout(() => {
        abortController.abort()
      }, CHATBOT_CONFIG.MAX_RESPONSE_TIME)

      const response = await this.apiClient.post<ChatResponse>(
        '/api/chat/message',
        request,
        { signal: abortController.signal }
      )

      clearTimeout(timeoutId)
      this.activeRequests.delete(requestId)

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate response')
      }

      return response.data!

    } catch (error) {
      this.activeRequests.delete(requestId)
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Response generation timed out')
      }
      
      throw error
    }
  }

  private async generateStreamingResponse(
    request: ChatRequest,
    onChunk?: (chunk: StreamingResponse) => void
  ): Promise<ChatResponse> {
    // For streaming responses, we'll use Server-Sent Events or WebSocket
    return new Promise((resolve, reject) => {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        // Fallback to regular API call if WebSocket is not available
        this.generateResponse(request).then(resolve).catch(reject)
        return
      }

      const requestId = this.generateRequestId()
      let accumulatedContent = ''
      let responseData: Partial<ChatResponse> = {}

      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.requestId !== requestId) return

          switch (data.type) {
            case 'chunk':
              accumulatedContent += data.content
              onChunk?.({ type: 'chunk', content: data.content })
              break
              
            case 'complete':
              responseData = {
                response: accumulatedContent,
                conversation_id: data.conversationId,
                sources: data.sources || [],
                response_time_ms: data.responseTime || 0,
                tokens_used: data.tokensUsed || 0,
                confidence_score: data.confidenceScore || 0,
                suggestions: data.suggestions || [],
              }
              
              this.websocket!.removeEventListener('message', handleMessage)
              resolve(responseData as ChatResponse)
              break
              
            case 'error':
              this.websocket!.removeEventListener('message', handleMessage)
              reject(new Error(data.error))
              break
          }
        } catch (error) {
          reject(error)
        }
      }

      this.websocket.addEventListener('message', handleMessage)
      
      // Send streaming request
      this.websocket.send(JSON.stringify({
        type: 'stream_chat',
        requestId,
        data: request,
      }))

      // Set timeout
      setTimeout(() => {
        this.websocket!.removeEventListener('message', handleMessage)
        reject(new Error('Streaming response timed out'))
      }, CHATBOT_CONFIG.MAX_RESPONSE_TIME)
    })
  }

  /**
   * ========================================================================
   * RESPONSE ENHANCEMENT
   * ========================================================================
   */

  private async enhanceResponse(
    response: ChatResponse,
    startTime: number
  ): Promise<ChatbotResponse> {
    const totalTime = Date.now() - startTime

    const enhancedResponse: ChatbotResponse = {
      ...response,
      processingTime: {
        retrieval: Math.round(totalTime * 0.3), // Estimated
        generation: Math.round(totalTime * 0.7), // Estimated
        total: totalTime,
      },
    }

    // Add debug information if enabled
    if (this.config.debug) {
      enhancedResponse.debug = {
        searchQuery: this.extractSearchQuery(response),
        chunksRetrieved: response.sources?.length || 0,
        prompt: 'Debug prompt would be here',
        modelUsed: 'Model info would be here',
      }
    }

    return enhancedResponse
  }

  /**
   * ========================================================================
   * CONVERSATION MANAGEMENT
   * ========================================================================
   */

  async getConversationHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const response = await this.apiClient.get<ChatMessage[]>(
        `/api/chat/sessions/${sessionId}/messages`
      )
      
      if (response.success && response.data) {
        return response.data
      }
      
      return []
    } catch (error) {
      console.warn('Failed to fetch conversation history:', error)
      return []
    }
  }

  async createSession(metadata?: any): Promise<ChatSession> {
    const sessionData = {
      session_id: this.generateSessionId(),
      deployment_id: this.config.deploymentId,
      user_id: this.config.userId,
      started_at: new Date().toISOString(),
      metadata: {
        userAgent: navigator?.userAgent,
        page_url: window?.location?.href,
        ...metadata,
      },
    }

    const response = await this.apiClient.post<ChatSession>(
      '/api/chat/sessions',
      sessionData
    )

    if (!response.success) {
      throw new Error(response.error || 'Failed to create session')
    }

    return response.data!
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      await this.apiClient.patch(`/api/chat/sessions/${sessionId}`, {
        ended_at: new Date().toISOString(),
      })
    } catch (error) {
      console.warn('Failed to end session:', error)
    }
  }

  /**
   * ========================================================================
   * WEBSOCKET MANAGEMENT
   * ========================================================================
   */

  private initializeWebSocket(): void {
    const token = useAuthStore.getState().tokens?.access_token
    if (!token) return

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'}/ws/chat`
    
    try {
      this.websocket = new WebSocket(`${wsUrl}?token=${token}`)
      
      this.websocket.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        this.emit('connected')
      }
      
      this.websocket.onclose = () => {
        this.isConnected = false
        this.emit('disconnected')
        
        if (this.config.autoReconnect !== false && 
            this.reconnectAttempts < CHATBOT_CONFIG.WS_RECONNECT_ATTEMPTS) {
          this.scheduleReconnect()
        }
      }
      
      this.websocket.onerror = (error) => {
        this.emit('error', error)
      }
      
      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleWebSocketMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }
      
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error)
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = CHATBOT_CONFIG.WS_RECONNECT_DELAY * this.reconnectAttempts
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.initializeWebSocket()
      }
    }, delay)
  }

  private handleWebSocketMessage(data: any): void {
    switch (data.type) {
      case 'typing_start':
        this.emit('typing:start', data)
        break
      case 'typing_stop':
        this.emit('typing:stop', data)
        break
      case 'message':
        this.emit('message:received', data)
        break
      case 'error':
        this.emit('error', data)
        break
      default:
        this.emit('message:unknown', data)
    }
  }

  /**
   * ========================================================================
   * RATE LIMITING & VALIDATION
   * ========================================================================
   */

  private checkRateLimit(): void {
    const now = Date.now()
    const minuteAgo = now - 60000
    const hourAgo = now - 3600000
    
    const sessionId = this.config.sessionId || 'default'
    const requests = this.rateLimitCounter.get(sessionId) || []
    
    // Clean old requests
    const recentRequests = requests.filter(time => time > hourAgo)
    const minuteRequests = recentRequests.filter(time => time > minuteAgo)
    
    // Check limits
    if (minuteRequests.length >= CHATBOT_CONFIG.MAX_REQUESTS_PER_MINUTE) {
      throw new Error('Rate limit exceeded: too many requests per minute')
    }
    
    if (recentRequests.length >= CHATBOT_CONFIG.MAX_REQUESTS_PER_HOUR) {
      throw new Error('Rate limit exceeded: too many requests per hour')
    }
    
    // Update counter
    recentRequests.push(now)
    this.rateLimitCounter.set(sessionId, recentRequests)
  }

  /**
   * ========================================================================
   * UTILITY METHODS
   * ========================================================================
   */

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private extractSearchQuery(response: ChatResponse): string {
    // Extract the search query used for RAG retrieval
    // This would be provided by the backend response
    return response.sources?.length ? 'search query here' : ''
  }

  /**
   * ========================================================================
   * CONFIGURATION METHODS
   * ========================================================================
   */

  updateConfig(newConfig: Partial<ChatbotServiceConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  getConfig(): ChatbotServiceConfig {
    return { ...this.config }
  }

  /**
   * ========================================================================
   * CLEANUP METHODS
   * ========================================================================
   */

  disconnect(): void {
    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
    }
    
    // Cancel all active requests
    this.activeRequests.forEach(controller => controller.abort())
    this.activeRequests.clear()
    
    this.isConnected = false
    this.emit('disconnected')
  }

  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
    this.rateLimitCounter.clear()
  }
}

/**
 * ========================================================================
 * REACT HOOKS FOR CHATBOT SERVICE
 * ========================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export const useChatbotService = (config?: ChatbotServiceConfig) => {
  const serviceRef = useRef<ChatbotService | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    serviceRef.current = new ChatbotService(config)
    
    const service = serviceRef.current
    
    service.on('connected', () => setIsConnected(true))
    service.on('disconnected', () => setIsConnected(false))
    service.on('typing:start', () => setIsTyping(true))
    service.on('typing:stop', () => setIsTyping(false))
    
    return () => {
      service.destroy()
    }
  }, [])

  const sendMessage = useCallback(async (
    message: string,
    context?: Partial<ConversationContext>
  ) => {
    if (!serviceRef.current) throw new Error('Service not initialized')
    return serviceRef.current.sendMessage(message, context)
  }, [])

  const sendMessageStreaming = useCallback(async (
    message: string,
    context?: Partial<ConversationContext>,
    onChunk?: (chunk: StreamingResponse) => void
  ) => {
    if (!serviceRef.current) throw new Error('Service not initialized')
    return serviceRef.current.sendMessageStreaming(message, context, onChunk)
  }, [])

  return {
    service: serviceRef.current,
    sendMessage,
    sendMessageStreaming,
    isConnected,
    isTyping,
  }
}

export default ChatbotService