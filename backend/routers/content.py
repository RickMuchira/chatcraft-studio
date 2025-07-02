# backend/routers/content.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import json
import logging
from datetime import datetime

from ..models.content import (
    ContentSourceCreate, ContentSourceResponse, ContentSourceUpdate,
    TenantUsage, ContentIngestionStats, ProcessingProgress,
    ContentType, ProcessingStatus
)
from ..services.content_service import ContentIngestionService
from ..database import get_db_session
from ..auth import get_current_tenant_id

logger = logging.getLogger(__name__)
security = HTTPBearer()

router = APIRouter(prefix="/api/content", tags=["Content Ingestion"])

async def get_content_service(db: AsyncSession = Depends(get_db_session)) -> ContentIngestionService:
    """Dependency to get content ingestion service"""
    return ContentIngestionService(db)

@router.post("/sources", response_model=ContentSourceResponse)
async def create_content_source(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    content_type: ContentType = Form(...),
    source_url: Optional[str] = Form(None),
    config: str = Form("{}"),  # JSON string
    file: Optional[UploadFile] = File(None),
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """
    Create a new content source for processing
    
    Supports multiple content types:
    - Document upload (PDF, DOCX, TXT)
    - Website scraping (single page or full site crawl)
    - Video transcription (YouTube URLs)
    - API endpoint data
    """
    
    try:
        # Parse config JSON
        try:
            config_dict = json.loads(config) if config else {}
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in config field")
        
        # Validate content type requirements
        if content_type in [ContentType.WEBSITE, ContentType.VIDEO, ContentType.API] and not source_url:
            raise HTTPException(
                status_code=400, 
                detail=f"source_url is required for {content_type.value}"
            )
        
        if content_type == ContentType.DOCUMENT and not file:
            raise HTTPException(
                status_code=400,
                detail="File upload is required for document content type"
            )
        
        # Validate file types for document uploads
        if file and content_type == ContentType.DOCUMENT:
            allowed_extensions = {'.pdf', '.docx', '.txt', '.md'}
            file_extension = None
            if file.filename:
                file_extension = '.' + file.filename.split('.')[-1].lower()
            
            if file_extension not in allowed_extensions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
                )
        
        # Create content source request
        source_data = ContentSourceCreate(
            name=name,
            content_type=content_type,
            source_url=source_url,
            config=config_dict
        )
        
        # Create and start processing
        result = await service.create_content_source(tenant_id, source_data, file)
        
        logger.info(f"Created content source {result.id} for tenant {tenant_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating content source: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create content source: {str(e)}")

@router.get("/sources", response_model=List[ContentSourceResponse])
async def list_content_sources(
    skip: int = 0,
    limit: int = 20,
    status: Optional[ProcessingStatus] = None,
    content_type: Optional[ContentType] = None,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """List all content sources for the tenant with optional filtering"""
    
    try:
        sources = await service.get_content_sources(tenant_id, skip, limit)
        
        # Apply filters
        if status:
            sources = [s for s in sources if s.status == status]
        
        if content_type:
            sources = [s for s in sources if s.content_type == content_type]
        
        return sources
        
    except Exception as e:
        logger.error(f"Error listing content sources: {e}")
        raise HTTPException(status_code=500, detail="Failed to list content sources")

@router.get("/sources/{source_id}", response_model=ContentSourceResponse)
async def get_content_source(
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Get details of a specific content source"""
    
    try:
        return await service.get_content_source(tenant_id, source_id)
    except Exception as e:
        logger.error(f"Error getting content source {source_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get content source")

@router.put("/sources/{source_id}", response_model=ContentSourceResponse)
async def update_content_source(
    source_id: str,
    update_data: ContentSourceUpdate,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Update content source configuration"""
    
    try:
        # Get existing source
        source = await service.get_content_source(tenant_id, source_id)
        
        # Update fields
        if update_data.name:
            source.name = update_data.name
        if update_data.config:
            source.config = update_data.config
        if update_data.status:
            source.status = update_data.status
        
        # Save updates (implement in service)
        # await service.update_content_source(tenant_id, source_id, update_data)
        
        return source
        
    except Exception as e:
        logger.error(f"Error updating content source {source_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update content source")

@router.delete("/sources/{source_id}")
async def delete_content_source(
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Delete a content source and all its processed chunks"""
    
    try:
        await service.delete_content_source(tenant_id, source_id)
        return {"message": "Content source deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting content source {source_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete content source")

@router.post("/sources/{source_id}/reprocess", response_model=ContentSourceResponse)
async def reprocess_content_source(
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Reprocess a content source (useful for failed or updated sources)"""
    
    try:
        return await service.reprocess_content_source(tenant_id, source_id)
        
    except Exception as e:
        logger.error(f"Error reprocessing content source {source_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to reprocess content source")

@router.get("/usage", response_model=TenantUsage)
async def get_tenant_usage(
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Get current tenant usage and quota information"""
    
    try:
        return await service.get_tenant_usage(tenant_id)
        
    except Exception as e:
        logger.error(f"Error getting tenant usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to get usage information")

@router.get("/stats", response_model=ContentIngestionStats)
async def get_ingestion_stats(
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Get content ingestion statistics for dashboard"""
    
    try:
        # Implement stats gathering in service
        stats = await service.get_ingestion_stats(tenant_id)
        return stats
        
    except Exception as e:
        logger.error(f"Error getting ingestion stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")

@router.get("/sources/{source_id}/progress")
async def get_processing_progress(
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Get real-time processing progress for a content source"""
    
    try:
        source = await service.get_content_source(tenant_id, source_id)
        
        progress = ProcessingProgress(
            source_id=source.id,
            status=source.status,
            progress_percentage=source.progress_percentage,
            message=f"Processing {source.name}",
            chunks_processed=source.processed_chunks,
            total_chunks=source.total_chunks,
            error_message=source.error_message
        )
        
        return progress
        
    except Exception as e:
        logger.error(f"Error getting processing progress: {e}")
        raise HTTPException(status_code=500, detail="Failed to get progress")

# Bulk operations
@router.post("/sources/bulk-upload")
async def bulk_upload_documents(
    files: List[UploadFile] = File(...),
    config: str = Form("{}"),
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Upload multiple documents at once"""
    
    try:
        # Parse config
        config_dict = json.loads(config) if config else {}
        
        # Check quota for bulk upload
        total_size_mb = 0
        for file in files:
            file.file.seek(0, 2)
            total_size_mb += file.file.tell() / (1024 * 1024)
            file.file.seek(0)
        
        await service.check_tenant_quotas(tenant_id, total_size_mb)
        
        # Create sources for each file
        created_sources = []
        for file in files:
            if file.filename:
                source_data = ContentSourceCreate(
                    name=file.filename,
                    content_type=ContentType.DOCUMENT,
                    config=config_dict
                )
                
                result = await service.create_content_source(tenant_id, source_data, file)
                created_sources.append(result)
        
        return {
            "message": f"Successfully uploaded {len(created_sources)} documents",
            "sources": created_sources
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk upload: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")

@router.post("/sources/bulk-website")
async def bulk_add_websites(
    urls: List[str],
    config: Dict[str, Any] = {},
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Add multiple websites for scraping"""
    
    try:
        # Check quotas
        await service.check_tenant_quotas(tenant_id, 0)
        
        created_sources = []
        for url in urls:
            try:
                source_data = ContentSourceCreate(
                    name=f"Website: {url}",
                    content_type=ContentType.WEBSITE,
                    source_url=url,
                    config=config
                )
                
                result = await service.create_content_source(tenant_id, source_data)
                created_sources.append(result)
                
            except Exception as e:
                logger.warning(f"Failed to add website {url}: {e}")
                continue
        
        return {
            "message": f"Successfully added {len(created_sources)} websites",
            "sources": created_sources
        }
        
    except Exception as e:
        logger.error(f"Error in bulk website add: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk website add failed: {str(e)}")

# Content preview endpoints
@router.get("/sources/{source_id}/chunks")
async def get_source_chunks(
    source_id: str,
    skip: int = 0,
    limit: int = 10,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Get processed chunks for a content source (for preview/debugging)"""
    
    try:
        # Verify source ownership
        await service.get_content_source(tenant_id, source_id)
        
        # Get chunks (implement in service)
        chunks = await service.get_source_chunks(source_id, skip, limit)
        
        return {
            "source_id": source_id,
            "chunks": chunks,
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"Error getting source chunks: {e}")
        raise HTTPException(status_code=500, detail="Failed to get chunks")

@router.get("/search")
async def search_content(
    query: str,
    limit: int = 10,
    source_ids: Optional[List[str]] = None,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ContentIngestionService = Depends(get_content_service)
):
    """Search through processed content (preview of RAG functionality)"""
    
    try:
        # This would integrate with vector search in production
        results = await service.search_content(tenant_id, query, limit, source_ids)
        
        return {
            "query": query,
            "results": results,
            "total_found": len(results)
        }
        
    except Exception as e:
        logger.error(f"Error searching content: {e}")
        raise HTTPException(status_code=500, detail="Search failed")