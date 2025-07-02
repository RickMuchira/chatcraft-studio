# backend/scripts/create_migration.py
"""Script to create new database migrations"""
import subprocess
import sys
from datetime import datetime

def create_migration(message: str):
    """Create a new Alembic migration"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    try:
        result = subprocess.run([
            "alembic", "revision", "--autogenerate", 
            "-m", message,
            "--rev-id", timestamp
        ], capture_output=True, text=True, check=True)
        
        print(f"✅ Migration created successfully:")
        print(result.stdout)
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Error creating migration:")
        print(e.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python create_migration.py 'migration message'")
        sys.exit(1)
    
    message = sys.argv[1]
    create_migration(message)