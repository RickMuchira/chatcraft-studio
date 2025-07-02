# backend/services/deployment_service.py
import asyncio
import logging
import hashlib
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_
from fastapi import HTTPException
from datetime import datetime, timedelta
import secrets
import re

from ..models.deployment import (
    ChatbotDeployment, DeploymentConversation, DeploymentMessage,
    DeploymentType, DeploymentStatus, WidgetStyling, DeploymentConfigData,
    ChatbotDeploymentCreate, ChatbotDeploymentResponse, WidgetEmbedCode,
    DeploymentAnalytics, ChatRequest, ChatResponse, DeploymentStats
)
from ..models.chatbot import ChatbotConfig
from ..models.content import Tenant
from .chatbot_service import ChatbotConfigService
from .rag_engine import RAGEngine

logger = logging.getLogger(__name__)

class DeploymentService:
    """Service for managing chatbot deployments and widgets"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.chatbot_service = ChatbotConfigService(db_session)
        self.rag_engine = RAGEngine(db_session)
    
    async def create_deployment(self, tenant_id: str, deployment_data: ChatbotDeploymentCreate) -> ChatbotDeploymentResponse:
        """Create a new chatbot deployment"""
        
        # Verify chatbot config exists and belongs to tenant
        config_result = await self.db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.id == deployment_data.config_id,
                ChatbotConfig.tenant_id == tenant_id
            )
        )
        config = config_result.scalar_one_or_none()
        
        if not config:
            raise HTTPException(status_code=404, detail="Chatbot configuration not found")
        
        # Generate unique identifiers
        widget_id = self._generate_widget_id(tenant_id, deployment_data.name)
        api_key = self._generate_api_key()
        
        # Create deployment URL
        deployment_url = self._generate_deployment_url(deployment_data.deployment_type, widget_id)
        
        # Set default widget styling for web widgets
        widget_styling = deployment_data.widget_styling
        if deployment_data.deployment_type == DeploymentType.WEB_WIDGET and not widget_styling:
            widget_styling = WidgetStyling()
        
        # Create deployment
        deployment = ChatbotDeployment(
            tenant_id=tenant_id,
            config_id=deployment_data.config_id,
            name=deployment_data.name,
            description=deployment_data.description,
            deployment_type=deployment_data.deployment_type,
            deployment_url=deployment_url,
            widget_id=widget_id,
            api_key=api_key,
            deployment_config=deployment_data.deployment_config.dict(),
            widget_styling=widget_styling.dict() if widget_styling else {},
            allowed_domains=deployment_data.allowed_domains,
            custom_domain=deployment_data.custom_domain,
            status=DeploymentStatus.DRAFT
        )
        
        self.db.add(deployment)
        await self.db.commit()
        await self.db.refresh(deployment)
        
        logger.info(f"Created deployment {deployment.id} for tenant {tenant_id}")
        return ChatbotDeploymentResponse.from_orm(deployment)
    
    async def get_deployments(self, tenant_id: str, deployment_type: Optional[DeploymentType] = None) -> List[ChatbotDeploymentResponse]:
        """Get all deployments for a tenant"""
        
        query = select(ChatbotDeployment).where(ChatbotDeployment.tenant_id == tenant_id)
        
        if deployment_type:
            query = query.where(ChatbotDeployment.deployment_type == deployment_type)
        
        query = query.order_by(ChatbotDeployment.created_at.desc())
        
        result = await self.db.execute(query)
        deployments = result.scalars().all()
        
        return [ChatbotDeploymentResponse.from_orm(deployment) for deployment in deployments]
    
    async def get_deployment(self, tenant_id: str, deployment_id: str) -> ChatbotDeploymentResponse:
        """Get specific deployment"""
        
        result = await self.db.execute(
            select(ChatbotDeployment).where(
                ChatbotDeployment.id == deployment_id,
                ChatbotDeployment.tenant_id == tenant_id
            )
        )
        
        deployment = result.scalar_one_or_none()
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        return ChatbotDeploymentResponse.from_orm(deployment)
    
    async def update_deployment(self, tenant_id: str, deployment_id: str, update_data: Dict[str, Any]) -> ChatbotDeploymentResponse:
        """Update deployment configuration"""
        
        result = await self.db.execute(
            select(ChatbotDeployment).where(
                ChatbotDeployment.id == deployment_id,
                ChatbotDeployment.tenant_id == tenant_id
            )
        )
        
        deployment = result.scalar_one_or_none()
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        # Update fields
        for field, value in update_data.items():
            if hasattr(deployment, field) and value is not None:
                setattr(deployment, field, value)
        
        deployment.updated_at = datetime.now()
        await self.db.commit()
        await self.db.refresh(deployment)
        
        return ChatbotDeploymentResponse.from_orm(deployment)
    
    async def deploy_chatbot(self, tenant_id: str, deployment_id: str) -> ChatbotDeploymentResponse:
        """Activate a chatbot deployment"""
        
        deployment = await self.get_deployment(tenant_id, deployment_id)
        
        # Validate deployment configuration
        await self._validate_deployment_config(deployment)
        
        # Update status to active
        updated_deployment = await self.update_deployment(tenant_id, deployment_id, {
            "status": DeploymentStatus.ACTIVE,
            "deployed_at": datetime.now()
        })
        
        logger.info(f"Deployed chatbot {deployment_id} for tenant {tenant_id}")
        return updated_deployment
    
    async def pause_deployment(self, tenant_id: str, deployment_id: str) -> ChatbotDeploymentResponse:
        """Pause a deployment"""
        return await self.update_deployment(tenant_id, deployment_id, {
            "status": DeploymentStatus.PAUSED
        })
    
    async def stop_deployment(self, tenant_id: str, deployment_id: str) -> ChatbotDeploymentResponse:
        """Stop a deployment"""
        return await self.update_deployment(tenant_id, deployment_id, {
            "status": DeploymentStatus.STOPPED
        })
    
    async def delete_deployment(self, tenant_id: str, deployment_id: str):
        """Delete a deployment and all its data"""
        
        result = await self.db.execute(
            select(ChatbotDeployment).where(
                ChatbotDeployment.id == deployment_id,
                ChatbotDeployment.tenant_id == tenant_id
            )
        )
        
        deployment = result.scalar_one_or_none()
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        # Delete deployment (conversations and messages will cascade)
        await self.db.delete(deployment)
        await self.db.commit()
        
        logger.info(f"Deleted deployment {deployment_id}")
    
    async def generate_widget_embed_code(self, tenant_id: str, deployment_id: str) -> WidgetEmbedCode:
        """Generate embed code for web widget"""
        
        deployment = await self.get_deployment(tenant_id, deployment_id)
        
        if deployment.deployment_type != DeploymentType.WEB_WIDGET:
            raise HTTPException(status_code=400, detail="Embed code only available for web widgets")
        
        # Generate embed code
        widget_config = {
            "widgetId": deployment.widget_id,
            "apiUrl": f"/api/widget/{deployment.widget_id}",
            "styling": deployment.widget_styling,
            "config": deployment.deployment_config
        }
        
        script_url = f"/static/widget/chatcraft-widget.js"
        
        embed_code = f"""<!-- ChatCraft Studio Widget -->
<script>
  window.ChatCraftConfig = {json.dumps(widget_config, indent=2)};
</script>
<script src="{script_url}" async></script>
<!-- End ChatCraft Studio Widget -->"""
        
        instructions = [
            "Copy the embed code above",
            "Paste it before the closing </body> tag on your website",
            "The widget will automatically appear on your page",
            "Customize the appearance in the deployment settings",
            "Monitor conversations in your ChatCraft dashboard"
        ]
        
        return WidgetEmbedCode(
            widget_id=deployment.widget_id,
            embed_code=embed_code,
            script_url=script_url,
            config_json=json.dumps(widget_config, indent=2),
            instructions=instructions
        )
    
    async def handle_widget_chat(self, widget_id: str, chat_request: ChatRequest) -> ChatResponse:
        """Handle chat request from widget"""
        
        # Get deployment by widget ID
        result = await self.db.execute(
            select(ChatbotDeployment).where(
                ChatbotDeployment.widget_id == widget_id,
                ChatbotDeployment.status == DeploymentStatus.ACTIVE
            )
        )
        
        deployment = result.scalar_one_or_none()
        if not deployment:
            raise HTTPException(status_code=404, detail="Widget not found or inactive")
        
        # Rate limiting check
        if not await self._check_rate_limit(deployment, chat_request.session_id):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        
        # Domain validation
        if deployment.allowed_domains and chat_request.page_url:
            if not self._validate_domain(chat_request.page_url, deployment.allowed_domains):
                raise HTTPException(status_code=403, detail="Domain not allowed")
        
        start_time = datetime.now()
        
        try:
            # Get or create conversation
            conversation = await self._get_or_create_conversation(deployment, chat_request)
            
            # Get chatbot configuration and generate response
            config = await self.chatbot_service.get_chatbot_config(deployment.tenant_id, deployment.config_id)
            
            # Use RAG engine to generate response
            from ..models.vector import ChatRequest as RAGChatRequest, RAGConfig
            
            rag_request = RAGChatRequest(
                message=chat_request.message,
                session_id=conversation.id,
                rag_config=RAGConfig()
            )
            
            rag_response = await self.rag_engine.chat(deployment.tenant_id, rag_request)
            
            # Calculate response time
            response_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # Save message and response
            message = await self._save_deployment_message(
                conversation, 
                chat_request.message, 
                rag_response.response,
                rag_response.retrieved_chunks,
                response_time,
                rag_response.tokens_used
            )
            
            # Update deployment statistics
            await self._update_deployment_stats(deployment.id)
            
            # Generate suggested replies if configured
            suggested_replies = await self._generate_suggested_replies(deployment, rag_response.response)
            
            return ChatResponse(
                message=chat_request.message,
                response=rag_response.response,
                conversation_id=conversation.id,
                message_id=message.id,
                response_time_ms=response_time,
                tokens_used=rag_response.tokens_used,
                retrieved_sources=[
                    {"title": chunk.title or "Knowledge Base", "source": chunk.source_name}
                    for chunk in rag_response.retrieved_chunks
                ],
                suggested_replies=suggested_replies
            )
            
        except Exception as e:
            logger.error(f"Widget chat error for {widget_id}: {e}")
            
            # Return fallback response
            fallback_response = "I apologize, but I'm experiencing technical difficulties. Please try again in a moment or contact our support team."
            
            return ChatResponse(
                message=chat_request.message,
                response=fallback_response,
                conversation_id=chat_request.conversation_id or "error",
                message_id="error",
                response_time_ms=int((datetime.now() - start_time).total_seconds() * 1000),
                tokens_used=0,
                retrieved_sources=[]
            )
    
    async def get_deployment_analytics(self, tenant_id: str, deployment_id: str, days: int = 30) -> DeploymentAnalytics:
        """Get analytics for a deployment"""
        
        deployment = await self.get_deployment(tenant_id, deployment_id)
        start_date = datetime.now() - timedelta(days=days)
        
        # Get conversation metrics
        conversations_result = await self.db.execute(
            select(
                func.count(DeploymentConversation.id).label('total'),
                func.count(func.distinct(DeploymentConversation.user_id)).label('unique_users')
            ).where(
                DeploymentConversation.deployment_id == deployment_id,
                DeploymentConversation.started_at >= start_date
            )
        )
        
        conv_stats = conversations_result.fetchone()
        
        # Get message metrics
        messages_result = await self.db.execute(
            select(
                func.count(DeploymentMessage.id).label('total_messages'),
                func.avg(DeploymentMessage.response_time_ms).label('avg_response_time'),
                func.avg(DeploymentMessage.feedback_score).label('avg_satisfaction')
            ).where(
                DeploymentMessage.deployment_id == deployment_id,
                DeploymentMessage.created_at >= start_date,
                DeploymentMessage.role == 'assistant'
            )
        )
        
        msg_stats = messages_result.fetchone()
        
        # Get popular queries
        popular_queries_result = await self.db.execute(
            select(
                DeploymentMessage.message,
                func.count(DeploymentMessage.id).label('frequency')
            ).where(
                DeploymentMessage.deployment_id == deployment_id,
                DeploymentMessage.created_at >= start_date,
                DeploymentMessage.role == 'user'
            ).group_by(DeploymentMessage.message).order_by(
                func.count(DeploymentMessage.id).desc()
            ).limit(10)
        )
        
        popular_queries = [
            {"query": row[0], "frequency": row[1]}
            for row in popular_queries_result.fetchall()
        ]
        
        # Calculate metrics
        total_conversations = conv_stats[0] or 0
        unique_users = conv_stats[1] or 0
        total_messages = msg_stats[0] or 0
        avg_response_time = msg_stats[1] or 0
        satisfaction_score = msg_stats[2]
        
        avg_messages_per_conv = total_messages / total_conversations if total_conversations > 0 else 0
        
        return DeploymentAnalytics(
            deployment_id=deployment_id,
            period_days=days,
            total_conversations=total_conversations,
            new_conversations=total_conversations,  # Simplified
            returning_users=0,  # Would need more complex tracking
            total_messages=total_messages,
            avg_messages_per_conversation=avg_messages_per_conv,
            avg_response_time_ms=avg_response_time,
            satisfaction_score=satisfaction_score,
            feedback_count=0,  # Count feedback messages
            peak_hours=[],  # Would analyze by hour
            popular_pages=[],  # Would analyze page_url
            common_queries=popular_queries,
            error_rate=0.0,  # Would track errors
            uptime_percentage=99.9  # Would track from monitoring
        )
    
    async def get_deployment_stats(self, tenant_id: str) -> DeploymentStats:
        """Get overall deployment statistics for tenant"""
        
        # Total deployments
        total_result = await self.db.execute(
            select(func.count(ChatbotDeployment.id)).where(
                ChatbotDeployment.tenant_id == tenant_id
            )
        )
        total_deployments = total_result.scalar() or 0
        
        # Active deployments
        active_result = await self.db.execute(
            select(func.count(ChatbotDeployment.id)).where(
                ChatbotDeployment.tenant_id == tenant_id,
                ChatbotDeployment.status == DeploymentStatus.ACTIVE
            )
        )
        active_deployments = active_result.scalar() or 0
        
        # Deployments by type
        by_type_result = await self.db.execute(
            select(
                ChatbotDeployment.deployment_type,
                func.count(ChatbotDeployment.id)
            ).where(
                ChatbotDeployment.tenant_id == tenant_id
            ).group_by(ChatbotDeployment.deployment_type)
        )
        
        deployments_by_type = {row[0]: row[1] for row in by_type_result.fetchall()}
        
        # Today's activity
        today = datetime.now().date()
        today_start = datetime.combine(today, datetime.min.time())
        
        conversations_today_result = await self.db.execute(
            select(func.count(DeploymentConversation.id)).where(
                DeploymentConversation.tenant_id == tenant_id,
                DeploymentConversation.started_at >= today_start
            )
        )
        conversations_today = conversations_today_result.scalar() or 0
        
        messages_today_result = await self.db.execute(
            select(func.count(DeploymentMessage.id)).where(
                DeploymentMessage.tenant_id == tenant_id,
                DeploymentMessage.created_at >= today_start
            )
        )
        messages_today = messages_today_result.scalar() or 0
        
        # Average satisfaction
        satisfaction_result = await self.db.execute(
            select(func.avg(DeploymentMessage.feedback_score)).where(
                DeploymentMessage.tenant_id == tenant_id,
                DeploymentMessage.feedback_score.isnot(None)
            )
        )
        avg_satisfaction = satisfaction_result.scalar()
        
        return DeploymentStats(
            total_deployments=total_deployments,
            active_deployments=active_deployments,
            deployments_by_type=deployments_by_type,
            total_conversations_today=conversations_today,
            total_messages_today=messages_today,
            average_satisfaction=avg_satisfaction
        )
    
    # Private helper methods
    def _generate_widget_id(self, tenant_id: str, deployment_name: str) -> str:
        """Generate unique widget ID"""
        # Create deterministic but unique ID
        source = f"{tenant_id}:{deployment_name}:{datetime.now().isoformat()}"
        hash_object = hashlib.md5(source.encode())
        return f"ccs_{hash_object.hexdigest()[:12]}"
    
    def _generate_api_key(self) -> str:
        """Generate API key for deployment"""
        return f"ccs_key_{secrets.token_urlsafe(32)}"
    
    def _generate_deployment_url(self, deployment_type: DeploymentType, widget_id: str) -> str:
        """Generate deployment URL"""
        base_url = "https://api.chatcraft.studio"  # Configure this
        
        if deployment_type == DeploymentType.WEB_WIDGET:
            return f"{base_url}/widget/{widget_id}"
        elif deployment_type == DeploymentType.API:
            return f"{base_url}/api/chat/{widget_id}"
        else:
            return f"{base_url}/deploy/{deployment_type.value}/{widget_id}"
    
    async def _validate_deployment_config(self, deployment: ChatbotDeploymentResponse):
        """Validate deployment configuration before activation"""
        
        # Check if chatbot config is valid
        try:
            config = await self.chatbot_service.get_chatbot_config(deployment.tenant_id, deployment.config_id)
            if not config.is_active:
                raise HTTPException(status_code=400, detail="Chatbot configuration is not active")
        except:
            raise HTTPException(status_code=400, detail="Invalid chatbot configuration")
        
        # Validate widget styling for web widgets
        if deployment.deployment_type == DeploymentType.WEB_WIDGET:
            if not deployment.widget_styling:
                raise HTTPException(status_code=400, detail="Widget styling required for web widgets")
        
        # Validate domains if specified
        if deployment.deployment_config.get("allowed_domains"):
            for domain in deployment.deployment_config["allowed_domains"]:
                if not self._is_valid_domain(domain):
                    raise HTTPException(status_code=400, detail=f"Invalid domain: {domain}")
    
    def _is_valid_domain(self, domain: str) -> bool:
        """Validate domain format"""
        domain_pattern = re.compile(
            r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?
        )
        return bool(domain_pattern.match(domain))
    
    def _validate_domain(self, url: str, allowed_domains: List[str]) -> bool:
        """Check if URL domain is in allowed list"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            
            # Remove port if present
            domain = domain.split(':')[0]
            
            # Check exact match or subdomain match
            for allowed in allowed_domains:
                allowed = allowed.lower()
                if domain == allowed or domain.endswith(f'.{allowed}'):
                    return True
            
            return False
        except:
            return False
    
    async def _check_rate_limit(self, deployment: ChatbotDeployment, session_id: str) -> bool:
        """Check if request is within rate limits"""
        
        if not deployment.deployment_config.get("rate_limit_enabled", True):
            return True
        
        rate_limit = deployment.rate_limit_per_hour
        current_hour = datetime.now().replace(minute=0, second=0, microsecond=0)
        
        # Count messages from this session in current hour
        messages_count_result = await self.db.execute(
            select(func.count(DeploymentMessage.id)).where(
                DeploymentMessage.deployment_id == deployment.id,
                DeploymentMessage.created_at >= current_hour,
                DeploymentConversation.session_id == session_id
            ).join(DeploymentConversation)
        )
        
        messages_count = messages_count_result.scalar() or 0
        return messages_count < rate_limit
    
    async def _get_or_create_conversation(self, deployment: ChatbotDeployment, chat_request: ChatRequest) -> DeploymentConversation:
        """Get existing conversation or create new one"""
        
        conversation = None
        
        # Try to find existing conversation by ID
        if chat_request.conversation_id:
            conv_result = await self.db.execute(
                select(DeploymentConversation).where(
                    DeploymentConversation.id == chat_request.conversation_id,
                    DeploymentConversation.deployment_id == deployment.id
                )
            )
            conversation = conv_result.scalar_one_or_none()
        
        # Try to find by session ID (recent conversation)
        if not conversation:
            recent_conv_result = await self.db.execute(
                select(DeploymentConversation).where(
                    DeploymentConversation.deployment_id == deployment.id,
                    DeploymentConversation.session_id == chat_request.session_id,
                    DeploymentConversation.started_at >= datetime.now() - timedelta(hours=24)
                ).order_by(DeploymentConversation.started_at.desc()).limit(1)
            )
            conversation = recent_conv_result.scalar_one_or_none()
        
        # Create new conversation if none found
        if not conversation:
            conversation = DeploymentConversation(
                deployment_id=deployment.id,
                tenant_id=deployment.tenant_id,
                user_id=chat_request.user_id,
                session_id=chat_request.session_id,
                user_agent=chat_request.user_agent,
                referrer_url=chat_request.referrer_url,
                page_url=chat_request.page_url
            )
            
            self.db.add(conversation)
            await self.db.commit()
            await self.db.refresh(conversation)
        
        return conversation
    
    async def _save_deployment_message(self, conversation: DeploymentConversation, 
                                     user_message: str, assistant_response: str,
                                     retrieved_chunks: List[Any], response_time_ms: int,
                                     tokens_used: int) -> DeploymentMessage:
        """Save message and response to database"""
        
        # Save user message
        user_msg = DeploymentMessage(
            conversation_id=conversation.id,
            deployment_id=conversation.deployment_id,
            tenant_id=conversation.tenant_id,
            message=user_message,
            role="user"
        )
        self.db.add(user_msg)
        
        # Save assistant response
        assistant_msg = DeploymentMessage(
            conversation_id=conversation.id,
            deployment_id=conversation.deployment_id,
            tenant_id=conversation.tenant_id,
            message=user_message,  # Keep original question for context
            response=assistant_response,
            role="assistant",
            retrieved_chunks=[chunk.chunk_id for chunk in retrieved_chunks],
            similarity_scores=[chunk.similarity_score for chunk in retrieved_chunks],
            response_time_ms=response_time_ms,
            tokens_used=tokens_used
        )
        self.db.add(assistant_msg)
        
        # Update conversation stats
        conversation.message_count += 2  # User + assistant
        conversation.ended_at = datetime.now()  # Update last activity
        
        await self.db.commit()
        await self.db.refresh(assistant_msg)
        
        return assistant_msg
    
    async def _update_deployment_stats(self, deployment_id: str):
        """Update deployment statistics"""
        
        # Get current stats
        stats_result = await self.db.execute(
            select(
                func.count(func.distinct(DeploymentConversation.id)).label('conversations'),
                func.count(DeploymentMessage.id).label('messages'),
                func.count(func.distinct(DeploymentConversation.user_id)).label('unique_users'),
                func.avg(DeploymentMessage.feedback_score).label('avg_satisfaction')
            ).select_from(
                DeploymentConversation
            ).outerjoin(DeploymentMessage).where(
                DeploymentConversation.deployment_id == deployment_id
            )
        )
        
        stats = stats_result.fetchone()
        
        # Update deployment
        await self.db.execute(
            update(ChatbotDeployment).where(
                ChatbotDeployment.id == deployment_id
            ).values(
                total_conversations=stats[0] or 0,
                total_messages=stats[1] or 0,
                unique_users=stats[2] or 0,
                average_satisfaction=stats[3],
                last_activity=datetime.now()
            )
        )
        
        await self.db.commit()
    
    async def _generate_suggested_replies(self, deployment: ChatbotDeployment, response: str) -> List[str]:
        """Generate suggested replies based on deployment config and response"""
        
        config = deployment.deployment_config
        
        # Use configured quick replies if available
        if config.get("quick_replies"):
            return config["quick_replies"][:3]  # Limit to 3
        
        # Generate contextual suggestions based on response content
        suggestions = []
        
        # Common follow-up patterns
        if "contact" in response.lower() or "support" in response.lower():
            suggestions.append("How can I contact support?")
        
        if "price" in response.lower() or "cost" in response.lower():
            suggestions.append("What are your pricing options?")
        
        if "feature" in response.lower() or "how to" in response.lower():
            suggestions.append("Can you show me more features?")
        
        # Default suggestions
        if not suggestions:
            suggestions = [
                "Tell me more",
                "What else can you help with?", 
                "Thank you"
            ]
        
        return suggestions[:3]

class WebSocketManager:
    """Manages WebSocket connections for real-time chat"""
    
    def __init__(self):
        self.active_connections: Dict[str, List] = {}  # widget_id -> list of connections
        
    async def connect(self, websocket, widget_id: str, session_id: str):
        """Accept new WebSocket connection"""
        await websocket.accept()
        
        if widget_id not in self.active_connections:
            self.active_connections[widget_id] = []
        
        self.active_connections[widget_id].append({
            "websocket": websocket,
            "session_id": session_id,
            "connected_at": datetime.now()
        })
        
        logger.info(f"WebSocket connected: {widget_id}:{session_id}")
    
    def disconnect(self, widget_id: str, session_id: str):
        """Remove WebSocket connection"""
        if widget_id in self.active_connections:
            self.active_connections[widget_id] = [
                conn for conn in self.active_connections[widget_id]
                if conn["session_id"] != session_id
            ]
            
            if not self.active_connections[widget_id]:
                del self.active_connections[widget_id]
        
        logger.info(f"WebSocket disconnected: {widget_id}:{session_id}")
    
    async def send_message(self, widget_id: str, session_id: str, message: Dict[str, Any]):
        """Send message to specific session"""
        if widget_id in self.active_connections:
            for conn in self.active_connections[widget_id]:
                if conn["session_id"] == session_id:
                    try:
                        await conn["websocket"].send_json(message)
                    except:
                        # Connection broken, remove it
                        self.disconnect(widget_id, session_id)
    
    async def broadcast_to_widget(self, widget_id: str, message: Dict[str, Any]):
        """Broadcast message to all sessions for a widget"""
        if widget_id in self.active_connections:
            disconnected = []
            
            for conn in self.active_connections[widget_id]:
                try:
                    await conn["websocket"].send_json(message)
                except:
                    disconnected.append(conn["session_id"])
            
            # Clean up disconnected sessions
            for session_id in disconnected:
                self.disconnect(widget_id, session_id)

# Global WebSocket manager instance
websocket_manager = WebSocketManager()