# backend/models/content.py
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean, JSON, ForeignKey, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import uuid

Base = declarative_base()

class ContentType(str, Enum):
    """Supported content types for ingestion"""
    DOCUMENT = "document"  # PDF, DOCX, TXT
    WEBSITE = "website"    # Web scraping
    VIDEO = "video"        # YouTube, MP4 with transcription
    API = "api"           # REST/GraphQL endpoints
    DATABASE = "database"  # SQL query results
    CONFLUENCE = "confluence"
    NOTION = "notion"
    SLACK = "slack"

class ProcessingStatus(str, Enum):
    """Content processing pipeline status"""
    PENDING = "pending"
    PROCESSING = "processing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRY = "retry"

# Database Models
class Tenant(Base):
    """Multi-tenant organization table"""
    __tablename__ = "tenants"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_name = Column(String, nullable=False)
    organization_type = Column(String, nullable=False)
    industry = Column(String, nullable=False)
    subscription_tier = Column(String, default="free")  # free, pro, enterprise
    
    # Quotas and limits
    max_documents = Column(Integer, default=50)
    max_storage_mb = Column(Integer, default=1000)  # 1GB default
    max_monthly_queries = Column(Integer, default=1000)
    
    # Usage tracking
    document_count = Column(Integer, default=0)
    storage_used_mb = Column(Integer, default=0)
    monthly_queries_used = Column(Integer, default=0)
    last_query_reset = Column(DateTime, default=func.now())
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    content_sources = relationship("ContentSource", back_populates="tenant", cascade="all, delete-orphan")
    questionnaire_id = Column(String, nullable=True)  # Link to questionnaire response

class ContentSource(Base):
    """Individual content sources within a tenant"""
    __tablename__ = "content_sources"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    # Content identification
    name = Column(String, nullable=False)  # User-friendly name
    content_type = Column(String, nullable=False)  # ContentType enum
    source_url = Column(String, nullable=True)  # URL for web/API sources
    file_path = Column(String, nullable=True)  # Local file path
    
    # Processing status
    status = Column(String, default=ProcessingStatus.PENDING)
    progress_percentage = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    # Content metadata
    file_size_mb = Column(Integer, default=0)
    total_chunks = Column(Integer, default=0)
    processed_chunks = Column(Integer, default=0)
    
    # Processing configuration
    config = Column(JSON, default=dict)  # Source-specific settings
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    last_processed = Column(DateTime, nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="content_sources")
    chunks = relationship("ContentChunk", back_populates="source", cascade="all, delete-orphan")
    
    # Indexes for performance
    __table_args__ = (
        Index('ix_content_source_tenant', 'tenant_id'),
        Index('ix_content_source_status', 'status'),
        Index('ix_content_source_type', 'content_type'),
    )

class ContentChunk(Base):
    """Processed content chunks ready for vector embedding"""
    __tablename__ = "content_chunks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_id = Column(String, ForeignKey("content_sources.id"), nullable=False)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)  # Denormalized for faster queries
    
    # Chunk content
    content = Column(Text, nullable=False)
    title = Column(String, nullable=True)  # Optional section title
    chunk_index = Column(Integer, nullable=False)  # Order within source
    
    # Metadata for retrieval
    metadata = Column(JSON, default=dict)  # Custom metadata per source type
    keywords = Column(JSON, default=list)  # Extracted keywords
    
    # Vector embedding (stored separately in vector DB)
    embedding_id = Column(String, nullable=True)  # Reference to vector DB
    
    # Content characteristics
    token_count = Column(Integer, default=0)
    character_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    source = relationship("ContentSource", back_populates="chunks")
    
    # Indexes for performance
    __table_args__ = (
        Index('ix_content_chunk_tenant', 'tenant_id'),
        Index('ix_content_chunk_source', 'source_id'),
        Index('ix_content_chunk_embedding', 'embedding_id'),
    )

# Pydantic Models for API
class ContentSourceCreate(BaseModel):
    """Request model for creating new content source"""
    name: str = Field(..., min_length=1, max_length=200)
    content_type: ContentType
    source_url: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    
    @validator('source_url')
    def validate_url_for_type(cls, v, values):
        content_type = values.get('content_type')
        if content_type in [ContentType.WEBSITE, ContentType.API, ContentType.VIDEO] and not v:
            raise ValueError(f"source_url is required for {content_type}")
        return v

class ContentSourceUpdate(BaseModel):
    """Request model for updating content source"""
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    status: Optional[ProcessingStatus] = None

class ContentSourceResponse(BaseModel):
    """Response model for content source"""
    id: str
    tenant_id: str
    name: str
    content_type: ContentType
    source_url: Optional[str]
    status: ProcessingStatus
    progress_percentage: int
    error_message: Optional[str]
    file_size_mb: int
    total_chunks: int
    processed_chunks: int
    created_at: datetime
    updated_at: datetime
    last_processed: Optional[datetime]
    
    class Config:
        from_attributes = True

class ProcessingProgress(BaseModel):
    """Real-time processing progress update"""
    source_id: str
    status: ProcessingStatus
    progress_percentage: int
    message: str
    chunks_processed: int
    total_chunks: int
    error_message: Optional[str] = None

class TenantUsage(BaseModel):
    """Tenant usage and quota information"""
    tenant_id: str
    organization_name: str
    subscription_tier: str
    
    # Current usage
    document_count: int
    storage_used_mb: int
    monthly_queries_used: int
    
    # Limits
    max_documents: int
    max_storage_mb: int
    max_monthly_queries: int
    
    # Calculated fields
    documents_remaining: int
    storage_remaining_mb: int
    queries_remaining: int
    
    @validator('documents_remaining', pre=False, always=True)
    def calc_documents_remaining(cls, v, values):
        return values['max_documents'] - values['document_count']
    
    @validator('storage_remaining_mb', pre=False, always=True)
    def calc_storage_remaining(cls, v, values):
        return values['max_storage_mb'] - values['storage_used_mb']
    
    @validator('queries_remaining', pre=False, always=True)
    def calc_queries_remaining(cls, v, values):
        return values['max_monthly_queries'] - values['monthly_queries_used']

class ContentIngestionStats(BaseModel):
    """Dashboard statistics for content ingestion"""
    total_sources: int
    sources_by_type: Dict[str, int]
    sources_by_status: Dict[str, int]
    total_chunks: int
    total_storage_mb: int
    processing_queue_size: int
    recent_activity: List[Dict[str, Any]]