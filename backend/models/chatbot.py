# backend/models/chatbot.py
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
from .vector import ChatSession

class LLMProvider(str, Enum):
    """Open-source LLM providers and models"""
    OLLAMA = "ollama"              # Local models via Ollama
    HUGGINGFACE = "huggingface"    # HuggingFace Transformers
    LLAMACPP = "llamacpp"          # llama.cpp integration
    VLLM = "vllm"                  # vLLM for fast inference
    TEXTGEN_WEBUI = "textgen"      # Text Generation WebUI
    LOCALAI = "localai"            # LocalAI API

class ChatbotPersonality(str, Enum):
    """Predefined personality types"""
    PROFESSIONAL = "professional"
    FRIENDLY = "friendly"
    TECHNICAL = "technical"
    CASUAL = "casual"
    EMPATHETIC = "empathetic"
    AUTHORITATIVE = "authoritative"
    HELPFUL = "helpful"
    CONCISE = "concise"

class ResponseStyle(str, Enum):
    """Response generation styles"""
    CONVERSATIONAL = "conversational"
    STRUCTURED = "structured"
    BULLET_POINTS = "bullet_points"
    DETAILED = "detailed"
    BRIEF = "brief"
    STEP_BY_STEP = "step_by_step"

class FallbackBehavior(str, Enum):
    """Behavior when no knowledge found"""
    APOLOGETIC = "apologetic"          # "I don't have that information"
    REDIRECT = "redirect"              # Redirect to human support
    SUGGEST_ALTERNATIVES = "suggest"   # Suggest related topics
    ASK_CLARIFICATION = "clarify"      # Ask for more details
    ESCALATE = "escalate"             # Auto-escalate to support

# Database Models
class ChatbotConfig(Base):
    """Chatbot configuration and personality settings"""
    __tablename__ = "chatbot_configs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # Basic configuration
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Personality configuration
    personality_type = Column(String, default=ChatbotPersonality.FRIENDLY)
    response_style = Column(String, default=ResponseStyle.CONVERSATIONAL)
    fallback_behavior = Column(String, default=FallbackBehavior.APOLOGETIC)
    
    # LLM configuration
    llm_provider = Column(String, default=LLMProvider.OLLAMA)
    llm_model = Column(String, default="llama2:7b")
    
    # Behavior settings
    max_response_length = Column(Integer, default=500)
    temperature = Column(Float, default=0.7)
    use_emojis = Column(Boolean, default=False)
    include_sources = Column(Boolean, default=True)
    
    # Advanced settings
    system_prompt_template = Column(Text, nullable=True)
    greeting_message = Column(Text, nullable=True)
    escalation_keywords = Column(JSON, default=list)
    restricted_topics = Column(JSON, default=list)
    
    # Questionnaire-derived settings
    questionnaire_config = Column(JSON, default=dict)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    tenant = relationship("Tenant", backref="chatbot_configs")
    deployments = relationship("ChatbotDeployment", back_populates="config", cascade="all, delete-orphan")

class ChatbotDeployment(Base):
    """Chatbot deployment instances"""
    __tablename__ = "chatbot_deployments"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    config_id = Column(String, ForeignKey("chatbot_configs.id"), nullable=False)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # Deployment details
    name = Column(String, nullable=False)
    deployment_type = Column(String, nullable=False)  # web_widget, slack, teams, api
    deployment_url = Column(String, nullable=True)
    
    # Status
    status = Column(String, default="active")  # active, paused, stopped
    
    # Configuration overrides
    custom_styling = Column(JSON, default=dict)
    channel_specific_config = Column(JSON, default=dict)
    
    # Statistics
    total_conversations = Column(Integer, default=0)
    total_messages = Column(Integer, default=0)
    average_satisfaction = Column(Float, nullable=True)
    
    # Deployment metadata
    created_at = Column(DateTime, default=func.now())
    last_active = Column(DateTime, nullable=True)
    
    # Relationships
    config = relationship("ChatbotConfig", back_populates="deployments")

class PromptTemplate(Base):
    """Reusable prompt templates"""
    __tablename__ = "prompt_templates"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True)  # Null for system templates
    
    # Template details
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False)  # system, greeting, escalation, etc.
    
    # Template content
    template_text = Column(Text, nullable=False)
    variables = Column(JSON, default=list)  # List of template variables
    
    # Usage tracking
    usage_count = Column(Integer, default=0)
    
    # Metadata
    is_system_template = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())

# Pydantic Models for API
class ChatbotConfigCreate(BaseModel):
    """Create chatbot configuration"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    personality_type: ChatbotPersonality = ChatbotPersonality.FRIENDLY
    response_style: ResponseStyle = ResponseStyle.CONVERSATIONAL
    fallback_behavior: FallbackBehavior = FallbackBehavior.APOLOGETIC
    
    # LLM settings
    llm_provider: LLMProvider = LLMProvider.OLLAMA
    llm_model: str = "llama2:7b"
    
    # Behavior settings
    max_response_length: int = Field(default=500, ge=100, le=2000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    use_emojis: bool = False
    include_sources: bool = True
    
    # Custom prompts
    greeting_message: Optional[str] = None
    escalation_keywords: List[str] = Field(default_factory=list)
    restricted_topics: List[str] = Field(default_factory=list)

class ChatbotConfigUpdate(BaseModel):
    """Update chatbot configuration"""
    name: Optional[str] = None
    description: Optional[str] = None
    personality_type: Optional[ChatbotPersonality] = None
    response_style: Optional[ResponseStyle] = None
    max_response_length: Optional[int] = Field(None, ge=100, le=2000)
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    use_emojis: Optional[bool] = None
    include_sources: Optional[bool] = None
    is_active: Optional[bool] = None

class ChatbotConfigResponse(BaseModel):
    """Chatbot configuration response"""
    id: str
    tenant_id: str
    name: str
    description: Optional[str]
    personality_type: ChatbotPersonality
    response_style: ResponseStyle
    fallback_behavior: FallbackBehavior
    llm_provider: LLMProvider
    llm_model: str
    max_response_length: int
    temperature: float
    use_emojis: bool
    include_sources: bool
    is_active: bool
    greeting_message: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ChatbotDeploymentCreate(BaseModel):
    """Create chatbot deployment"""
    config_id: str
    name: str = Field(..., min_length=1, max_length=100)
    deployment_type: str = Field(..., regex="^(web_widget|slack|teams|api|discord|telegram)$")
    custom_styling: Dict[str, Any] = Field(default_factory=dict)
    channel_specific_config: Dict[str, Any] = Field(default_factory=dict)

class ChatbotDeploymentResponse(BaseModel):
    """Chatbot deployment response"""
    id: str
    config_id: str
    tenant_id: str
    name: str
    deployment_type: str
    deployment_url: Optional[str]
    status: str
    custom_styling: Dict[str, Any]
    total_conversations: int
    total_messages: int
    average_satisfaction: Optional[float]
    created_at: datetime
    last_active: Optional[datetime]
    
    class Config:
        from_attributes = True

class PromptTemplateCreate(BaseModel):
    """Create prompt template"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    category: str = Field(..., min_length=1)
    template_text: str = Field(..., min_length=1)
    variables: List[str] = Field(default_factory=list)

class PromptTemplateResponse(BaseModel):
    """Prompt template response"""
    id: str
    tenant_id: Optional[str]
    name: str
    description: Optional[str]
    category: str
    template_text: str
    variables: List[str]
    usage_count: int
    is_system_template: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class ChatbotTestRequest(BaseModel):
    """Test chatbot configuration"""
    config_id: str
    test_messages: List[str]
    use_test_knowledge: bool = True

class ChatbotTestResponse(BaseModel):
    """Chatbot test results"""
    config_id: str
    test_results: List[Dict[str, Any]]
    overall_performance: Dict[str, Any]
    recommendations: List[str]

class ChatbotPersonalityAnalysis(BaseModel):
    """Personality analysis from questionnaire"""
    recommended_personality: ChatbotPersonality
    recommended_style: ResponseStyle
    recommended_fallback: FallbackBehavior
    confidence_score: float
    reasoning: str
    suggested_prompts: Dict[str, str]

class LLMModelInfo(BaseModel):
    """Information about available LLM models"""
    provider: LLMProvider
    model_name: str
    description: str
    parameters: str
    capabilities: List[str]
    resource_requirements: Dict[str, str]
    is_available: bool
    download_size: Optional[str] = None

class ChatbotMetrics(BaseModel):
    """Chatbot performance metrics"""
    config_id: str
    total_conversations: int
    total_messages: int
    average_response_time_ms: float
    satisfaction_score: Optional[float]
    common_queries: List[Dict[str, Any]]
    escalation_rate: float
    knowledge_coverage: float
    response_accuracy: Optional[float]

# Open-source specific configurations
class OllamaConfig(BaseModel):
    """Ollama-specific configuration"""
    base_url: str = "http://localhost:11434"
    model: str = "llama2:7b"
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40
    num_ctx: int = 2048
    repeat_penalty: float = 1.1

class HuggingFaceConfig(BaseModel):
    """HuggingFace model configuration"""
    model_name: str = "microsoft/DialoGPT-medium"
    device: str = "cpu"  # cpu, cuda, mps
    max_length: int = 1000
    do_sample: bool = True
    temperature: float = 0.7
    pad_token_id: Optional[int] = None

class LocalAIConfig(BaseModel):
    """LocalAI configuration"""
    base_url: str = "http://localhost:8080"
    model: str = "llama2-7b"
    temperature: float = 0.7
    max_tokens: int = 500
    stream: bool = False