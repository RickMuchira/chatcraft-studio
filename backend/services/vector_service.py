# backend/services/vector_service.py
import asyncio
import os
import time
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
import openai
from sentence_transformers import SentenceTransformer
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException

from ..models.vector import (
    VectorCollection, EmbeddingJob, VectorProvider, EmbeddingModel,
    VectorCollectionCreate, VectorCollectionResponse, RetrievedChunk,
    SearchRequest, SearchResponse, RAGConfig, SearchStrategy
)
from ..models.content import ContentChunk, ContentSource

logger = logging.getLogger(__name__)

# Abstract base class for vector providers
class VectorProvider(ABC):
    """Abstract base class for vector database providers"""
    
    @abstractmethod
    async def create_collection(self, collection_name: str, dimensions: int, config: Dict[str, Any]) -> str:
        """Create a new collection and return its ID"""
        pass
    
    @abstractmethod
    async def delete_collection(self, collection_id: str) -> bool:
        """Delete a collection"""
        pass
    
    @abstractmethod
    async def upsert_vectors(self, collection_id: str, vectors: List[Dict[str, Any]]) -> bool:
        """Insert or update vectors in collection"""
        pass
    
    @abstractmethod
    async def search_vectors(self, collection_id: str, query_vector: List[float], 
                           limit: int = 10, filters: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """Search for similar vectors"""
        pass
    
    @abstractmethod
    async def get_collection_stats(self, collection_id: str) -> Dict[str, Any]:
        """Get collection statistics"""
        pass

# Weaviate implementation
class WeaviateProvider(VectorProvider):
    """Weaviate vector database provider"""
    
    def __init__(self):
        try:
            import weaviate
            self.client = weaviate.Client(
                url=os.getenv("WEAVIATE_URL", "http://localhost:8080"),
                auth_client_secret=weaviate.AuthApiKey(api_key=os.getenv("WEAVIATE_API_KEY", ""))
            )
        except ImportError:
            raise ImportError("Install Weaviate client: pip install weaviate-client")
    
    async def create_collection(self, collection_name: str, dimensions: int, config: Dict[str, Any]) -> str:
        """Create Weaviate class (collection)"""
        try:
            class_obj = {
                "class": collection_name,
                "description": f"Knowledge base collection for {collection_name}",
                "vectorizer": "none",  # We'll provide our own vectors
                "properties": [
                    {
                        "name": "content",
                        "dataType": ["text"],
                        "description": "The text content of the chunk"
                    },
                    {
                        "name": "title", 
                        "dataType": ["string"],
                        "description": "Title of the content chunk"
                    },
                    {
                        "name": "source_name",
                        "dataType": ["string"],
                        "description": "Name of the source document"
                    },
                    {
                        "name": "source_type",
                        "dataType": ["string"],
                        "description": "Type of the source (document, website, etc.)"
                    },
                    {
                        "name": "chunk_index",
                        "dataType": ["int"],
                        "description": "Index of chunk within source"
                    },
                    {
                        "name": "keywords",
                        "dataType": ["string[]"],
                        "description": "Extracted keywords"
                    },
                    {
                        "name": "metadata",
                        "dataType": ["text"],
                        "description": "JSON metadata"
                    },
                    {
                        "name": "tenant_id",
                        "dataType": ["string"],
                        "description": "Tenant identifier for isolation"
                    },
                    {
                        "name": "chunk_id",
                        "dataType": ["string"],
                        "description": "Reference to ContentChunk ID"
                    }
                ]
            }
            
            self.client.schema.create_class(class_obj)
            return collection_name
            
        except Exception as e:
            logger.error(f"Failed to create Weaviate collection: {e}")
            raise
    
    async def delete_collection(self, collection_id: str) -> bool:
        """Delete Weaviate class"""
        try:
            self.client.schema.delete_class(collection_id)
            return True
        except Exception as e:
            logger.error(f"Failed to delete Weaviate collection: {e}")
            return False
    
    async def upsert_vectors(self, collection_id: str, vectors: List[Dict[str, Any]]) -> bool:
        """Insert vectors into Weaviate"""
        try:
            with self.client.batch as batch:
                batch.batch_size = 100
                
                for vector_data in vectors:
                    batch.add_data_object(
                        data_object=vector_data["properties"],
                        class_name=collection_id,
                        vector=vector_data["vector"],
                        uuid=vector_data.get("id")
                    )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to upsert vectors to Weaviate: {e}")
            return False
    
    async def search_vectors(self, collection_id: str, query_vector: List[float], 
                           limit: int = 10, filters: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """Search Weaviate collection"""
        try:
            query = self.client.query.get(collection_id, [
                "content", "title", "source_name", "source_type", 
                "chunk_index", "keywords", "metadata", "chunk_id"
            ]).with_near_vector({
                "vector": query_vector
            }).with_limit(limit)
            
            if filters:
                # Add tenant isolation filter
                if "tenant_id" in filters:
                    query = query.with_where({
                        "path": ["tenant_id"],
                        "operator": "Equal",
                        "valueString": filters["tenant_id"]
                    })
            
            result = query.with_additional(["certainty", "distance"]).do()
            
            documents = []
            if "data" in result and "Get" in result["data"] and collection_id in result["data"]["Get"]:
                for item in result["data"]["Get"][collection_id]:
                    documents.append({
                        "chunk_id": item.get("chunk_id"),
                        "content": item.get("content", ""),
                        "title": item.get("title"),
                        "source_name": item.get("source_name", ""),
                        "source_type": item.get("source_type", ""),
                        "chunk_index": item.get("chunk_index", 0),
                        "keywords": item.get("keywords", []),
                        "metadata": item.get("metadata", "{}"),
                        "similarity_score": item.get("_additional", {}).get("certainty", 0.0)
                    })
            
            return documents
            
        except Exception as e:
            logger.error(f"Failed to search Weaviate: {e}")
            return []
    
    async def get_collection_stats(self, collection_id: str) -> Dict[str, Any]:
        """Get Weaviate collection statistics"""
        try:
            result = self.client.query.aggregate(collection_id).with_meta_count().do()
            
            count = 0
            if "data" in result and "Aggregate" in result["data"]:
                aggregate_data = result["data"]["Aggregate"].get(collection_id, [])
                if aggregate_data:
                    count = aggregate_data[0].get("meta", {}).get("count", 0)
            
            return {
                "total_vectors": count,
                "provider": "weaviate"
            }
            
        except Exception as e:
            logger.error(f"Failed to get Weaviate stats: {e}")
            return {"total_vectors": 0, "provider": "weaviate"}

# Qdrant implementation
class QdrantProvider(VectorProvider):
    """Qdrant vector database provider"""
    
    def __init__(self):
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams
            
            self.client = QdrantClient(
                host=os.getenv("QDRANT_HOST", "localhost"),
                port=int(os.getenv("QDRANT_PORT", 6333)),
                api_key=os.getenv("QDRANT_API_KEY")
            )
            self.Distance = Distance
            self.VectorParams = VectorParams
            
        except ImportError:
            raise ImportError("Install Qdrant client: pip install qdrant-client")
    
    async def create_collection(self, collection_name: str, dimensions: int, config: Dict[str, Any]) -> str:
        """Create Qdrant collection"""
        try:
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=self.VectorParams(
                    size=dimensions,
                    distance=self.Distance.COSINE
                )
            )
            return collection_name
            
        except Exception as e:
            logger.error(f"Failed to create Qdrant collection: {e}")
            raise
    
    async def delete_collection(self, collection_id: str) -> bool:
        """Delete Qdrant collection"""
        try:
            self.client.delete_collection(collection_name=collection_id)
            return True
        except Exception as e:
            logger.error(f"Failed to delete Qdrant collection: {e}")
            return False
    
    async def upsert_vectors(self, collection_id: str, vectors: List[Dict[str, Any]]) -> bool:
        """Insert vectors into Qdrant"""
        try:
            from qdrant_client.models import PointStruct
            
            points = []
            for vector_data in vectors:
                points.append(PointStruct(
                    id=vector_data.get("id", hash(str(vector_data))),
                    vector=vector_data["vector"],
                    payload=vector_data["properties"]
                ))
            
            self.client.upsert(
                collection_name=collection_id,
                points=points
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to upsert vectors to Qdrant: {e}")
            return False
    
    async def search_vectors(self, collection_id: str, query_vector: List[float], 
                           limit: int = 10, filters: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """Search Qdrant collection"""
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            
            search_filter = None
            if filters and "tenant_id" in filters:
                search_filter = Filter(
                    must=[
                        FieldCondition(
                            key="tenant_id",
                            match=MatchValue(value=filters["tenant_id"])
                        )
                    ]
                )
            
            results = self.client.search(
                collection_name=collection_id,
                query_vector=query_vector,
                query_filter=search_filter,
                limit=limit,
                with_payload=True
            )
            
            documents = []
            for result in results:
                payload = result.payload
                documents.append({
                    "chunk_id": payload.get("chunk_id"),
                    "content": payload.get("content", ""),
                    "title": payload.get("title"),
                    "source_name": payload.get("source_name", ""),
                    "source_type": payload.get("source_type", ""),
                    "chunk_index": payload.get("chunk_index", 0),
                    "keywords": payload.get("keywords", []),
                    "metadata": payload.get("metadata", "{}"),
                    "similarity_score": result.score
                })
            
            return documents
            
        except Exception as e:
            logger.error(f"Failed to search Qdrant: {e}")
            return []
    
    async def get_collection_stats(self, collection_id: str) -> Dict[str, Any]:
        """Get Qdrant collection statistics"""
        try:
            info = self.client.get_collection(collection_name=collection_id)
            return {
                "total_vectors": info.points_count,
                "provider": "qdrant"
            }
            
        except Exception as e:
            logger.error(f"Failed to get Qdrant stats: {e}")
            return {"total_vectors": 0, "provider": "qdrant"}

# Embedding service
class EmbeddingService:
    """Service for generating embeddings using various models"""
    
    def __init__(self):
        self.openai_client = None
        self.sentence_transformer = None
        
        # Initialize OpenAI if API key is available
        if os.getenv("OPENAI_API_KEY"):
            openai.api_key = os.getenv("OPENAI_API_KEY")
            self.openai_client = openai
    
    async def generate_embeddings(self, texts: List[str], model: EmbeddingModel) -> List[List[float]]:
        """Generate embeddings for a list of texts"""
        
        if model.startswith("text-embedding"):
            return await self._generate_openai_embeddings(texts, model)
        elif model.startswith("sentence-transformers"):
            return await self._generate_sentence_transformer_embeddings(texts, model)
        else:
            raise ValueError(f"Unsupported embedding model: {model}")
    
    async def _generate_openai_embeddings(self, texts: List[str], model: str) -> List[List[float]]:
        """Generate OpenAI embeddings"""
        if not self.openai_client:
            raise ValueError("OpenAI API key not configured")
        
        try:
            # Process in batches to avoid rate limits
            batch_size = 100
            all_embeddings = []
            
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                
                response = await self.openai_client.Embedding.acreate(
                    model=model,
                    input=batch
                )
                
                batch_embeddings = [item["embedding"] for item in response["data"]]
                all_embeddings.extend(batch_embeddings)
                
                # Rate limiting
                if len(texts) > batch_size:
                    await asyncio.sleep(0.1)
            
            return all_embeddings
            
        except Exception as e:
            logger.error(f"Failed to generate OpenAI embeddings: {e}")
            raise
    
    async def _generate_sentence_transformer_embeddings(self, texts: List[str], model: str) -> List[List[float]]:
        """Generate Sentence Transformer embeddings"""
        try:
            if not self.sentence_transformer or self.sentence_transformer.model_name != model:
                self.sentence_transformer = SentenceTransformer(model)
            
            # Generate embeddings
            embeddings = self.sentence_transformer.encode(texts, convert_to_tensor=False)
            
            # Convert to list of lists
            return [embedding.tolist() for embedding in embeddings]
            
        except Exception as e:
            logger.error(f"Failed to generate Sentence Transformer embeddings: {e}")
            raise

# Main Vector Service
class VectorService:
    """Main service for vector database operations and RAG"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.embedding_service = EmbeddingService()
        
        # Initialize vector providers
        self.providers = {}
        
        try:
            self.providers[VectorProvider.WEAVIATE] = WeaviateProvider()
        except ImportError:
            logger.warning("Weaviate provider not available")
        
        try:
            self.providers[VectorProvider.QDRANT] = QdrantProvider()
        except ImportError:
            logger.warning("Qdrant provider not available")
    
    async def create_collection(self, tenant_id: str, collection_data: VectorCollectionCreate) -> VectorCollectionResponse:
        """Create a new vector collection for a tenant"""
        
        # Check if provider is available
        if collection_data.provider not in self.providers:
            raise HTTPException(
                status_code=400,
                detail=f"Vector provider {collection_data.provider} not available"
            )
        
        provider = self.providers[collection_data.provider]
        
        # Create collection name with tenant isolation
        collection_name = f"tenant_{tenant_id}_{collection_data.name}".lower().replace(" ", "_")
        
        # Get embedding dimensions
        dimensions = self._get_embedding_dimensions(collection_data.embedding_model)
        
        try:
            # Create collection in vector database
            external_collection_id = await provider.create_collection(
                collection_name, 
                dimensions, 
                collection_data.config
            )
            
            # Save to our database
            collection = VectorCollection(
                tenant_id=tenant_id,
                name=collection_data.name,
                provider=collection_data.provider,
                collection_id=external_collection_id,
                embedding_model=collection_data.embedding_model,
                dimensions=dimensions,
                config=collection_data.config
            )
            
            self.db.add(collection)
            await self.db.commit()
            await self.db.refresh(collection)
            
            logger.info(f"Created vector collection {collection.id} for tenant {tenant_id}")
            return VectorCollectionResponse.from_orm(collection)
            
        except Exception as e:
            logger.error(f"Failed to create vector collection: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create collection: {str(e)}")
    
    def _get_embedding_dimensions(self, model: EmbeddingModel) -> int:
        """Get embedding dimensions for a model"""
        dimensions_map = {
            EmbeddingModel.OPENAI_ADA_002: 1536,
            EmbeddingModel.OPENAI_3_SMALL: 1536,
            EmbeddingModel.OPENAI_3_LARGE: 3072,
            EmbeddingModel.SENTENCE_TRANSFORMERS: 384,
        }
        return dimensions_map.get(model, 1536)
    
    async def embed_content_chunks(self, tenant_id: str, collection_id: str, chunk_ids: List[str]) -> str:
        """Embed content chunks and store in vector database"""
        
        # Get collection
        result = await self.db.execute(
            select(VectorCollection).where(
                VectorCollection.id == collection_id,
                VectorCollection.tenant_id == tenant_id
            )
        )
        collection = result.scalar_one_or_none()
        
        if not collection:
            raise HTTPException(status_code=404, detail="Vector collection not found")
        
        # Create embedding job
        job = EmbeddingJob(
            tenant_id=tenant_id,
            collection_id=collection_id,
            chunk_ids=chunk_ids,
            status="pending"
        )
        
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        
        # Start embedding process in background
        asyncio.create_task(self._process_embedding_job(job.id))
        
        return job.id
    
    async def _process_embedding_job(self, job_id: str):
        """Process embedding job in background"""
        
        # Get job
        result = await self.db.execute(
            select(EmbeddingJob).where(EmbeddingJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        
        if not job:
            logger.error(f"Embedding job {job_id} not found")
            return
        
        try:
            # Update job status
            job.status = "processing"
            job.started_at = datetime.now()
            await self.db.commit()
            
            # Get collection and chunks
            collection = await self.db.execute(
                select(VectorCollection).where(VectorCollection.id == job.collection_id)
            )
            collection = collection.scalar_one()
            
            # Get content chunks
            chunks_result = await self.db.execute(
                select(ContentChunk, ContentSource).join(ContentSource).where(
                    ContentChunk.id.in_(job.chunk_ids),
                    ContentChunk.tenant_id == job.tenant_id
                )
            )
            chunks_data = chunks_result.fetchall()
            
            if not chunks_data:
                raise ValueError("No chunks found for embedding")
            
            # Prepare texts for embedding
            texts = []
            chunk_metadata = []
            
            for chunk, source in chunks_data:
                # Combine title and content for better context
                text = f"{chunk.title or ''}\n\n{chunk.content}".strip()
                texts.append(text)
                
                chunk_metadata.append({
                    "chunk_id": chunk.id,
                    "content": chunk.content,
                    "title": chunk.title,
                    "source_name": source.name,
                    "source_type": source.content_type,
                    "chunk_index": chunk.chunk_index,
                    "keywords": chunk.keywords or [],
                    "metadata": chunk.metadata or {},
                    "tenant_id": job.tenant_id
                })
            
            # Generate embeddings
            logger.info(f"Generating embeddings for {len(texts)} chunks")
            embeddings = await self.embedding_service.generate_embeddings(
                texts, 
                collection.embedding_model
            )
            
            # Prepare vector data
            vector_data = []
            for i, (embedding, metadata) in enumerate(zip(embeddings, chunk_metadata)):
                vector_data.append({
                    "id": metadata["chunk_id"],
                    "vector": embedding,
                    "properties": metadata
                })
                
                # Update progress
                progress = int((i + 1) / len(texts) * 80)  # 80% for embedding generation
                job.progress = progress
                await self.db.commit()
            
            # Store in vector database
            provider = self.providers[collection.provider]
            success = await provider.upsert_vectors(collection.collection_id, vector_data)
            
            if success:
                # Update collection stats
                collection.total_vectors += len(vector_data)
                collection.last_updated = datetime.now()
                
                # Update job completion
                job.status = "completed"
                job.progress = 100
                job.embedded_count = len(vector_data)
                job.completed_at = datetime.now()
                
                # Update chunk embedding IDs
                for metadata in chunk_metadata:
                    await self.db.execute(
                        update(ContentChunk)
                        .where(ContentChunk.id == metadata["chunk_id"])
                        .values(embedding_id=metadata["chunk_id"])
                    )
                
                await self.db.commit()
                logger.info(f"Successfully embedded {len(vector_data)} chunks")
                
            else:
                raise Exception("Failed to store vectors in database")
                
        except Exception as e:
            logger.error(f"Embedding job {job_id} failed: {e}")
            
            # Update job with error
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now()
            await self.db.commit()
    
    async def search_knowledge(self, tenant_id: str, request: SearchRequest) -> SearchResponse:
        """Search knowledge base using RAG"""
        
        start_time = time.time()
        
        # Get tenant's default collection (or create logic to select appropriate collection)
        result = await self.db.execute(
            select(VectorCollection).where(
                VectorCollection.tenant_id == tenant_id
            ).order_by(VectorCollection.created_at.desc()).limit(1)
        )
        collection = result.scalar_one_or_none()
        
        if not collection:
            raise HTTPException(status_code=404, detail="No vector collection found for tenant")
        
        try:
            # Process query based on search strategy
            if request.config.search_strategy == SearchStrategy.MULTI_QUERY:
                results = await self._multi_query_search(collection, request)
            elif request.config.search_strategy == SearchStrategy.HYBRID:
                results = await self._hybrid_search(collection, request)
            else:
                results = await self._semantic_search(collection, request)
            
            # Post-process results
            processed_results = await self._post_process_results(
                results, 
                request.config,
                tenant_id
            )
            
            search_time = int((time.time() - start_time) * 1000)
            
            return SearchResponse(
                query=request.query,
                chunks=processed_results,
                total_found=len(processed_results),
                search_time_ms=search_time,
                strategy_used=request.config.search_strategy
            )
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    
    async def _semantic_search(self, collection: VectorCollection, request: SearchRequest) -> List[Dict[str, Any]]:
        """Perform semantic vector search"""
        
        # Generate query embedding
        query_embeddings = await self.embedding_service.generate_embeddings(
            [request.query], 
            collection.embedding_model
        )
        query_vector = query_embeddings[0]
        
        # Search vector database
        provider = self.providers[collection.provider]
        
        # Prepare filters with tenant isolation
        filters = {"tenant_id": collection.tenant_id}
        if request.filters:
            filters.update(request.filters)
        
        results = await provider.search_vectors(
            collection.collection_id,
            query_vector,
            limit=request.config.max_chunks * 2,  # Get more for filtering
            filters=filters
        )
        
        return results
    
    async def _multi_query_search(self, collection: VectorCollection, request: SearchRequest) -> List[Dict[str, Any]]:
        """Multi-query search with query expansion"""
        
        # Generate query variations
        query_variations = await self._generate_query_variations(
            request.query, 
            request.config.query_variations
        )
        
        all_results = []
        seen_chunks = set()
        
        # Search with each query variation
        for query in query_variations:
            query_embeddings = await self.embedding_service.generate_embeddings(
                [query], 
                collection.embedding_model
            )
            query_vector = query_embeddings[0]
            
            provider = self.providers[collection.provider]
            filters = {"tenant_id": collection.tenant_id}
            if request.filters:
                filters.update(request.filters)
            
            results = await provider.search_vectors(
                collection.collection_id,
                query_vector,
                limit=request.config.max_chunks,
                filters=filters
            )
            
            # Deduplicate and add to results
            for result in results:
                chunk_id = result.get("chunk_id")
                if chunk_id and chunk_id not in seen_chunks:
                    seen_chunks.add(chunk_id)
                    all_results.append(result)
        
        # Sort by similarity score
        all_results.sort(key=lambda x: x.get("similarity_score", 0), reverse=True)
        
        return all_results[:request.config.max_chunks * 2]
    
    async def _hybrid_search(self, collection: VectorCollection, request: SearchRequest) -> List[Dict[str, Any]]:
        """Hybrid search combining semantic and keyword search"""
        
        # Get semantic search results
        semantic_results = await self._semantic_search(collection, request)
        
        # Get keyword search results from database
        keyword_results = await self._keyword_search(collection.tenant_id, request.query, request.config.max_chunks)
        
        # Combine and rerank results
        combined_results = self._combine_search_results(
            semantic_results, 
            keyword_results,
            request.config.keyword_weight
        )
        
        return combined_results
    
    async def _keyword_search(self, tenant_id: str, query: str, limit: int) -> List[Dict[str, Any]]:
        """Keyword search in content chunks"""
        
        # Simple keyword search using database full-text search
        # In production, you might use Elasticsearch or similar
        
        search_terms = query.lower().split()
        
        # Build SQL for keyword search
        search_conditions = []
        for term in search_terms:
            search_conditions.append(f"LOWER(content) LIKE '%{term}%'")
        
        sql_query = f"""
            SELECT c.id, c.content, c.title, c.chunk_index, c.keywords, c.metadata,
                   s.name as source_name, s.content_type as source_type
            FROM content_chunks c
            JOIN content_sources s ON c.source_id = s.id
            WHERE c.tenant_id = '{tenant_id}'
            AND ({' OR '.join(search_conditions)})
            ORDER BY c.chunk_index
            LIMIT {limit}
        """
        
        result = await self.db.execute(sql_query)
        rows = result.fetchall()
        
        # Convert to standard format
        keyword_results = []
        for row in rows:
            keyword_results.append({
                "chunk_id": row[0],
                "content": row[1],
                "title": row[2],
                "chunk_index": row[3],
                "keywords": row[4] or [],
                "metadata": row[5] or {},
                "source_name": row[6],
                "source_type": row[7],
                "similarity_score": 0.5  # Default score for keyword matches
            })
        
        return keyword_results
    
    def _combine_search_results(self, semantic_results: List[Dict], keyword_results: List[Dict], keyword_weight: float) -> List[Dict]:
        """Combine semantic and keyword search results"""
        
        # Create a dictionary for easy lookup
        semantic_dict = {r["chunk_id"]: r for r in semantic_results}
        keyword_dict = {r["chunk_id"]: r for r in keyword_results}
        
        # Get all unique chunk IDs
        all_chunk_ids = set(semantic_dict.keys()) | set(keyword_dict.keys())
        
        combined_results = []
        for chunk_id in all_chunk_ids:
            semantic_result = semantic_dict.get(chunk_id)
            keyword_result = keyword_dict.get(chunk_id)
            
            # Calculate combined score
            semantic_score = semantic_result["similarity_score"] if semantic_result else 0
            keyword_score = keyword_result["similarity_score"] if keyword_result else 0
            
            combined_score = (
                semantic_score * (1 - keyword_weight) + 
                keyword_score * keyword_weight
            )
            
            # Use semantic result as base, fallback to keyword result
            result = semantic_result or keyword_result
            result["similarity_score"] = combined_score
            
            combined_results.append(result)
        
        # Sort by combined score
        combined_results.sort(key=lambda x: x["similarity_score"], reverse=True)
        
        return combined_results
    
    async def _generate_query_variations(self, query: str, num_variations: int) -> List[str]:
        """Generate query variations for multi-query search"""
        
        # Simple query expansion - in production, use more sophisticated methods
        variations = [query]
        
        # Add simple variations
        words = query.split()
        if len(words) > 1:
            # Add partial queries
            variations.append(" ".join(words[:len(words)//2]))
            variations.append(" ".join(words[len(words)//2:]))
        
        # Add synonym-based variations (simplified)
        synonyms = {
            "help": ["support", "assistance", "aid"],
            "problem": ["issue", "error", "bug"],
            "how": ["what", "method", "way"],
            "price": ["cost", "fee", "charge"],
            "buy": ["purchase", "order", "get"]
        }
        
        for word in words:
            if word.lower() in synonyms:
                for synonym in synonyms[word.lower()]:
                    synonym_query = query.replace(word, synonym)
                    if synonym_query not in variations:
                        variations.append(synonym_query)
        
        return variations[:num_variations]
    
    async def _post_process_results(self, results: List[Dict], config: RAGConfig, tenant_id: str) -> List[RetrievedChunk]:
        """Post-process search results"""
        
        processed_results = []
        
        for result in results:
            # Filter by similarity threshold
            if result.get("similarity_score", 0) < config.similarity_threshold:
                continue
            
            # Parse metadata
            metadata = result.get("metadata", {})
            if isinstance(metadata, str):
                try:
                    import json
                    metadata = json.loads(metadata)
                except:
                    metadata = {}
            
            processed_chunk = RetrievedChunk(
                chunk_id=result["chunk_id"],
                content=result["content"],
                title=result.get("title"),
                source_name=result["source_name"],
                source_type=result["source_type"],
                similarity_score=result["similarity_score"],
                metadata=metadata,
                keywords=result.get("keywords", [])
            )
            
            processed_results.append(processed_chunk)
            
            if len(processed_results) >= config.max_chunks:
                break
        
        return processed_results
    
    async def get_collection_stats(self, tenant_id: str, collection_id: str) -> Dict[str, Any]:
        """Get vector collection statistics"""
        
        result = await self.db.execute(
            select(VectorCollection).where(
                VectorCollection.id == collection_id,
                VectorCollection.tenant_id == tenant_id
            )
        )
        collection = result.scalar_one_or_none()
        
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        
        # Get stats from vector provider
        provider = self.providers[collection.provider]
        provider_stats = await provider.get_collection_stats(collection.collection_id)
        
        return {
            "collection_id": collection.id,
            "name": collection.name,
            "provider": collection.provider,
            "embedding_model": collection.embedding_model,
            "total_vectors": provider_stats.get("total_vectors", collection.total_vectors),
            "last_updated": collection.last_updated,
            "created_at": collection.created_at
        }