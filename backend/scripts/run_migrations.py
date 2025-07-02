# backend/scripts/run_migrations.py
"""Script to run database migrations"""
import subprocess
import sys
import asyncio
from backend.database import init_database

async def run_migrations():
    """Run Alembic migrations and initialize database"""
    
    try:
        # Run Alembic migrations
        print("🔄 Running database migrations...")
        result = subprocess.run([
            "alembic", "upgrade", "head"
        ], capture_output=True, text=True, check=True)
        
        print("✅ Migrations completed successfully")
        print(result.stdout)
        
        # Initialize any additional setup
        await init_database()
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running migrations:")
        print(e.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_migrations())