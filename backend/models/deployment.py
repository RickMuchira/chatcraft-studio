# backend/models/deployment.py
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean, JSON, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from enum import Enum
import uuid

from .content import Base, Tenant
from .chatbot import ChatbotConfig

class DeploymentType(str, Enum):
    """Types of chatbot deployments"""
    WEB_WIDGET = "web_widget"
    SLACK = "slack"
    TEAMS = "teams"
    DISCORD = "discord"
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"
    API = "api"
    EMBED = "embed"

class DeploymentStatus(str, Enum):
    """Deployment status"""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"

class WidgetPosition(str, Enum):
    """Widget positioning options"""
    BOTTOM_RIGHT = "bottom-right"
    BOTTOM_LEFT = "bottom-left"
    TOP_RIGHT = "top-right"
    TOP_LEFT = "top-left"
    CENTER = "center"

class WidgetSize(str, Enum):
    """Widget size options"""
    SMALL = "small"      # 300x400
    MEDIUM = "medium"    # 400x500
    LARGE = "large"      # 500x600
    FULLSCREEN = "fullscreen"

class ChatbotDeployment(Base):
    """Chatbot deployment instances"""
    __tablename__ = "chatbot_deployments"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    config_id = Column(String, ForeignKey("chatbot_configs.id"), nullable=False)
    
    # Deployment details
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    deployment_type = Column(String, nullable=False)
    status = Column(String, default=DeploymentStatus.DRAFT)
    
    # URLs and identifiers
    deployment_url = Column(String, nullable=True)  # Public URL for the deployment
    widget_id = Column(String, nullable=True)       # Unique widget identifier
    api_key = Column(String, nullable=True)         # API key for this deployment
    
    # Configuration
    deployment_config = Column(JSON, default=dict)  # Deployment-specific settings
    widget_styling = Column(JSON, default=dict)     # Widget appearance settings
    custom_domain = Column(String, nullable=True)   # Custom domain for widget
    
    # Access control
    allowed_domains = Column(JSON, default=list)    # Domains allowed to embed widget
    rate_limit_per_hour = Column(Integer, default=100)
    require_auth = Column(Boolean, default=False)
    
    # Analytics and usage
    total_conversations = Column(Integer, default=0)
    total_messages = Column(Integer, default=0)
    unique_users = Column(Integer, default=0)
    average_satisfaction = Column(Float, nullable=True)
    last_activity = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    deployed_at = Column(DateTime, nullable=True)
    
    # Relationships
    tenant = relationship("Tenant")
    config = relationship("ChatbotConfig")
    conversations = relationship("DeploymentConversation", back_populates="deployment", cascade="all, delete-orphan")

class DeploymentConversation(Base):
    """Individual conversations within a deployment"""
    __tablename__ = "deployment_conversations"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    deployment_id = Column(String, ForeignKey("chatbot_deployments.id"), nullable=False)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # User identification
    user_id = Column(String, nullable=True)          # Anonymous or authenticated user ID
    session_id = Column(String, nullable=False)      # Browser/client session
    user_ip = Column(String, nullable=True)          # IP address for analytics
    user_agent = Column(String, nullable=True)       # Browser info
    
    # Conversation metadata
    started_at = Column(DateTime, default=func.now())
    ended_at = Column(DateTime, nullable=True)
    message_count = Column(Integer, default=0)
    satisfaction_score = Column(Float, nullable=True)
    
    # Context
    referrer_url = Column(String, nullable=True)     # Where user came from
    page_url = Column(String, nullable=True)         # Page where widget was used
    
    # Relationships
    deployment = relationship("ChatbotDeployment", back_populates="conversations")
    messages = relationship("DeploymentMessage", back_populates="conversation", cascade="all, delete-orphan")

class DeploymentMessage(Base):
    """Individual messages within deployment conversations"""
    __tablename__ = "deployment_messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, ForeignKey("deployment_conversations.id"), nullable=False)
    deployment_id = Column(String, ForeignKey("chatbot_deployments.id"), nullable=False)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # Message content
    message = Column(Text, nullable=False)
    response = Column(Text, nullable=True)
    role = Column(String, nullable=False)  # user, assistant, system
    
    # RAG context
    retrieved_chunks = Column(JSON, default=list)
    similarity_scores = Column(JSON, default=list)
    
    # Performance metrics
    response_time_ms = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    
    # User feedback
    feedback_score = Column(Float, nullable=True)
    feedback_comment = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    conversation = relationship("DeploymentConversation", back_populates="messages")

# Pydantic Models for API
class WidgetStyling(BaseModel):
    """Widget styling configuration"""
    
    # Layout
    position: WidgetPosition = WidgetPosition.BOTTOM_RIGHT
    size: WidgetSize = WidgetSize.MEDIUM
    
    # Colors
    primary_color: str = "#2563eb"
    secondary_color: str = "#f8fafc"
    text_color: str = "#1f2937"
    background_color: str = "#ffffff"
    
    # Branding
    header_title: str = "Chat with us"
    header_subtitle: Optional[str] = "We're here to help!"
    company_logo_url: Optional[str] = None
    
    # Typography
    font_family: str = "Inter, sans-serif"
    font_size: str = "14px"
    
    # Behavior
    auto_open: bool = False
    show_launcher: bool = True
    launcher_text: str = "💬"
    
    # Advanced
    border_radius: str = "12px"
    shadow: str = "0 10px 25px rgba(0, 0, 0, 0.1)"
    animation: str = "slide-up"
    
    # Custom CSS
    custom_css: Optional[str] = None

class DeploymentConfigData(BaseModel):
    """Deployment-specific configuration"""
    
    # Behavior settings
    greeting_enabled: bool = True
    typing_indicator: bool = True
    read_receipts: bool = True
    file_upload_enabled: bool = False
    
    # Security
    rate_limit_enabled: bool = True
    rate_limit_per_hour: int = 100
    allowed_domains: List[str] = Field(default_factory=list)
    require_auth: bool = False
    
    # Features
    conversation_starters: List[str] = Field(default_factory=list)
    quick_replies: List[str] = Field(default_factory=list)
    escalation_enabled: bool = True
    feedback_enabled: bool = True
    
    # Analytics
    analytics_enabled: bool = True
    collect_user_info: bool = False
    session_timeout_minutes: int = 30

class ChatbotDeploymentCreate(BaseModel):
    """Create new chatbot deployment"""
    config_id: str
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    deployment_type: DeploymentType
    
    # Configuration
    deployment_config: DeploymentConfigData = Field(default_factory=DeploymentConfigData)
    widget_styling: Optional[WidgetStyling] = None
    
    # Access control
    allowed_domains: List[str] = Field(default_factory=list)
    custom_domain: Optional[str] = None

class ChatbotDeploymentUpdate(BaseModel):
    """Update chatbot deployment"""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[DeploymentStatus] = None
    deployment_config: Optional[DeploymentConfigData] = None
    widget_styling: Optional[WidgetStyling] = None
    allowed_domains: Optional[List[str]] = None

class ChatbotDeploymentResponse(BaseModel):
    """Chatbot deployment response"""
    id: str
    tenant_id: str
    config_id: str
    name: str
    description: Optional[str]
    deployment_type: DeploymentType
    status: DeploymentStatus
    deployment_url: Optional[str]
    widget_id: Optional[str]
    
    # Statistics
    total_conversations: int
    total_messages: int
    unique_users: int
    average_satisfaction: Optional[float]
    
    # Configuration
    deployment_config: Dict[str, Any]
    widget_styling: Dict[str, Any]
    
    created_at: datetime
    updated_at: datetime
    deployed_at: Optional[datetime]
    last_activity: Optional[datetime]
    
    class Config:
        from_attributes = True

class WidgetEmbedCode(BaseModel):
    """Widget embed code and configuration"""
    widget_id: str
    embed_code: str
    script_url: str
    config_json: str
    instructions: List[str]

class DeploymentAnalytics(BaseModel):
    """Deployment analytics data"""
    deployment_id: str
    period_days: int
    
    # Conversation metrics
    total_conversations: int
    new_conversations: int
    returning_users: int
    
    # Message metrics
    total_messages: int
    avg_messages_per_conversation: float
    avg_response_time_ms: float
    
    # User satisfaction
    satisfaction_score: Optional[float]
    feedback_count: int
    
    # Usage patterns
    peak_hours: List[Dict[str, Any]]
    popular_pages: List[Dict[str, Any]]
    common_queries: List[Dict[str, Any]]
    
    # Performance
    error_rate: float
    uptime_percentage: float

class ChatRequest(BaseModel):
    """Chat request for deployed widget"""
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None
    session_id: str
    
    # Context
    page_url: Optional[str] = None
    referrer_url: Optional[str] = None
    user_agent: Optional[str] = None

class ChatResponse(BaseModel):
    """Chat response from deployed widget"""
    message: str
    response: str
    conversation_id: str
    message_id: str
    
    # Metadata
    response_time_ms: int
    tokens_used: int
    retrieved_sources: List[Dict[str, str]]
    
    # UI hints
    show_typing: bool = False
    suggested_replies: List[str] = Field(default_factory=list)

class ConversationStarter(BaseModel):
    """Conversation starter suggestion"""
    text: str
    category: str
    icon: Optional[str] = None

class DeploymentStats(BaseModel):
    """Quick deployment statistics"""
    total_deployments: int
    active_deployments: int
    deployments_by_type: Dict[str, int]
    total_conversations_today: int
    total_messages_today: int
    average_satisfaction: Optional[float]

class WebSocketMessage(BaseModel):
    """WebSocket message format"""
    type: str  # chat, typing, status, error
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)