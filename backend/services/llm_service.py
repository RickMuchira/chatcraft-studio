# backend/services/llm_service.py
import asyncio
import httpx
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, AsyncGenerator
import json
import os
from datetime import datetime

from ..models.chatbot import (
    LLMProvider, OllamaConfig, HuggingFaceConfig, LocalAIConfig,
    ChatbotConfig, LLMModelInfo
)

logger = logging.getLogger(__name__)

class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers"""
    
    @abstractmethod
    async def generate_response(self, prompt: str, config: Dict[str, Any]) -> str:
        """Generate a response from the LLM"""
        pass
    
    @abstractmethod
    async def stream_response(self, prompt: str, config: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Stream response from the LLM"""
        pass
    
    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the LLM provider is available"""
        pass
    
    @abstractmethod
    async def get_available_models(self) -> List[LLMModelInfo]:
        """Get list of available models"""
        pass

class OllamaProvider(BaseLLMProvider):
    """Ollama local LLM provider"""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url.rstrip('/')
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def generate_response(self, prompt: str, config: Dict[str, Any]) -> str:
        """Generate response using Ollama"""
        try:
            ollama_config = OllamaConfig(**config)
            
            payload = {
                "model": ollama_config.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": ollama_config.temperature,
                    "top_p": ollama_config.top_p,
                    "top_k": ollama_config.top_k,
                    "num_ctx": ollama_config.num_ctx,
                    "repeat_penalty": ollama_config.repeat_penalty
                }
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/generate",
                json=payload
            )
            response.raise_for_status()
            
            result = response.json()
            return result.get("response", "").strip()
            
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            raise Exception(f"Failed to generate response: {str(e)}")
    
    async def stream_response(self, prompt: str, config: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Stream response from Ollama"""
        try:
            ollama_config = OllamaConfig(**config)
            
            payload = {
                "model": ollama_config.model,
                "prompt": prompt,
                "stream": True,
                "options": {
                    "temperature": ollama_config.temperature,
                    "top_p": ollama_config.top_p,
                    "top_k": ollama_config.top_k,
                    "num_ctx": ollama_config.num_ctx,
                    "repeat_penalty": ollama_config.repeat_penalty
                }
            }
            
            async with self.client.stream(
                "POST",
                f"{self.base_url}/api/generate",
                json=payload
            ) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if line.strip():
                        try:
                            data = json.loads(line)
                            if "response" in data:
                                yield data["response"]
                            if data.get("done", False):
                                break
                        except json.JSONDecodeError:
                            continue
                            
        except Exception as e:
            logger.error(f"Ollama streaming failed: {e}")
            raise Exception(f"Failed to stream response: {str(e)}")
    
    async def is_available(self) -> bool:
        """Check if Ollama is available"""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            return response.status_code == 200
        except:
            return False
    
    async def get_available_models(self) -> List[LLMModelInfo]:
        """Get available Ollama models"""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            
            data = response.json()
            models = []
            
            for model in data.get("models", []):
                models.append(LLMModelInfo(
                    provider=LLMProvider.OLLAMA,
                    model_name=model["name"],
                    description=f"Ollama model: {model['name']}",
                    parameters=model.get("details", {}).get("parameter_size", "Unknown"),
                    capabilities=["text-generation", "conversation"],
                    resource_requirements={"memory": model.get("size", "Unknown")},
                    is_available=True,
                    download_size=model.get("size")
                ))
            
            return models
            
        except Exception as e:
            logger.error(f"Failed to get Ollama models: {e}")
            return []

class HuggingFaceProvider(BaseLLMProvider):
    """HuggingFace Transformers provider"""
    
    def __init__(self):
        self.models = {}  # Cache loaded models
        self.tokenizers = {}  # Cache tokenizers
    
    async def generate_response(self, prompt: str, config: Dict[str, Any]) -> str:
        """Generate response using HuggingFace model"""
        try:
            # Import here to avoid dependency issues if not installed
            from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
            import torch
            
            hf_config = HuggingFaceConfig(**config)
            model_name = hf_config.model_name
            
            # Load model and tokenizer if not cached
            if model_name not in self.models:
                logger.info(f"Loading HuggingFace model: {model_name}")
                
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16 if hf_config.device != "cpu" else torch.float32,
                    device_map="auto" if hf_config.device != "cpu" else None
                )
                
                self.tokenizers[model_name] = tokenizer
                self.models[model_name] = model
            
            # Create pipeline
            generator = pipeline(
                "text-generation",
                model=self.models[model_name],
                tokenizer=self.tokenizers[model_name],
                device=0 if hf_config.device == "cuda" else -1
            )
            
            # Generate response
            result = generator(
                prompt,
                max_length=hf_config.max_length,
                do_sample=hf_config.do_sample,
                temperature=hf_config.temperature,
                pad_token_id=hf_config.pad_token_id or self.tokenizers[model_name].eos_token_id,
                return_full_text=False,
                num_return_sequences=1
            )
            
            return result[0]["generated_text"].strip()
            
        except Exception as e:
            logger.error(f"HuggingFace generation failed: {e}")
            raise Exception(f"Failed to generate response: {str(e)}")
    
    async def stream_response(self, prompt: str, config: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Stream response (basic implementation for HuggingFace)"""
        # HuggingFace doesn't have native streaming, so we'll simulate it
        response = await self.generate_response(prompt, config)
        
        # Stream word by word for better UX
        words = response.split()
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            await asyncio.sleep(0.05)  # Small delay for streaming effect
    
    async def is_available(self) -> bool:
        """Check if HuggingFace is available"""
        try:
            import transformers
            import torch
            return True
        except ImportError:
            return False
    
    async def get_available_models(self) -> List[LLMModelInfo]:
        """Get available HuggingFace models"""
        # Predefined list of good open-source conversational models
        models = [
            LLMModelInfo(
                provider=LLMProvider.HUGGINGFACE,
                model_name="microsoft/DialoGPT-medium",
                description="Microsoft's conversational AI model",
                parameters="345M",
                capabilities=["conversation", "dialogue"],
                resource_requirements={"memory": "1.5GB", "gpu": "Optional"},
                is_available=True
            ),
            LLMModelInfo(
                provider=LLMProvider.HUGGINGFACE,
                model_name="facebook/blenderbot-400M-distill",
                description="Facebook's BlenderBot for open-domain chatbots",
                parameters="400M",
                capabilities=["conversation", "knowledge"],
                resource_requirements={"memory": "2GB", "gpu": "Optional"},
                is_available=True
            ),
            LLMModelInfo(
                provider=LLMProvider.HUGGINGFACE,
                model_name="google/flan-t5-base",
                description="Google's instruction-tuned T5 model",
                parameters="250M",
                capabilities=["instruction-following", "conversation"],
                resource_requirements={"memory": "1GB", "gpu": "Optional"},
                is_available=True
            )
        ]
        return models

class LocalAIProvider(BaseLLMProvider):
    """LocalAI API provider"""
    
    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url.rstrip('/')
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def generate_response(self, prompt: str, config: Dict[str, Any]) -> str:
        """Generate response using LocalAI"""
        try:
            localai_config = LocalAIConfig(**config)
            
            payload = {
                "model": localai_config.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": localai_config.temperature,
                "max_tokens": localai_config.max_tokens,
                "stream": False
            }
            
            response = await self.client.post(
                f"{self.base_url}/v1/chat/completions",
                json=payload
            )
            response.raise_for_status()
            
            result = response.json()
            return result["choices"][0]["message"]["content"].strip()
            
        except Exception as e:
            logger.error(f"LocalAI generation failed: {e}")
            raise Exception(f"Failed to generate response: {str(e)}")
    
    async def stream_response(self, prompt: str, config: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Stream response from LocalAI"""
        try:
            localai_config = LocalAIConfig(**config)
            
            payload = {
                "model": localai_config.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": localai_config.temperature,
                "max_tokens": localai_config.max_tokens,
                "stream": True
            }
            
            async with self.client.stream(
                "POST",
                f"{self.base_url}/v1/chat/completions",
                json=payload
            ) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]  # Remove "data: " prefix
                        if data_str.strip() == "[DONE]":
                            break
                        
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and data["choices"]:
                                delta = data["choices"][0].get("delta", {})
                                if "content" in delta:
                                    yield delta["content"]
                        except json.JSONDecodeError:
                            continue
                            
        except Exception as e:
            logger.error(f"LocalAI streaming failed: {e}")
            raise Exception(f"Failed to stream response: {str(e)}")
    
    async def is_available(self) -> bool:
        """Check if LocalAI is available"""
        try:
            response = await self.client.get(f"{self.base_url}/v1/models")
            return response.status_code == 200
        except:
            return False
    
    async def get_available_models(self) -> List[LLMModelInfo]:
        """Get available LocalAI models"""
        try:
            response = await self.client.get(f"{self.base_url}/v1/models")
            response.raise_for_status()
            
            data = response.json()
            models = []
            
            for model in data.get("data", []):
                models.append(LLMModelInfo(
                    provider=LLMProvider.LOCALAI,
                    model_name=model["id"],
                    description=f"LocalAI model: {model['id']}",
                    parameters="Unknown",
                    capabilities=["text-generation", "conversation"],
                    resource_requirements={"memory": "Unknown"},
                    is_available=True
                ))
            
            return models
            
        except Exception as e:
            logger.error(f"Failed to get LocalAI models: {e}")
            return []

class LLMService:
    """Main LLM service that manages multiple providers"""
    
    def __init__(self):
        self.providers = {}
        self._initialize_providers()
    
    def _initialize_providers(self):
        """Initialize available LLM providers"""
        
        # Ollama provider
        ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.providers[LLMProvider.OLLAMA] = OllamaProvider(ollama_url)
        
        # HuggingFace provider
        self.providers[LLMProvider.HUGGINGFACE] = HuggingFaceProvider()
        
        # LocalAI provider
        localai_url = os.getenv("LOCALAI_URL", "http://localhost:8080")
        self.providers[LLMProvider.LOCALAI] = LocalAIProvider(localai_url)
        
        logger.info(f"Initialized LLM providers: {list(self.providers.keys())}")
    
    async def generate_response(self, provider: LLMProvider, prompt: str, config: Dict[str, Any]) -> str:
        """Generate response using specified provider"""
        
        if provider not in self.providers:
            raise ValueError(f"Provider {provider} not available")
        
        llm_provider = self.providers[provider]
        
        # Check if provider is available
        if not await llm_provider.is_available():
            raise Exception(f"Provider {provider} is not available")
        
        return await llm_provider.generate_response(prompt, config)
    
    async def stream_response(self, provider: LLMProvider, prompt: str, config: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Stream response using specified provider"""
        
        if provider not in self.providers:
            raise ValueError(f"Provider {provider} not available")
        
        llm_provider = self.providers[provider]
        
        # Check if provider is available
        if not await llm_provider.is_available():
            raise Exception(f"Provider {provider} is not available")
        
        async for chunk in llm_provider.stream_response(prompt, config):
            yield chunk
    
    async def get_available_providers(self) -> List[LLMProvider]:
        """Get list of available providers"""
        available = []
        
        for provider_type, provider in self.providers.items():
            if await provider.is_available():
                available.append(provider_type)
        
        return available
    
    async def get_all_available_models(self) -> List[LLMModelInfo]:
        """Get all available models from all providers"""
        all_models = []
        
        for provider_type, provider in self.providers.items():
            if await provider.is_available():
                try:
                    models = await provider.get_available_models()
                    all_models.extend(models)
                except Exception as e:
                    logger.warning(f"Failed to get models from {provider_type}: {e}")
        
        return all_models
    
    async def health_check(self) -> Dict[str, Any]:
        """Check health of all LLM providers"""
        health = {
            "timestamp": datetime.now(),
            "providers": {}
        }
        
        for provider_type, provider in self.providers.items():
            try:
                is_available = await provider.is_available()
                models = await provider.get_available_models() if is_available else []
                
                health["providers"][provider_type] = {
                    "status": "healthy" if is_available else "unavailable",
                    "available_models": len(models),
                    "models": [model.model_name for model in models[:3]]  # First 3 models
                }
            except Exception as e:
                health["providers"][provider_type] = {
                    "status": "error",
                    "error": str(e)
                }
        
        return health
    
    def get_default_config(self, provider: LLMProvider, model: str) -> Dict[str, Any]:
        """Get default configuration for a provider/model combination"""
        
        configs = {
            LLMProvider.OLLAMA: {
                "model": model,
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 40,
                "num_ctx": 2048,
                "repeat_penalty": 1.1
            },
            LLMProvider.HUGGINGFACE: {
                "model_name": model,
                "device": "cpu",
                "max_length": 1000,
                "do_sample": True,
                "temperature": 0.7
            },
            LLMProvider.LOCALAI: {
                "model": model,
                "temperature": 0.7,
                "max_tokens": 500,
                "stream": False
            }
        }
        
        return configs.get(provider, {})

# Fallback text-based LLM for when no providers are available
class FallbackLLMProvider(BaseLLMProvider):
    """Simple rule-based fallback when no LLMs are available"""
    
    def __init__(self):
        self.responses = {
            "greeting": [
                "Hello! I'm here to help you with any questions.",
                "Hi there! How can I assist you today?",
                "Welcome! What can I help you with?"
            ],
            "default": [
                "I understand you're asking about {topic}. Let me search our knowledge base for relevant information.",
                "That's a great question about {topic}. Based on our documentation, here's what I found:",
                "Thank you for your question regarding {topic}. Here's the information I have:"
            ],
            "no_knowledge": [
                "I apologize, but I don't have specific information about that topic in our knowledge base.",
                "I'm sorry, I couldn't find relevant information about that in our documentation.",
                "That's outside my current knowledge base. You might want to contact our support team for more specific help."
            ],
            "error": [
                "I'm experiencing some technical difficulties right now. Please try again in a moment.",
                "I'm temporarily unable to process that request. Please contact our support team if this continues."
            ]
        }
    
    async def generate_response(self, prompt: str, config: Dict[str, Any]) -> str:
        """Generate simple rule-based response"""
        import random
        
        # Simple keyword matching
        prompt_lower = prompt.lower()
        
        if any(word in prompt_lower for word in ["hello", "hi", "hey", "greetings"]):
            return random.choice(self.responses["greeting"])
        
        # Extract potential topic from prompt
        words = prompt.split()
        topic = " ".join(words[:3]) if len(words) >= 3 else prompt[:50]
        
        response_template = random.choice(self.responses["default"])
        return response_template.format(topic=topic)
    
    async def stream_response(self, prompt: str, config: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Stream the fallback response"""
        response = await self.generate_response(prompt, config)
        words = response.split()
        
        for word in words:
            yield word + " "
            await asyncio.sleep(0.1)
    
    async def is_available(self) -> bool:
        """Fallback is always available"""
        return True
    
    async def get_available_models(self) -> List[LLMModelInfo]:
        """Return fallback model info"""
        return [
            LLMModelInfo(
                provider=LLMProvider.OLLAMA,  # Use as default type
                model_name="fallback-rules",
                description="Simple rule-based fallback when LLMs unavailable",
                parameters="0",
                capabilities=["basic-responses"],
                resource_requirements={"memory": "Minimal"},
                is_available=True
            )
        ]

# Smart LLM router that automatically selects best available provider
class SmartLLMRouter:
    """Intelligently routes requests to the best available LLM provider"""
    
    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service
        self.fallback = FallbackLLMProvider()
        
        # Provider priority order (best to worst)
        self.provider_priority = [
            LLMProvider.OLLAMA,      # Local, fast, good quality
            LLMProvider.LOCALAI,     # Local, OpenAI-compatible
            LLMProvider.HUGGINGFACE, # Local, but slower
        ]
    
    async def generate_response(self, prompt: str, preferred_provider: Optional[LLMProvider] = None, 
                              preferred_model: Optional[str] = None) -> tuple[str, LLMProvider, str]:
        """Generate response using best available provider"""
        
        # Try preferred provider first if specified
        if preferred_provider and preferred_model:
            try:
                config = self.llm_service.get_default_config(preferred_provider, preferred_model)
                response = await self.llm_service.generate_response(preferred_provider, prompt, config)
                return response, preferred_provider, preferred_model
            except Exception as e:
                logger.warning(f"Preferred provider {preferred_provider} failed: {e}")
        
        # Try providers in priority order
        for provider in self.provider_priority:
            try:
                if provider not in self.llm_service.providers:
                    continue
                
                # Check if provider is available
                if not await self.llm_service.providers[provider].is_available():
                    continue
                
                # Get available models
                models = await self.llm_service.providers[provider].get_available_models()
                if not models:
                    continue
                
                # Use first available model
                model = models[0].model_name
                config = self.llm_service.get_default_config(provider, model)
                
                response = await self.llm_service.generate_response(provider, prompt, config)
                return response, provider, model
                
            except Exception as e:
                logger.warning(f"Provider {provider} failed: {e}")
                continue
        
        # Fallback to rule-based system
        logger.warning("All LLM providers failed, using fallback")
        response = await self.fallback.generate_response(prompt, {})
        return response, LLMProvider.OLLAMA, "fallback-rules"  # Use OLLAMA as placeholder
    
    async def stream_response(self, prompt: str, preferred_provider: Optional[LLMProvider] = None,
                            preferred_model: Optional[str] = None) -> AsyncGenerator[tuple[str, LLMProvider, str], None]:
        """Stream response using best available provider"""
        
        # Similar logic to generate_response but with streaming
        provider_used = None
        model_used = None
        
        # Try preferred provider first
        if preferred_provider and preferred_model:
            try:
                config = self.llm_service.get_default_config(preferred_provider, preferred_model)
                
                async for chunk in self.llm_service.stream_response(preferred_provider, prompt, config):
                    yield chunk, preferred_provider, preferred_model
                return
                
            except Exception as e:
                logger.warning(f"Preferred provider {preferred_provider} streaming failed: {e}")
        
        # Try providers in priority order
        for provider in self.provider_priority:
            try:
                if provider not in self.llm_service.providers:
                    continue
                
                if not await self.llm_service.providers[provider].is_available():
                    continue
                
                models = await self.llm_service.providers[provider].get_available_models()
                if not models:
                    continue
                
                model = models[0].model_name
                config = self.llm_service.get_default_config(provider, model)
                
                async for chunk in self.llm_service.stream_response(provider, prompt, config):
                    yield chunk, provider, model
                return
                
            except Exception as e:
                logger.warning(f"Provider {provider} streaming failed: {e}")
                continue
        
        # Fallback streaming
        logger.warning("All LLM providers failed for streaming, using fallback")
        async for chunk in self.fallback.stream_response(prompt, {}):
            yield chunk, LLMProvider.OLLAMA, "fallback-rules"

# Utility functions for provider management
async def download_ollama_model(model_name: str, base_url: str = "http://localhost:11434") -> bool:
    """Download an Ollama model"""
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minute timeout
            response = await client.post(
                f"{base_url}/api/pull",
                json={"name": model_name}
            )
            response.raise_for_status()
            return True
    except Exception as e:
        logger.error(f"Failed to download Ollama model {model_name}: {e}")
        return False

async def check_system_requirements() -> Dict[str, Any]:
    """Check system requirements for running LLMs"""
    import psutil
    import shutil
    
    requirements = {
        "cpu_cores": psutil.cpu_count(),
        "memory_gb": round(psutil.virtual_memory().total / (1024**3)),
        "disk_space_gb": round(shutil.disk_usage("/").free / (1024**3)),
        "recommendations": []
    }
    
    # Add recommendations based on resources
    if requirements["memory_gb"] < 8:
        requirements["recommendations"].append("Consider upgrading to 8GB+ RAM for better LLM performance")
    
    if requirements["cpu_cores"] < 4:
        requirements["recommendations"].append("4+ CPU cores recommended for smooth LLM inference")
    
    if requirements["disk_space_gb"] < 10:
        requirements["recommendations"].append("At least 10GB free disk space needed for model storage")
    
    # Check for GPU
    try:
        import torch
        if torch.cuda.is_available():
            requirements["gpu"] = torch.cuda.get_device_name(0)
            requirements["gpu_memory_gb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024**3))
        else:
            requirements["gpu"] = "Not available"
            requirements["recommendations"].append("GPU support can significantly improve LLM performance")
    except ImportError:
        requirements["gpu"] = "PyTorch not installed"
    
    return requirements

# Popular open-source model recommendations
RECOMMENDED_MODELS = {
    LLMProvider.OLLAMA: [
        {
            "name": "llama2:7b",
            "description": "Meta's Llama 2 7B - Great balance of quality and speed",
            "size": "3.8GB",
            "use_case": "General conversation, customer support",
            "min_ram": "8GB"
        },
        {
            "name": "mistral:7b",
            "description": "Mistral 7B - Excellent instruction following",
            "size": "4.1GB", 
            "use_case": "Technical support, detailed explanations",
            "min_ram": "8GB"
        },
        {
            "name": "codellama:7b",
            "description": "Code Llama 7B - Specialized for programming",
            "size": "3.8GB",
            "use_case": "Technical documentation, code help",
            "min_ram": "8GB"
        },
        {
            "name": "neural-chat:7b",
            "description": "Intel's Neural Chat - Optimized for conversation",
            "size": "4.1GB",
            "use_case": "Customer service, general chat",
            "min_ram": "8GB"
        }
    ],
    LLMProvider.HUGGINGFACE: [
        {
            "name": "microsoft/DialoGPT-medium",
            "description": "Microsoft's conversational model",
            "size": "345M parameters",
            "use_case": "Casual conversation",
            "min_ram": "4GB"
        },
        {
            "name": "google/flan-t5-base",
            "description": "Google's instruction-tuned model",
            "size": "250M parameters", 
            "use_case": "Question answering, instructions",
            "min_ram": "4GB"
        }
    ]
}

def get_model_recommendations(provider: LLMProvider) -> List[Dict[str, str]]:
    """Get recommended models for a provider"""
    return RECOMMENDED_MODELS.get(provider, [])