import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios'

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const API_TIMEOUT = 30000 // 30 seconds

// Token storage utilities
const TOKEN_STORAGE_KEY = 'chatcraft_access_token'
const REFRESH_TOKEN_KEY = 'chatcraft_refresh_token'
const TENANT_ID_KEY = 'chatcraft_tenant_id'

class TokenManager {
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  }

  static getTenantId(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TENANT_ID_KEY)
  }

  static setTokens(accessToken: string, refreshToken: string, tenantId: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    localStorage.setItem(TENANT_ID_KEY, tenantId)
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(TENANT_ID_KEY)
  }

  static isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const currentTime = Date.now() / 1000
      return payload.exp < currentTime
    } catch {
      return true
    }
  }
}

// Create main API instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - Add auth token to requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = TokenManager.getAccessToken()
    const tenantId = TokenManager.getTenantId()

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    if (tenantId) {
      config.headers['X-Tenant-ID'] = tenantId
    }

    // Add request timestamp for debugging
    config.metadata = { startTime: Date.now() }

    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
      headers: config.headers,
      data: config.data
    })

    return config
  },
  (error: AxiosError) => {
    console.error('❌ Request Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor - Handle token refresh and errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Log response time for debugging
    const duration = Date.now() - (response.config.metadata?.startTime || 0)
    console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`, response.data)
    
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    console.error('❌ API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    })

    // Handle 401 Unauthorized - Token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = TokenManager.getRefreshToken()
      if (refreshToken) {
        try {
          console.log('🔄 Attempting token refresh...')
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken
          })

          const { access_token, refresh_token: newRefreshToken, tenant_id } = response.data
          TokenManager.setTokens(access_token, newRefreshToken, tenant_id)

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return api(originalRequest)
        } catch (refreshError) {
          console.error('❌ Token refresh failed:', refreshError)
          TokenManager.clearTokens()
          
          // Redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
          return Promise.reject(refreshError)
        }
      } else {
        // No refresh token, redirect to login
        TokenManager.clearTokens()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      }
    }

    // Handle other error statuses
    if (error.response?.status === 403) {
      console.error('❌ Forbidden: Insufficient permissions')
      // Could show a toast notification here
    }

    if (error.response?.status === 404) {
      console.error('❌ Not Found: Resource does not exist')
    }

    if (error.response?.status >= 500) {
      console.error('❌ Server Error: Internal server error')
      // Could show a toast notification here
    }

    return Promise.reject(error)
  }
)

// API Response Types
export interface ApiResponse<T = any> {
  data: T
  message?: string
  status: 'success' | 'error'
  timestamp?: string
}

export interface ApiError {
  message: string
  code?: string
  details?: any
  status: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasNext: boolean
  hasPrev: boolean
}

// Authentication Types
export interface LoginRequest {
  email: string
  password: string
}

export interface AuthTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  tenant_id: string
  expires_in: number
}

export interface TenantCreateRequest {
  organization_name: string
  questionnaire_data: any
}

// Content Management Types
export interface ContentSourceCreate {
  name: string
  content_type: 'document' | 'website' | 'video' | 'api'
  source_url?: string
  config?: Record<string, any>
}

export interface ContentSourceResponse {
  id: string
  tenant_id: string
  name: string
  content_type: string
  source_url?: string
  status: 'pending' | 'processing' | 'chunking' | 'embedding' | 'completed' | 'failed'
  progress_percentage: number
  error_message?: string
  file_size_mb: number
  total_chunks: number
  processed_chunks: number
  created_at: string
  updated_at: string
  last_processed?: string
}

export interface ProcessingProgress {
  source_id: string
  status: string
  progress_percentage: number
  message: string
  chunks_processed: number
  total_chunks: number
  error_message?: string
}

export interface TenantUsage {
  tenant_id: string
  organization_name: string
  subscription_tier: string
  document_count: number
  storage_used_mb: number
  monthly_queries_used: number
  max_documents: number
  max_storage_mb: number
  max_monthly_queries: number
  documents_remaining: number
  storage_remaining_mb: number
  queries_remaining: number
}

// Utility functions
export const apiUtils = {
  /**
   * Create a FormData object for file uploads
   */
  createFormData: (data: Record<string, any>): FormData => {
    const formData = new FormData()
    
    Object.entries(data).forEach(([key, value]) => {
      if (value instanceof File) {
        formData.append(key, value)
      } else if (Array.isArray(value)) {
        formData.append(key, JSON.stringify(value))
      } else if (typeof value === 'object' && value !== null) {
        formData.append(key, JSON.stringify(value))
      } else {
        formData.append(key, String(value))
      }
    })
    
    return formData
  },

  /**
   * Handle API errors consistently
   */
  handleError: (error: AxiosError): ApiError => {
    if (error.response) {
      return {
        message: error.response.data?.message || error.message,
        code: error.response.data?.code,
        details: error.response.data?.details,
        status: error.response.status
      }
    } else if (error.request) {
      return {
        message: 'Network error - please check your connection',
        status: 0
      }
    } else {
      return {
        message: error.message,
        status: 0
      }
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: (): boolean => {
    const token = TokenManager.getAccessToken()
    if (!token) return false
    return !TokenManager.isTokenExpired(token)
  },

  /**
   * Get current tenant ID
   */
  getCurrentTenantId: (): string | null => {
    return TokenManager.getTenantId()
  },

  /**
   * Logout user and clear tokens
   */
  logout: (): void => {
    TokenManager.clearTokens()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }
}

// Export configured API instance and utilities
export { api, TokenManager }
export default api

// Development helpers
if (process.env.NODE_ENV === 'development') {
  // Add request/response logging
  console.log('🔧 API Configuration loaded:', {
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    hasToken: !!TokenManager.getAccessToken(),
    tenantId: TokenManager.getTenantId()
  })
}