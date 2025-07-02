# backend/routers/deployment.py
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import json
import logging
from datetime import datetime

from ..models.deployment import (
    ChatbotDeploymentCreate, ChatbotDeploymentResponse, ChatbotDeploymentUpdate,
    WidgetEmbedCode, DeploymentAnalytics, ChatRequest, ChatResponse,
    DeploymentStats, DeploymentType, DeploymentStatus, WebSocketMessage
)
from ..services.deployment_service import DeploymentService, websocket_manager
from ..database import get_db_session
from ..auth import get_current_tenant_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployment", tags=["Chatbot Deployment"])

async def get_deployment_service(db: AsyncSession = Depends(get_db_session)) -> DeploymentService:
    """Dependency to get deployment service"""
    return DeploymentService(db)

# Deployment Management
@router.post("/deployments", response_model=ChatbotDeploymentResponse)
async def create_deployment(
    deployment_data: ChatbotDeploymentCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Create a new chatbot deployment
    
    Deployment types supported:
    - **web_widget** - Embeddable chat widget for websites
    - **slack** - Slack app integration
    - **teams** - Microsoft Teams bot
    - **discord** - Discord bot
    - **telegram** - Telegram bot
    - **api** - REST API endpoint
    - **embed** - Generic embed code
    """
    try:
        return await service.create_deployment(tenant_id, deployment_data)
    except Exception as e:
        logger.error(f"Failed to create deployment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create deployment: {str(e)}")

@router.get("/deployments", response_model=List[ChatbotDeploymentResponse])
async def list_deployments(
    deployment_type: Optional[DeploymentType] = Query(None, description="Filter by deployment type"),
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """List all deployments for the organization"""
    try:
        return await service.get_deployments(tenant_id, deployment_type)
    except Exception as e:
        logger.error(f"Failed to list deployments: {e}")
        raise HTTPException(status_code=500, detail="Failed to list deployments")

@router.get("/deployments/{deployment_id}", response_model=ChatbotDeploymentResponse)
async def get_deployment(
    deployment_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """Get details of a specific deployment"""
    try:
        return await service.get_deployment(tenant_id, deployment_id)
    except Exception as e:
        logger.error(f"Failed to get deployment: {e}")
        raise HTTPException(status_code=500, detail="Failed to get deployment")

@router.put("/deployments/{deployment_id}", response_model=ChatbotDeploymentResponse)
async def update_deployment(
    deployment_id: str,
    update_data: ChatbotDeploymentUpdate,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """Update deployment configuration"""
    try:
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        return await service.update_deployment(tenant_id, deployment_id, update_dict)
    except Exception as e:
        logger.error(f"Failed to update deployment: {e}")
        raise HTTPException(status_code=500, detail="Failed to update deployment")

@router.delete("/deployments/{deployment_id}")
async def delete_deployment(
    deployment_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """Delete a deployment and all its data"""
    try:
        await service.delete_deployment(tenant_id, deployment_id)
        return {"message": "Deployment deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete deployment: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete deployment")

# Deployment Actions
@router.post("/deployments/{deployment_id}/deploy", response_model=ChatbotDeploymentResponse)
async def deploy_chatbot(
    deployment_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Activate a chatbot deployment
    
    This will:
    1. Validate the deployment configuration
    2. Set status to active
    3. Make the chatbot available at its deployment URL
    4. Start accepting chat requests
    """
    try:
        return await service.deploy_chatbot(tenant_id, deployment_id)
    except Exception as e:
        logger.error(f"Failed to deploy chatbot: {e}")
        raise HTTPException(status_code=500, detail="Failed to deploy chatbot")

@router.post("/deployments/{deployment_id}/pause", response_model=ChatbotDeploymentResponse)
async def pause_deployment(
    deployment_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """Pause a deployment (temporarily stop accepting requests)"""
    try:
        return await service.pause_deployment(tenant_id, deployment_id)
    except Exception as e:
        logger.error(f"Failed to pause deployment: {e}")
        raise HTTPException(status_code=500, detail="Failed to pause deployment")

@router.post("/deployments/{deployment_id}/stop", response_model=ChatbotDeploymentResponse)
async def stop_deployment(
    deployment_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """Stop a deployment (completely deactivate)"""
    try:
        return await service.stop_deployment(tenant_id, deployment_id)
    except Exception as e:
        logger.error(f"Failed to stop deployment: {e}")
        raise HTTPException(status_code=500, detail="Failed to stop deployment")

# Widget-Specific Endpoints
@router.get("/deployments/{deployment_id}/embed-code", response_model=WidgetEmbedCode)
async def get_widget_embed_code(
    deployment_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Generate embed code for web widget deployment
    
    Returns:
    - **embed_code** - HTML/JavaScript code to paste on your website
    - **script_url** - Direct URL to the widget script
    - **config_json** - Configuration for custom implementations
    - **instructions** - Step-by-step setup guide
    """
    try:
        return await service.generate_widget_embed_code(tenant_id, deployment_id)
    except Exception as e:
        logger.error(f"Failed to generate embed code: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate embed code")

@router.get("/widget/{widget_id}/preview", response_class=HTMLResponse)
async def preview_widget(
    widget_id: str,
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Preview widget in a standalone page
    
    Useful for testing widget appearance and functionality before embedding.
    """
    try:
        # Generate preview HTML page
        preview_html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ChatCraft Widget Preview</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }}
        .preview-container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }}
        .preview-header {{
            text-align: center;
            margin-bottom: 40px;
        }}
        .preview-content {{
            background: #f8fafc;
            padding: 40px;
            border-radius: 8px;
            min-height: 400px;
        }}
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <h1>🤖 ChatCraft Widget Preview</h1>
            <p>This is how your widget will appear on your website</p>
        </div>
        <div class="preview-content">
            <h2>Sample Website Content</h2>
            <p>Your website content would appear here. The chat widget will be positioned according to your settings.</p>
            <p>Try clicking the chat icon to start a conversation!</p>
        </div>
    </div>
    
    <!-- ChatCraft Widget -->
    <script>
        window.ChatCraftConfig = {{
            widgetId: "{widget_id}",
            apiUrl: "/api/widget/{widget_id}/chat",
            preview: true
        }};
    </script>
    <script src="/static/widget/chatcraft-widget.js" async></script>
</body>
</html>"""
        
        return HTMLResponse(content=preview_html)
        
    except Exception as e:
        logger.error(f"Failed to generate widget preview: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate preview")

# Public Widget API (no authentication required)
@router.post("/widget/{widget_id}/chat", response_model=ChatResponse)
async def widget_chat(
    widget_id: str,
    chat_request: ChatRequest,
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Handle chat request from embedded widget
    
    This is the public API endpoint that embedded widgets use to send messages.
    No authentication required, but subject to rate limiting and domain validation.
    """
    try:
        return await service.handle_widget_chat(widget_id, chat_request)
    except Exception as e:
        logger.error(f"Widget chat failed: {e}")
        raise HTTPException(status_code=500, detail="Chat request failed")

# WebSocket endpoint for real-time chat
@router.websocket("/ws/widget/{widget_id}")
async def websocket_widget_chat(
    websocket: WebSocket,
    widget_id: str,
    session_id: str = Query(..., description="Client session ID"),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    WebSocket endpoint for real-time chat with widgets
    
    Enables:
    - Real-time message delivery
    - Typing indicators
    - Connection status updates
    - Streaming responses
    """
    try:
        await websocket_manager.connect(websocket, widget_id, session_id)
        
        while True:
            try:
                # Receive message from client
                data = await websocket.receive_json()
                
                if data.get("type") == "chat":
                    # Handle chat message
                    chat_request = ChatRequest(
                        message=data["message"],
                        session_id=session_id,
                        **data.get("metadata", {})
                    )
                    
                    # Send typing indicator
                    await websocket_manager.send_message(widget_id, session_id, {
                        "type": "typing",
                        "data": {"typing": True},
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    # Process chat request
                    response = await service.handle_widget_chat(widget_id, chat_request)
                    
                    # Send response
                    await websocket_manager.send_message(widget_id, session_id, {
                        "type": "chat_response",
                        "data": response.dict(),
                        "timestamp": datetime.now().isoformat()
                    })
                    
                elif data.get("type") == "ping":
                    # Handle ping/keepalive
                    await websocket_manager.send_message(widget_id, session_id, {
                        "type": "pong",
                        "data": {},
                        "timestamp": datetime.now().isoformat()
                    })
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                await websocket_manager.send_message(widget_id, session_id, {
                    "type": "error",
                    "data": {"message": "An error occurred"},
                    "timestamp": datetime.now().isoformat()
                })
                
    except Exception as e:
        logger.error(f"WebSocket connection failed: {e}")
    finally:
        websocket_manager.disconnect(widget_id, session_id)

# Analytics and Monitoring
@router.get("/deployments/{deployment_id}/analytics", response_model=DeploymentAnalytics)
async def get_deployment_analytics(
    deployment_id: str,
    days: int = Query(default=30, ge=1, le=365, description="Number of days to analyze"),
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Get comprehensive analytics for a deployment
    
    Metrics include:
    - **Conversation volume** and user engagement
    - **Message patterns** and response times
    - **User satisfaction** and feedback
    - **Popular queries** and knowledge gaps
    - **Usage patterns** by time and location
    """
    try:
        return await service.get_deployment_analytics(tenant_id, deployment_id, days)
    except Exception as e:
        logger.error(f"Failed to get deployment analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get analytics")

@router.get("/stats", response_model=DeploymentStats)
async def get_deployment_overview(
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Get overview statistics for all deployments
    
    Provides high-level metrics across all your chatbot deployments.
    """
    try:
        return await service.get_deployment_stats(tenant_id)
    except Exception as e:
        logger.error(f"Failed to get deployment stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")

# Streaming Chat Response (alternative to WebSocket)
@router.post("/widget/{widget_id}/chat/stream")
async def stream_widget_chat(
    widget_id: str,
    chat_request: ChatRequest,
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Stream chat response using Server-Sent Events
    
    Alternative to WebSocket for browsers that need simpler integration.
    """
    async def generate_stream():
        try:
            # Send initial event
            yield f"data: {json.dumps({'type': 'start', 'message': 'Processing your request...'})}\n\n"
            
            # Process chat request
            response = await service.handle_widget_chat(widget_id, chat_request)
            
            # Stream response word by word for better UX
            words = response.response.split()
            current_text = ""
            
            for i, word in enumerate(words):
                current_text += word + " "
                
                yield f"data: {json.dumps({
                    'type': 'partial',
                    'text': current_text.strip(),
                    'progress': (i + 1) / len(words)
                })}\n\n"
                
                # Small delay for streaming effect
                await asyncio.sleep(0.05)
            
            # Send final response
            yield f"data: {json.dumps({
                'type': 'complete',
                'response': response.dict()
            })}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({
                'type': 'error',
                'error': str(e)
            })}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

# Feedback and Rating
@router.post("/widget/{widget_id}/feedback")
async def submit_widget_feedback(
    widget_id: str,
    feedback_data: Dict[str, Any],
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Submit user feedback for a widget conversation
    
    Accepts:
    - **message_id** - ID of the message being rated
    - **score** - Rating from 1-5
    - **comment** - Optional feedback comment
    """
    try:
        message_id = feedback_data.get("message_id")
        score = feedback_data.get("score")
        comment = feedback_data.get("comment")
        
        if not message_id or not score:
            raise HTTPException(status_code=400, detail="message_id and score are required")
        
        # Update message with feedback
        from ..models.deployment import DeploymentMessage
        
        await service.db.execute(
            update(DeploymentMessage).where(
                DeploymentMessage.id == message_id
            ).values(
                feedback_score=score,
                feedback_comment=comment
            )
        )
        
        await service.db.commit()
        
        return {"message": "Feedback submitted successfully"}
        
    except Exception as e:
        logger.error(f"Failed to submit feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit feedback")

# Widget Configuration
@router.get("/widget/{widget_id}/config")
async def get_widget_config(
    widget_id: str,
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Get public configuration for a widget
    
    Returns configuration needed by the widget JavaScript without sensitive data.
    """
    try:
        # Get deployment by widget ID (public endpoint, so no tenant verification)
        from ..models.deployment import ChatbotDeployment
        
        result = await service.db.execute(
            select(ChatbotDeployment).where(
                ChatbotDeployment.widget_id == widget_id,
                ChatbotDeployment.status == DeploymentStatus.ACTIVE
            )
        )
        
        deployment = result.scalar_one_or_none()
        if not deployment:
            raise HTTPException(status_code=404, detail="Widget not found or inactive")
        
        # Return safe configuration
        return {
            "widget_id": widget_id,
            "styling": deployment.widget_styling,
            "config": {
                "greeting_enabled": deployment.deployment_config.get("greeting_enabled", True),
                "typing_indicator": deployment.deployment_config.get("typing_indicator", True),
                "conversation_starters": deployment.deployment_config.get("conversation_starters", []),
                "quick_replies": deployment.deployment_config.get("quick_replies", []),
                "feedback_enabled": deployment.deployment_config.get("feedback_enabled", True),
                "file_upload_enabled": deployment.deployment_config.get("file_upload_enabled", False)
            },
            "endpoints": {
                "chat": f"/api/deployment/widget/{widget_id}/chat",
                "websocket": f"/api/deployment/ws/widget/{widget_id}",
                "feedback": f"/api/deployment/widget/{widget_id}/feedback"
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get widget config: {e}")
        raise HTTPException(status_code=500, detail="Failed to get widget configuration")

# Deployment Templates and Quick Setup
@router.get("/templates")
async def get_deployment_templates():
    """
    Get pre-configured deployment templates
    
    Returns common deployment configurations for different use cases.
    """
    templates = [
        {
            "id": "customer_support",
            "name": "Customer Support Widget",
            "description": "Professional widget for customer support with escalation",
            "deployment_type": "web_widget",
            "config": {
                "greeting_enabled": True,
                "typing_indicator": True,
                "escalation_enabled": True,
                "feedback_enabled": True,
                "conversation_starters": [
                    "How can I track my order?",
                    "I need help with my account",
                    "What are your business hours?"
                ]
            },
            "styling": {
                "position": "bottom-right",
                "size": "medium",
                "primary_color": "#2563eb",
                "header_title": "Customer Support",
                "header_subtitle": "We're here to help!"
            }
        },
        {
            "id": "sales_assistant",
            "name": "Sales Assistant Widget",
            "description": "Friendly widget for lead generation and sales support",
            "deployment_type": "web_widget",
            "config": {
                "greeting_enabled": True,
                "conversation_starters": [
                    "Tell me about your products",
                    "I'd like a demo",
                    "What are your pricing options?"
                ],
                "quick_replies": [
                    "Get pricing",
                    "Schedule demo",
                    "Contact sales"
                ]
            },
            "styling": {
                "position": "bottom-right",
                "size": "large",
                "primary_color": "#10b981",
                "header_title": "Sales Assistant",
                "header_subtitle": "Let's find the perfect solution!"
            }
        },
        {
            "id": "technical_support",
            "name": "Technical Support Widget",
            "description": "Technical widget with detailed troubleshooting capabilities",
            "deployment_type": "web_widget",
            "config": {
                "greeting_enabled": True,
                "file_upload_enabled": True,
                "conversation_starters": [
                    "I'm having a technical issue",
                    "How do I configure this feature?",
                    "Something isn't working properly"
                ]
            },
            "styling": {
                "position": "bottom-right",
                "size": "large",
                "primary_color": "#7c3aed",
                "header_title": "Technical Support",
                "header_subtitle": "Let's solve this together"
            }
        },
        {
            "id": "simple_faq",
            "name": "Simple FAQ Widget",
            "description": "Minimal widget for basic questions and answers",
            "deployment_type": "web_widget",
            "config": {
                "greeting_enabled": False,
                "typing_indicator": False,
                "conversation_starters": [
                    "Frequently asked questions",
                    "Product information",
                    "Contact information"
                ]
            },
            "styling": {
                "position": "bottom-right",
                "size": "small",
                "primary_color": "#6b7280",
                "header_title": "FAQ",
                "header_subtitle": "Quick answers"
            }
        }
    ]
    
    return {"templates": templates}

@router.post("/quick-deploy")
async def quick_deploy_from_template(
    template_id: str,
    config_id: str,
    name: str,
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Quick deploy using a pre-configured template
    
    Creates and immediately activates a deployment based on a template.
    """
    try:
        # Get templates
        templates_response = await get_deployment_templates()
        templates = {t["id"]: t for t in templates_response["templates"]}
        
        if template_id not in templates:
            raise HTTPException(status_code=404, detail="Template not found")
        
        template = templates[template_id]
        
        # Create deployment from template
        deployment_data = ChatbotDeploymentCreate(
            config_id=config_id,
            name=name,
            description=f"Quick deployment: {template['description']}",
            deployment_type=DeploymentType(template["deployment_type"]),
            deployment_config=DeploymentConfigData(**template["config"]),
            widget_styling=WidgetStyling(**template["styling"]) if "styling" in template else None
        )
        
        # Create deployment
        deployment = await service.create_deployment(tenant_id, deployment_data)
        
        # Immediately activate it
        active_deployment = await service.deploy_chatbot(tenant_id, deployment.id)
        
        # Generate embed code if it's a widget
        embed_code = None
        if deployment.deployment_type == DeploymentType.WEB_WIDGET:
            embed_code = await service.generate_widget_embed_code(tenant_id, deployment.id)
        
        return {
            "deployment": active_deployment,
            "embed_code": embed_code,
            "message": f"Successfully deployed {template['name']}",
            "next_steps": [
                "Copy the embed code to your website" if embed_code else "Configure your integration",
                "Test the chatbot functionality",
                "Monitor conversations in the dashboard",
                "Customize styling and behavior as needed"
            ]
        }
        
    except Exception as e:
        logger.error(f"Quick deploy failed: {e}")
        raise HTTPException(status_code=500, detail=f"Quick deploy failed: {str(e)}")

# Development and Testing
@router.post("/deployments/{deployment_id}/test")
async def test_deployment(
    deployment_id: str,
    test_messages: List[str],
    tenant_id: str = Depends(get_current_tenant_id),
    service: DeploymentService = Depends(get_deployment_service)
):
    """
    Test a deployment with sample messages
    
    Useful for validating deployment functionality before going live.
    """
    try:
        deployment = await service.get_deployment(tenant_id, deployment_id)
        
        if deployment.status != DeploymentStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Deployment must be active to test")
        
        test_results = []
        
        for message in test_messages:
            chat_request = ChatRequest(
                message=message,
                session_id="test_session",
                user_id="test_user"
            )
            
            try:
                start_time = datetime.now()
                response = await service.handle_widget_chat(deployment.widget_id, chat_request)
                response_time = (datetime.now() - start_time).total_seconds() * 1000
                
                test_results.append({
                    "message": message,
                    "response": response.response,
                    "response_time_ms": int(response_time),
                    "status": "success",
                    "retrieved_sources": len(response.retrieved_sources)
                })
                
            except Exception as e:
                test_results.append({
                    "message": message,
                    "response": None,
                    "status": "error",
                    "error": str(e)
                })
        
        # Calculate summary
        successful_tests = len([r for r in test_results if r["status"] == "success"])
        avg_response_time = sum(r.get("response_time_ms", 0) for r in test_results if r["status"] == "success")
        avg_response_time = avg_response_time / successful_tests if successful_tests > 0 else 0
        
        return {
            "deployment_id": deployment_id,
            "test_results": test_results,
            "summary": {
                "total_tests": len(test_messages),
                "successful_tests": successful_tests,
                "success_rate": successful_tests / len(test_messages),
                "average_response_time_ms": int(avg_response_time)
            }
        }
        
    except Exception as e:
        logger.error(f"Deployment test failed: {e}")
        raise HTTPException(status_code=500, detail="Deployment test failed")

# Import asyncio for streaming
import asyncio