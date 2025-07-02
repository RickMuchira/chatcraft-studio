// types/index.ts - Comprehensive TypeScript Types for ChatCraft Studio

/**
 * ========================================================================
 * CORE AUTHENTICATION & TENANT TYPES
 * ========================================================================
 */

export interface AuthToken {
    access_token: string
    refresh_token: string
    token_type: string
    tenant_id: string
    expires_in: number
  }
  
  export interface User {
    id: string
    email: string
    name: string
    tenant_id: string
    role: UserRole
    created_at: string
    last_login: string
    is_active: boolean
  }
  
  export type UserRole = 'admin' | 'member' | 'viewer'
  
  export interface Tenant {
    id: string
    organization_name: string
    subdomain: string
    plan_type: PlanType
    questionnaire_id?: string
    created_at: string
    updated_at: string
    settings: TenantSettings
    usage: TenantUsage
  }
  
  export type PlanType = 'free' | 'starter' | 'professional' | 'enterprise'
  
  export interface TenantSettings {
    custom_domain?: string
    branding: {
      logo_url?: string
      primary_color: string
      secondary_color: string
      font_family: string
    }
    security: {
      sso_enabled: boolean
      two_factor_required: boolean
      ip_restrictions: string[]
    }
    notifications: {
      email_enabled: boolean
      slack_webhook?: string
      discord_webhook?: string
    }
  }
  
  export interface TenantUsage {
    current_month: {
      messages_sent: number
      documents_processed: number
      storage_used_mb: number
      chatbots_active: number
    }
    limits: {
      max_messages: number
      max_documents: number
      max_storage_mb: number
      max_chatbots: number
    }
    usage_percentage: {
      messages: number
      documents: number
      storage: number
      chatbots: number
    }
  }
  
  /**
   * ========================================================================
   * QUESTIONNAIRE & ORGANIZATION TYPES
   * ========================================================================
   */
  
  export interface QuestionnaireResponse {
    organizationName: string
    organizationType: OrganizationType
    industry: string
    organizationSize: OrganizationSize
    primaryPurpose: string
    targetAudience: string[]
    communicationStyle: CommunicationStyle
    supportChannels: string[]
    businessHours?: string
    specialRequirements?: string
    complianceNeeds: string[]
    languages: string[]
    integrationNeeds: string[]
  }
  
  export type OrganizationType = 
    | 'business' 
    | 'nonprofit' 
    | 'education' 
    | 'healthcare' 
    | 'government' 
    | 'retail' 
    | 'technology' 
    | 'finance' 
    | 'consulting' 
    | 'other'
  
  export type OrganizationSize = 
    | 'solo'      // 1 person
    | 'small'     // 2-10 people
    | 'medium'    // 11-50 people
    | 'large'     // 51-200 people
    | 'enterprise' // 200+ people
  
  export type CommunicationStyle = 
    | 'professional' 
    | 'friendly' 
    | 'helpful' 
    | 'expert' 
    | 'warm'
  
  export interface QuestionnaireAnalysis {
    organization_profile: {
      type: OrganizationType
      size: OrganizationSize
      industry: string
      complexity_score: number
    }
    communication_analysis: {
      style: CommunicationStyle
      tone: string
      audience_types: string[]
      formality_level: number
    }
    suggested_configs: {
      personality_type: ChatbotPersonality
      response_style: ResponseStyle
      fallback_behavior: FallbackBehavior
      temperature: number
    }
    suggested_prompts: {
      system: string
      greeting: string
      fallback: string
    }
    compliance_requirements: string[]
    integration_priorities: string[]
  }
  
  /**
   * ========================================================================
   * CONTENT MANAGEMENT TYPES
   * ========================================================================
   */
  
  export interface ContentSource {
    id: string
    tenant_id: string
    name: string
    content_type: ContentType
    source_url?: string
    file_path?: string
    config: ContentSourceConfig
    status: ProcessingStatus
    created_at: string
    updated_at: string
    processed_at?: string
    error_message?: string
    stats: ContentProcessingStats
  }
  
  export type ContentType = 
    | 'document'   // PDF, DOCX, TXT files
    | 'website'    // Web scraping
    | 'video'      // YouTube transcription
    | 'api'        // API endpoints
    | 'database'   // Database connections
  
  export type ProcessingStatus = 
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'cancelled'
  
  export interface ContentSourceConfig {
    // Website scraping config
    max_pages?: number
    depth_limit?: number
    follow_external_links?: boolean
    exclude_patterns?: string[]
    include_patterns?: string[]
    
    // Document processing config
    ocr_enabled?: boolean
    extract_images?: boolean
    chunk_size?: number
    overlap_size?: number
    
    // Video processing config
    language?: string
    timestamps_enabled?: boolean
    
    // API config
    headers?: Record<string, string>
    auth_token?: string
    request_method?: 'GET' | 'POST'
    parameters?: Record<string, any>
  }
  
  export interface ContentProcessingStats {
    total_documents: number
    processed_documents: number
    failed_documents: number
    total_chunks: number
    total_tokens: number
    processing_time_ms: number
    file_size_bytes: number
  }
  
  export interface ProcessingProgress {
    source_id: string
    current_step: string
    progress_percentage: number
    estimated_completion?: string
    current_file?: string
    files_processed: number
    total_files: number
    error_count: number
    warnings: string[]
  }
  
  export interface ContentChunk {
    id: string
    source_id: string
    content: string
    metadata: ChunkMetadata
    embedding_vector?: number[]
    similarity_score?: number
  }
  
  export interface ChunkMetadata {
    page_number?: number
    section_title?: string
    url?: string
    timestamp?: string
    file_path?: string
    chunk_index: number
    token_count: number
    language?: string
  }
  
  /**
   * ========================================================================
   * CHATBOT CONFIGURATION TYPES
   * ========================================================================
   */
  
  export interface ChatbotConfig {
    id: string
    tenant_id: string
    name: string
    description?: string
    personality_type: ChatbotPersonality
    response_style: ResponseStyle
    fallback_behavior: FallbackBehavior
    llm_provider: LLMProvider
    llm_model: string
    system_prompt_template: string
    greeting_message: string
    max_response_length: number
    temperature: number
    use_emojis: boolean
    include_sources: boolean
    escalation_keywords: string[]
    restricted_topics: string[]
    created_at: string
    updated_at: string
    is_active: boolean
    usage_stats: ChatbotUsageStats
  }
  
  export type ChatbotPersonality = 
    | 'professional'
    | 'friendly'
    | 'technical'
    | 'casual'
    | 'empathetic'
    | 'authoritative'
    | 'helpful'
    | 'concise'
  
  export type ResponseStyle = 
    | 'conversational'
    | 'structured'
    | 'bullet_points'
    | 'detailed'
    | 'brief'
    | 'step_by_step'
  
  export type FallbackBehavior = 
    | 'apologetic'      // "I don't have that information"
    | 'redirect'        // Redirect to human support
    | 'suggest'         // Suggest related topics
    | 'clarify'         // Ask for clarification
  
  export type LLMProvider = 
    | 'ollama'          // Local models via Ollama
    | 'huggingface'     // HuggingFace Transformers
    | 'llamacpp'        // llama.cpp integration
    | 'vllm'            // vLLM for fast inference
    | 'textgen'         // Text Generation WebUI
    | 'localai'         // LocalAI API
  
  export interface ChatbotUsageStats {
    total_conversations: number
    total_messages: number
    average_response_time_ms: number
    user_satisfaction_score: number
    escalation_rate: number
    most_common_topics: string[]
    daily_usage: DailyUsage[]
  }
  
  export interface DailyUsage {
    date: string
    message_count: number
    unique_users: number
    average_session_length: number
  }
  
  export interface ChatbotTestRequest {
    config_id?: string
    test_messages: string[]
    context?: ChatMessage[]
  }
  
  export interface ChatbotTestResponse {
    responses: ChatTestResult[]
    performance_metrics: {
      average_response_time: number
      total_tokens_used: number
      sources_retrieved: number
    }
  }
  
  export interface ChatTestResult {
    message: string
    response: string
    response_time_ms: number
    tokens_used: number
    sources: ContentChunk[]
    confidence_score: number
  }
  
  /**
   * ========================================================================
   * CHAT & MESSAGING TYPES
   * ========================================================================
   */
  
  export interface ChatSession {
    id: string
    deployment_id: string
    user_id?: string
    session_id: string
    started_at: string
    ended_at?: string
    message_count: number
    user_feedback?: UserFeedback
    metadata: SessionMetadata
  }
  
  export interface SessionMetadata {
    user_agent?: string
    ip_address?: string
    referrer?: string
    page_url?: string
    country?: string
    device_type?: string
    session_duration?: number
  }
  
  export interface ChatMessage {
    id: string
    conversation_id: string
    role: MessageRole
    content: string
    timestamp: string
    metadata?: MessageMetadata
  }
  
  export type MessageRole = 'user' | 'assistant' | 'system'
  
  export interface MessageMetadata {
    response_time_ms?: number
    tokens_used?: number
    sources?: ContentChunk[]
    confidence_score?: number
    user_feedback?: UserFeedback
  }
  
  export interface UserFeedback {
    score: number // 1-5 rating
    comment?: string
    helpful: boolean
    timestamp: string
  }
  
  export interface ChatRequest {
    message: string
    session_id: string
    conversation_id?: string
    context?: ChatMessage[]
    page_url?: string
    user_metadata?: Record<string, any>
  }
  
  export interface ChatResponse {
    response: string
    conversation_id: string
    sources: ContentChunk[]
    response_time_ms: number
    tokens_used: number
    confidence_score: number
    suggestions?: string[]
  }
  
  /**
   * ========================================================================
   * DEPLOYMENT TYPES
   * ========================================================================
   */
  
  export interface ChatbotDeployment {
    id: string
    tenant_id: string
    config_id: string
    name: string
    deployment_type: DeploymentType
    status: DeploymentStatus
    widget_id?: string
    webhook_url?: string
    api_key?: string
    config: DeploymentConfig
    styling: WidgetStyling
    security: DeploymentSecurity
    created_at: string
    updated_at: string
    last_deployed_at?: string
    stats: DeploymentStats
  }
  
  export type DeploymentType = 
    | 'web_widget'
    | 'slack'
    | 'teams'
    | 'discord'
    | 'telegram'
    | 'whatsapp'
    | 'api'
    | 'embed'
  
  export type DeploymentStatus = 
    | 'draft'
    | 'active'
    | 'paused'
    | 'stopped'
    | 'error'
  
  export interface DeploymentConfig {
    // Rate limiting
    max_requests_per_minute: number
    max_requests_per_hour: number
    
    // Behavior
    auto_responses_enabled: boolean
    handoff_enabled: boolean
    handoff_keywords: string[]
    
    // Features
    file_upload_enabled: boolean
    feedback_collection_enabled: boolean
    analytics_enabled: boolean
    
    // Integration specific
    slack_config?: SlackConfig
    teams_config?: TeamsConfig
    webhook_config?: WebhookConfig
  }
  
  export interface WidgetStyling {
    // Layout
    position: WidgetPosition
    size: WidgetSize
    
    // Colors
    primary_color: string
    secondary_color: string
    text_color: string
    background_color: string
    
    // Branding
    header_title: string
    header_subtitle?: string
    launcher_text: string
    logo_url?: string
    
    // Behavior
    auto_open: boolean
    greeting_enabled: boolean
    typing_indicator: boolean
    sound_enabled: boolean
    
    // Appearance
    border_radius: string
    shadow: string
    animation: string
    font_family: string
    font_size: string
  }
  
  export type WidgetPosition = 
    | 'bottom-right'
    | 'bottom-left'
    | 'top-right'
    | 'top-left'
    | 'center'
  
  export type WidgetSize = 
    | 'small'      // 300x400
    | 'medium'     // 400x500
    | 'large'      // 500x600
    | 'fullscreen'
  
  export interface DeploymentSecurity {
    allowed_domains: string[]
    cors_origins: string[]
    rate_limiting: {
      enabled: boolean
      requests_per_minute: number
      burst_limit: number
    }
    authentication: {
      required: boolean
      api_key?: string
      jwt_secret?: string
    }
  }
  
  export interface DeploymentStats {
    total_conversations: number
    total_messages: number
    unique_users: number
    average_session_duration: number
    user_satisfaction_score: number
    response_time_p95: number
    uptime_percentage: number
    error_rate: number
  }
  
  export interface WidgetEmbedCode {
    widget_id: string
    embed_code: string
    script_url: string
    config_json: string
    instructions: string[]
  }
  
  // Integration-specific configs
  export interface SlackConfig {
    bot_token: string
    signing_secret: string
    app_id: string
    team_id: string
    channels: string[]
  }
  
  export interface TeamsConfig {
    app_id: string
    app_password: string
    tenant_id: string
    service_url: string
  }
  
  export interface WebhookConfig {
    url: string
    secret: string
    events: string[]
    headers: Record<string, string>
  }
  
  /**
   * ========================================================================
   * ANALYTICS TYPES
   * ========================================================================
   */
  
  export interface AnalyticsDashboard {
    overview: AnalyticsOverview
    conversations: ConversationAnalytics
    performance: PerformanceAnalytics
    insights: AnalyticsInsights
  }
  
  export interface AnalyticsOverview {
    total_conversations: number
    total_messages: number
    unique_users: number
    active_deployments: number
    user_satisfaction: number
    response_time_avg: number
    trending_topics: string[]
    growth_metrics: GrowthMetrics
  }
  
  export interface GrowthMetrics {
    conversations_growth: number // percentage
    users_growth: number
    satisfaction_trend: number
    period: 'day' | 'week' | 'month'
  }
  
  export interface ConversationAnalytics {
    by_channel: ChannelMetrics[]
    by_time: TimeSeriesData[]
    by_topic: TopicMetrics[]
    user_flow: UserFlowData[]
    satisfaction_breakdown: SatisfactionBreakdown
  }
  
  export interface ChannelMetrics {
    channel: DeploymentType
    conversations: number
    messages: number
    satisfaction: number
    response_time: number
  }
  
  export interface TimeSeriesData {
    timestamp: string
    conversations: number
    messages: number
    unique_users: number
    response_time: number
  }
  
  export interface TopicMetrics {
    topic: string
    frequency: number
    satisfaction: number
    resolution_rate: number
    escalation_rate: number
  }
  
  export interface UserFlowData {
    step: string
    users: number
    drop_off_rate: number
  }
  
  export interface SatisfactionBreakdown {
    excellent: number  // 5 stars
    good: number      // 4 stars
    average: number   // 3 stars
    poor: number      // 2 stars
    terrible: number  // 1 star
  }
  
  export interface PerformanceAnalytics {
    response_times: ResponseTimeMetrics
    system_health: SystemHealthMetrics
    error_tracking: ErrorMetrics
    resource_usage: ResourceUsageMetrics
  }
  
  export interface ResponseTimeMetrics {
    p50: number
    p95: number
    p99: number
    average: number
    by_deployment: DeploymentPerformance[]
  }
  
  export interface DeploymentPerformance {
    deployment_id: string
    deployment_name: string
    avg_response_time: number
    error_rate: number
    uptime: number
  }
  
  export interface SystemHealthMetrics {
    uptime_percentage: number
    error_rate: number
    successful_requests: number
    failed_requests: number
    last_outage?: string
  }
  
  export interface ErrorMetrics {
    total_errors: number
    error_rate: number
    by_type: ErrorTypeBreakdown[]
    recent_errors: RecentError[]
  }
  
  export interface ErrorTypeBreakdown {
    type: string
    count: number
    percentage: number
  }
  
  export interface RecentError {
    timestamp: string
    error_type: string
    message: string
    deployment_id?: string
    user_id?: string
  }
  
  export interface ResourceUsageMetrics {
    storage_used_mb: number
    storage_limit_mb: number
    api_calls_used: number
    api_calls_limit: number
    bandwidth_used_mb: number
  }
  
  export interface AnalyticsInsights {
    key_findings: string[]
    recommendations: Recommendation[]
    performance_alerts: Alert[]
    optimization_opportunities: OptimizationOpportunity[]
  }
  
  export interface Recommendation {
    type: 'performance' | 'content' | 'user_experience' | 'cost'
    title: string
    description: string
    impact: 'high' | 'medium' | 'low'
    effort: 'high' | 'medium' | 'low'
    action_items: string[]
  }
  
  export interface Alert {
    id: string
    severity: 'critical' | 'warning' | 'info'
    title: string
    message: string
    timestamp: string
    resolved: boolean
    action_required?: string
  }
  
  export interface OptimizationOpportunity {
    area: string
    current_performance: number
    potential_improvement: number
    required_actions: string[]
    estimated_impact: string
  }
  
  /**
   * ========================================================================
   * API RESPONSE TYPES
   * ========================================================================
   */
  
  export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    error?: string
    message?: string
    meta?: ResponseMeta
  }
  
  export interface ResponseMeta {
    total?: number
    page?: number
    per_page?: number
    last_page?: number
    has_more?: boolean
  }
  
  export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    meta: ResponseMeta & {
      total: number
      page: number
      per_page: number
      last_page: number
    }
  }
  
  /**
   * ========================================================================
   * WEBSOCKET TYPES
   * ========================================================================
   */
  
  export interface WebSocketMessage {
    type: WebSocketMessageType
    data: any
    timestamp: string
    id?: string
  }
  
  export type WebSocketMessageType = 
    | 'chat_message'
    | 'processing_update'
    | 'deployment_status'
    | 'analytics_update'
    | 'user_typing'
    | 'agent_typing'
    | 'connection_status'
    | 'error'
  
  export interface WebSocketConfig {
    url: string
    reconnectAttempts: number
    reconnectInterval: number
    heartbeatInterval: number
    protocols?: string[]
  }
  
  /**
   * ========================================================================
   * FORM & UI TYPES
   * ========================================================================
   */
  
  export interface FormState<T = any> {
    data: T
    errors: Record<string, string>
    touched: Record<string, boolean>
    isSubmitting: boolean
    isValid: boolean
  }
  
  export interface SelectOption {
    value: string
    label: string
    description?: string
    icon?: React.ReactNode
    disabled?: boolean
  }
  
  export interface TableColumn<T = any> {
    key: keyof T
    title: string
    sortable?: boolean
    render?: (value: any, record: T) => React.ReactNode
    width?: string | number
  }
  
  export interface TableProps<T = any> {
    data: T[]
    columns: TableColumn<T>[]
    loading?: boolean
    pagination?: PaginationProps
    selection?: {
      selectedKeys: string[]
      onSelectionChange: (keys: string[]) => void
    }
  }
  
  export interface PaginationProps {
    current: number
    pageSize: number
    total: number
    onChange: (page: number, pageSize: number) => void
  }
  
  /**
   * ========================================================================
   * UTILITY TYPES
   * ========================================================================
   */
  
  export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
  }
  
  export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
  
  export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
    Pick<T, Exclude<keyof T, Keys>> & {
      [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
    }[Keys]

export interface AuthState {
  // Authentication Status
  isAuthenticated: boolean
  isLoading: boolean
  isInitializing: boolean
  // ... existing code ...
}