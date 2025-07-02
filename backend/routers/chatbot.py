# backend/routers/chatbot.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime

from ..models.chatbot import (
    ChatbotConfigCreate, ChatbotConfigResponse, ChatbotConfigUpdate,
    ChatbotDeploymentCreate, ChatbotDeploymentResponse,
    ChatbotPersonalityAnalysis, ChatbotTestRequest, ChatbotTestResponse,
    ChatbotMetrics, LLMModelInfo, ChatbotPersonality, ResponseStyle,
    FallbackBehavior, LLMProvider
)
from ..services.chatbot_service import (
    ChatbotConfigService, get_personality_description, 
    get_response_style_description, validate_llm_model_availability
)
from ..services.llm_service import (
    LLMService, get_model_recommendations, check_system_requirements, 
    download_ollama_model
)
from ..database import get_db_session
from ..auth import get_current_tenant_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chatbot", tags=["Chatbot Configuration"])

async def get_chatbot_service(db: AsyncSession = Depends(get_db_session)) -> ChatbotConfigService:
    """Dependency to get chatbot service"""
    return ChatbotConfigService(db)

async def get_llm_service() -> LLMService:
    """Dependency to get LLM service"""
    return LLMService()

# Chatbot Configuration Management
@router.post("/configs", response_model=ChatbotConfigResponse)
async def create_chatbot_config(
    config_data: ChatbotConfigCreate,
    auto_generate: bool = Query(default=True, description="Auto-generate personality from questionnaire"),
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """
    Create a new chatbot configuration
    
    Features:
    - **Auto-personality generation** from questionnaire data
    - **Open-source LLM integration** (Ollama, HuggingFace, LocalAI)
    - **Customizable behavior** and response styles
    - **Multi-language support**
    
    When `auto_generate=true`, the system will:
    1. Analyze your questionnaire responses
    2. Recommend optimal personality settings
    3. Generate custom prompts for your organization
    4. Configure fallback behaviors based on your use case
    """
    try:
        # Validate LLM model availability
        is_available = await validate_llm_model_availability(config_data.llm_provider, config_data.llm_model)
        if not is_available:
            raise HTTPException(
                status_code=400, 
                detail=f"LLM model {config_data.llm_model} is not available for provider {config_data.llm_provider}"
            )
        
        return await service.create_chatbot_config(tenant_id, config_data, auto_generate)
        
    except Exception as e:
        logger.error(f"Failed to create chatbot config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create configuration: {str(e)}")

@router.get("/configs", response_model=List[ChatbotConfigResponse])
async def list_chatbot_configs(
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """List all chatbot configurations for the organization"""
    try:
        return await service.get_chatbot_configs(tenant_id)
    except Exception as e:
        logger.error(f"Failed to list chatbot configs: {e}")
        raise HTTPException(status_code=500, detail="Failed to list configurations")

@router.get("/configs/{config_id}", response_model=ChatbotConfigResponse)
async def get_chatbot_config(
    config_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """Get details of a specific chatbot configuration"""
    try:
        return await service.get_chatbot_config(tenant_id, config_id)
    except Exception as e:
        logger.error(f"Failed to get chatbot config: {e}")
        raise HTTPException(status_code=500, detail="Failed to get configuration")

@router.put("/configs/{config_id}", response_model=ChatbotConfigResponse)
async def update_chatbot_config(
    config_id: str,
    update_data: ChatbotConfigUpdate,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """Update chatbot configuration settings"""
    try:
        # Convert Pydantic model to dict, excluding None values
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        return await service.update_chatbot_config(tenant_id, config_id, update_dict)
        
    except Exception as e:
        logger.error(f"Failed to update chatbot config: {e}")
        raise HTTPException(status_code=500, detail="Failed to update configuration")

@router.delete("/configs/{config_id}")
async def delete_chatbot_config(
    config_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """Delete a chatbot configuration"""
    try:
        await service.delete_chatbot_config(tenant_id, config_id)
        return {"message": "Chatbot configuration deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete chatbot config: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete configuration")

@router.post("/configs/{config_id}/clone", response_model=ChatbotConfigResponse)
async def clone_chatbot_config(
    config_id: str,
    new_name: str = Query(..., description="Name for the cloned configuration"),
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """Clone an existing chatbot configuration"""
    try:
        return await service.clone_chatbot_config(tenant_id, config_id, new_name)
    except Exception as e:
        logger.error(f"Failed to clone chatbot config: {e}")
        raise HTTPException(status_code=500, detail="Failed to clone configuration")

# Personality Analysis and Recommendations
@router.post("/analyze-personality", response_model=ChatbotPersonalityAnalysis)
async def analyze_questionnaire_personality(
    questionnaire_data: Dict[str, Any],
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """
    Analyze questionnaire data and recommend optimal chatbot personality
    
    This endpoint analyzes your organization's profile and recommends:
    - **Personality type** (friendly, professional, technical, etc.)
    - **Response style** (conversational, structured, detailed, etc.)  
    - **Fallback behavior** (escalate, apologize, suggest alternatives)
    - **Custom prompts** tailored to your organization
    """
    try:
        return await service.analyze_questionnaire_for_personality(questionnaire_data)
    except Exception as e:
        logger.error(f"Failed to analyze personality: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze questionnaire")

@router.post("/configs/{config_id}/regenerate-prompts")
async def regenerate_chatbot_prompts(
    config_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """
    Regenerate prompts for chatbot based on latest questionnaire data
    
    Useful when:
    - Organization details have changed
    - Want to refresh chatbot personality
    - Testing different prompt variations
    """
    try:
        prompts = await service.regenerate_prompts(tenant_id, config_id)
        return {
            "message": "Prompts regenerated successfully",
            "new_prompts": prompts
        }
    except Exception as e:
        logger.error(f"Failed to regenerate prompts: {e}")
        raise HTTPException(status_code=500, detail="Failed to regenerate prompts")

# Testing and Validation
@router.post("/configs/{config_id}/test", response_model=ChatbotTestResponse)
async def test_chatbot_config(
    config_id: str,
    test_request: ChatbotTestRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """
    Test chatbot configuration with sample messages
    
    Features:
    - **Performance testing** with response time measurement
    - **Quality assessment** of generated responses
    - **Knowledge integration testing** using your content
    - **Recommendations** for improvement
    
    Use this to validate your chatbot before deployment.
    """
    try:
        # Override config_id from URL
        test_request.config_id = config_id
        return await service.test_chatbot_config(tenant_id, test_request)
        
    except Exception as e:
        logger.error(f"Failed to test chatbot config: {e}")
        raise HTTPException(status_code=500, detail="Failed to test configuration")

@router.get("/configs/{config_id}/metrics", response_model=ChatbotMetrics)
async def get_chatbot_metrics(
    config_id: str,
    days: int = Query(default=30, ge=1, le=365, description="Number of days to analyze"),
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """
    Get comprehensive chatbot performance metrics
    
    Metrics include:
    - **Conversation volume** and message counts
    - **Response time** performance
    - **User satisfaction** scores
    - **Common queries** and patterns
    - **Knowledge coverage** and gaps
    - **Escalation rates**
    """
    try:
        return await service.get_chatbot_metrics(tenant_id, config_id, days)
    except Exception as e:
        logger.error(f"Failed to get chatbot metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get metrics")

# LLM Provider Management
@router.get("/llm/providers")
async def list_llm_providers(
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    List available open-source LLM providers
    
    Supported providers:
    - **Ollama** - Run models locally (llama2, mistral, codellama, etc.)
    - **HuggingFace** - Transformers library integration
    - **LocalAI** - OpenAI-compatible local API
    - **Text Generation WebUI** - Popular community interface
    """
    try:
        available_providers = await llm_service.get_available_providers()
        
        provider_info = []
        for provider in LLMProvider:
            is_available = provider in available_providers
            
            provider_info.append({
                "provider": provider.value,
                "name": provider.value.title(),
                "is_available": is_available,
                "description": _get_provider_description(provider),
                "recommended_models": get_model_recommendations(provider)
            })
        
        return {
            "providers": provider_info,
            "total_available": len(available_providers),
            "system_requirements": await check_system_requirements()
        }
        
    except Exception as e:
        logger.error(f"Failed to list LLM providers: {e}")
        raise HTTPException(status_code=500, detail="Failed to list providers")

@router.get("/llm/models", response_model=List[LLMModelInfo])
async def list_available_models(
    provider: Optional[LLMProvider] = Query(None, description="Filter by specific provider"),
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    List all available LLM models across providers
    
    Returns detailed information about each model including:
    - **Model capabilities** and use cases
    - **Resource requirements** (RAM, GPU, disk space)
    - **Download size** and availability status
    - **Performance characteristics**
    """
    try:
        if provider:
            # Get models for specific provider
            if provider not in llm_service.providers:
                raise HTTPException(status_code=400, detail=f"Provider {provider} not available")
            
            provider_instance = llm_service.providers[provider]
            if not await provider_instance.is_available():
                raise HTTPException(status_code=400, detail=f"Provider {provider} is not running")
            
            return await provider_instance.get_available_models()
        else:
            # Get all models
            return await llm_service.get_all_available_models()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        raise HTTPException(status_code=500, detail="Failed to list models")

@router.post("/llm/ollama/download")
async def download_ollama_model_endpoint(
    model_name: str = Query(..., description="Ollama model name (e.g., 'llama2:7b')"),
    background_tasks: BackgroundTasks,
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Download an Ollama model in the background
    
    Popular models:
    - **llama2:7b** - Meta's Llama 2, great balance of quality/speed (3.8GB)
    - **mistral:7b** - Mistral AI's model, excellent instruction following (4.1GB)
    - **codellama:7b** - Specialized for code and programming (3.8GB)
    - **neural-chat:7b** - Intel's conversational model (4.1GB)
    """
    try:
        # Check if Ollama is available
        if LLMProvider.OLLAMA not in llm_service.providers:
            raise HTTPException(status_code=400, detail="Ollama provider not available")
        
        ollama_provider = llm_service.providers[LLMProvider.OLLAMA]
        if not await ollama_provider.is_available():
            raise HTTPException(status_code=400, detail="Ollama is not running")
        
        # Start download in background
        background_tasks.add_task(download_ollama_model, model_name)
        
        return {
            "message": f"Started downloading {model_name}",
            "model_name": model_name,
            "status": "downloading",
            "note": "Check /llm/models endpoint to see when download completes"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start model download: {e}")
        raise HTTPException(status_code=500, detail="Failed to start download")

@router.get("/llm/health")
async def check_llm_health(
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Check health status of all LLM providers
    
    Useful for:
    - **Troubleshooting** connection issues
    - **System monitoring** and alerting
    - **Provider selection** logic
    - **Performance optimization**
    """
    try:
        return await llm_service.health_check()
    except Exception as e:
        logger.error(f"LLM health check failed: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")

# Configuration Helpers and Utilities
@router.get("/personalities")
async def list_personality_types():
    """
    List all available chatbot personality types with descriptions
    
    Helps you choose the right personality for your organization and use case.
    """
    personalities = []
    
    for personality in ChatbotPersonality:
        personalities.append({
            "type": personality.value,
            "name": personality.value.title(),
            "description": get_personality_description(personality),
            "best_for": _get_personality_use_cases(personality)
        })
    
    return {"personalities": personalities}

@router.get("/response-styles")
async def list_response_styles():
    """List all available response styles with descriptions"""
    styles = []
    
    for style in ResponseStyle:
        styles.append({
            "style": style.value,
            "name": style.value.replace("_", " ").title(),
            "description": get_response_style_description(style),
            "example": _get_response_style_example(style)
        })
    
    return {"response_styles": styles}

@router.get("/fallback-behaviors")
async def list_fallback_behaviors():
    """List all available fallback behaviors for when chatbot can't answer"""
    behaviors = []
    
    for behavior in FallbackBehavior:
        behaviors.append({
            "behavior": behavior.value,
            "name": behavior.value.replace("_", " ").title(),
            "description": _get_fallback_description(behavior),
            "when_to_use": _get_fallback_use_cases(behavior)
        })
    
    return {"fallback_behaviors": behaviors}

@router.get("/config-wizard")
async def get_configuration_wizard(
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """
    Get step-by-step configuration wizard based on your questionnaire
    
    Returns personalized recommendations and guided setup for optimal chatbot configuration.
    """
    try:
        # Get questionnaire data
        questionnaire_data = await service._get_questionnaire_data(tenant_id)
        
        if not questionnaire_data:
            return {
                "step": "questionnaire",
                "message": "Complete the organization questionnaire first",
                "next_action": "Fill out questionnaire at /api/save-questionnaire"
            }
        
        # Analyze personality
        analysis = await service.analyze_questionnaire_for_personality(questionnaire_data)
        
        # Check LLM availability
        llm_service = LLMService()
        available_providers = await llm_service.get_available_providers()
        
        # Generate recommendations
        recommendations = {
            "step": "configuration",
            "organization": questionnaire_data.get("organizationName", "Your Organization"),
            "analysis": {
                "recommended_personality": analysis.recommended_personality.value,
                "recommended_style": analysis.recommended_style.value,
                "confidence": analysis.confidence_score,
                "reasoning": analysis.reasoning
            },
            "llm_setup": {
                "available_providers": [p.value for p in available_providers],
                "recommended_provider": "ollama" if LLMProvider.OLLAMA in available_providers else "huggingface",
                "recommended_models": _get_recommended_models_for_use_case(questionnaire_data)
            },
            "suggested_config": {
                "name": f"{questionnaire_data.get('organizationName', 'My')} Assistant",
                "personality_type": analysis.recommended_personality.value,
                "response_style": analysis.recommended_style.value,
                "fallback_behavior": analysis.recommended_fallback.value,
                "use_emojis": questionnaire_data.get("communicationStyle") == "casual",
                "max_response_length": 750 if analysis.recommended_style == ResponseStyle.DETAILED else 500
            },
            "next_steps": [
                "Review and customize the suggested configuration",
                "Test the chatbot with sample questions",
                "Deploy to your preferred channels",
                "Monitor performance and iterate"
            ]
        }
        
        return recommendations
        
    except Exception as e:
        logger.error(f"Configuration wizard failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate configuration wizard")

# Quick Setup Endpoints
@router.post("/quick-setup", response_model=ChatbotConfigResponse)
async def quick_chatbot_setup(
    name: Optional[str] = Query(None, description="Chatbot name (auto-generated if not provided)"),
    tenant_id: str = Depends(get_current_tenant_id),
    service: ChatbotConfigService = Depends(get_chatbot_service)
):
    """
    One-click chatbot setup using questionnaire data
    
    Automatically:
    1. Analyzes your questionnaire responses
    2. Selects optimal personality and settings
    3. Chooses best available LLM model
    4. Creates ready-to-deploy chatbot configuration
    
    Perfect for getting started quickly!
    """
    try:
        # Get questionnaire data
        questionnaire_data = await service._get_questionnaire_data(tenant_id)
        
        if not questionnaire_data:
            raise HTTPException(
                status_code=400, 
                detail="No questionnaire data found. Complete the questionnaire first."
            )
        
        # Analyze personality
        analysis = await service.analyze_questionnaire_for_personality(questionnaire_data)
        
        # Get best available LLM
        llm_service = LLMService()
        available_providers = await llm_service.get_available_providers()
        
        if not available_providers:
            raise HTTPException(
                status_code=400,
                detail="No LLM providers available. Please set up Ollama, HuggingFace, or LocalAI."
            )
        
        # Select best provider and model
        provider = available_providers[0]  # Use first available
        models = await llm_service.providers[provider].get_available_models()
        
        if not models:
            raise HTTPException(
                status_code=400,
                detail=f"No models available for provider {provider.value}"
            )
        
        model = models[0].model_name  # Use first available model
        
        # Generate chatbot name
        if not name:
            org_name = questionnaire_data.get("organizationName", "Organization")
            name = f"{org_name} Assistant"
        
        # Create configuration
        config_data = ChatbotConfigCreate(
            name=name,
            description=f"Auto-generated chatbot for {questionnaire_data.get('organizationName')}",
            personality_type=analysis.recommended_personality,
            response_style=analysis.recommended_style,
            fallback_behavior=analysis.recommended_fallback,
            llm_provider=provider,
            llm_model=model,
            use_emojis=questionnaire_data.get("communicationStyle") == "casual",
            include_sources=True
        )
        
        return await service.create_chatbot_config(tenant_id, config_data, auto_generate=True)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quick setup failed: {e}")
        raise HTTPException(status_code=500, detail="Quick setup failed")

# Helper functions
def _get_provider_description(provider: LLMProvider) -> str:
    """Get description for LLM provider"""
    descriptions = {
        LLMProvider.OLLAMA: "Run large language models locally with Ollama. Easy setup, good performance.",
        LLMProvider.HUGGINGFACE: "Use HuggingFace Transformers library. Great model selection, requires more setup.",
        LLMProvider.LOCALAI: "OpenAI-compatible local API. Drop-in replacement for OpenAI API.",
        LLMProvider.TEXTGEN_WEBUI: "Popular community interface for running LLMs with web UI.",
        LLMProvider.VLLM: "High-performance inference server for fast LLM serving.",
        LLMProvider.LLAMACPP: "Efficient C++ implementation for running LLaMA models."
    }
    return descriptions.get(provider, "Open-source LLM provider")

def _get_personality_use_cases(personality: ChatbotPersonality) -> List[str]:
    """Get use cases for personality type"""
    use_cases = {
        ChatbotPersonality.FRIENDLY: ["Customer service", "General inquiries", "Community support"],
        ChatbotPersonality.PROFESSIONAL: ["Corporate communications", "Financial services", "Legal consultation"],
        ChatbotPersonality.TECHNICAL: ["Technical support", "Developer documentation", "IT helpdesk"],
        ChatbotPersonality.CASUAL: ["Social media", "Gaming communities", "Informal support"],
        ChatbotPersonality.EMPATHETIC: ["Healthcare", "Mental health", "Crisis support"],
        ChatbotPersonality.AUTHORITATIVE: ["Expert consultation", "Educational content", "Compliance guidance"],
        ChatbotPersonality.HELPFUL: ["General assistance", "FAQ responses", "Product support"],
        ChatbotPersonality.CONCISE: ["Quick answers", "Status updates", "Brief confirmations"]
    }
    return use_cases.get(personality, ["General purpose"])

def _get_response_style_example(style: ResponseStyle) -> str:
    """Get example response for style"""
    examples = {
        ResponseStyle.CONVERSATIONAL: "I'd be happy to help you with that! Let me walk you through the process step by step.",
        ResponseStyle.STRUCTURED: "**Process Overview:**\n1. Initial setup\n2. Configuration\n3. Testing\n\n**Next Steps:**\n- Review settings\n- Contact support",
        ResponseStyle.BULLET_POINTS: "• First, check your settings\n• Then, verify the connection\n• Finally, test the functionality",
        ResponseStyle.DETAILED: "To complete this process, you'll need to first ensure that all prerequisites are met, including having the correct permissions and access credentials. Then, navigate to the settings panel...",
        ResponseStyle.BRIEF: "Check settings, verify connection, test functionality.",
        ResponseStyle.STEP_BY_STEP: "Step 1: Open the settings menu\nStep 2: Navigate to preferences\nStep 3: Click save changes"
    }
    return examples.get(style, "Example response in this style")

def _get_fallback_description(behavior: FallbackBehavior) -> str:
    """Get description for fallback behavior"""
    descriptions = {
        FallbackBehavior.APOLOGETIC: "Politely apologize and explain limitations",
        FallbackBehavior.REDIRECT: "Direct users to alternative resources or support",
        FallbackBehavior.SUGGEST_ALTERNATIVES: "Offer related topics or similar questions",
        FallbackBehavior.ASK_CLARIFICATION: "Ask for more details to better understand the question",
        FallbackBehavior.ESCALATE: "Automatically route to human support"
    }
    return descriptions.get(behavior, "Handle unknown queries gracefully")

def _get_fallback_use_cases(behavior: FallbackBehavior) -> List[str]:
    """Get use cases for fallback behavior"""
    use_cases = {
        FallbackBehavior.APOLOGETIC: ["General inquiries", "Low-stakes conversations"],
        FallbackBehavior.REDIRECT: ["Sales inquiries", "Complex technical issues"],
        FallbackBehavior.SUGGEST_ALTERNATIVES: ["FAQ systems", "Knowledge exploration"],
        FallbackBehavior.ASK_CLARIFICATION: ["Technical support", "Detailed troubleshooting"],
        FallbackBehavior.ESCALATE: ["Customer service", "Critical issues", "Urgent requests"]
    }
    return use_cases.get(behavior, ["General purpose"])

def _get_recommended_models_for_use_case(questionnaire_data: Dict[str, Any]) -> List[Dict[str, str]]:
    """Get recommended models based on questionnaire data"""
    primary_purpose = questionnaire_data.get("primaryPurpose", "").lower()
    org_size = questionnaire_data.get("organizationSize", "")
    
    # Base recommendations
    recommendations = [
        {
            "provider": "ollama",
            "model": "llama2:7b",
            "reason": "Best balance of quality and performance",
            "size": "3.8GB"
        }
    ]
    
    # Add specific recommendations based on use case
    if "technical" in primary_purpose or "support" in primary_purpose:
        recommendations.insert(0, {
            "provider": "ollama", 
            "model": "codellama:7b",
            "reason": "Specialized for technical content and code",
            "size": "3.8GB"
        })
    
    if "sales" in primary_purpose or "marketing" in primary_purpose:
        recommendations.insert(0, {
            "provider": "ollama",
            "model": "neural-chat:7b", 
            "reason": "Optimized for conversational interactions",
            "size": "4.1GB"
        })
    
    # Adjust for organization size
    if any(size in org_size.lower() for size in ["large", "enterprise", "1000+"]):
        recommendations.append({
            "provider": "ollama",
            "model": "llama2:13b",
            "reason": "Higher quality for enterprise use (requires more resources)",
            "size": "7.3GB"
        })
    
    return recommendations