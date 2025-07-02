// stores/auth-store.ts - Comprehensive Authentication Store for ChatCraft Studio

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import type { 
  AuthToken, 
  User, 
  Tenant, 
  TenantUsage, 
  ApiResponse,
  QuestionnaireResponse 
} from '@/types'

/**
 * ========================================================================
 * AUTHENTICATION STATE INTERFACES
 * ========================================================================
 */

interface AuthState {
  // Authentication Status
  isAuthenticated: boolean
  isLoading: boolean
  isInitializing: boolean
  
  // User & Token Data
  user: User | null
  tenant: Tenant | null
  tokens: AuthToken | null
  
  // Session Management
  sessionExpiry: number | null
  lastActivity: number
  tokenRefreshPromise: Promise<void> | null
  
  // Error Handling
  error: string | null
  loginError: string | null
  
  // Feature Flags
  features: {
    questionnaire_completed: boolean
    content_sources_configured: boolean
    chatbot_deployed: boolean
    analytics_enabled: boolean
  }
}

interface AuthActions {
  // Authentication Actions
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  register: (registrationData: RegistrationData) => Promise<{ success: boolean; error?: string }>
  
  // Token Management
  refreshToken: () => Promise<boolean>
  setTokens: (tokens: AuthToken) => void
  clearTokens: () => void
  
  // User Management
  updateUser: (userData: Partial<User>) => Promise<void>
  updateTenant: (tenantData: Partial<Tenant>) => Promise<void>
  
  // Session Management
  extendSession: () => void
  checkSessionValidity: () => boolean
  handleSessionExpiry: () => void
  
  // Tenant Onboarding
  completeQuestionnaire: (questionnaire: QuestionnaireResponse) => Promise<{ success: boolean; error?: string }>
  updateOnboardingStep: (step: OnboardingStep) => void
  
  // Error Management
  setError: (error: string | null) => void
  clearError: () => void
  
  // Initialization
  initialize: () => Promise<void>
  reset: () => void
}

type OnboardingStep = 
  | 'questionnaire'
  | 'content_setup'
  | 'chatbot_config'
  | 'deployment'
  | 'completed'

/**
 * ========================================================================
 * API REQUEST TYPES
 * ========================================================================
 */

interface LoginCredentials {
  email: string
  password: string
  remember_me?: boolean
}

interface RegistrationData {
  email: string
  password: string
  organization_name: string
  questionnaire_data?: QuestionnaireResponse
}

interface TokenRefreshRequest {
  refresh_token: string
}

/**
 * ========================================================================
 * CONSTANTS & CONFIGURATION
 * ========================================================================
 */

const AUTH_CONFIG = {
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes before expiry
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000,   // 24 hours
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
} as const

const STORAGE_KEYS = {
  AUTH_STATE: 'chatcraft-auth-state',
  TOKENS: 'chatcraft-tokens',
  USER_PREFERENCES: 'chatcraft-user-prefs',
} as const

/**
 * ========================================================================
 * UTILITY FUNCTIONS
 * ========================================================================
 */

const apiClient = {
  async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${AUTH_CONFIG.API_BASE_URL}${endpoint}`
    
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    
    // Add auth token if available
    const tokens = getStoredTokens()
    if (tokens?.access_token) {
      defaultHeaders['Authorization'] = `Bearer ${tokens.access_token}`
    }
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        return {
          success: false,
          error: data.detail || data.message || `HTTP ${response.status}`,
          data: undefined
        }
      }
      
      return {
        success: true,
        data: data,
        error: undefined
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        data: undefined
      }
    }
  }
}

const getStoredTokens = (): AuthToken | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TOKENS)
    return stored ? JSON.parse(stored) : undefined
  } catch {
    return undefined
  }
}

const storeTokens = (tokens: AuthToken | undefined) => {
  if (typeof window === 'undefined') return
  if (tokens) {
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens))
  } else {
    localStorage.removeItem(STORAGE_KEYS.TOKENS)
  }
}

const isTokenExpired = (token: AuthToken): boolean => {
  if (!token.expires_in) return false
  
  const now = Date.now()
  const tokenTime = parseInt(token.access_token.split('.')[1] || '0', 10) * 1000
  const expiryTime = tokenTime + (token.expires_in * 1000)
  
  return now >= expiryTime - AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD
}

/**
 * ========================================================================
 * MAIN AUTHENTICATION STORE
 * ========================================================================
 */

export const useAuthStore = create<AuthState & AuthActions>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        // Initial State
        isAuthenticated: false,
        isLoading: false,
        isInitializing: true,
        user: null,
        tenant: null,
        tokens: null,
        sessionExpiry: null,
        lastActivity: Date.now(),
        tokenRefreshPromise: null,
        error: null,
        loginError: null,
        features: {
          questionnaire_completed: false,
          content_sources_configured: false,
          chatbot_deployed: false,
          analytics_enabled: false,
        },

        // Authentication Actions
        login: async (credentials) => {
          set((state) => {
            state.isLoading = true
            state.loginError = null
            state.error = null
          })

          try {
            const response = await apiClient.request<AuthToken>('/auth/login', {
              method: 'POST',
              body: JSON.stringify(credentials),
            })

            if (!response.success || !response.data) {
              set((state) => {
                state.isLoading = false
                state.loginError = response.error || 'Login failed'
              })
              return { success: false, error: response.error }
            }

            const tokens = response.data
            
            // Store tokens securely
            storeTokens(tokens)
            
            // Fetch user and tenant data
            const [userResponse, tenantResponse] = await Promise.all([
              apiClient.request<User>('/auth/me'),
              apiClient.request<Tenant>(`/tenants/${tokens.tenant_id}`)
            ])

            set((state) => {
              state.isAuthenticated = true
              state.isLoading = false
              state.tokens = tokens
              state.user = userResponse.data ?? null
              state.tenant = tenantResponse.data ?? null
              state.sessionExpiry = Date.now() + AUTH_CONFIG.SESSION_TIMEOUT
              state.lastActivity = Date.now()
              
              // Update features based on tenant state
              if (state.tenant) {
                state.features.questionnaire_completed = !!state.tenant.questionnaire_id
                // Add other feature flags based on tenant data
              }
            })

            return { success: true }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Login failed'
            
            set((state) => {
              state.isLoading = false
              state.loginError = errorMessage
            })
            
            return { success: false, error: errorMessage }
          }
        },

        logout: async () => {
          const { tokens } = get()
          
          // Call logout endpoint if we have tokens
          if (tokens) {
            try {
              await apiClient.request('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ refresh_token: tokens.refresh_token }),
              })
            } catch (error) {
              console.warn('Logout API call failed:', error)
            }
          }

          // Clear all auth data
          storeTokens(undefined)
          
          set((state) => {
            state.isAuthenticated = false
            state.user = null
            state.tenant = null
            state.tokens = null
            state.sessionExpiry = null
            state.error = null
            state.loginError = null
            state.features = {
              questionnaire_completed: false,
              content_sources_configured: false,
              chatbot_deployed: false,
              analytics_enabled: false,
            }
          })
        },

        register: async (registrationData) => {
          set((state) => {
            state.isLoading = true
            state.error = null
          })

          try {
            const response = await apiClient.request<{
              auth: AuthToken
              user: User
              tenant: Tenant
            }>('/auth/register', {
              method: 'POST',
              body: JSON.stringify(registrationData),
            })

            if (!response.success || !response.data) {
              set((state) => {
                state.isLoading = false
                state.error = response.error || 'Registration failed'
              })
              return { success: false, error: response.error }
            }

            const { auth, user, tenant } = response.data
            
            // Store tokens
            storeTokens(auth)

            set((state) => {
              state.isAuthenticated = true
              state.isLoading = false
              state.tokens = auth
              state.user = user
              state.tenant = tenant
              state.sessionExpiry = Date.now() + AUTH_CONFIG.SESSION_TIMEOUT
              state.lastActivity = Date.now()
              state.features.questionnaire_completed = !!registrationData.questionnaire_data
            })

            return { success: true }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Registration failed'
            
            set((state) => {
              state.isLoading = false
              state.error = errorMessage
            })
            
            return { success: false, error: errorMessage }
          }
        },

        // Token Management
        refreshToken: async () => {
          const { tokens, tokenRefreshPromise } = get()
          
          // Return existing promise if refresh is already in progress
          if (tokenRefreshPromise) {
            await tokenRefreshPromise
            return get().isAuthenticated
          }

          if (!tokens?.refresh_token) {
            get().logout()
            return false
          }

          const refreshPromise = (async () => {
            try {
              const response = await apiClient.request<AuthToken>('/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ refresh_token: tokens.refresh_token }),
              })

              if (!response.success || !response.data) {
                get().logout()
                return
              }

              const newTokens = response.data
              storeTokens(newTokens)

              set((state) => {
                state.tokens = newTokens
                state.sessionExpiry = Date.now() + AUTH_CONFIG.SESSION_TIMEOUT
                state.lastActivity = Date.now()
                state.tokenRefreshPromise = null
              })
            } catch (error) {
              console.error('Token refresh failed:', error)
              get().logout()
            }
          })()

          set((state) => {
            state.tokenRefreshPromise = refreshPromise
          })

          await refreshPromise
          return get().isAuthenticated
        },

        setTokens: (tokens) => {
          storeTokens(tokens)
          set((state) => {
            state.tokens = tokens
            state.isAuthenticated = true
            state.sessionExpiry = Date.now() + AUTH_CONFIG.SESSION_TIMEOUT
          })
        },

        clearTokens: () => {
          storeTokens(undefined)
          set((state) => {
            state.tokens = null
            state.isAuthenticated = false
            state.sessionExpiry = null
          })
        },

        // User Management
        updateUser: async (userData) => {
          const { user } = get()
          if (!user) return

          try {
            const response = await apiClient.request<User>(`/users/${user.id}`, {
              method: 'PATCH',
              body: JSON.stringify(userData),
            })

            if (response.success && response.data) {
              set((state) => {
                state.user = response.data
              })
            }
          } catch (error) {
            console.error('Failed to update user:', error)
            set((state) => {
              state.error = 'Failed to update user profile'
            })
          }
        },

        updateTenant: async (tenantData) => {
          const { tenant } = get()
          if (!tenant) return

          try {
            const response = await apiClient.request<Tenant>(`/tenants/${tenant.id}`, {
              method: 'PATCH',
              body: JSON.stringify(tenantData),
            })

            if (response.success && response.data) {
              set((state) => {
                state.tenant = response.data
              })
            }
          } catch (error) {
            console.error('Failed to update tenant:', error)
            set((state) => {
              state.error = 'Failed to update organization settings'
            })
          }
        },

        // Session Management
        extendSession: () => {
          set((state) => {
            state.lastActivity = Date.now()
            state.sessionExpiry = Date.now() + AUTH_CONFIG.SESSION_TIMEOUT
          })
        },

        checkSessionValidity: () => {
          const { sessionExpiry, tokens } = get()
          
          if (!sessionExpiry || !tokens) return false
          
          const now = Date.now()
          
          // Check if session has expired
          if (now > sessionExpiry) {
            get().handleSessionExpiry()
            return false
          }
          
          // Check if token needs refresh
          if (isTokenExpired(tokens)) {
            get().refreshToken()
          }
          
          return true
        },

        handleSessionExpiry: () => {
          set((state) => {
            state.error = 'Your session has expired. Please log in again.'
          })
          get().logout()
        },

        // Tenant Onboarding
        completeQuestionnaire: async (questionnaire) => {
          const { tenant } = get()
          if (!tenant) return { success: false, error: 'No tenant found' }

          try {
            const response = await apiClient.request<{ questionnaire_id: string }>('/questionnaires', {
              method: 'POST',
              body: JSON.stringify(questionnaire),
            })

            if (!response.success) {
              return { success: false, error: response.error }
            }

            // Update tenant with questionnaire ID
            await get().updateTenant({ 
              questionnaire_id: response.data?.questionnaire_id 
            })

            set((state) => {
              state.features.questionnaire_completed = true
            })

            return { success: true }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to save questionnaire'
            return { success: false, error: errorMessage }
          }
        },

        updateOnboardingStep: (step) => {
          set((state) => {
            switch (step) {
              case 'questionnaire':
                state.features.questionnaire_completed = true
                break
              case 'content_setup':
                state.features.content_sources_configured = true
                break
              case 'chatbot_config':
                // Will be updated when chatbot is configured
                break
              case 'deployment':
                state.features.chatbot_deployed = true
                break
              case 'completed':
                state.features.analytics_enabled = true
                break
            }
          })
        },

        // Error Management
        setError: (error) => {
          set((state) => {
            state.error = error
          })
        },

        clearError: () => {
          set((state) => {
            state.error = null
            state.loginError = null
          })
        },

        // Initialization
        initialize: async () => {
          set((state) => {
            state.isInitializing = true
          })

          try {
            const storedTokens = getStoredTokens()
            
            if (!storedTokens) {
              set((state) => {
                state.isInitializing = false
              })
              return
            }

            // Check if token is expired
            if (isTokenExpired(storedTokens)) {
              // Try to refresh
              const refreshed = await get().refreshToken()
              if (!refreshed) {
                set((state) => {
                  state.isInitializing = false
                })
                return
              }
            } else {
              set((state) => {
                state.tokens = storedTokens
              })
            }

            // Fetch current user and tenant data
            const [userResponse, tenantResponse] = await Promise.all([
              apiClient.request<User>('/auth/me'),
              apiClient.request<Tenant>(`/tenants/${storedTokens.tenant_id}`)
            ])

            if (userResponse.success && tenantResponse.success) {
              set((state) => {
                state.isAuthenticated = true
                state.user = userResponse.data ?? null
                state.tenant = tenantResponse.data ?? null
                state.sessionExpiry = Date.now() + AUTH_CONFIG.SESSION_TIMEOUT
                state.lastActivity = Date.now()
                
                // Update features
                if (state.tenant) {
                  state.features.questionnaire_completed = !!state.tenant.questionnaire_id
                }
              })
            } else {
              get().logout()
            }
          } catch (error) {
            console.error('Auth initialization failed:', error)
            get().logout()
          } finally {
            set((state) => {
              state.isInitializing = false
            })
          }
        },

        reset: () => {
          get().logout()
          set((state) => {
            state.isInitializing = false
            state.isLoading = false
            state.error = null
            state.loginError = null
          })
        },
      })),
      {
        name: STORAGE_KEYS.AUTH_STATE,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          // Only persist specific parts of the state
          user: state.user,
          tenant: state.tenant,
          features: state.features,
          lastActivity: state.lastActivity,
        }),
      }
    )
  )
)

/**
 * ========================================================================
 * SELECTORS & HOOKS
 * ========================================================================
 */

// Convenient selectors
export const useAuth = () => {
  const store = useAuthStore()
  return {
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    isInitializing: store.isInitializing,
    user: store.user,
    tenant: store.tenant,
    error: store.error,
    loginError: store.loginError,
  }
}

export const useAuthActions = () => {
  const store = useAuthStore()
  return {
    login: store.login,
    logout: store.logout,
    register: store.register,
    clearError: store.clearError,
    extendSession: store.extendSession,
  }
}

export const useOnboarding = () => {
  const store = useAuthStore()
  return {
    features: store.features,
    completeQuestionnaire: store.completeQuestionnaire,
    updateOnboardingStep: store.updateOnboardingStep,
  }
}

export const useTenant = () => {
  const store = useAuthStore()
  return {
    tenant: store.tenant,
    updateTenant: store.updateTenant,
    features: store.features,
  }
}

/**
 * ========================================================================
 * REACT HOOKS FOR AUTOMATIC SESSION MANAGEMENT
 * ========================================================================
 */

import { useEffect } from 'react'

// Hook for automatic session management
export const useSessionManager = () => {
  const { checkSessionValidity, extendSession, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) return

    // Check session validity on mount
    checkSessionValidity()

    // Set up periodic session checks
    const sessionCheckInterval = setInterval(() => {
      checkSessionValidity()
    }, 60000) // Check every minute

    // Set up activity tracking
    const handleActivity = () => {
      extendSession()
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true)
    })

    return () => {
      clearInterval(sessionCheckInterval)
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true)
      })
    }
  }, [isAuthenticated, checkSessionValidity, extendSession])
}

// Hook for automatic initialization
export const useAuthInitialization = () => {
  const { initialize, isInitializing } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  return { isInitializing }
}

/**
 * ========================================================================
 * EXPORTS
 * ========================================================================
 */

export default useAuthStore
export type { AuthState, AuthActions, LoginCredentials, RegistrationData }