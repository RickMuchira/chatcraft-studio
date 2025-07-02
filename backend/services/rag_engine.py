# backend/services/rag_engine.py
import asyncio
import time
import logging
from typing import List, Dict, Any, Optional, Tuple
import openai
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException

from ..models.vector import (
    ChatSession, ChatMessage, RAGConfig, SearchStrategy,
    ChatRequest, ChatResponse, ChatSessionCreate, ChatSessionResponse,
    ChatMessageResponse, RetrievedChunk
)
from ..models.content import Tenant
from .vector_service import VectorService
import json

logger = logging.getLogger(__name__)

class RAGEngine:
    """
    RAG (Retrieval-Augmented Generation) Engine
    Combines knowledge retrieval with LLM generation for intelligent responses
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.vector_service = VectorService(db_session)
        
        # Initialize OpenAI client
        if not openai.api_key:
            openai.api_key = os.getenv("OPENAI_API_KEY")
        
        # Default models
        self.default_chat_model = "gpt-4"
        self.fallback_chat_model = "gpt-3.5-turbo"
        
    async def create_chat_session(self, tenant_id: str, session_data: ChatSessionCreate) -> ChatSessionResponse:
        """Create a new chat session"""
        
        session = ChatSession(
            tenant_id=tenant_id,
            user_id=session_data.user_id,
            session_name=session_data.session_name,
            rag_config=session_data.rag_config.dict()
        )
        
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        
        logger.info(f"Created chat session {session.id} for tenant {tenant_id}")
        return ChatSessionResponse.from_orm(session)
    
    async def chat(self, tenant_id: str, request: ChatRequest) -> ChatResponse:
        """Process chat message with RAG"""
        
        start_time = time.time()
        
        # Get or create session
        if request.session_id:
            session = await self._get_session(tenant_id, request.session_id)
        else:
            # Create new session
            session_data = ChatSessionCreate(
                rag_config=request.rag_config
            )
            session_response = await self.create_chat_session(tenant_id, session_data)
            session = await self._get_session(tenant_id, session_response.id)
        
        try:
            # Get tenant information for personalization
            tenant = await self._get_tenant(tenant_id)
            
            # Retrieve relevant knowledge
            retrieved_chunks = await self._retrieve_knowledge(
                tenant_id, 
                request.message, 
                request.rag_config,
                session
            )
            
            # Build conversation context
            conversation_context = await self._build_conversation_context(
                session, 
                request.rag_config.conversation_context_length
            )
            
            # Generate response using LLM
            response_text = await self._generate_response(
                tenant,
                request.message,
                retrieved_chunks,
                conversation_context,
                request.rag_config
            )
            
            # Save message and response
            message = await self._save_chat_message(
                session.id,
                tenant_id,
                request.message,
                response_text,
                retrieved_chunks
            )
            
            # Update session stats
            await self._update_session_stats(session.id, message.tokens_used)
            
            response_time = int((time.time() - start_time) * 1000)
            
            return ChatResponse(
                message=request.message,
                response=response_text,
                session_id=session.id,
                message_id=message.id,
                retrieved_chunks=retrieved_chunks,
                tokens_used=message.tokens_used,
                response_time_ms=response_time
            )
            
        except Exception as e:
            logger.error(f"Chat failed: {e}")
            raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")
    
    async def _retrieve_knowledge(self, tenant_id: str, query: str, config: RAGConfig, session: ChatSession) -> List[RetrievedChunk]:
        """Retrieve relevant knowledge using vector search"""
        
        from .vector_service import SearchRequest
        
        # Enhance query with conversation context if available
        enhanced_query = await self._enhance_query_with_context(query, session, config)
        
        # Create search request
        search_request = SearchRequest(
            query=enhanced_query,
            config=config
        )
        
        # Perform search
        search_response = await self.vector_service.search_knowledge(tenant_id, search_request)
        
        return search_response.chunks
    
    async def _enhance_query_with_context(self, query: str, session: ChatSession, config: RAGConfig) -> str:
        """Enhance query with conversation context"""
        
        if config.conversation_context_length == 0:
            return query
        
        # Get recent messages for context
        recent_messages = await self.db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == session.id
            ).order_by(ChatMessage.created_at.desc()).limit(config.conversation_context_length)
        )
        
        messages = recent_messages.scalars().all()
        
        if not messages:
            return query
        
        # Build context string
        context_parts = []
        for msg in reversed(messages):  # Chronological order
            if msg.role == "user":
                context_parts.append(f"Previous question: {msg.message}")
            elif msg.role == "assistant" and msg.response:
                context_parts.append(f"Previous answer: {msg.response[:200]}...")
        
        if context_parts:
            enhanced_query = f"Context: {' '.join(context_parts[-2:])} Current question: {query}"
            return enhanced_query
        
        return query
    
    async def _build_conversation_context(self, session: ChatSession, context_length: int) -> List[Dict[str, str]]:
        """Build conversation context for LLM"""
        
        if context_length == 0:
            return []
        
        # Get recent messages
        recent_messages = await self.db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == session.id
            ).order_by(ChatMessage.created_at.desc()).limit(context_length * 2)  # *2 for user+assistant pairs
        )
        
        messages = recent_messages.scalars().all()
        
        # Build context in chronological order
        context = []
        for msg in reversed(messages):
            context.append({
                "role": msg.role,
                "content": msg.message if msg.role == "user" else msg.response
            })
        
        return context
    
    async def _generate_response(
        self, 
        tenant: Tenant, 
        user_message: str, 
        retrieved_chunks: List[RetrievedChunk],
        conversation_context: List[Dict[str, str]],
        config: RAGConfig
    ) -> str:
        """Generate response using LLM with retrieved context"""
        
        # Get tenant's questionnaire data for personalization
        questionnaire_data = await self._get_questionnaire_data(tenant.questionnaire_id)
        
        # Build system prompt
        system_prompt = self._build_system_prompt(tenant, questionnaire_data, retrieved_chunks)
        
        # Build context from retrieved knowledge
        knowledge_context = self._build_knowledge_context(retrieved_chunks)
        
        # Prepare messages for LLM
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add conversation context
        messages.extend(conversation_context)
        
        # Add current query with knowledge context
        user_prompt = f"""
Based on the following knowledge from our documentation:

{knowledge_context}

Please answer this question: {user_message}

Guidelines:
- Use the provided knowledge as your primary source
- If the knowledge doesn't contain the answer, say so clearly
- Maintain the communication style specified in the system prompt
- Be helpful and accurate
- Include relevant details from the knowledge base
"""
        
        messages.append({"role": "user", "content": user_prompt})
        
        try:
            # Try primary model
            response = await self._call_openai(messages, self.default_chat_model)
            return response
            
        except Exception as e:
            logger.warning(f"Primary model failed, trying fallback: {e}")
            try:
                # Try fallback model
                response = await self._call_openai(messages, self.fallback_chat_model)
                return response
            except Exception as e2:
                logger.error(f"Both models failed: {e2}")
                return self._generate_fallback_response(retrieved_chunks)
    
    def _build_system_prompt(self, tenant: Tenant, questionnaire_data: Dict, retrieved_chunks: List[RetrievedChunk]) -> str:
        """Build system prompt based on tenant configuration"""
        
        org_name = tenant.organization_name
        org_type = questionnaire_data.get("organizationType", "organization")
        industry = questionnaire_data.get("industry", "business")
        communication_style = questionnaire_data.get("communicationStyle", "professional")
        primary_purpose = questionnaire_data.get("primaryPurpose", "customer support")
        
        # Build knowledge source summary
        source_types = set()
        source_names = set()
        for chunk in retrieved_chunks:
            source_types.add(chunk.source_type)
            source_names.add(chunk.source_name)
        
        knowledge_summary = f"You have access to {len(retrieved_chunks)} pieces of information from {len(source_names)} sources including {', '.join(source_types)}."
        
        system_prompt = f"""You are an AI assistant for {org_name}, a {org_type} in the {industry} industry.

Your primary purpose is {primary_purpose}.

Communication Style: {communication_style}
- If friendly: Be warm, approachable, and use conversational language
- If professional: Be formal, precise, and business-focused
- If casual: Be relaxed, use informal language, and be personable
- If technical: Be detailed, use industry terminology, and be thorough

Knowledge Base: {knowledge_summary}

Key Instructions:
1. Always base your responses on the provided knowledge from {org_name}'s documentation
2. If information isn't in the knowledge base, clearly state this limitation
3. Maintain consistency with {org_name}'s communication style and values
4. Be helpful and aim to fully address the user's question
5. If appropriate, suggest related information or next steps
6. Never make up information that isn't in the provided knowledge base

Remember: You represent {org_name} and should maintain their professional standards while being genuinely helpful to users.
"""
        
        return system_prompt
    
    def _build_knowledge_context(self, retrieved_chunks: List[RetrievedChunk]) -> str:
        """Build knowledge context from retrieved chunks"""
        
        if not retrieved_chunks:
            return "No relevant information found in the knowledge base."
        
        context_parts = []
        
        for i, chunk in enumerate(retrieved_chunks, 1):
            source_info = f"Source: {chunk.source_name} ({chunk.source_type})"
            if chunk.title:
                source_info += f" - {chunk.title}"
            
            context_part = f"""
[Knowledge {i}] {source_info}
Relevance Score: {chunk.similarity_score:.2f}

{chunk.content}

---
"""
            context_parts.append(context_part)
        
        return "\n".join(context_parts)
    
    async def _call_openai(self, messages: List[Dict], model: str) -> str:
        """Call OpenAI API"""
        
        try:
            response = await openai.ChatCompletion.acreate(
                model=model,
                messages=messages,
                max_tokens=1000,
                temperature=0.7,
                timeout=30
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"OpenAI API call failed: {e}")
            raise
    
    def _generate_fallback_response(self, retrieved_chunks: List[RetrievedChunk]) -> str:
        """Generate fallback response when LLM is unavailable"""
        
        if not retrieved_chunks:
            return "I apologize, but I couldn't find relevant information in our knowledge base to answer your question. Please try rephrasing your question or contact our support team for assistance."
        
        # Simple template-based response
        response = "Based on our documentation, here's what I found:\n\n"
        
        for chunk in retrieved_chunks[:3]:  # Top 3 chunks
            response += f"From {chunk.source_name}:\n{chunk.content[:300]}...\n\n"
        
        response += "For more detailed information, please refer to our complete documentation or contact our support team."
        
        return response
    
    async def _save_chat_message(
        self, 
        session_id: str, 
        tenant_id: str,
        user_message: str,
        response: str,
        retrieved_chunks: List[RetrievedChunk]
    ) -> ChatMessage:
        """Save chat message and response to database"""
        
        # Calculate token usage (rough estimation)
        tokens_used = len(user_message.split()) + len(response.split()) + sum(len(chunk.content.split()) for chunk in retrieved_chunks)
        
        # Prepare chunk data for storage
        chunk_ids = [chunk.chunk_id for chunk in retrieved_chunks]
        similarity_scores = [chunk.similarity_score for chunk in retrieved_chunks]
        
        # Save user message
        user_message_obj = ChatMessage(
            session_id=session_id,
            tenant_id=tenant_id,
            message=user_message,
            role="user",
            tokens_used=0  # Only count tokens for assistant responses
        )
        
        self.db.add(user_message_obj)
        
        # Save assistant response
        assistant_message = ChatMessage(
            session_id=session_id,
            tenant_id=tenant_id,
            message=user_message,  # Keep original question for context
            response=response,
            role="assistant",
            retrieved_chunks=chunk_ids,
            similarity_scores=similarity_scores,
            tokens_used=tokens_used,
            response_time_ms=0  # Will be calculated by caller
        )
        
        self.db.add(assistant_message)
        await self.db.commit()
        await self.db.refresh(assistant_message)
        
        return assistant_message
    
    async def _update_session_stats(self, session_id: str, tokens_used: int):
        """Update session statistics"""
        
        await self.db.execute(
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(
                message_count=ChatSession.message_count + 1,
                total_tokens_used=ChatSession.total_tokens_used + tokens_used,
                last_activity=func.now()
            )
        )
        await self.db.commit()
    
    async def _get_session(self, tenant_id: str, session_id: str) -> ChatSession:
        """Get chat session by ID"""
        
        result = await self.db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.tenant_id == tenant_id
            )
        )
        
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        return session
    
    async def _get_tenant(self, tenant_id: str) -> Tenant:
        """Get tenant information"""
        
        result = await self.db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        return tenant
    
    async def _get_questionnaire_data(self, questionnaire_id: Optional[str]) -> Dict[str, Any]:
        """Get questionnaire data for tenant personalization"""
        
        if not questionnaire_id:
            return {}
        
        try:
            # Get from SQLite (legacy storage)
            import sqlite3
            
            conn = sqlite3.connect('questionnaire_responses.db')
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT raw_json FROM questionnaire_responses WHERE id = ?",
                (questionnaire_id,)
            )
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return json.loads(result[0])
            
        except Exception as e:
            logger.warning(f"Failed to get questionnaire data: {e}")
        
        return {}
    
    async def get_chat_sessions(self, tenant_id: str, user_id: Optional[str] = None) -> List[ChatSessionResponse]:
        """Get chat sessions for tenant"""
        
        query = select(ChatSession).where(ChatSession.tenant_id == tenant_id)
        
        if user_id:
            query = query.where(ChatSession.user_id == user_id)
        
        query = query.order_by(ChatSession.last_activity.desc())
        
        result = await self.db.execute(query)
        sessions = result.scalars().all()
        
        return [ChatSessionResponse.from_orm(session) for session in sessions]
    
    async def get_chat_history(self, tenant_id: str, session_id: str, limit: int = 50) -> List[ChatMessageResponse]:
        """Get chat history for a session"""
        
        # Verify session belongs to tenant
        await self._get_session(tenant_id, session_id)
        
        result = await self.db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == session_id
            ).order_by(ChatMessage.created_at.desc()).limit(limit)
        )
        
        messages = result.scalars().all()
        
        return [ChatMessageResponse.from_orm(msg) for msg in reversed(messages)]
    
    async def update_message_feedback(self, tenant_id: str, message_id: str, feedback_score: float):
        """Update feedback score for a message"""
        
        # Verify message belongs to tenant
        result = await self.db.execute(
            select(ChatMessage).where(
                ChatMessage.id == message_id,
                ChatMessage.tenant_id == tenant_id
            )
        )
        
        message = result.scalar_one_or_none()
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Update feedback
        message.feedback_score = feedback_score
        await self.db.commit()
        
        logger.info(f"Updated feedback for message {message_id}: {feedback_score}")
    
    async def delete_chat_session(self, tenant_id: str, session_id: str):
        """Delete a chat session and all its messages"""
        
        session = await self._get_session(tenant_id, session_id)
        
        # Delete all messages (cascade should handle this, but explicit is better)
        await self.db.execute(
            f"DELETE FROM chat_messages WHERE session_id = '{session_id}'"
        )
        
        # Delete session
        await self.db.delete(session)
        await self.db.commit()
        
        logger.info(f"Deleted chat session {session_id}")
    
    async def get_rag_analytics(self, tenant_id: str, days: int = 30) -> Dict[str, Any]:
        """Get RAG analytics for tenant"""
        
        from datetime import datetime, timedelta
        
        start_date = datetime.now() - timedelta(days=days)
        
        # Get message statistics
        messages_result = await self.db.execute(f"""
            SELECT 
                COUNT(*) as total_messages,
                AVG(response_time_ms) as avg_response_time,
                AVG(tokens_used) as avg_tokens,
                AVG(feedback_score) as avg_feedback
            FROM chat_messages 
            WHERE tenant_id = '{tenant_id}' 
            AND created_at >= '{start_date}'
            AND role = 'assistant'
        """)
        
        stats = messages_result.fetchone()
        
        # Get top queries
        top_queries_result = await self.db.execute(f"""
            SELECT message, COUNT(*) as frequency
            FROM chat_messages 
            WHERE tenant_id = '{tenant_id}' 
            AND created_at >= '{start_date}'
            AND role = 'user'
            GROUP BY message
            ORDER BY frequency DESC
            LIMIT 10
        """)
        
        top_queries = [{"query": row[0], "frequency": row[1]} for row in top_queries_result.fetchall()]
        
        # Get chunk usage statistics
        chunk_usage_result = await self.db.execute(f"""
            SELECT 
                json_array_elements_text(retrieved_chunks::json) as chunk_id,
                COUNT(*) as usage_count
            FROM chat_messages 
            WHERE tenant_id = '{tenant_id}' 
            AND created_at >= '{start_date}'
            AND retrieved_chunks IS NOT NULL
            GROUP BY chunk_id
            ORDER BY usage_count DESC
            LIMIT 20
        """)
        
        chunk_usage = {row[0]: row[1] for row in chunk_usage_result.fetchall()}
        
        return {
            "total_messages": stats[0] or 0,
            "avg_response_time_ms": stats[1] or 0,
            "avg_tokens_per_message": stats[2] or 0,
            "avg_feedback_score": stats[3] or 0,
            "top_queries": top_queries,
            "chunk_usage_stats": chunk_usage,
            "analysis_period_days": days
        }

class RAGOrchestrator:
    """
    High-level orchestrator for RAG operations
    Manages the complete flow from content ingestion to chat responses
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.rag_engine = RAGEngine(db_session)
        self.vector_service = VectorService(db_session)
    
    async def setup_tenant_rag(self, tenant_id: str, questionnaire_data: Dict[str, Any]) -> Dict[str, str]:
        """Set up complete RAG system for a new tenant"""
        
        logger.info(f"Setting up RAG system for tenant {tenant_id}")
        
        try:
            # Create vector collection
            from ..models.vector import VectorCollectionCreate, VectorProvider, EmbeddingModel
            
            collection_data = VectorCollectionCreate(
                name=f"{questionnaire_data.get('organizationName', 'default')}_knowledge",
                provider=VectorProvider.WEAVIATE,  # Default provider
                embedding_model=EmbeddingModel.OPENAI_ADA_002,
                config={
                    "description": f"Knowledge base for {questionnaire_data.get('organizationName')}",
                    "industry": questionnaire_data.get("industry"),
                    "communication_style": questionnaire_data.get("communicationStyle")
                }
            )
            
            collection = await self.vector_service.create_collection(tenant_id, collection_data)
            
            # Create default chat session template
            default_rag_config = self._build_default_rag_config(questionnaire_data)
            
            return {
                "collection_id": collection.id,
                "status": "ready",
                "message": "RAG system successfully configured",
                "next_steps": "Upload content sources to begin building knowledge base"
            }
            
        except Exception as e:
            logger.error(f"Failed to setup RAG for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail=f"RAG setup failed: {str(e)}")
    
    def _build_default_rag_config(self, questionnaire_data: Dict[str, Any]) -> Dict[str, Any]:
        """Build default RAG configuration based on questionnaire"""
        
        # Customize based on organization type and purpose
        org_type = questionnaire_data.get("organizationType", "")
        primary_purpose = questionnaire_data.get("primaryPurpose", "")
        communication_style = questionnaire_data.get("communicationStyle", "professional")
        
        # Default configuration
        config = {
            "search_strategy": "semantic",
            "max_chunks": 5,
            "similarity_threshold": 0.7,
            "chunk_overlap": True,
            "rerank_results": True,
            "include_metadata": True,
            "conversation_context_length": 3
        }
        
        # Adjust based on use case
        if "support" in primary_purpose.lower():
            config["max_chunks"] = 7  # More context for support
            config["similarity_threshold"] = 0.6  # More permissive for support
        
        if "sales" in primary_purpose.lower():
            config["search_strategy"] = "hybrid"  # Better for product queries
            config["conversation_context_length"] = 5  # More context for sales flow
        
        if communication_style == "technical":
            config["max_chunks"] = 10  # More detailed technical responses
            config["include_metadata"] = True
        
        return config
    
    async def process_content_for_rag(self, tenant_id: str, source_ids: List[str]) -> Dict[str, Any]:
        """Process content sources for RAG (embed and index)"""
        
        # Get tenant's vector collection
        result = await self.db.execute(
            select(VectorCollection).where(
                VectorCollection.tenant_id == tenant_id
            ).order_by(VectorCollection.created_at.desc()).limit(1)
        )
        
        collection = result.scalar_one_or_none()
        if not collection:
            raise HTTPException(status_code=404, detail="No vector collection found. Set up RAG system first.")
        
        # Get chunks from content sources
        chunks_result = await self.db.execute(
            select(ContentChunk).where(
                ContentChunk.source_id.in_(source_ids),
                ContentChunk.tenant_id == tenant_id
            )
        )
        
        chunks = chunks_result.scalars().all()
        chunk_ids = [chunk.id for chunk in chunks]
        
        if not chunk_ids:
            raise HTTPException(status_code=404, detail="No content chunks found for specified sources")
        
        # Start embedding job
        job_id = await self.vector_service.embed_content_chunks(
            tenant_id, 
            collection.id, 
            chunk_ids
        )
        
        return {
            "job_id": job_id,
            "collection_id": collection.id,
            "chunks_to_process": len(chunk_ids),
            "status": "processing",
            "message": f"Started embedding {len(chunk_ids)} content chunks"
        }
    
    async def test_rag_system(self, tenant_id: str, test_questions: List[str]) -> Dict[str, Any]:
        """Test RAG system with sample questions"""
        
        results = []
        
        for question in test_questions:
            try:
                # Create test chat request
                from ..models.vector import ChatRequest, RAGConfig
                
                chat_request = ChatRequest(
                    message=question,
                    rag_config=RAGConfig()
                )
                
                # Get response
                response = await self.rag_engine.chat(tenant_id, chat_request)
                
                results.append({
                    "question": question,
                    "response": response.response,
                    "chunks_found": len(response.retrieved_chunks),
                    "response_time_ms": response.response_time_ms,
                    "status": "success"
                })
                
            except Exception as e:
                results.append({
                    "question": question,
                    "error": str(e),
                    "status": "failed"
                })
        
        return {
            "test_results": results,
            "success_rate": len([r for r in results if r["status"] == "success"]) / len(results),
            "total_questions": len(test_questions)
        }