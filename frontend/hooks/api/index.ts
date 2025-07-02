// hooks/api/index.ts - Comprehensive API Hooks for ChatCraft Studio

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/hooks/use-toast'
import type {
  // Content Management
  ContentSource,
  ContentSourceCreate,
  ContentSourceUpdate,
  ProcessingProgress,
  ContentIngestionStats,
  
  // Chatbot Configuration
  ChatbotConfig,
  ChatbotTestRequest,
  ChatbotTestResponse,
  
  // Deployment
  ChatbotDeployment,
  ChatbotDeploymentCreate,
  ChatbotDeploymentUpdate,
  WidgetEmbedCode,
  
  // Analytics
  AnalyticsDashboard,
  ConversationAnalytics,
  PerformanceAnalytics,
  
  // Chat
  ChatRequest,
  ChatResponse,
  ChatSession,
  
  // API Response Types
  ApiResponse,
  PaginatedResponse,
  
  // Questionnaire
  QuestionnaireResponse,
  QuestionnaireAnalysis,
} from '@/types'

/**
 * ========================================================================
 * API CLIENT CONFIGURATION
 * ========================================================================
 */

const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const

const QUERY_KEYS = {
  // Content Management
  CONTENT_SOURCES: 'content-sources',
  CONTENT_SOURCE: 'content-source',
  PROCESSING_PROGRESS: 'processing-progress',
  CONTENT_STATS: 'content-stats',
  
  // Chatbot Configuration
  CHATBOT_CONFIGS: 'chatbot-configs',
  CHATBOT_CONFIG: 'chatbot-config',
  CHATBOT_TEST: 'chatbot-test',
  
  // Deployment
  DEPLOYMENTS: 'deployments',
  DEPLOYMENT: 'deployment',
  EMBED_CODE: 'embed-code',
  
  // Analytics
  ANALYTICS_DASHBOARD: 'analytics-dashboard',
  CONVERSATION_ANALYTICS: 'conversation-analytics',
  PERFORMANCE_ANALYTICS: 'performance-analytics',
  
  // Chat
  CHAT_SESSIONS: 'chat-sessions',
  CHAT_SESSION: 'chat-session',
  
  // Questionnaire
  QUESTIONNAIRE_ANALYSIS: 'questionnaire-analysis',
  
  // Tenant
  TENANT_USAGE: 'tenant-usage',
} as const

/**
 * ========================================================================
 * CORE API CLIENT
 * ========================================================================
 */

class ApiClient {
  private baseURL: string
  private getAuthToken: () => string | null

  constructor(baseURL: string, getAuthToken: () => string | null) {
    this.baseURL = baseURL
    this.getAuthToken = getAuthToken
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`
    
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    const token = this.getAuthToken()
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`
    }

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT)
      
      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      let data
      const contentType = response.headers.get('content-type')
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        return {
          success: false,
          error: data?.detail || data?.message || `HTTP ${response.status}: ${response.statusText}`,
          data: null,
        }
      }

      return {
        success: true,
        data,
        error: null,
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: 'Request timeout',
            data: null,
          }
        }
        return {
          success: false,
          error: error.message,
          data: null,
        }
      }
      
      return {
        success: false,
        error: 'Unknown error occurred',
        data: null,
      }
    }
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    const url = new URL(endpoint, this.baseURL)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }
    
    return this.request<T>(url.pathname + url.search)
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    })
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    const token = this.getAuthToken()
    const headers: Record<string, string> = {}
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    })
  }
}

/**
 * ========================================================================
 * CUSTOM HOOK FOR API CLIENT
 * ========================================================================
 */

export const useApiClient = () => {
  const tokens = useAuthStore((state) => state.tokens)
  
  return useMemo(() => {
    const getAuthToken = () => tokens?.access_token || null
    return new ApiClient(API_CONFIG.BASE_URL, getAuthToken)
  }, [tokens?.access_token])
}

/**
 * ========================================================================
 * ERROR HANDLING UTILITIES
 * ========================================================================
 */

const handleApiError = (error: any, operation: string) => {
  const message = error?.message || error?.error || `Failed to ${operation}`
  console.error(`API Error (${operation}):`, error)
  
  toast({
    title: 'Error',
    description: message,
    variant: 'destructive',
  })
  
  return error
}

const showSuccessToast = (message: string) => {
  toast({
    title: 'Success',
    description: message,
    variant: 'default',
  })
}

/**
 * ========================================================================
 * CONTENT MANAGEMENT HOOKS
 * ========================================================================
 */

export const useContentSources = (params?: {
  page?: number
  per_page?: number
  content_type?: string
  status?: string
}) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.CONTENT_SOURCES, params],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<ContentSource>>('/api/content/sources', params)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 30000, // 30 seconds
    retry: 2,
  })
}

export const useContentSource = (sourceId: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.CONTENT_SOURCE, sourceId],
    queryFn: async () => {
      const response = await apiClient.get<ContentSource>(`/api/content/sources/${sourceId}`)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    enabled: !!sourceId,
    staleTime: 60000, // 1 minute
  })
}

export const useCreateContentSource = () => {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: ContentSourceCreate & { file?: File }) => {
      const { file, ...sourceData } = data
      
      if (file) {
        // Handle file upload
        const formData = new FormData()
        Object.entries(sourceData).forEach(([key, value]) => {
          if (value !== undefined) {
            formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
          }
        })
        formData.append('file', file)
        
        const response = await apiClient.upload<ContentSource>('/api/content/sources', formData)
        if (!response.success) {
          throw new Error(response.error)
        }
        return response.data
      } else {
        // Handle other content types
        const response = await apiClient.post<ContentSource>('/api/content/sources', sourceData)
        if (!response.success) {
          throw new Error(response.error)
        }
        return response.data
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONTENT_SOURCES] })
      showSuccessToast(`Content source "${data?.name}" created successfully`)
    },
    onError: (error) => handleApiError(error, 'create content source'),
  })
}

export const useUpdateContentSource = () => {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ContentSourceUpdate }) => {
      const response = await apiClient.patch<ContentSource>(`/api/content/sources/${id}`, data)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONTENT_SOURCES] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONTENT_SOURCE, variables.id] })
      showSuccessToast(`Content source updated successfully`)
    },
    onError: (error) => handleApiError(error, 'update content source'),
  })
}

export const useDeleteContentSource = () => {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/api/content/sources/${id}`)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONTENT_SOURCES] })
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.CONTENT_SOURCE, id] })
      showSuccessToast('Content source deleted successfully')
    },
    onError: (error) => handleApiError(error, 'delete content source'),
  })
}

export const useProcessingProgress = (sourceId: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.PROCESSING_PROGRESS, sourceId],
    queryFn: async () => {
      const response = await apiClient.get<ProcessingProgress>(`/api/content/sources/${sourceId}/progress`)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    enabled: !!sourceId,
    refetchInterval: 2000, // Poll every 2 seconds
    staleTime: 0, // Always fetch fresh data
  })
}

export const useContentStats = () => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.CONTENT_STATS],
    queryFn: async () => {
      const response = await apiClient.get<ContentIngestionStats>('/api/content/stats')
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 60000, // 1 minute
  })
}

/**
 * ========================================================================
 * CHATBOT CONFIGURATION HOOKS
 * ========================================================================
 */

export const useChatbotConfigs = () => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.CHATBOT_CONFIGS],
    queryFn: async () => {
      const response = await apiClient.get<ChatbotConfig[]>('/api/chatbot/configs')
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 30000,
  })
}

export const useChatbotConfig = (configId: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.CHATBOT_CONFIG, configId],
    queryFn: async () => {
      const response = await apiClient.get<ChatbotConfig>(`/api/chatbot/configs/${configId}`)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    enabled: !!configId,
    staleTime: 60000,
  })
}

export const useCreateChatbotConfig = () => {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: Partial<ChatbotConfig>) => {
      const response = await apiClient.post<ChatbotConfig>('/api/chatbot/configs', data)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOT_CONFIGS] })
      showSuccessToast(`Chatbot "${data?.name}" created successfully`)
    },
    onError: (error) => handleApiError(error, 'create chatbot configuration'),
  })
}

export const useUpdateChatbotConfig = () => {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ChatbotConfig> }) => {
      const response = await apiClient.patch<ChatbotConfig>(`/api/chatbot/configs/${id}`, data)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOT_CONFIGS] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHATBOT_CONFIG, variables.id] })
      showSuccessToast('Chatbot configuration updated successfully')
    },
    onError: (error) => handleApiError(error, 'update chatbot configuration'),
  })
}

export const useTestChatbot = () => {
  const apiClient = useApiClient()
  
  return useMutation({
    mutationFn: async (data: ChatbotTestRequest) => {
      const response = await apiClient.post<ChatbotTestResponse>('/api/chatbot/test', data)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onError: (error) => handleApiError(error, 'test chatbot'),
  })
}

export const useAnalyzeQuestionnaire = () => {
  const apiClient = useApiClient()
  
  return useMutation({
    mutationFn: async (questionnaire: QuestionnaireResponse) => {
      const response = await apiClient.post<QuestionnaireAnalysis>('/api/questionnaire/analyze', questionnaire)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onError: (error) => handleApiError(error, 'analyze questionnaire'),
  })
}

/**
 * ========================================================================
 * DEPLOYMENT HOOKS
 * ========================================================================
 */

export const useDeployments = () => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.DEPLOYMENTS],
    queryFn: async () => {
      const response = await apiClient.get<ChatbotDeployment[]>('/api/deployment/deployments')
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 30000,
  })
}

export const useDeployment = (deploymentId: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.DEPLOYMENT, deploymentId],
    queryFn: async () => {
      const response = await apiClient.get<ChatbotDeployment>(`/api/deployment/deployments/${deploymentId}`)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    enabled: !!deploymentId,
    staleTime: 60000,
  })
}

export const useCreateDeployment = () => {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: ChatbotDeploymentCreate) => {
      const response = await apiClient.post<ChatbotDeployment>('/api/deployment/deployments', data)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DEPLOYMENTS] })
      showSuccessToast(`Deployment "${data?.name}" created successfully`)
    },
    onError: (error) => handleApiError(error, 'create deployment'),
  })
}

export const useUpdateDeployment = () => {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ChatbotDeploymentUpdate }) => {
      const response = await apiClient.patch<ChatbotDeployment>(`/api/deployment/deployments/${id}`, data)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DEPLOYMENTS] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DEPLOYMENT, variables.id] })
      showSuccessToast('Deployment updated successfully')
    },
    onError: (error) => handleApiError(error, 'update deployment'),
  })
}

export const useGetEmbedCode = (deploymentId: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.EMBED_CODE, deploymentId],
    queryFn: async () => {
      const response = await apiClient.get<WidgetEmbedCode>(`/api/deployment/deployments/${deploymentId}/embed`)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    enabled: !!deploymentId,
    staleTime: 300000, // 5 minutes (embed code doesn't change often)
  })
}

/**
 * ========================================================================
 * ANALYTICS HOOKS
 * ========================================================================
 */

export const useAnalyticsDashboard = (timeRange?: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS_DASHBOARD, timeRange],
    queryFn: async () => {
      const response = await apiClient.get<AnalyticsDashboard>('/api/analytics/dashboard', {
        time_range: timeRange,
      })
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // Refetch every 5 minutes
  })
}

export const useConversationAnalytics = (deploymentId?: string, timeRange?: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.CONVERSATION_ANALYTICS, deploymentId, timeRange],
    queryFn: async () => {
      const response = await apiClient.get<ConversationAnalytics>('/api/analytics/conversations', {
        deployment_id: deploymentId,
        time_range: timeRange,
      })
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 120000, // 2 minutes
  })
}

export const usePerformanceAnalytics = (timeRange?: string) => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.PERFORMANCE_ANALYTICS, timeRange],
    queryFn: async () => {
      const response = await apiClient.get<PerformanceAnalytics>('/api/analytics/performance', {
        time_range: timeRange,
      })
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 180000, // 3 minutes
  })
}

/**
 * ========================================================================
 * CHAT HOOKS
 * ========================================================================
 */

export const useChatSessions = (deploymentId?: string) => {
  const apiClient = useApiClient()
  
  return useInfiniteQuery({
    queryKey: [QUERY_KEYS.CHAT_SESSIONS, deploymentId],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await apiClient.get<PaginatedResponse<ChatSession>>('/api/chat/sessions', {
        deployment_id: deploymentId,
        page: pageParam,
        per_page: 20,
      })
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    getNextPageParam: (lastPage) => {
      return lastPage?.meta?.has_more ? (lastPage.meta.page || 0) + 1 : undefined
    },
    staleTime: 30000,
  })
}

export const useSendChatMessage = () => {
  const apiClient = useApiClient()
  
  return useMutation({
    mutationFn: async (data: ChatRequest) => {
      const response = await apiClient.post<ChatResponse>('/api/chat/message', data)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onError: (error) => handleApiError(error, 'send chat message'),
  })
}

/**
 * ========================================================================
 * TENANT & USAGE HOOKS
 * ========================================================================
 */

export const useTenantUsage = () => {
  const apiClient = useApiClient()
  
  return useQuery({
    queryKey: [QUERY_KEYS.TENANT_USAGE],
    queryFn: async () => {
      const response = await apiClient.get('/api/tenant/usage')
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    staleTime: 60000,
    refetchInterval: 300000, // Refetch every 5 minutes
  })
}

/**
 * ========================================================================
 * UTILITY HOOKS
 * ========================================================================
 */

// Hook for invalidating all queries (useful for logout)
export const useInvalidateAllQueries = () => {
  const queryClient = useQueryClient()
  
  return useCallback(() => {
    queryClient.invalidateQueries()
  }, [queryClient])
}

// Hook for prefetching data
export const usePrefetchData = () => {
  const queryClient = useQueryClient()
  const apiClient = useApiClient()
  
  const prefetchContentSources = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: [QUERY_KEYS.CONTENT_SOURCES],
      queryFn: async () => {
        const response = await apiClient.get<PaginatedResponse<ContentSource>>('/api/content/sources')
        if (!response.success) throw new Error(response.error)
        return response.data
      },
    })
  }, [queryClient, apiClient])
  
  const prefetchChatbotConfigs = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: [QUERY_KEYS.CHATBOT_CONFIGS],
      queryFn: async () => {
        const response = await apiClient.get<ChatbotConfig[]>('/api/chatbot/configs')
        if (!response.success) throw new Error(response.error)
        return response.data
      },
    })
  }, [queryClient, apiClient])
  
  const prefetchDeployments = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: [QUERY_KEYS.DEPLOYMENTS],
      queryFn: async () => {
        const response = await apiClient.get<ChatbotDeployment[]>('/api/deployment/deployments')
        if (!response.success) throw new Error(response.error)
        return response.data
      },
    })
  }, [queryClient, apiClient])
  
  return {
    prefetchContentSources,
    prefetchChatbotConfigs,
    prefetchDeployments,
  }
}

/**
 * ========================================================================
 * EXPORT ALL HOOKS
 * ========================================================================
 */

export {
  // Content Management
  useContentSources,
  useContentSource,
  useCreateContentSource,
  useUpdateContentSource,
  useDeleteContentSource,
  useProcessingProgress,
  useContentStats,
  
  // Chatbot Configuration
  useChatbotConfigs,
  useChatbotConfig,
  useCreateChatbotConfig,
  useUpdateChatbotConfig,
  useTestChatbot,
  useAnalyzeQuestionnaire,
  
  // Deployment
  useDeployments,
  useDeployment,
  useCreateDeployment,
  useUpdateDeployment,
  useGetEmbedCode,
  
  // Analytics
  useAnalyticsDashboard,
  useConversationAnalytics,
  usePerformanceAnalytics,
  
  // Chat
  useChatSessions,
  useSendChatMessage,
  
  // Tenant
  useTenantUsage,
  
  // Utilities
  useApiClient,
  useInvalidateAllQueries,
  usePrefetchData,
}