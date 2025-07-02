# backend/processors/__init__.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import asyncio
import aiofiles
import httpx
from pathlib import Path
import logging
import re
from urllib.parse import urljoin, urlparse
import mimetypes

# Document processing
try:
    import PyPDF2
    import docx
except ImportError:
    print("Install document processing dependencies: pip install PyPDF2 python-docx")

# Web scraping
try:
    from bs4 import BeautifulSoup
    import trafilatura
except ImportError:
    print("Install web scraping dependencies: pip install beautifulsoup4 trafilatura")

# Video processing
try:
    import yt_dlp
    import whisper
except ImportError:
    print("Install video processing dependencies: pip install yt-dlp openai-whisper")

logger = logging.getLogger(__name__)

class BaseProcessor(ABC):
    """Base class for all content processors"""
    
    def __init__(self):
        self.chunk_size = 1000  # Default chunk size in characters
        self.overlap_size = 200  # Overlap between chunks
    
    @abstractmethod
    async def extract_content(self, source) -> Dict[str, Any]:
        """Extract raw content from source"""
        pass
    
    async def chunk_content(self, content_data: Dict[str, Any], config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split content into chunks for embedding"""
        
        chunk_size = config.get('chunk_size', self.chunk_size)
        overlap_size = config.get('overlap_size', self.overlap_size)
        
        text = content_data.get('text', '')
        title = content_data.get('title', '')
        metadata = content_data.get('metadata', {})
        
        if not text:
            return []
        
        # Smart chunking - try to split on natural boundaries
        chunks = await self._smart_chunk_text(text, chunk_size, overlap_size)
        
        # Create chunk objects
        chunk_objects = []
        for i, chunk_text in enumerate(chunks):
            chunk_obj = {
                'content': chunk_text,
                'title': title if i == 0 else f"{title} (Part {i+1})",
                'metadata': {
                    **metadata,
                    'chunk_index': i,
                    'total_chunks': len(chunks),
                    'source_type': content_data.get('source_type', 'unknown')
                },
                'keywords': await self._extract_keywords(chunk_text)
            }
            chunk_objects.append(chunk_obj)
        
        return chunk_objects
    
    async def _smart_chunk_text(self, text: str, chunk_size: int, overlap_size: int) -> List[str]:
        """Intelligently chunk text on natural boundaries"""
        
        if len(text) <= chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            
            if end >= len(text):
                # Last chunk
                chunks.append(text[start:])
                break
            
            # Try to find a natural break point
            break_points = ['. ', '\n\n', '\n', '! ', '? ']
            best_break = end
            
            for break_point in break_points:
                last_break = text.rfind(break_point, start, end)
                if last_break > start + chunk_size // 2:  # Don't break too early
                    best_break = last_break + len(break_point)
                    break
            
            chunks.append(text[start:best_break])
            start = best_break - overlap_size if best_break > overlap_size else best_break
        
        return chunks
    
    async def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text (simple implementation)"""
        
        # Remove common stop words
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are',
            'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
            'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can'
        }
        
        # Extract words (simple tokenization)
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
        
        # Filter stop words and get unique words
        keywords = list(set(word for word in words if word not in stop_words))
        
        # Return top 10 most relevant keywords (by length for now)
        return sorted(keywords, key=len, reverse=True)[:10]

class DocumentProcessor(BaseProcessor):
    """Process documents (PDF, DOCX, TXT)"""
    
    async def extract_content(self, source) -> Dict[str, Any]:
        """Extract text from document files"""
        
        if not source.file_path:
            raise ValueError("No file path provided for document")
        
        file_path = Path(source.file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        file_extension = file_path.suffix.lower()
        
        if file_extension == '.pdf':
            text = await self._extract_pdf_text(file_path)
        elif file_extension == '.docx':
            text = await self._extract_docx_text(file_path)
        elif file_extension in ['.txt', '.md']:
            text = await self._extract_text_file(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_extension}")
        
        return {
            'text': text,
            'title': source.name,
            'source_type': 'document',
            'metadata': {
                'file_name': file_path.name,
                'file_size': file_path.stat().st_size,
                'file_type': file_extension
            }
        }
    
    async def _extract_pdf_text(self, file_path: Path) -> str:
        """Extract text from PDF file"""
        text = ""
        
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n\n"
        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            raise ValueError(f"Failed to extract text from PDF: {e}")
        
        return text.strip()
    
    async def _extract_docx_text(self, file_path: Path) -> str:
        """Extract text from DOCX file"""
        try:
            doc = docx.Document(file_path)
            text = "\n\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text.strip()
        except Exception as e:
            logger.error(f"Error extracting DOCX text: {e}")
            raise ValueError(f"Failed to extract text from DOCX: {e}")
    
    async def _extract_text_file(self, file_path: Path) -> str:
        """Extract text from plain text file"""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as file:
                return await file.read()
        except UnicodeDecodeError:
            # Try with different encoding
            try:
                async with aiofiles.open(file_path, 'r', encoding='latin-1') as file:
                    return await file.read()
            except Exception as e:
                logger.error(f"Error reading text file: {e}")
                raise ValueError(f"Failed to read text file: {e}")

class WebsiteProcessor(BaseProcessor):
    """Process website content via web scraping"""
    
    def __init__(self):
        super().__init__()
        self.max_pages = 50  # Default max pages per website
        self.timeout = 30    # Request timeout
    
    async def extract_content(self, source) -> Dict[str, Any]:
        """Extract content from website(s)"""
        
        if not source.source_url:
            raise ValueError("No URL provided for website")
        
        config = source.config or {}
        max_pages = config.get('max_pages', self.max_pages)
        include_subpages = config.get('include_subpages', False)
        
        if include_subpages:
            # Crawl multiple pages
            pages_content = await self._crawl_website(source.source_url, max_pages)
        else:
            # Single page
            pages_content = [await self._extract_single_page(source.source_url)]
        
        # Combine all page content
        combined_text = "\n\n---\n\n".join([
            f"Page: {page['url']}\nTitle: {page['title']}\n\n{page['content']}"
            for page in pages_content
        ])
        
        return {
            'text': combined_text,
            'title': source.name,
            'source_type': 'website',
            'metadata': {
                'base_url': source.source_url,
                'pages_scraped': len(pages_content),
                'urls': [page['url'] for page in pages_content]
            }
        }
    
    async def _crawl_website(self, base_url: str, max_pages: int) -> List[Dict[str, Any]]:
        """Crawl website and extract content from multiple pages"""
        
        visited_urls = set()
        pages_to_visit = [base_url]
        extracted_pages = []
        
        base_domain = urlparse(base_url).netloc
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            while pages_to_visit and len(extracted_pages) < max_pages:
                url = pages_to_visit.pop(0)
                
                if url in visited_urls:
                    continue
                
                visited_urls.add(url)
                
                try:
                    page_data = await self._extract_single_page(url, client)
                    extracted_pages.append(page_data)
                    
                    # Find additional links on this page (stay on same domain)
                    if len(extracted_pages) < max_pages:
                        new_links = await self._extract_links(url, page_data['raw_html'], base_domain)
                        for link in new_links:
                            if link not in visited_urls and link not in pages_to_visit:
                                pages_to_visit.append(link)
                
                except Exception as e:
                    logger.warning(f"Failed to extract content from {url}: {e}")
                    continue
                
                # Be respectful - add delay between requests
                await asyncio.sleep(1)
        
        return extracted_pages
    
    async def _extract_single_page(self, url: str, client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
        """Extract content from a single web page"""
        
        if client is None:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                return await self._extract_single_page(url, client)
        
        try:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            
            html = response.text
            
            # Use trafilatura for main content extraction (better than BeautifulSoup for articles)
            main_content = trafilatura.extract(html, include_comments=False, include_tables=True)
            
            if not main_content:
                # Fallback to BeautifulSoup
                soup = BeautifulSoup(html, 'html.parser')
                
                # Remove script and style elements
                for script in soup(["script", "style", "nav", "footer", "header"]):
                    script.decompose()
                
                main_content = soup.get_text()
            
            # Extract title
            soup = BeautifulSoup(html, 'html.parser')
            title = soup.title.string if soup.title else url
            
            # Clean up text
            clean_content = re.sub(r'\n\s*\n', '\n\n', main_content.strip())
            
            return {
                'url': url,
                'title': title.strip(),
                'content': clean_content,
                'raw_html': html
            }
            
        except Exception as e:
            logger.error(f"Error extracting content from {url}: {e}")
            raise ValueError(f"Failed to extract content from {url}: {e}")
    
    async def _extract_links(self, base_url: str, html: str, base_domain: str) -> List[str]:
        """Extract internal links from HTML"""
        
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Convert relative URLs to absolute
            absolute_url = urljoin(base_url, href)
            
            # Only include links from the same domain
            if urlparse(absolute_url).netloc == base_domain:
                # Remove fragments and query parameters for deduplication
                clean_url = absolute_url.split('#')[0].split('?')[0]
                if clean_url not in links:
                    links.append(clean_url)
        
        return links[:20]  # Limit to prevent infinite crawling

class VideoProcessor(BaseProcessor):
    """Process video content with transcription"""
    
    async def extract_content(self, source) -> Dict[str, Any]:
        """Extract audio and transcribe video content"""
        
        if not source.source_url:
            raise ValueError("No URL provided for video")
        
        config = source.config or {}
        language = config.get('language', 'en')
        
        # Download and transcribe audio
        transcript = await self._transcribe_video(source.source_url, language)
        
        return {
            'text': transcript['text'],
            'title': transcript.get('title', source.name),
            'source_type': 'video',
            'metadata': {
                'video_url': source.source_url,
                'duration': transcript.get('duration'),
                'language': language
            }
        }
    
    async def _transcribe_video(self, url: str, language: str) -> Dict[str, Any]:
        """Download video and transcribe audio using Whisper"""
        
        try:
            # Download audio using yt-dlp
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': 'temp_audio.%(ext)s',
                'quiet': True
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get('title', 'Unknown')
                duration = info.get('duration', 0)
            
            # Transcribe using Whisper
            model = whisper.load_model("base")
            result = model.transcribe("temp_audio.webm", language=language)
            
            # Clean up temp file
            import os
            for file in os.listdir('.'):
                if file.startswith('temp_audio'):
                    os.remove(file)
            
            return {
                'text': result['text'],
                'title': title,
                'duration': duration
            }
            
        except Exception as e:
            logger.error(f"Error transcribing video: {e}")
            raise ValueError(f"Failed to transcribe video: {e}")

class APIProcessor(BaseProcessor):
    """Process API endpoint responses"""
    
    async def extract_content(self, source) -> Dict[str, Any]:
        """Extract content from API endpoints"""
        
        if not source.source_url:
            raise ValueError("No URL provided for API")
        
        config = source.config or {}
        headers = config.get('headers', {})
        auth_token = config.get('auth_token')
        
        if auth_token:
            headers['Authorization'] = f"Bearer {auth_token}"
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(source.source_url, headers=headers)
                response.raise_for_status()
                
                data = response.json()
                
                # Convert JSON to readable text
                text = await self._json_to_text(data)
                
                return {
                    'text': text,
                    'title': source.name,
                    'source_type': 'api',
                    'metadata': {
                        'api_url': source.source_url,
                        'response_size': len(response.text),
                        'content_type': response.headers.get('content-type', 'unknown')
                    }
                }
                
        except Exception as e:
            logger.error(f"Error fetching API content: {e}")
            raise ValueError(f"Failed to fetch API content: {e}")
    
    async def _json_to_text(self, data: Any) -> str:
        """Convert JSON data to readable text format"""
        
        if isinstance(data, dict):
            text_parts = []
            for key, value in data.items():
                if isinstance(value, (dict, list)):
                    text_parts.append(f"{key}: {await self._json_to_text(value)}")
                else:
                    text_parts.append(f"{key}: {str(value)}")
            return "\n".join(text_parts)
        
        elif isinstance(data, list):
            text_parts = []
            for i, item in enumerate(data):
                if isinstance(item, (dict, list)):
                    text_parts.append(f"Item {i+1}: {await self._json_to_text(item)}")
                else:
                    text_parts.append(f"Item {i+1}: {str(item)}")
            return "\n".join(text_parts)
        
        else:
            return str(data)

class DatabaseProcessor(BaseProcessor):
    """Process database query results"""
    
    async def extract_content(self, source) -> Dict[str, Any]:
        """Extract content from database queries"""
        
        config = source.config or {}
        query = config.get('query')
        
        if not query:
            raise ValueError("No SQL query provided")
        
        # This is a placeholder - in production, you'd implement actual database connections
        # with proper security, connection pooling, etc.
        
        return {
            'text': f"Database query results for: {query}\n\n[Placeholder - implement actual database connection]",
            'title': source.name,
            'source_type': 'database',
            'metadata': {
                'query': query,
                'database_type': config.get('database_type', 'unknown')
            }
        }