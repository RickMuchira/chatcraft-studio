# backend/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import sqlite3
import uuid
from datetime import datetime
import json
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_database()
    print("✅ Database initialized")
    yield
    # Shutdown (if needed)
    pass

app = FastAPI(
    title="ChatCraft Studio - Questionnaire Backend",
    lifespan=lifespan
)

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic model that exactly matches your frontend form data
class QuestionnaireResponse(BaseModel):
    """Model that matches your React form exactly"""
    organizationName: str = Field(..., min_length=1, description="Organization name")
    organizationType: str = Field(..., description="Type of organization")
    industry: str = Field(..., description="Industry sector")
    organizationSize: str = Field(..., description="Organization size")
    primaryPurpose: str = Field(..., description="Main chatbot purpose")
    targetAudience: List[str] = Field(default_factory=list, description="Target audience")
    communicationStyle: str = Field(..., description="Communication style")
    supportChannels: List[str] = Field(default_factory=list, description="Support channels")
    businessHours: Optional[str] = Field(None, description="Business hours")
    specialRequirements: Optional[str] = Field(None, description="Special requirements")
    complianceNeeds: List[str] = Field(default_factory=list, description="Compliance needs")
    languages: List[str] = Field(default=["English"], description="Languages")
    integrationNeeds: List[str] = Field(default_factory=list, description="Integration needs")

class SaveResponse(BaseModel):
    """Response after saving questionnaire"""
    id: str
    message: str
    saved_at: datetime
    organization_name: str

# Database setup
def init_database():
    """Initialize SQLite database"""
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
            target_audience TEXT NOT NULL,  -- JSON string
            communication_style TEXT NOT NULL,
            support_channels TEXT NOT NULL,  -- JSON string
            business_hours TEXT,
            special_requirements TEXT,
            compliance_needs TEXT NOT NULL,  -- JSON string
            languages TEXT NOT NULL,  -- JSON string
            integration_needs TEXT NOT NULL,  -- JSON string
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            raw_json TEXT NOT NULL  -- Store complete form data as JSON
        )
    ''')
    
    conn.commit()
    conn.close()

@app.get("/")
async def root():
    """Health check"""
    return {
        "message": "ChatCraft Studio Questionnaire Backend",
        "status": "running",
        "timestamp": datetime.now()
    }

@app.post("/api/save-questionnaire", response_model=SaveResponse)
async def save_questionnaire(data: QuestionnaireResponse):
    """
    Save questionnaire response to database
    This endpoint receives data from your React form
    """
    try:
        # Generate unique ID
        response_id = str(uuid.uuid4())
        
        # Connect to database
        conn = sqlite3.connect('questionnaire_responses.db')
        cursor = conn.cursor()
        
        # Convert data to match database schema
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
            json.dumps(data.targetAudience),  # Convert list to JSON string
            data.communicationStyle,
            json.dumps(data.supportChannels),  # Convert list to JSON string
            data.businessHours,
            data.specialRequirements,
            json.dumps(data.complianceNeeds),  # Convert list to JSON string
            json.dumps(data.languages),  # Convert list to JSON string
            json.dumps(data.integrationNeeds),  # Convert list to JSON string
            json.dumps(data.dict())  # Store complete form data as JSON
        ))
        
        conn.commit()
        conn.close()
        
        print(f"✅ Saved questionnaire response: {response_id} for {data.organizationName}")
        
        return SaveResponse(
            id=response_id,
            message="Questionnaire response saved successfully!",
            saved_at=datetime.now(),
            organization_name=data.organizationName
        )
        
    except Exception as e:
        print(f"❌ Error saving questionnaire: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save questionnaire: {str(e)}")

@app.get("/api/questionnaire/{response_id}")
async def get_questionnaire(response_id: str):
    """Get a saved questionnaire response by ID"""
    try:
        conn = sqlite3.connect('questionnaire_responses.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM questionnaire_responses WHERE id = ?
        ''', (response_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Questionnaire response not found")
        
        # Get column names
        conn = sqlite3.connect('questionnaire_responses.db')
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(questionnaire_responses)")
        columns = [column[1] for column in cursor.fetchall()]
        conn.close()
        
        # Convert row to dictionary
        result = dict(zip(columns, row))
        
        # Parse JSON fields back to lists
        result['target_audience'] = json.loads(result['target_audience'])
        result['support_channels'] = json.loads(result['support_channels'])
        result['compliance_needs'] = json.loads(result['compliance_needs'])
        result['languages'] = json.loads(result['languages'])
        result['integration_needs'] = json.loads(result['integration_needs'])
        result['raw_json'] = json.loads(result['raw_json'])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error fetching questionnaire: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch questionnaire: {str(e)}")

@app.get("/api/questionnaires")
async def get_all_questionnaires(skip: int = 0, limit: int = 10):
    """Get all saved questionnaire responses (paginated)"""
    try:
        conn = sqlite3.connect('questionnaire_responses.db')
        cursor = conn.cursor()
        
        # Get total count
        cursor.execute("SELECT COUNT(*) FROM questionnaire_responses")
        total_count = cursor.fetchone()[0]
        
        # Get paginated results
        cursor.execute('''
            SELECT id, organization_name, organization_type, industry, 
                   communication_style, created_at 
            FROM questionnaire_responses 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        ''', (limit, skip))
        
        rows = cursor.fetchall()
        conn.close()
        
        # Convert to list of dictionaries
        results = []
        for row in rows:
            results.append({
                'id': row[0],
                'organization_name': row[1],
                'organization_type': row[2],
                'industry': row[3],
                'communication_style': row[4],
                'created_at': row[5]
            })
        
        return {
            'questionnaires': results,
            'total_count': total_count,
            'skip': skip,
            'limit': limit
        }
        
    except Exception as e:
        print(f"❌ Error fetching questionnaires: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch questionnaires: {str(e)}")

@app.delete("/api/questionnaire/{response_id}")
async def delete_questionnaire(response_id: str):
    """Delete a questionnaire response"""
    try:
        conn = sqlite3.connect('questionnaire_responses.db')
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute("SELECT id FROM questionnaire_responses WHERE id = ?", (response_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Questionnaire response not found")
        
        # Delete
        cursor.execute("DELETE FROM questionnaire_responses WHERE id = ?", (response_id,))
        conn.commit()
        conn.close()
        
        return {"message": "Questionnaire response deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error deleting questionnaire: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete questionnaire: {str(e)}")

# For running with uvicorn directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)