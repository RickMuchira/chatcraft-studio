# backend/alembic/versions/001_initial_tables.py
"""Initial tables for content ingestion

Revision ID: 001
Revises: 
Create Date: 2025-01-01 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Create tenants table
    op.create_table('tenants',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organization_name', sa.String(), nullable=False),
        sa.Column('organization_type', sa.String(), nullable=False),
        sa.Column('industry', sa.String(), nullable=False),
        sa.Column('subscription_tier', sa.String(), nullable=True, default='free'),
        sa.Column('max_documents', sa.Integer(), nullable=True, default=50),
        sa.Column('max_storage_mb', sa.Integer(), nullable=True, default=1000),
        sa.Column('max_monthly_queries', sa.Integer(), nullable=True, default=1000),
        sa.Column('document_count', sa.Integer(), nullable=True, default=0),
        sa.Column('storage_used_mb', sa.Integer(), nullable=True, default=0),
        sa.Column('monthly_queries_used', sa.Integer(), nullable=True, default=0),
        sa.Column('last_query_reset', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('questionnaire_id', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create content_sources table
    op.create_table('content_sources',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('source_url', sa.String(), nullable=True),
        sa.Column('file_path', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, default='pending'),
        sa.Column('progress_percentage', sa.Integer(), nullable=True, default=0),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('file_size_mb', sa.Integer(), nullable=True, default=0),
        sa.Column('total_chunks', sa.Integer(), nullable=True, default=0),
        sa.Column('processed_chunks', sa.Integer(), nullable=True, default=0),
        sa.Column('config', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('last_processed', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create content_chunks table
    op.create_table('content_chunks',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('source_id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('keywords', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('embedding_id', sa.String(), nullable=True),
        sa.Column('token_count', sa.Integer(), nullable=True, default=0),
        sa.Column('character_count', sa.Integer(), nullable=True, default=0),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['source_id'], ['content_sources.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for performance
    op.create_index('ix_content_source_tenant', 'content_sources', ['tenant_id'])
    op.create_index('ix_content_source_status', 'content_sources', ['status'])
    op.create_index('ix_content_source_type', 'content_sources', ['content_type'])
    op.create_index('ix_content_chunk_tenant', 'content_chunks', ['tenant_id'])
    op.create_index('ix_content_chunk_source', 'content_chunks', ['source_id'])
    op.create_index('ix_content_chunk_embedding', 'content_chunks', ['embedding_id'])
    
    # Create composite indexes for common queries
    op.create_index('ix_content_source_tenant_status', 'content_sources', ['tenant_id', 'status'])
    op.create_index('ix_content_chunk_tenant_source', 'content_chunks', ['tenant_id', 'source_id'])

def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_content_chunk_tenant_source', table_name='content_chunks')
    op.drop_index('ix_content_source_tenant_status', table_name='content_sources')
    op.drop_index('ix_content_chunk_embedding', table_name='content_chunks')
    op.drop_index('ix_content_chunk_source', table_name='content_chunks')
    op.drop_index('ix_content_chunk_tenant', table_name='content_chunks')
    op.drop_index('ix_content_source_type', table_name='content_sources')
    op.drop_index('ix_content_source_status', table_name='content_sources')
    op.drop_index('ix_content_source_tenant', table_name='content_sources')
    
    # Drop tables
    op.drop_table('content_chunks')
    op.drop_table('content_sources')
    op.drop_table('tenants')
