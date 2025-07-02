# backend/services/chatbot_service.py
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from fastapi import HTTPException
import json
import re
from datetime import datetime

from ..models.chatbot import (
    ChatbotConfig, ChatbotDeployment, PromptTemplate,
    ChatbotPersonality, ResponseStyle, FallbackBehavior, LLMProvider,
    ChatbotConfigCreate, ChatbotConfigResponse, ChatbotPersonalityAnalysis,
    ChatbotMetrics, ChatbotTestRequest, ChatbotTestResponse
)
from ..models.content import Tenant
from ..models.vector import ChatSession, ChatMessage
from .llm_service import LLMService, SmartLLMRouter
from .rag_engine import RAGEngine

logger = logging.getLogger(__name__)

class PersonalityAnalyzer:
    """Analyzes questionnaire data to recommend chatbot personality"""
    
    def __init__(self):
        # Personality mapping rules based on questionnaire data
        self.personality_rules = {
            "organizationType": {
                "Healthcare": {"personality": ChatbotPersonality.EMPATHETIC, "weight": 0.8},
                "Education": {"personality": ChatbotPersonality.HELPFUL, "weight": 0.8},
                "Technology": {"personality": ChatbotPersonality.TECHNICAL, "weight": 0.7},
                "Finance": {"personality": ChatbotPersonality.PROFESSIONAL, "weight": 0.9},
                "Legal": {"personality": ChatbotPersonality.AUTHORITATIVE, "weight": 0.8},
                "Retail": {"personality": ChatbotPersonality.FRIENDLY, "weight": 0.7},
                "Non-profit": {"personality": ChatbotPersonality.EMPATHETIC, "weight": 0.7}
            },
            "communicationStyle": {
                "friendly": {"personality": ChatbotPersonality.FRIENDLY, "weight": 1.0},
                "professional": {"personality": ChatbotPersonality.PROFESSIONAL, "weight": 1.0},
                "casual": {"personality": ChatbotPersonality.CASUAL, "weight": 1.0},
                "technical": {"personality": ChatbotPersonality.TECHNICAL, "weight": 1.0},
                "empathetic": {"personality": ChatbotPersonality.EMPATHETIC, "weight": 1.0}
            },
            "primaryPurpose": {
                "Customer Support": {"style": ResponseStyle.STEP_BY_STEP, "fallback": FallbackBehavior.ESCALATE},
                "Sales": {"style": ResponseStyle.CONVERSATIONAL, "fallback": FallbackBehavior.REDIRECT},
                "Technical Support": {"style": ResponseStyle.DETAILED, "fallback": FallbackBehavior.ASK_CLARIFICATION},
                "Information": {"style": ResponseStyle.STRUCTURED, "fallback": FallbackBehavior.SUGGEST_ALTERNATIVES},
                "Lead Generation": {"style": ResponseStyle.CONVERSATIONAL, "fallback": FallbackBehavior.REDIRECT}
            }
        }
    
    def analyze_questionnaire(self, questionnaire_data: Dict[str, Any]) -> ChatbotPersonalityAnalysis:
        """Analyze questionnaire data and recommend personality settings"""
        
        # Score different personalities
        personality_scores = {p: 0.0 for p in ChatbotPersonality}
        style_scores = {s: 0.0 for s in ResponseStyle}
        fallback_scores = {f: 0.0 for f in FallbackBehavior}
        
        reasoning_parts = []
        
        # Analyze organization type
        org_type = questionnaire_data.get("organizationType", "")
        if org_type in self.personality_rules["organizationType"]:
            rule = self.personality_rules["organizationType"][org_type]
            personality = rule["personality"]
            weight = rule["weight"]
            personality_scores[personality] += weight
            reasoning_parts.append(f"Organization type '{org_type}' suggests {personality.value} personality")
        
        # Analyze communication style (highest weight)
        comm_style = questionnaire_data.get("communicationStyle", "").lower()
        if comm_style in self.personality_rules["communicationStyle"]:
            rule = self.personality_rules["communicationStyle"][comm_style]
            personality = rule["personality"]
            weight = rule["weight"]
            personality_scores[personality] += weight
            reasoning_parts.append(f"Communication style '{comm_style}' strongly indicates {personality.value} personality")
        
        # Analyze primary purpose for response style and fallback
        primary_purpose = questionnaire_data.get("primaryPurpose", "")
        if primary_purpose in self.personality_rules["primaryPurpose"]:
            rule = self.personality_rules["primaryPurpose"][primary_purpose]
            if "style" in rule:
                style_scores[rule["style"]] += 1.0
                reasoning_parts.append(f"Primary purpose '{primary_purpose}' suggests {rule['style'].value} response style")
            if "fallback" in rule:
                fallback_scores[rule["fallback"]] += 1.0
                reasoning_parts.append(f"Primary purpose '{primary_purpose}' suggests {rule['fallback'].value} fallback behavior")
        
        # Additional factors
        target_audience = questionnaire_data.get("targetAudience", [])
        if "customers" in [aud.lower() for aud in target_audience]:
            personality_scores[ChatbotPersonality.HELPFUL] += 0.3
            reasoning_parts.append("Customer-facing role adds helpful tendency")
        
        if "technical users" in [aud.lower() for aud in target_audience]:
            personality_scores[ChatbotPersonality.TECHNICAL] += 0.4
            style_scores[ResponseStyle.DETAILED] += 0.5
            reasoning_parts.append("Technical audience requires detailed, technical responses")
        
        # Determine winners
        recommended_personality = max(personality_scores, key=personality_scores.get)
        recommended_style = max(style_scores, key=style_scores.get) if any(style_scores.values()) else ResponseStyle.CONVERSATIONAL
        recommended_fallback = max(fallback_scores, key=fallback_scores.get) if any(fallback_scores.values()) else FallbackBehavior.APOLOGETIC
        
        # Calculate confidence score
        max_score = personality_scores[recommended_personality]
        total_score = sum(personality_scores.values())
        confidence_score = max_score / total_score if total_score > 0 else 0.5
        
        # Generate suggested prompts
        suggested_prompts = self._generate_suggested_prompts(
            questionnaire_data, 
            recommended_personality, 
            recommended_style
        )
        
        return ChatbotPersonalityAnalysis(
            recommended_personality=recommended_personality,
            recommended_style=recommended_style,
            recommended_fallback=recommended_fallback,
            confidence_score=confidence_score,
            reasoning=" | ".join(reasoning_parts),
            suggested_prompts=suggested_prompts
        )
    
    def _generate_suggested_prompts(self, questionnaire_data: Dict[str, Any], 
                                  personality: ChatbotPersonality, 
                                  style: ResponseStyle) -> Dict[str, str]:
        """Generate suggested prompts based on analysis"""
        
        org_name = questionnaire_data.get("organizationName", "our organization")
        org_type = questionnaire_data.get("organizationType", "organization")
        industry = questionnaire_data.get("industry", "business")
        primary_purpose = questionnaire_data.get("primaryPurpose", "customer service")
        
        # Base personality traits
        personality_traits = {
            ChatbotPersonality.FRIENDLY: "warm, approachable, and conversational",
            ChatbotPersonality.PROFESSIONAL: "formal, precise, and business-focused",
            ChatbotPersonality.TECHNICAL: "detailed, accurate, and technically precise",
            ChatbotPersonality.CASUAL: "relaxed, informal, and easy-going",
            ChatbotPersonality.EMPATHETIC: "understanding, compassionate, and supportive",
            ChatbotPersonality.AUTHORITATIVE: "confident, knowledgeable, and decisive",
            ChatbotPersonality.HELPFUL: "supportive, solution-oriented, and proactive",
            ChatbotPersonality.CONCISE: "brief, direct, and to-the-point"
        }
        
        trait = personality_traits.get(personality, "helpful and professional")
        
        prompts = {
            "system": f"""You are an AI assistant for {org_name}, a {org_type} in the {industry} industry.

Your primary role is {primary_purpose.lower()}.

Personality: Be {trait} in all interactions.

Key Instructions:
1. Always represent {org_name} professionally and accurately
2. Base responses on the provided knowledge from {org_name}'s documentation
3. If information isn't available, clearly state this limitation
4. Maintain consistency with {org_name}'s values and communication style
5. Be helpful while staying within your knowledge boundaries

Remember: You represent {org_name} and should uphold their reputation while providing excellent service.""",
            
            "greeting": f"Hello! I'm {org_name}'s AI assistant. I'm here to help you with any questions about our {industry.lower()} services. How can I assist you today?",
            
            "escalation": f"I understand this requires additional assistance. Let me connect you with our {primary_purpose.lower()} team who can provide more specialized help.",
            
            "no_knowledge": f"I don't have specific information about that in {org_name}'s current knowledge base. For the most accurate and up-to-date information, I'd recommend contacting our team directly."
        }
        
        return prompts

class PromptTemplateEngine:
    """Manages and generates dynamic prompts"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def create_system_prompt(self, config: ChatbotConfig, questionnaire_data: Dict[str, Any], 
                                 conversation_context: Optional[List[Dict]] = None) -> str:
        """Create dynamic system prompt based on configuration and context"""
        
        # Get base template
        if config.system_prompt_template:
            template = config.system_prompt_template
        else:
            # Generate default template
            analyzer = PersonalityAnalyzer()
            analysis = analyzer.analyze_questionnaire(questionnaire_data)
            template = analysis.suggested_prompts["system"]
        
        # Template variables
        variables = {
            "organization_name": questionnaire_data.get("organizationName", "our organization"),
            "organization_type": questionnaire_data.get("organizationType", "organization"),
            "industry": questionnaire_data.get("industry", "business"),
            "primary_purpose": questionnaire_data.get("primaryPurpose", "customer service"),
            "communication_style": questionnaire_data.get("communicationStyle", "professional"),
            "personality_type": config.personality_type.value,
            "response_style": config.response_style.value,
            "current_date": datetime.now().strftime("%Y-%m-%d"),
            "max_response_length": config.max_response_length,
            "use_emojis": "You may use emojis when appropriate" if config.use_emojis else "Do not use emojis",
            "include_sources": "Always cite your sources" if config.include_sources else "Focus on the answer content"
        }
        
        # Replace template variables
        system_prompt = template
        for var, value in variables.items():
            system_prompt = system_prompt.replace(f"{{{var}}}", str(value))
        
        # Add conversation context if available
        if conversation_context:
            context_summary = self._summarize_conversation_context(conversation_context)
            system_prompt += f"\n\nConversation Context: {context_summary}"
        
        # Add restrictions if any
        if config.restricted_topics:
            topics = ", ".join(config.restricted_topics)
            system_prompt += f"\n\nIMPORTANT: Do not discuss or provide information about: {topics}"
        
        return system_prompt
    
    def _summarize_conversation_context(self, context: List[Dict]) -> str:
        """Summarize conversation context for system prompt"""
        if not context or len(context) < 2:
            return "This is the start of a new conversation."
        
        # Get last few exchanges
        recent_context = context[-4:]  # Last 2 user-assistant pairs
        
        summary_parts = []
        for msg in recent_context:
            role = msg.get("role", "")
            content = msg.get("content", "")[:100]  # Truncate long messages
            
            if role == "user":
                summary_parts.append(f"User asked about: {content}")
            elif role == "assistant":
                summary_parts.append(f"You responded about: {content}")
        
        return " | ".join(summary_parts)
    
    async def get_template_by_category(self, tenant_id: str, category: str) -> Optional[PromptTemplate]:
        """Get prompt template by category"""
        
        # Try tenant-specific template first
        result = await self.db.execute(
            select(PromptTemplate).where(
                PromptTemplate.tenant_id == tenant_id,
                PromptTemplate.category == category
            ).order_by(PromptTemplate.usage_count.desc()).limit(1)
        )
        
        template = result.scalar_one_or_none()
        
        if not template:
            # Try system template
            result = await self.db.execute(
                select(PromptTemplate).where(
                    PromptTemplate.tenant_id.is_(None),
                    PromptTemplate.category == category,
                    PromptTemplate.is_system_template == True
                ).limit(1)
            )
            template = result.scalar_one_or_none()
        
        return template

class ChatbotConfigService:
    """Main service for chatbot configuration management"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.llm_service = LLMService()
        self.llm_router = SmartLLMRouter(self.llm_service)
        self.rag_engine = RAGEngine(db_session)
        self.personality_analyzer = PersonalityAnalyzer()
        self.prompt_engine = PromptTemplateEngine(db_session)
    
    async def analyze_questionnaire_for_personality(self, questionnaire_data: Dict[str, Any]) -> ChatbotPersonalityAnalysis:
        """Analyze questionnaire and recommend chatbot personality"""
        return self.personality_analyzer.analyze_questionnaire(questionnaire_data)
    
    async def create_chatbot_config(self, tenant_id: str, config_data: ChatbotConfigCreate, 
                                  auto_generate: bool = True) -> ChatbotConfigResponse:
        """Create new chatbot configuration"""
        
        # Get questionnaire data for auto-generation
        questionnaire_data = {}
        if auto_generate:
            questionnaire_data = await self._get_questionnaire_data(tenant_id)
        
        # Auto-generate personality if requested and data available
        if auto_generate and questionnaire_data:
            analysis = await self.analyze_questionnaire_for_personality(questionnaire_data)
            
            # Override config with recommendations if not explicitly set
            if not hasattr(config_data, 'personality_type') or config_data.personality_type == ChatbotPersonality.FRIENDLY:
                config_data.personality_type = analysis.recommended_personality
            if not hasattr(config_data, 'response_style') or config_data.response_style == ResponseStyle.CONVERSATIONAL:
                config_data.response_style = analysis.recommended_style
            if not hasattr(config_data, 'fallback_behavior') or config_data.fallback_behavior == FallbackBehavior.APOLOGETIC:
                config_data.fallback_behavior = analysis.recommended_fallback
        
        # Create configuration
        config = ChatbotConfig(
            tenant_id=tenant_id,
            name=config_data.name,
            description=config_data.description,
            personality_type=config_data.personality_type,
            response_style=config_data.response_style,
            fallback_behavior=config_data.fallback_behavior,
            llm_provider=config_data.llm_provider,
            llm_model=config_data.llm_model,
            max_response_length=config_data.max_response_length,
            temperature=config_data.temperature,
            use_emojis=config_data.use_emojis,
            include_sources=config_data.include_sources,
            greeting_message=config_data.greeting_message,
            escalation_keywords=config_data.escalation_keywords,
            restricted_topics=config_data.restricted_topics,
            questionnaire_config=questionnaire_data
        )
        
        # Generate system prompt if not provided
        if not config.system_prompt_template and questionnaire_data:
            analysis = await self.analyze_questionnaire_for_personality(questionnaire_data)
            config.system_prompt_template = analysis.suggested_prompts["system"]
        
        # Generate greeting if not provided
        if not config.greeting_message and questionnaire_data:
            analysis = await self.analyze_questionnaire_for_personality(questionnaire_data)
            config.greeting_message = analysis.suggested_prompts["greeting"]
        
        self.db.add(config)
        await self.db.commit()
        await self.db.refresh(config)
        
        logger.info(f"Created chatbot config {config.id} for tenant {tenant_id}")
        return ChatbotConfigResponse.from_orm(config)
    
    async def test_chatbot_config(self, tenant_id: str, test_request: ChatbotTestRequest) -> ChatbotTestResponse:
        """Test chatbot configuration with sample messages"""
        
        # Get configuration
        result = await self.db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.id == test_request.config_id,
                ChatbotConfig.tenant_id == tenant_id
            )
        )
        
        config = result.scalar_one_or_none()
        if not config:
            raise HTTPException(status_code=404, detail="Chatbot configuration not found")
        
        test_results = []
        total_response_time = 0
        successful_responses = 0
        
        for test_message in test_request.test_messages:
            start_time = datetime.now()
            
            try:
                # Generate system prompt
                system_prompt = await self.prompt_engine.create_system_prompt(
                    config, 
                    config.questionnaire_config or {}
                )
                
                # Create full prompt
                if test_request.use_test_knowledge:
                    # Use RAG to get relevant knowledge
                    from ..models.vector import SearchRequest, RAGConfig
                    search_request = SearchRequest(
                        query=test_message,
                        config=RAGConfig(max_chunks=3)
                    )
                    
                    try:
                        search_response = await self.rag_engine.vector_service.search_knowledge(
                            tenant_id, search_request
                        )
                        
                        knowledge_context = ""
                        if search_response.chunks:
                            knowledge_context = "\n\n".join([
                                f"Knowledge: {chunk.content[:200]}..."
                                for chunk in search_response.chunks[:2]
                            ])
                    except:
                        knowledge_context = "No knowledge base available for testing."
                else:
                    knowledge_context = "Testing without knowledge base."
                
                full_prompt = f"""{system_prompt}

Knowledge Context:
{knowledge_context}

User: {test_message}
Assistant: """
                
                # Get LLM configuration
                llm_config = self.llm_service.get_default_config(config.llm_provider, config.llm_model)
                llm_config["temperature"] = config.temperature
                
                # Generate response
                response, provider_used, model_used = await self.llm_router.generate_response(
                    full_prompt,
                    preferred_provider=config.llm_provider,
                    preferred_model=config.llm_model
                )
                
                # Truncate response if needed
                if len(response) > config.max_response_length:
                    response = response[:config.max_response_length] + "..."
                
                response_time = (datetime.now() - start_time).total_seconds() * 1000
                total_response_time += response_time
                successful_responses += 1
                
                test_results.append({
                    "test_message": test_message,
                    "response": response,
                    "response_time_ms": int(response_time),
                    "provider_used": provider_used.value,
                    "model_used": model_used,
                    "status": "success",
                    "response_length": len(response),
                    "within_length_limit": len(response) <= config.max_response_length
                })
                
            except Exception as e:
                response_time = (datetime.now() - start_time).total_seconds() * 1000
                
                test_results.append({
                    "test_message": test_message,
                    "response": None,
                    "response_time_ms": int(response_time),
                    "status": "failed",
                    "error": str(e)
                })
        
        # Calculate overall performance
        avg_response_time = total_response_time / len(test_request.test_messages) if test_request.test_messages else 0
        success_rate = successful_responses / len(test_request.test_messages) if test_request.test_messages else 0
        
        overall_performance = {
            "success_rate": success_rate,
            "average_response_time_ms": int(avg_response_time),
            "total_tests": len(test_request.test_messages),
            "successful_responses": successful_responses,
            "failed_responses": len(test_request.test_messages) - successful_responses
        }
        
        # Generate recommendations
        recommendations = []
        
        if success_rate < 0.8:
            recommendations.append("Consider using a more reliable LLM provider or model")
        
        if avg_response_time > 5000:
            recommendations.append("Response time is slow - consider using a faster model or provider")
        
        if any(r.get("response_length", 0) > config.max_response_length for r in test_results):
            recommendations.append("Some responses exceed length limit - consider adjusting max_response_length")
        
        if not recommendations:
            recommendations.append("Configuration is performing well!")
        
        return ChatbotTestResponse(
            config_id=test_request.config_id,
            test_results=test_results,
            overall_performance=overall_performance,
            recommendations=recommendations
        )
    
    async def get_chatbot_configs(self, tenant_id: str) -> List[ChatbotConfigResponse]:
        """Get all chatbot configurations for tenant"""
        
        result = await self.db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.tenant_id == tenant_id
            ).order_by(ChatbotConfig.created_at.desc())
        )
        
        configs = result.scalars().all()
        return [ChatbotConfigResponse.from_orm(config) for config in configs]
    
    async def get_chatbot_config(self, tenant_id: str, config_id: str) -> ChatbotConfigResponse:
        """Get specific chatbot configuration"""
        
        result = await self.db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.id == config_id,
                ChatbotConfig.tenant_id == tenant_id
            )
        )
        
        config = result.scalar_one_or_none()
        if not config:
            raise HTTPException(status_code=404, detail="Chatbot configuration not found")
        
        return ChatbotConfigResponse.from_orm(config)
    
    async def update_chatbot_config(self, tenant_id: str, config_id: str, 
                                  update_data: Dict[str, Any]) -> ChatbotConfigResponse:
        """Update chatbot configuration"""
        
        result = await self.db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.id == config_id,
                ChatbotConfig.tenant_id == tenant_id
            )
        )
        
        config = result.scalar_one_or_none()
        if not config:
            raise HTTPException(status_code=404, detail="Chatbot configuration not found")
        
        # Update fields
        for field, value in update_data.items():
            if hasattr(config, field) and value is not None:
                setattr(config, field, value)
        
        config.updated_at = datetime.now()
        await self.db.commit()
        await self.db.refresh(config)
        
        return ChatbotConfigResponse.from_orm(config)
    
    async def delete_chatbot_config(self, tenant_id: str, config_id: str):
        """Delete chatbot configuration"""
        
        result = await self.db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.id == config_id,
                ChatbotConfig.tenant_id == tenant_id
            )
        )
        
        config = result.scalar_one_or_none()
        if not config:
            raise HTTPException(status_code=404, detail="Chatbot configuration not found")
        
        await self.db.delete(config)
        await self.db.commit()
        
        logger.info(f"Deleted chatbot config {config_id}")
    
    async def get_chatbot_metrics(self, tenant_id: str, config_id: str, days: int = 30) -> ChatbotMetrics:
        """Get chatbot performance metrics"""
        
        from datetime import timedelta
        start_date = datetime.now() - timedelta(days=days)
        
        # Get deployment IDs for this config
        deployments_result = await self.db.execute(
            select(ChatbotDeployment.id).where(
                ChatbotDeployment.config_id == config_id,
                ChatbotDeployment.tenant_id == tenant_id
            )
        )
        deployment_ids = [row[0] for row in deployments_result.fetchall()]
        
        if not deployment_ids:
            # No deployments yet
            return ChatbotMetrics(
                config_id=config_id,
                total_conversations=0,
                total_messages=0,
                average_response_time_ms=0,
                satisfaction_score=None,
                common_queries=[],
                escalation_rate=0,
                knowledge_coverage=0,
                response_accuracy=None
            )
        
        # Get chat sessions for these deployments (this would require linking sessions to deployments)
        # For now, we'll get all sessions for the tenant in the time period
        sessions_result = await self.db.execute(
            select(ChatSession).where(
                ChatSession.tenant_id == tenant_id,
                ChatSession.created_at >= start_date
            )
        )
        sessions = sessions_result.scalars().all()
        
        # Get messages for these sessions
        session_ids = [s.id for s in sessions]
        messages_result = await self.db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id.in_(session_ids),
                ChatMessage.created_at >= start_date,
                ChatMessage.role == "assistant"
            )
        )
        messages = messages_result.scalars().all()
        
        # Calculate metrics
        total_conversations = len(sessions)
        total_messages = len(messages)
        
        # Average response time
        response_times = [msg.response_time_ms for msg in messages if msg.response_time_ms]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # Satisfaction score
        feedback_scores = [msg.feedback_score for msg in messages if msg.feedback_score is not None]
        avg_satisfaction = sum(feedback_scores) / len(feedback_scores) if feedback_scores else None
        
        # Common queries
        user_messages_result = await self.db.execute(
            select(ChatMessage.message, func.count(ChatMessage.id).label('count')).where(
                ChatMessage.session_id.in_(session_ids),
                ChatMessage.created_at >= start_date,
                ChatMessage.role == "user"
            ).group_by(ChatMessage.message).order_by(func.count(ChatMessage.id).desc()).limit(10)
        )
        
        common_queries = [
            {"query": row[0], "frequency": row[1]} 
            for row in user_messages_result.fetchall()
        ]
        
        # Escalation rate (messages with escalation keywords)
        config = await self.get_chatbot_config(tenant_id, config_id)
        escalation_keywords = config.escalation_keywords if hasattr(config, 'escalation_keywords') else []
        
        escalated_messages = 0
        if escalation_keywords:
            for msg in messages:
                if any(keyword.lower() in msg.response.lower() for keyword in escalation_keywords if msg.response):
                    escalated_messages += 1
        
        escalation_rate = escalated_messages / total_messages if total_messages > 0 else 0
        
        # Knowledge coverage (percentage of messages with retrieved chunks)
        messages_with_knowledge = sum(1 for msg in messages if msg.retrieved_chunks)
        knowledge_coverage = messages_with_knowledge / total_messages if total_messages > 0 else 0
        
        return ChatbotMetrics(
            config_id=config_id,
            total_conversations=total_conversations,
            total_messages=total_messages,
            average_response_time_ms=avg_response_time,
            satisfaction_score=avg_satisfaction,
            common_queries=common_queries,
            escalation_rate=escalation_rate,
            knowledge_coverage=knowledge_coverage,
            response_accuracy=avg_satisfaction  # Use satisfaction as proxy for accuracy
        )
    
    async def _get_questionnaire_data(self, tenant_id: str) -> Dict[str, Any]:
        """Get questionnaire data for tenant"""
        
        # Get tenant
        result = await self.db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant = result.scalar_one_or_none()
        
        if not tenant or not tenant.questionnaire_id:
            return {}
        
        try:
            # Get from SQLite (legacy storage)
            import sqlite3
            
            conn = sqlite3.connect('questionnaire_responses.db')
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT raw_json FROM questionnaire_responses WHERE id = ?",
                (tenant.questionnaire_id,)
            )
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return json.loads(result[0])
            
        except Exception as e:
            logger.warning(f"Failed to get questionnaire data: {e}")
        
        return {}
    
    async def clone_chatbot_config(self, tenant_id: str, config_id: str, new_name: str) -> ChatbotConfigResponse:
        """Clone an existing chatbot configuration"""
        
        # Get original config
        original = await self.get_chatbot_config(tenant_id, config_id)
        
        # Create new config with same settings
        config_data = ChatbotConfigCreate(
            name=new_name,
            description=f"Cloned from {original.name}",
            personality_type=original.personality_type,
            response_style=original.response_style,
            fallback_behavior=original.fallback_behavior,
            llm_provider=original.llm_provider,
            llm_model=original.llm_model,
            max_response_length=original.max_response_length,
            temperature=original.temperature,
            use_emojis=original.use_emojis,
            include_sources=original.include_sources,
            greeting_message=original.greeting_message
        )
        
        return await self.create_chatbot_config(tenant_id, config_data, auto_generate=False)
    
    async def regenerate_prompts(self, tenant_id: str, config_id: str) -> Dict[str, str]:
        """Regenerate prompts for a chatbot configuration"""
        
        config = await self.get_chatbot_config(tenant_id, config_id)
        questionnaire_data = await self._get_questionnaire_data(tenant_id)
        
        if not questionnaire_data:
            raise HTTPException(status_code=400, detail="No questionnaire data available for prompt regeneration")
        
        # Analyze questionnaire and regenerate prompts
        analysis = await self.analyze_questionnaire_for_personality(questionnaire_data)
        
        # Update config with new prompts
        await self.update_chatbot_config(tenant_id, config_id, {
            "system_prompt_template": analysis.suggested_prompts["system"],
            "greeting_message": analysis.suggested_prompts["greeting"]
        })
        
        return analysis.suggested_prompts

# Utility functions for chatbot management
def get_personality_description(personality: ChatbotPersonality) -> str:
    """Get human-readable description of personality type"""
    descriptions = {
        ChatbotPersonality.FRIENDLY: "Warm, approachable, and conversational. Great for customer-facing roles.",
        ChatbotPersonality.PROFESSIONAL: "Formal, precise, and business-focused. Ideal for corporate environments.",
        ChatbotPersonality.TECHNICAL: "Detailed, accurate, and technically precise. Perfect for technical support.",
        ChatbotPersonality.CASUAL: "Relaxed, informal, and easy-going. Good for casual interactions.",
        ChatbotPersonality.EMPATHETIC: "Understanding, compassionate, and supportive. Excellent for sensitive topics.",
        ChatbotPersonality.AUTHORITATIVE: "Confident, knowledgeable, and decisive. Best for expert guidance.",
        ChatbotPersonality.HELPFUL: "Supportive, solution-oriented, and proactive. Universal customer service.",
        ChatbotPersonality.CONCISE: "Brief, direct, and to-the-point. Efficient for quick interactions."
    }
    return descriptions.get(personality, "Professional and helpful assistant.")

def get_response_style_description(style: ResponseStyle) -> str:
    """Get human-readable description of response style"""
    descriptions = {
        ResponseStyle.CONVERSATIONAL: "Natural, flowing conversation style",
        ResponseStyle.STRUCTURED: "Organized, formatted responses with clear sections",
        ResponseStyle.BULLET_POINTS: "Information presented in bullet points and lists",
        ResponseStyle.DETAILED: "Comprehensive, thorough explanations",
        ResponseStyle.BRIEF: "Short, concise responses",
        ResponseStyle.STEP_BY_STEP: "Sequential, instructional format"
    }
    return descriptions.get(style, "Conversational and natural responses.")

async def validate_llm_model_availability(provider: LLMProvider, model: str) -> bool:
    """Validate that a specific LLM model is available"""
    llm_service = LLMService()
    
    try:
        if provider not in llm_service.providers:
            return False
        
        provider_instance = llm_service.providers[provider]
        if not await provider_instance.is_available():
            return False
        
        available_models = await provider_instance.get_available_models()
        return any(m.model_name == model for m in available_models)
        
    except Exception:
        return False