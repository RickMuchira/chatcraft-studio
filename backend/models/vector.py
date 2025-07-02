# backend/models/vector.py
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean, JSON, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum
import uuid

from .content import Base, Tenant, ContentChunk

class VectorProvider(str, Enum):
    """Supported vector database providers"""
    WEAVIATE = "weaviate"
    QDRANT = "qdrant"
    CHROMA = "chroma"
    PINECONE = "pinecone"

class EmbeddingModel(str, Enum):
    """Supported embedding models"""
    OPENAI_ADA_002 = "text-embedding-ada-002"
    OPENAI_3_SMALL = "text-embedding-3-small"
    OPENAI_3_LARGE = "text-embedding-3-large"
    SENTENCE_TRANSFORMERS = "sentence-transformers/all-MiniLM-L6-v2"
    COHERE_EMBED = "cohere-embed-english-v3.0"
    
class SearchStrategy(str, Enum):
    """RAG search strategies"""
    SEMANTIC = "semantic"           # Pure vector similarity
    HYBRID = "hybrid"              # Vector + keyword search
    CONTEXTUAL = "contextual"      # Vector + conversation context
    MULTI_QUERY = "multi_query"    # Multiple query variations

# Database Models
class VectorCollection(Base):
    """Vector database collections per tenant"""
    __tablename__ = "vector_collections"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # Collection configuration
    name = Column(String, nullable=False)  # e.g., "acme_corp_knowledge"
    provider = Column(String, nullable=False)  # VectorProvider enum
    collection_id = Column(String, nullable=False)  # External collection ID
    
    # Embedding configuration
    embedding_model = Column(String, default=EmbeddingModel.OPENAI_ADA_002)
    dimensions = Column(Integer, default=1536)  # Embedding dimensions
    
    # Collection metadata
    total_vectors = Column(Integer, default=0)
    last_updated = Column(DateTime, default=func.now())
    
    # Configuration
    config = Column(JSON, default=dict)  # Provider-specific settings
    
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    tenant = relationship("Tenant", backref="vector_collections")

class EmbeddingJob(Base):
    """Track embedding generation jobs"""
    __tablename__ = "embedding_jobs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    collection_id = Column(String, ForeignKey("vector_collections.id"), nullable=False)
    
    # Job details
    chunk_ids = Column(JSON, nullable=False)  # List of ContentChunk IDs
    status = Column(String, default="pending")  # pending, processing, completed, failed
    progress = Column(Integer, default=0)  # 0-100
    
    # Results
    embedded_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    # Timing
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    collection = relationship("VectorCollection")

class ChatSession(Base):
    """Chat sessions for context tracking"""
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # Session metadata
    user_id = Column(String, nullable=True)  # Optional user identification
    session_name = Column(String, nullable=True)  # User-defined name
    
    # Configuration
    rag_config = Column(JSON, default=dict)  # RAG settings for this session
    
    # Statistics
    message_count = Column(Integer, default=0)
    total_tokens_used = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=func.now())
    last_activity = Column(DateTime, default=func.now())
    
    # Relationships
    tenant = relationship("Tenant")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    """Individual chat messages with RAG context"""
    __tablename__ = "chat_messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # Message content
    message = Column(Text, nullable=False)
    response = Column(Text, nullable=True)
    role = Column(String, nullable=False)  # user, assistant, system
    
    # RAG context
    retrieved_chunks = Column(JSON, default=list)  # Chunk IDs used for response
    similarity_scores = Column(JSON, default=list)  # Similarity scores
    search_query = Column(Text, nullable=True)  # Processed search query
    
    # Metadata
    tokens_used = Column(Integer, default=0)
    response_time_ms = Column(Integer, default=0)
    feedback_score = Column(Float, nullable=True)  # User feedback 1-5
    
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    session = relationship("ChatSession", back_populates="messages")

# Pydantic Models for API
class VectorCollectionCreate(BaseModel):
    """Create new vector collection"""
    name: str = Field(..., min_length=1, max_length=100)
    provider: VectorProvider = VectorProvider.WEAVIATE
    embedding_model: EmbeddingModel = EmbeddingModel.OPENAI_ADA_002
    config: Dict[str, Any] = Field(default_factory=dict)

class VectorCollectionResponse(BaseModel):
    """Vector collection response"""
    id: str
    tenant_id: str
    name: str
    provider: VectorProvider
    collection_id: str
    embedding_model: EmbeddingModel
    dimensions: int
    total_vectors: int
    last_updated: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True

class EmbeddingJobResponse(BaseModel):
    """Embedding job status response"""
    id: str
    tenant_id: str
    collection_id: str
    status: str
    progress: int
    embedded_count: int
    failed_count: int
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True

class RAGConfig(BaseModel):
    """RAG configuration for searches"""
    search_strategy: SearchStrategy = SearchStrategy.SEMANTIC
    max_chunks: int = Field(default=5, ge=1, le=20)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    chunk_overlap: bool = True
    rerank_results: bool = True
    include_metadata: bool = True
    
    # Hybrid search settings
    keyword_weight: float = Field(default=0.3, ge=0.0, le=1.0)
    
    # Multi-query settings
    query_variations: int = Field(default=3, ge=1, le=5)
    
    # Context settings
    conversation_context_length: int = Field(default=5, ge=0, le=20)

class SearchRequest(BaseModel):
    """Search request for RAG"""
    query: str = Field(..., min_length=1, max_length=500)
    config: RAGConfig = Field(default_factory=RAGConfig)
    session_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None

class RetrievedChunk(BaseModel):
    """Retrieved chunk with metadata"""
    chunk_id: str
    content: str
    title: Optional[str]
    source_name: str
    source_type: str
    similarity_score: float
    metadata: Dict[str, Any]
    keywords: List[str]

class SearchResponse(BaseModel):
    """Search response with retrieved chunks"""
    query: str
    chunks: List[RetrievedChunk]
    total_found: int
    search_time_ms: int
    strategy_used: SearchStrategy
    
class ChatRequest(BaseModel):
    """Chat request with RAG"""
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None
    rag_config: RAGConfig = Field(default_factory=RAGConfig)
    stream: bool = False

class ChatResponse(BaseModel):
    """Chat response"""
    message: str
    response: str
    session_id: str
    message_id: str
    retrieved_chunks: List[RetrievedChunk]
    tokens_used: int
    response_time_ms: int

class ChatSessionCreate(BaseModel):
    """Create chat session"""
    session_name: Optional[str] = None
    user_id: Optional[str] = None
    rag_config: RAGConfig = Field(default_factory=RAGConfig)

class ChatSessionResponse(BaseModel):
    """Chat session response"""
    id: str
    tenant_id: str
    user_id: Optional[str]
    session_name: Optional[str]
    message_count: int
    total_tokens_used: int
    created_at: datetime
    last_activity: datetime
    
    class Config:
        from_attributes = True

class ChatMessageResponse(BaseModel):
    """Chat message response"""
    id: str
    session_id: str
    message: str
    response: Optional[str]
    role: str
    retrieved_chunks: List[str]  # Chunk IDs
    similarity_scores: List[float]
    tokens_used: int
    response_time_ms: int
    feedback_score: Optional[float]
    created_at: datetime
    
    class Config:
        from_attributes = True

class VectorStats(BaseModel):
    """Vector database statistics"""
    total_collections: int
    total_vectors: int
    collections_by_provider: Dict[str, int]
    embedding_models_used: Dict[str, int]
    recent_embedding_jobs: List[Dict[str, Any]]
    
class RAGAnalytics(BaseModel):
    """RAG performance analytics"""
    total_searches: int
    average_response_time_ms: float
    average_similarity_score: float
    search_strategies_used: Dict[str, int]
    top_queries: List[Dict[str, Any]]
    chunk_usage_stats: Dict[str, int]
    user_feedback_average: Optional[float]

class EmbeddingProgress(BaseModel):
    """Real-time embedding progress"""
    job_id: str
    status: str
    progress: int
    current_chunk: int
    total_chunks: int
    estimated_completion: Optional[datetime]
    error_message: Optional[str]