# backend/services/content_service.py
import asyncio
import os
import aiofiles
import httpx
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update, func
from fastapi import HTTPException, UploadFile
from typing import List, Optional, Dict, Any, Tuple
import logging
from datetime import datetime, timedelta
import json
import hashlib
from pathlib import Path

from ..models.content import (
    Tenant, ContentSource, ContentChunk, 
    ContentType, ProcessingStatus,
    ContentSourceCreate, ContentSourceResponse, TenantUsage
)
from ..processors import (
    DocumentProcessor, WebsiteProcessor, VideoProcessor, 
    APIProcessor, DatabaseProcessor
)

logger = logging.getLogger(__name__)

class ContentIngestionService:
    """
    Main service for handling content ingestion with multi-tenant isolation
    """
    
    def __init__(self, db_session: AsyncSession, storage_path: str = "./storage"):
        self.db = db_session
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(exist_ok=True)
        
        # Content processors
        self.processors = {
            ContentType.DOCUMENT: DocumentProcessor(),
            ContentType.WEBSITE: WebsiteProcessor(),
            ContentType.VIDEO: VideoProcessor(),
            ContentType.API: APIProcessor(),
            ContentType.DATABASE: DatabaseProcessor(),
        }
        
        # Processing queue (in production, use Redis/Celery)
        self.processing_queue = asyncio.Queue()
        self.is_processing = False

    async def check_tenant_quotas(self, tenant_id: str, estimated_size_mb: int = 0) -> TenantUsage:
        """Check if tenant can add more content based on their quotas"""
        
        result = await self.db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant = result.scalar_one_or_none()
        
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Reset monthly query counter if needed
        if tenant.last_query_reset < datetime.now() - timedelta(days=30):
            tenant.monthly_queries_used = 0
            tenant.last_query_reset = datetime.now()
            await self.db.commit()
        
        usage = TenantUsage(
            tenant_id=tenant.id,
            organization_name=tenant.organization_name,
            subscription_tier=tenant.subscription_tier,
            document_count=tenant.document_count,
            storage_used_mb=tenant.storage_used_mb,
            monthly_queries_used=tenant.monthly_queries_used,
            max_documents=tenant.max_documents,
            max_storage_mb=tenant.max_storage_mb,
            max_monthly_queries=tenant.max_monthly_queries
        )
        
        # Check quotas
        if tenant.document_count >= tenant.max_documents:
            raise HTTPException(
                status_code=403, 
                detail=f"Document limit reached ({tenant.max_documents}). Upgrade your plan to add more content."
            )
        
        if tenant.storage_used_mb + estimated_size_mb > tenant.max_storage_mb:
            raise HTTPException(
                status_code=403,
                detail=f"Storage limit exceeded. Need {estimated_size_mb}MB, have {tenant.max_storage_mb - tenant.storage_used_mb}MB remaining."
            )
        
        return usage

    async def create_content_source(
        self, 
        tenant_id: str, 
        source_data: ContentSourceCreate,
        uploaded_file: Optional[UploadFile] = None
    ) -> ContentSourceResponse:
        """Create a new content source for processing"""
        
        # Check quotas
        estimated_size = 0
        if uploaded_file:
            # Estimate file size in MB
            uploaded_file.file.seek(0, 2)  # Seek to end
            estimated_size = uploaded_file.file.tell() / (1024 * 1024)
            uploaded_file.file.seek(0)  # Reset
        
        await self.check_tenant_quotas(tenant_id, estimated_size)
        
        # Create content source record
        source = ContentSource(
            tenant_id=tenant_id,
            name=source_data.name,
            content_type=source_data.content_type,
            source_url=source_data.source_url,
            config=source_data.config,
            status=ProcessingStatus.PENDING
        )
        
        # Handle file upload
        if uploaded_file:
            file_path = await self._save_uploaded_file(tenant_id, uploaded_file)
            source.file_path = str(file_path)
            source.file_size_mb = int(estimated_size)
        
        self.db.add(source)
        await self.db.commit()
        await self.db.refresh(source)
        
        # Update tenant document count
        await self._update_tenant_usage(tenant_id, documents=1, storage_mb=int(estimated_size))
        
        # Add to processing queue
        await self.processing_queue.put(source.id)
        
        # Start processing if not already running
        if not self.is_processing:
            asyncio.create_task(self._process_queue())
        
        logger.info(f"Created content source {source.id} for tenant {tenant_id}")
        return ContentSourceResponse.from_orm(source)

    async def _save_uploaded_file(self, tenant_id: str, file: UploadFile) -> Path:
        """Save uploaded file to tenant-isolated storage"""
        
        # Create tenant directory
        tenant_dir = self.storage_path / tenant_id
        tenant_dir.mkdir(exist_ok=True)
        
        # Generate unique filename
        file_hash = hashlib.md5(f"{file.filename}{datetime.now()}".encode()).hexdigest()[:8]
        file_extension = Path(file.filename).suffix
        safe_filename = f"{file_hash}_{file.filename}".replace(" ", "_")
        
        file_path = tenant_dir / safe_filename
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        return file_path

    async def _process_queue(self):
        """Background task to process content sources"""
        self.is_processing = True
        
        try:
            while True:
                try:
                    # Get next source to process (timeout after 5 seconds)
                    source_id = await asyncio.wait_for(
                        self.processing_queue.get(), 
                        timeout=5.0
                    )
                    
                    await self._process_content_source(source_id)
                    
                except asyncio.TimeoutError:
                    # No more items in queue
                    break
                except Exception as e:
                    logger.error(f"Error processing content source: {e}")
                    continue
                    
        finally:
            self.is_processing = False

    async def _process_content_source(self, source_id: str):
        """Process a single content source"""
        
        # Get source from database
        result = await self.db.execute(
            select(ContentSource).where(ContentSource.id == source_id)
        )
        source = result.scalar_one_or_none()
        
        if not source:
            logger.error(f"Content source {source_id} not found")
            return
        
        try:
            # Update status to processing
            await self._update_source_status(source_id, ProcessingStatus.PROCESSING, 0)
            
            # Get appropriate processor
            processor = self.processors.get(ContentType(source.content_type))
            if not processor:
                raise ValueError(f"No processor available for {source.content_type}")
            
            # Extract content
            logger.info(f"Extracting content from {source.name} ({source.content_type})")
            content_data = await processor.extract_content(source)
            
            # Update progress
            await self._update_source_status(source_id, ProcessingStatus.CHUNKING, 25)
            
            # Chunk content
            logger.info(f"Chunking content for {source.name}")
            chunks = await processor.chunk_content(content_data, source.config)
            
            # Update progress
            await self._update_source_status(source_id, ProcessingStatus.EMBEDDING, 50)
            
            # Save chunks to database
            await self._save_content_chunks(source, chunks)
            
            # Update progress
            await self._update_source_status(source_id, ProcessingStatus.COMPLETED, 100)
            
            logger.info(f"Successfully processed {source.name} - {len(chunks)} chunks created")
            
        except Exception as e:
            logger.error(f"Failed to process {source.name}: {e}")
            await self._update_source_status(
                source_id, 
                ProcessingStatus.FAILED, 
                0, 
                str(e)
            )

    async def _save_content_chunks(self, source: ContentSource, chunks: List[Dict[str, Any]]):
        """Save processed chunks to database"""
        
        chunk_objects = []
        for i, chunk_data in enumerate(chunks):
            chunk = ContentChunk(
                source_id=source.id,
                tenant_id=source.tenant_id,
                content=chunk_data['content'],
                title=chunk_data.get('title'),
                chunk_index=i,
                metadata=chunk_data.get('metadata', {}),
                keywords=chunk_data.get('keywords', []),
                token_count=len(chunk_data['content'].split()),
                character_count=len(chunk_data['content'])
            )
            chunk_objects.append(chunk)
        
        self.db.add_all(chunk_objects)
        
        # Update source totals
        source.total_chunks = len(chunks)
        source.processed_chunks = len(chunks)
        source.last_processed = datetime.now()
        
        await self.db.commit()

    async def _update_source_status(
        self, 
        source_id: str, 
        status: ProcessingStatus, 
        progress: int,
        error_message: Optional[str] = None
    ):
        """Update content source processing status"""
        
        await self.db.execute(
            update(ContentSource)
            .where(ContentSource.id == source_id)
            .values(
                status=status,
                progress_percentage=progress,
                error_message=error_message,
                updated_at=datetime.now()
            )
        )
        await self.db.commit()

    async def _update_tenant_usage(self, tenant_id: str, documents: int = 0, storage_mb: int = 0):
        """Update tenant usage statistics"""
        
        await self.db.execute(
            update(Tenant)
            .where(Tenant.id == tenant_id)
            .values(
                document_count=Tenant.document_count + documents,
                storage_used_mb=Tenant.storage_used_mb + storage_mb,
                updated_at=datetime.now()
            )
        )
        await self.db.commit()

    async def get_content_sources(
        self, 
        tenant_id: str, 
        skip: int = 0, 
        limit: int = 20
    ) -> List[ContentSourceResponse]:
        """Get all content sources for a tenant"""
        
        result = await self.db.execute(
            select(ContentSource)
            .where(ContentSource.tenant_id == tenant_id)
            .order_by(ContentSource.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        
        sources = result.scalars().all()
        return [ContentSourceResponse.from_orm(source) for source in sources]

    async def get_content_source(self, tenant_id: str, source_id: str) -> ContentSourceResponse:
        """Get a specific content source"""
        
        result = await self.db.execute(
            select(ContentSource)
            .where(
                ContentSource.id == source_id,
                ContentSource.tenant_id == tenant_id
            )
        )
        
        source = result.scalar_one_or_none()
        if not source:
            raise HTTPException(status_code=404, detail="Content source not found")
        
        return ContentSourceResponse.from_orm(source)

    async def delete_content_source(self, tenant_id: str, source_id: str):
        """Delete a content source and all its chunks"""
        
        # Get source to check ownership and get file info
        result = await self.db.execute(
            select(ContentSource)
            .where(
                ContentSource.id == source_id,
                ContentSource.tenant_id == tenant_id
            )
        )
        
        source = result.scalar_one_or_none()
        if not source:
            raise HTTPException(status_code=404, detail="Content source not found")
        
        # Delete file if exists
        if source.file_path and Path(source.file_path).exists():
            Path(source.file_path).unlink()
        
        # Delete from database (chunks will be deleted via cascade)
        await self.db.delete(source)
        
        # Update tenant usage
        await self._update_tenant_usage(
            tenant_id, 
            documents=-1, 
            storage_mb=-source.file_size_mb
        )
        
        await self.db.commit()
        
        logger.info(f"Deleted content source {source_id} for tenant {tenant_id}")

    async def get_tenant_usage(self, tenant_id: str) -> TenantUsage:
        """Get current tenant usage and quotas"""
        return await self.check_tenant_quotas(tenant_id, 0)

    async def reprocess_content_source(self, tenant_id: str, source_id: str):
        """Reprocess a failed or completed content source"""
        
        result = await self.db.execute(
            select(ContentSource)
            .where(
                ContentSource.id == source_id,
                ContentSource.tenant_id == tenant_id
            )
        )
        
        source = result.scalar_one_or_none()
        if not source:
            raise HTTPException(status_code=404, detail="Content source not found")
        
        # Reset status and progress
        source.status = ProcessingStatus.PENDING
        source.progress_percentage = 0
        source.error_message = None
        
        # Delete existing chunks
        await self.db.execute(
            f"DELETE FROM content_chunks WHERE source_id = '{source_id}'"
        )
        
        await self.db.commit()
        
        # Add back to processing queue
        await self.processing_queue.put(source_id)
        
        if not self.is_processing:
            asyncio.create_task(self._process_queue())
        
        logger.info(f"Reprocessing content source {source_id}")
        return ContentSourceResponse.from_orm(source)