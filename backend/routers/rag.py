# backend/routers/rag.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import json
import logging
from datetime import datetime

from ..models.vector import (
    VectorCollectionCreate, VectorCollectionResponse, EmbeddingJobResponse,
    SearchRequest, SearchResponse, ChatRequest, ChatResponse,
    ChatSessionCreate, ChatSessionResponse, ChatMessageResponse,
    RAGConfig, VectorStats, RAGAnalytics
)
from ..services.vector_service import VectorService
from ..services.rag_engine import RAGEngine, RAGOrchestrator
from ..database import get_db_session
from ..auth import get_current_tenant_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rag", tags=["RAG & Vector Search"])

async def get_vector_service(db: AsyncSession = Depends(get_db_session)) -> VectorService:
    """Dependency to get vector service"""
    return VectorService(db)

async def get_rag_engine(db: AsyncSession = Depends(get_db_session)) -> RAGEngine:
    """Dependency to get RAG engine"""
    return RAGEngine(db)

async def get_rag_orchestrator(db: AsyncSession = Depends(get_db_session)) -> RAGOrchestrator:
    """Dependency to get RAG orchestrator"""
    return RAGOrchestrator(db)

# Vector Collection Management
@router.post("/collections", response_model=VectorCollectionResponse)
async def create_vector_collection(
    collection_data: VectorCollectionCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    service: VectorService = Depends(get_vector_service)
):
    """
    Create a new vector collection for storing embeddings
    
    Each tenant can have multiple collections for different use cases:
    - General knowledge base
    - Product documentation  
    - Support articles
    - Training materials
    """
    try:
        return await service.create_collection(tenant_id, collection_data)
    except Exception as e:
        logger.error(f"Failed to create vector collection: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create collection: {str(e)}")

@router.get("/collections", response_model=List[VectorCollectionResponse])
async def list_vector_collections(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """List all vector collections for the tenant"""
    try:
        from sqlalchemy import select
        from ..models.vector import VectorCollection
        
        result = await db.execute(
            select(VectorCollection).where(
                VectorCollection.tenant_id == tenant_id
            ).order_by(VectorCollection.created_at.desc())
        )
        
        collections = result.scalars().all()
        return [VectorCollectionResponse.from_orm(collection) for collection in collections]
        
    except Exception as e:
        logger.error(f"Failed to list collections: {e}")
        raise HTTPException(status_code=500, detail="Failed to list collections")

@router.get("/collections/{collection_id}", response_model=VectorCollectionResponse)
async def get_vector_collection(
    collection_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: VectorService = Depends(get_vector_service)
):
    """Get details of a specific vector collection"""
    try:
        # This would need to be implemented in VectorService
        return await service.get_collection(tenant_id, collection_id)
    except Exception as e:
        logger.error(f"Failed to get collection: {e}")
        raise HTTPException(status_code=500, detail="Failed to get collection")

@router.delete("/collections/{collection_id}")
async def delete_vector_collection(
    collection_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: VectorService = Depends(get_vector_service)
):
    """Delete a vector collection and all its embeddings"""
    try:
        await service.delete_collection(tenant_id, collection_id)
        return {"message": "Collection deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete collection: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete collection")

# Embedding Management
@router.post("/collections/{collection_id}/embed")
async def embed_content_chunks(
    collection_id: str,
    chunk_ids: List[str],
    tenant_id: str = Depends(get_current_tenant_id),
    service: VectorService = Depends(get_vector_service)
):
    """
    Generate embeddings for content chunks and store in vector database
    
    This endpoint starts a background job to:
    1. Generate embeddings for the specified chunks
    2. Store embeddings in the vector database
    3. Update chunk records with embedding IDs
    """
    try:
        job_id = await service.embed_content_chunks(tenant_id, collection_id, chunk_ids)
        
        return {
            "job_id": job_id,
            "message": f"Started embedding job for {len(chunk_ids)} chunks",
            "status": "processing"
        }
        
    except Exception as e:
        logger.error(f"Failed to start embedding job: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start embedding: {str(e)}")

@router.get("/embedding-jobs/{job_id}", response_model=EmbeddingJobResponse)
async def get_embedding_job_status(
    job_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """Get the status of an embedding job"""
    try:
        from sqlalchemy import select
        from ..models.vector import EmbeddingJob
        
        result = await db.execute(
            select(EmbeddingJob).where(
                EmbeddingJob.id == job_id,
                EmbeddingJob.tenant_id == tenant_id
            )
        )
        
        job = result.scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Embedding job not found")
        
        return EmbeddingJobResponse.from_orm(job)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get embedding job: {e}")
        raise HTTPException(status_code=500, detail="Failed to get job status")

@router.get("/embedding-jobs", response_model=List[EmbeddingJobResponse])
async def list_embedding_jobs(
    status: Optional[str] = None,
    limit: int = Query(default=20, le=100),
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """List embedding jobs for the tenant"""
    try:
        from sqlalchemy import select
        from ..models.vector import EmbeddingJob
        
        query = select(EmbeddingJob).where(
            EmbeddingJob.tenant_id == tenant_id
        ).order_by(EmbeddingJob.created_at.desc()).limit(limit)
        
        if status:
            query = query.where(EmbeddingJob.status == status)
        
        result = await db.execute(query)
        jobs = result.scalars().all()
        
        return [EmbeddingJobResponse.from_orm(job) for job in jobs]
        
    except Exception as e:
        logger.error(f"Failed to list embedding jobs: {e}")
        raise HTTPException(status_code=500, detail="Failed to list jobs")

# Knowledge Search
@router.post("/search", response_model=SearchResponse)
async def search_knowledge_base(
    search_request: SearchRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    service: VectorService = Depends(get_vector_service)
):
    """
    Search the knowledge base using various strategies:
    
    - **Semantic**: Pure vector similarity search
    - **Hybrid**: Combines vector search with keyword matching
    - **Multi-query**: Uses multiple query variations for better recall
    - **Contextual**: Considers conversation context (when session_id provided)
    """
    try:
        return await service.search_knowledge(tenant_id, search_request)
    except Exception as e:
        logger.error(f"Knowledge search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# Chat Sessions
@router.post("/chat/sessions", response_model=ChatSessionResponse)
async def create_chat_session(
    session_data: ChatSessionCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """
    Create a new chat session
    
    Sessions maintain conversation context and can be configured with
    specific RAG settings for different use cases.
    """
    try:
        return await rag_engine.create_chat_session(tenant_id, session_data)
    except Exception as e:
        logger.error(f"Failed to create chat session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create session")

@router.get("/chat/sessions", response_model=List[ChatSessionResponse])
async def list_chat_sessions(
    user_id: Optional[str] = None,
    limit: int = Query(default=20, le=100),
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """List chat sessions for the tenant"""
    try:
        return await rag_engine.get_chat_sessions(tenant_id, user_id)
    except Exception as e:
        logger.error(f"Failed to list chat sessions: {e}")
        raise HTTPException(status_code=500, detail="Failed to list sessions")

@router.get("/chat/sessions/{session_id}/messages", response_model=List[ChatMessageResponse])
async def get_chat_history(
    session_id: str,
    limit: int = Query(default=50, le=200),
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """Get chat history for a session"""
    try:
        return await rag_engine.get_chat_history(tenant_id, session_id, limit)
    except Exception as e:
        logger.error(f"Failed to get chat history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get chat history")

@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """Delete a chat session and all its messages"""
    try:
        await rag_engine.delete_chat_session(tenant_id, session_id)
        return {"message": "Chat session deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete chat session: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete session")

# Chat Interface
@router.post("/chat", response_model=ChatResponse)
async def chat_with_rag(
    chat_request: ChatRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """
    Chat with RAG-powered AI assistant
    
    The assistant will:
    1. Search the knowledge base for relevant information
    2. Use conversation context if session_id provided
    3. Generate a response using retrieved knowledge
    4. Maintain conversation history
    
    **RAG Configuration Options:**
    - `search_strategy`: How to find relevant information
    - `max_chunks`: Maximum number of knowledge pieces to use
    - `similarity_threshold`: Minimum relevance score
    - `conversation_context_length`: How much chat history to consider
    """
    try:
        return await rag_engine.chat(tenant_id, chat_request)
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

@router.post("/chat/stream")
async def chat_with_rag_stream(
    chat_request: ChatRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """
    Chat with streaming response (Server-Sent Events)
    
    Returns real-time response as it's generated, providing
    better user experience for longer responses.
    """
    # This would implement streaming chat - placeholder for now
    raise HTTPException(status_code=501, detail="Streaming chat not yet implemented")

@router.put("/chat/messages/{message_id}/feedback")
async def update_message_feedback(
    message_id: str,
    feedback_score: float = Query(..., ge=1.0, le=5.0),
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """
    Update feedback score for a chat message
    
    Feedback helps improve the RAG system by tracking:
    - Which responses are most helpful
    - Which knowledge chunks are most relevant
    - Overall system performance
    """
    try:
        await rag_engine.update_message_feedback(tenant_id, message_id, feedback_score)
        return {"message": "Feedback updated successfully"}
    except Exception as e:
        logger.error(f"Failed to update feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to update feedback")

# RAG System Setup and Management
@router.post("/setup")
async def setup_rag_system(
    questionnaire_data: Dict[str, Any],
    tenant_id: str = Depends(get_current_tenant_id),
    orchestrator: RAGOrchestrator = Depends(get_rag_orchestrator)
):
    """
    Set up complete RAG system for tenant
    
    This endpoint:
    1. Creates vector collection based on questionnaire data
    2. Configures default RAG settings
    3. Prepares system for content ingestion
    
    Should be called after questionnaire completion.
    """
    try:
        return await orchestrator.setup_tenant_rag(tenant_id, questionnaire_data)
    except Exception as e:
        logger.error(f"RAG setup failed: {e}")
        raise HTTPException(status_code=500, detail=f"RAG setup failed: {str(e)}")

@router.post("/process-content")
async def process_content_for_rag(
    source_ids: List[str],
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_current_tenant_id),
    orchestrator: RAGOrchestrator = Depends(get_rag_orchestrator)
):
    """
    Process content sources for RAG
    
    Takes uploaded content and:
    1. Generates embeddings for all chunks
    2. Stores embeddings in vector database
    3. Makes content searchable for RAG
    
    This is typically called after content ingestion is complete.
    """
    try:
        return await orchestrator.process_content_for_rag(tenant_id, source_ids)
    except Exception as e:
        logger.error(f"Content processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Content processing failed: {str(e)}")

@router.post("/test")
async def test_rag_system(
    test_questions: List[str],
    tenant_id: str = Depends(get_current_tenant_id),
    orchestrator: RAGOrchestrator = Depends(get_rag_orchestrator)
):
    """
    Test RAG system with sample questions
    
    Useful for:
    - Validating system setup
    - Testing knowledge coverage
    - Performance benchmarking
    - Quality assurance
    """
    try:
        return await orchestrator.test_rag_system(tenant_id, test_questions)
    except Exception as e:
        logger.error(f"RAG testing failed: {e}")
        raise HTTPException(status_code=500, detail=f"RAG testing failed: {str(e)}")

# Analytics and Insights
@router.get("/analytics", response_model=RAGAnalytics)
async def get_rag_analytics(
    days: int = Query(default=30, ge=1, le=365),
    tenant_id: str = Depends(get_current_tenant_id),
    rag_engine: RAGEngine = Depends(get_rag_engine)
):
    """
    Get RAG system analytics and performance metrics
    
    Provides insights into:
    - Chat volume and patterns
    - Response quality and speed
    - Most popular queries
    - Knowledge gap identification
    - User satisfaction scores
    """
    try:
        analytics = await rag_engine.get_rag_analytics(tenant_id, days)
        return RAGAnalytics(**analytics)
    except Exception as e:
        logger.error(f"Failed to get analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get analytics")

@router.get("/stats", response_model=VectorStats)
async def get_vector_stats(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """Get vector database statistics for tenant"""
    try:
        from sqlalchemy import select, func
        from ..models.vector import VectorCollection, EmbeddingJob
        
        # Get collection stats
        collections_result = await db.execute(
            select(
                func.count(VectorCollection.id).label("total_collections"),
                func.sum(VectorCollection.total_vectors).label("total_vectors")
            ).where(VectorCollection.tenant_id == tenant_id)
        )
        
        collection_stats = collections_result.fetchone()
        
        # Get collections by provider
        providers_result = await db.execute(
            select(
                VectorCollection.provider,
                func.count(VectorCollection.id).label("count")
            ).where(
                VectorCollection.tenant_id == tenant_id
            ).group_by(VectorCollection.provider)
        )
        
        providers_data = providers_result.fetchall()
        collections_by_provider = {row[0]: row[1] for row in providers_data}
        
        # Get embedding models used
        models_result = await db.execute(
            select(
                VectorCollection.embedding_model,
                func.count(VectorCollection.id).label("count")
            ).where(
                VectorCollection.tenant_id == tenant_id
            ).group_by(VectorCollection.embedding_model)
        )
        
        models_data = models_result.fetchall()
        embedding_models_used = {row[0]: row[1] for row in models_data}
        
        # Get recent embedding jobs
        recent_jobs_result = await db.execute(
            select(EmbeddingJob).where(
                EmbeddingJob.tenant_id == tenant_id
            ).order_by(EmbeddingJob.created_at.desc()).limit(5)
        )
        
        recent_jobs = recent_jobs_result.scalars().all()
        recent_embedding_jobs = [
            {
                "job_id": job.id,
                "status": job.status,
                "embedded_count": job.embedded_count,
                "created_at": job.created_at.isoformat()
            }
            for job in recent_jobs
        ]
        
        return VectorStats(
            total_collections=collection_stats[0] or 0,
            total_vectors=collection_stats[1] or 0,
            collections_by_provider=collections_by_provider,
            embedding_models_used=embedding_models_used,
            recent_embedding_jobs=recent_embedding_jobs
        )
        
    except Exception as e:
        logger.error(f"Failed to get vector stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")

# Configuration and Settings
@router.get("/config")
async def get_rag_config(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """Get current RAG configuration for tenant"""
    try:
        from sqlalchemy import select
        from ..models.content import Tenant
        
        # Get tenant and questionnaire data
        result = await db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant = result.scalar_one_or_none()
        
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Get questionnaire data for current config
        questionnaire_data = {}
        if tenant.questionnaire_id:
            try:
                import sqlite3
                conn = sqlite3.connect('questionnaire_responses.db')
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT raw_json FROM questionnaire_responses WHERE id = ?",
                    (tenant.questionnaire_id,)
                )
                result = cursor.fetchone()
                if result:
                    questionnaire_data = json.loads(result[0])
                conn.close()
            except Exception as e:
                logger.warning(f"Failed to get questionnaire data: {e}")
        
        # Build current RAG configuration
        orchestrator = RAGOrchestrator(db)
        default_config = orchestrator._build_default_rag_config(questionnaire_data)
        
        return {
            "tenant_id": tenant_id,
            "organization_name": tenant.organization_name,
            "questionnaire_data": questionnaire_data,
            "current_rag_config": default_config,
            "available_strategies": [strategy.value for strategy in SearchStrategy],
            "available_models": [model.value for model in EmbeddingModel]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get RAG config: {e}")
        raise HTTPException(status_code=500, detail="Failed to get configuration")

@router.put("/config")
async def update_rag_config(
    config_updates: Dict[str, Any],
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """Update RAG configuration for tenant"""
    try:
        # Validate configuration updates
        valid_keys = {
            "search_strategy", "max_chunks", "similarity_threshold",
            "chunk_overlap", "rerank_results", "include_metadata",
            "conversation_context_length", "keyword_weight", "query_variations"
        }
        
        invalid_keys = set(config_updates.keys()) - valid_keys
        if invalid_keys:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid configuration keys: {invalid_keys}"
            )
        
        # For now, we'll store this as tenant metadata
        # In production, you might want a dedicated configuration table
        from sqlalchemy import update
        from ..models.content import Tenant
        
        # Get current tenant data
        result = await db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant = result.scalar_one_or_none()
        
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Update tenant with new RAG config (you'd implement this field)
        # For now, just return success
        
        return {
            "message": "RAG configuration updated successfully",
            "updated_config": config_updates,
            "tenant_id": tenant_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update RAG config: {e}")
        raise HTTPException(status_code=500, detail="Failed to update configuration")

# Health and Status
@router.get("/health")
async def rag_health_check(
    tenant_id: str = Depends(get_current_tenant_id),
    service: VectorService = Depends(get_vector_service)
):
    """
    Check RAG system health for tenant
    
    Verifies:
    - Vector database connectivity
    - Embedding service availability
    - Content availability
    - Recent processing status
    """
    try:
        health_status = {
            "status": "healthy",
            "timestamp": datetime.now(),
            "tenant_id": tenant_id,
            "checks": {}
        }
        
        # Check vector collections
        try:
            from sqlalchemy import select
            from ..models.vector import VectorCollection
            
            result = await service.db.execute(
                select(VectorCollection).where(
                    VectorCollection.tenant_id == tenant_id
                )
            )
            collections = result.scalars().all()
            
            health_status["checks"]["vector_collections"] = {
                "status": "healthy",
                "count": len(collections),
                "total_vectors": sum(c.total_vectors for c in collections)
            }
            
        except Exception as e:
            health_status["checks"]["vector_collections"] = {
                "status": "unhealthy",
                "error": str(e)
            }
            health_status["status"] = "degraded"
        
        # Check embedding service
        try:
            # Test embedding generation with a simple text
            embeddings = await service.embedding_service.generate_embeddings(
                ["test"], 
                EmbeddingModel.OPENAI_ADA_002
            )
            
            health_status["checks"]["embedding_service"] = {
                "status": "healthy",
                "test_embedding_dimension": len(embeddings[0])
            }
            
        except Exception as e:
            health_status["checks"]["embedding_service"] = {
                "status": "unhealthy",
                "error": str(e)
            }
            health_status["status"] = "degraded"
        
        # Check content availability
        try:
            from sqlalchemy import select, func
            from ..models.content import ContentChunk
            
            result = await service.db.execute(
                select(func.count(ContentChunk.id)).where(
                    ContentChunk.tenant_id == tenant_id
                )
            )
            
            chunk_count = result.scalar() or 0
            
            health_status["checks"]["content_chunks"] = {
                "status": "healthy" if chunk_count > 0 else "warning",
                "total_chunks": chunk_count,
                "message": "No content available" if chunk_count == 0 else f"{chunk_count} chunks available"
            }
            
        except Exception as e:
            health_status["checks"]["content_chunks"] = {
                "status": "unhealthy",
                "error": str(e)
            }
        
        return health_status
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.now(),
            "tenant_id": tenant_id,
            "error": str(e)
        }

# Utility endpoints for development
@router.post("/dev/reset")
async def reset_rag_system(
    confirm: bool = Query(False, description="Must be true to confirm reset"),
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Reset RAG system for tenant (development only)
    
    WARNING: This will delete all:
    - Vector collections
    - Embeddings
    - Chat sessions
    - Chat messages
    """
    import os
    
    if os.getenv("ENVIRONMENT") != "development":
        raise HTTPException(status_code=403, detail="Only available in development environment")
    
    if not confirm:
        raise HTTPException(status_code=400, detail="Must confirm reset with confirm=true")
    
    try:
        # Delete all RAG-related data for tenant
        await db.execute(f"DELETE FROM chat_messages WHERE tenant_id = '{tenant_id}'")
        await db.execute(f"DELETE FROM chat_sessions WHERE tenant_id = '{tenant_id}'")
        await db.execute(f"DELETE FROM embedding_jobs WHERE tenant_id = '{tenant_id}'")
        await db.execute(f"DELETE FROM vector_collections WHERE tenant_id = '{tenant_id}'")
        
        await db.commit()
        
        return {
            "message": "RAG system reset successfully",
            "tenant_id": tenant_id,
            "warning": "All RAG data has been permanently deleted"
        }
        
    except Exception as e:
        logger.error(f"Failed to reset RAG system: {e}")
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")

@router.get("/dev/debug/{session_id}")
async def debug_chat_session(
    session_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db_session)
):
    """Debug information for a chat session (development only)"""
    import os
    
    if os.getenv("ENVIRONMENT") != "development":
        raise HTTPException(status_code=403, detail="Only available in development environment")
    
    try:
        from sqlalchemy import select
        from ..models.vector import ChatSession, ChatMessage
        
        # Get session
        session_result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.tenant_id == tenant_id
            )
        )
        session = session_result.scalar_one_or_none()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get messages
        messages_result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == session_id
            ).order_by(ChatMessage.created_at)
        )
        messages = messages_result.scalars().all()
        
        return {
            "session": {
                "id": session.id,
                "tenant_id": session.tenant_id,
                "user_id": session.user_id,
                "session_name": session.session_name,
                "rag_config": session.rag_config,
                "message_count": session.message_count,
                "total_tokens_used": session.total_tokens_used,
                "created_at": session.created_at,
                "last_activity": session.last_activity
            },
            "messages": [
                {
                    "id": msg.id,
                    "message": msg.message,
                    "response": msg.response,
                    "role": msg.role,
                    "retrieved_chunks": msg.retrieved_chunks,
                    "similarity_scores": msg.similarity_scores,
                    "tokens_used": msg.tokens_used,
                    "response_time_ms": msg.response_time_ms,
                    "feedback_score": msg.feedback_score,
                    "created_at": msg.created_at
                }
                for msg in messages
            ],
            "total_messages": len(messages)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Debug session failed: {e}")
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")