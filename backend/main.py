# backend/main.py
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import structlog

from .database import init_database, close_database, get_db_session
from .routers.content import router as content_router
from .auth import create_demo_tenant, create_demo_token, get_db_session
from .models.content import Tenant

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup
    logger.info("🚀 Starting ChatCraft Studio Backend")
    
    try:
        await init_database()
        logger.info("✅ Database initialized")
        
        # Initialize any background services here
        # e.g., vector database connection, Redis, etc.
        
        yield
        
    except Exception as e:
        logger.error("❌ Failed to start application", error=str(e))
        raise
    finally:
        # Shutdown
        logger.info("🛑 Shutting down ChatCraft Studio Backend")
        await close_database()
        logger.info("✅ Cleanup completed")

# Create FastAPI application
app = FastAPI(
    title="ChatCraft Studio - Multi-Tenant RAG Platform",
    description="""
    ## ChatCraft Studio Backend API
    
    A multi-tenant SaaS platform that transforms organizational questionnaire data 
    and knowledge repositories into intelligent, production-ready chatbots using 
    RAG (Retrieval-Augmented Generation) architecture.
    
    ### Key Features:
    - **Multi-tenant content ingestion** with quota management
    - **Document processing** (PDF, DOCX, TXT)  
    - **Website scraping** with intelligent crawling
    - **Video transcription** using Whisper
    - **API endpoint integration**
    - **Real-time processing status** tracking
    - **Tenant isolation** at all layers
    
    ### Authentication:
    All endpoints require Bearer token authentication. Use the `/auth/demo-token` 
    endpoint to get a demo token for testing.
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["*"]  # Configure properly in production
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://localhost:3000",
        # Add your frontend domains here
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# Custom middleware for request logging
@app.middleware("http")
async def log_requests(request, call_next):
    start_time = datetime.now()
    
    # Log request
    logger.info(
        "Request started",
        method=request.method,
        url=str(request.url),
        client_ip=request.client.host if request.client else None
    )
    
    try:
        response = await call_next(request)
        
        # Log successful response
        duration = (datetime.now() - start_time).total_seconds()
        logger.info(
            "Request completed",
            method=request.method,
            url=str(request.url),
            status_code=response.status_code,
            duration_seconds=duration
        )
        
        return response
        
    except Exception as e:
        # Log error
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(
            "Request failed",
            method=request.method,
            url=str(request.url),
            error=str(e),
            duration_seconds=duration
        )
        raise

# Include routers
app.include_router(content_router)

# Original questionnaire models (keeping for backward compatibility)
class QuestionnaireResponse(BaseModel):
    """Model that matches your React form exactly"""
    organizationName: str = Field(..., min_length=1, description="Organization name")
    organizationType: str = Field(..., description="Type of organization")
    industry: str = Field(..., description="Industry sector")
    organizationSize: str = Field(..., description="Organization size")
    primaryPurpose: str = Field(..., description="Main chatbot purpose")
    targetAudience: list[str] = Field(default_factory=list, description="Target audience")
    communicationStyle: str = Field(..., description="Communication style")
    supportChannels: list[str] = Field(default_factory=list, description="Support channels")
    businessHours: str | None = Field(None, description="Business hours")
    specialRequirements: str | None = Field(None, description="Special requirements")
    complianceNeeds: list[str] = Field(default_factory=list, description="Compliance needs")
    languages: list[str] = Field(default=["English"], description="Languages")
    integrationNeeds: list[str] = Field(default_factory=list, description="Integration needs")

class SaveResponse(BaseModel):
    """Response after saving questionnaire"""
    id: str
    message: str
    saved_at: datetime
    organization_name: str

class TenantCreateRequest(BaseModel):
    """Request to create a new tenant"""
    organization_name: str
    questionnaire_data: QuestionnaireResponse

class AuthTokenResponse(BaseModel):
    """Authentication token response"""
    access_token: str
    refresh_token: str
    token_type: str
    tenant_id: str
    expires_in: int

# Root endpoint
@app.get("/")
async def root():
    """Health check and API information"""
    return {
        "message": "ChatCraft Studio - Multi-Tenant RAG Platform",
        "status": "running",
        "version": "1.0.0",
        "timestamp": datetime.now(),
        "features": [
            "Multi-tenant content ingestion",
            "Document processing (PDF, DOCX, TXT)",
            "Website scraping",
            "Video transcription", 
            "API integration",
            "Real-time processing",
            "Tenant isolation"
        ],
        "endpoints": {
            "docs": "/docs",
            "health": "/health",
            "questionnaire": "/api/save-questionnaire",
            "content": "/api/content",
            "auth": "/auth"
        }
    }

@app.get("/health")
async def health_check():
    """Detailed health check endpoint"""
    try:
        # Test database connection
        async with get_db_context() as db:
            await db.execute("SELECT 1")
        
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
    
    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "timestamp": datetime.now(),
        "services": {
            "database": db_status,
            "api": "healthy"
        },
        "uptime": "unknown",  # Implement proper uptime tracking
        "version": "1.0.0"
    }

# Authentication endpoints
@app.post("/auth/create-tenant", response_model=AuthTokenResponse)
async def create_tenant_with_questionnaire(
    request: TenantCreateRequest,
    db = Depends(get_db_session)
):
    """
    Create a new tenant with questionnaire data and return auth tokens
    This simulates the complete onboarding flow
    """
    try:
        # Save questionnaire (original logic)
        import json
        import uuid
        import sqlite3
        
        response_id = str(uuid.uuid4())
        data = request.questionnaire_data
        
        # Create tenant in new system
        tenant = await create_demo_tenant(
            organization_name=data.organizationName,
            questionnaire_id=response_id,
            db=db
        )
        
        # Save questionnaire to SQLite (backward compatibility)
        conn = sqlite3.connect('questionnaire_responses.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS questionnaire_responses (
                id TEXT PRIMARY KEY,
                organization_name TEXT NOT NULL,
                organization_type TEXT NOT NULL,
                industry TEXT NOT NULL,
                organization_size TEXT NOT NULL,
                primary_purpose TEXT NOT NULL,
                target_audience TEXT NOT NULL,
                communication_style TEXT NOT NULL,
                support_channels TEXT NOT NULL,
                business_hours TEXT,
                special_requirements TEXT,
                compliance_needs TEXT NOT NULL,
                languages TEXT NOT NULL,
                integration_needs TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                raw_json TEXT NOT NULL
            )
        ''')
        
        cursor.execute('''
            INSERT INTO questionnaire_responses (
                id, organization_name, organization_type, industry, organization_size,
                primary_purpose, target_audience, communication_style, support_channels,
                business_hours, special_requirements, compliance_needs, languages,
                integration_needs, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            response_id,
            data.organizationName,
            data.organizationType,
            data.industry,
            data.organizationSize,
            data.primaryPurpose,
            json.dumps(data.targetAudience),
            data.communicationStyle,
            json.dumps(data.supportChannels),
            data.businessHours,
            data.specialRequirements,
            json.dumps(data.complianceNeeds),
            json.dumps(data.languages),
            json.dumps(data.integrationNeeds),
            json.dumps(data.dict())
        ))
        
        conn.commit()
        conn.close()
        
        # Create authentication tokens
        tokens = create_demo_token(tenant.id, f"user@{tenant.organization_name.lower().replace(' ', '')}.com")
        
        logger.info(
            "Tenant created successfully",
            tenant_id=tenant.id,
            organization=tenant.organization_name,
            questionnaire_id=response_id
        )
        
        return AuthTokenResponse(
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            token_type=tokens["token_type"],
            tenant_id=tenant.id,
            expires_in=1800  # 30 minutes
        )
        
    except Exception as e:
        logger.error("Failed to create tenant", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to create tenant: {str(e)}")

@app.post("/auth/demo-token", response_model=AuthTokenResponse)
async def get_demo_token(
    tenant_id: str = None,
    organization_name: str = "Demo Organization"
):
    """
    Get demo authentication tokens for testing
    If no tenant_id provided, creates a new demo tenant
    """
    try:
        if not tenant_id:
            # Create demo tenant
            async with get_db_context() as db:
                tenant = await create_demo_tenant(
                    organization_name=organization_name,
                    questionnaire_id="demo-questionnaire",
                    db=db
                )
                tenant_id = tenant.id
        
        # Create tokens
        tokens = create_demo_token(tenant_id)
        
        return AuthTokenResponse(
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            token_type=tokens["token_type"],
            tenant_id=tenant_id,
            expires_in=1800
        )
        
    except Exception as e:
        logger.error("Failed to create demo token", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to create demo token: {str(e)}")

# Legacy questionnaire endpoint (backward compatibility)
@app.post("/api/save-questionnaire", response_model=SaveResponse)
async def save_questionnaire(data: QuestionnaireResponse):
    """
    Legacy endpoint for saving questionnaire responses
    Kept for backward compatibility with existing frontend
    """
    try:
        import json
        import uuid
        import sqlite3
        
        response_id = str(uuid.uuid4())
        
        # Save to SQLite (original logic)
        conn = sqlite3.connect('questionnaire_responses.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS questionnaire_responses (
                id TEXT PRIMARY KEY,
                organization_name TEXT NOT NULL,
                organization_type TEXT NOT NULL,
                industry TEXT NOT NULL,
                organization_size TEXT NOT NULL,
                primary_purpose TEXT NOT NULL,
                target_audience TEXT NOT NULL,
                communication_style TEXT NOT NULL,
                support_channels TEXT NOT NULL,
                business_hours TEXT,
                special_requirements TEXT,
                compliance_needs TEXT NOT NULL,
                languages TEXT NOT NULL,
                integration_needs TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                raw_json TEXT NOT NULL
            )
        ''')
        
        cursor.execute('''
            INSERT INTO questionnaire_responses (
                id, organization_name, organization_type, industry, organization_size,
                primary_purpose, target_audience, communication_style, support_channels,
                business_hours, special_requirements, compliance_needs, languages,
                integration_needs, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            response_id,
            data.organizationName,
            data.organizationType,
            data.industry,
            data.organizationSize,
            data.primaryPurpose,
            json.dumps(data.targetAudience),
            data.communicationStyle,
            json.dumps(data.supportChannels),
            data.businessHours,
            data.specialRequirements,
            json.dumps(data.complianceNeeds),
            json.dumps(data.languages),
            json.dumps(data.integrationNeeds),
            json.dumps(data.dict())
        ))
        
        conn.commit()
        conn.close()
        
        logger.info("Questionnaire saved", questionnaire_id=response_id, organization=data.organizationName)
        
        return SaveResponse(
            id=response_id,
            message="Questionnaire response saved successfully! Use /auth/create-tenant to create a full tenant.",
            saved_at=datetime.now(),
            organization_name=data.organizationName
        )
        
    except Exception as e:
        logger.error("Failed to save questionnaire", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to save questionnaire: {str(e)}")

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Custom HTTP exception handler with structured logging"""
    logger.warning(
        "HTTP exception occurred",
        status_code=exc.status_code,
        detail=exc.detail,
        url=str(request.url),
        method=request.method
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "status_code": exc.status_code,
            "message": exc.detail,
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle unexpected exceptions"""
    logger.error(
        "Unexpected exception occurred",
        error=str(exc),
        url=str(request.url),
        method=request.method,
        exc_info=True
    )
    
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "status_code": 500,
            "message": "Internal server error",
            "timestamp": datetime.now().isoformat()
        }
    )

# Development utilities
if os.getenv("ENVIRONMENT") == "development":
    
    @app.get("/dev/reset-tenant/{tenant_id}")
    async def reset_tenant_data(tenant_id: str):
        """Development endpoint to reset tenant data"""
        try:
            async with get_db_context() as db:
                # Delete all content sources and chunks for tenant
                await db.execute(f"DELETE FROM content_chunks WHERE tenant_id = '{tenant_id}'")
                await db.execute(f"DELETE FROM content_sources WHERE tenant_id = '{tenant_id}'")
                
                # Reset tenant usage
                await db.execute(f"""
                    UPDATE tenants 
                    SET document_count = 0, storage_used_mb = 0, monthly_queries_used = 0
                    WHERE id = '{tenant_id}'
                """)
                
                await db.commit()
            
            return {"message": f"Tenant {tenant_id} data reset successfully"}
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to reset tenant: {str(e)}")
    
    @app.get("/dev/tenants")
    async def list_all_tenants():
        """Development endpoint to list all tenants"""
        try:
            async with get_db_context() as db:
                result = await db.execute("SELECT id, organization_name, subscription_tier, created_at FROM tenants")
                tenants = result.fetchall()
                
                return {
                    "tenants": [
                        {
                            "id": tenant[0],
                            "organization_name": tenant[1], 
                            "subscription_tier": tenant[2],
                            "created_at": tenant[3]
                        }
                        for tenant in tenants
                    ]
                }
                
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list tenants: {str(e)}")

# For running with uvicorn directly
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    reload = os.getenv("ENVIRONMENT", "development") == "development"
    
    uvicorn.run(
        "main:app", 
        host=host, 
        port=port, 
        reload=reload,
        log_config={
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                },
            },
            "handlers": {
                "default": {
                    "formatter": "default",
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                },
            },
            "root": {
                "level": "INFO",
                "handlers": ["default"],
            },
        }
    )