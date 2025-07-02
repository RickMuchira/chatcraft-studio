// hooks/use-upload.ts - Comprehensive File Upload Hook for ChatCraft Studio

import { useState, useCallback, useRef, useEffect } from 'react'
import { useApiClient } from '@/hooks/api'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/hooks/use-toast'
import type { 
  ContentSource, 
  ContentType, 
  ProcessingStatus,
  TenantUsage,
  ApiResponse 
} from '@/types'

/**
 * ========================================================================
 * UPLOAD CONFIGURATION & TYPES
 * ========================================================================
 */

const UPLOAD_CONFIG = {
  // File size limits (in bytes)
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_FILES_BATCH: 10,
  
  // Chunk size for large file uploads
  CHUNK_SIZE: 4 * 1024 * 1024, // 4MB chunks
  
  // Timeout configurations
  UPLOAD_TIMEOUT: 10 * 60 * 1000, // 10 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000, // 2 seconds
  
  // Progress update frequency
  PROGRESS_THROTTLE: 100, // Update progress every 100ms
} as const

const SUPPORTED_FILE_TYPES = {
  document: {
    extensions: ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'application/rtf'
    ],
    maxSize: 50 * 1024 * 1024, // 50MB for documents
  },
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    mimeTypes: [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ],
    maxSize: 10 * 1024 * 1024, // 10MB for images
  },
  video: {
    extensions: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
    mimeTypes: [
      'video/mp4',
      'video/x-msvideo',
      'video/quicktime',
      'video/x-ms-wmv',
      'video/x-flv',
      'video/webm'
    ],
    maxSize: 500 * 1024 * 1024, // 500MB for videos
  },
  audio: {
    extensions: ['.mp3', '.wav', '.flac', '.aac', '.ogg'],
    mimeTypes: [
      'audio/mpeg',
      'audio/wav',
      'audio/flac',
      'audio/aac',
      'audio/ogg'
    ],
    maxSize: 100 * 1024 * 1024, // 100MB for audio
  },
} as const

export interface UploadFile {
  id: string
  file: File
  name: string
  size: number
  type: string
  contentType: ContentType
  status: UploadStatus
  progress: number
  error?: string
  contentSource?: ContentSource
  uploadId?: string
  chunks?: UploadChunk[]
}

export interface UploadChunk {
  index: number
  start: number
  end: number
  uploaded: boolean
  retries: number
}

export type UploadStatus = 
  | 'pending'
  | 'validating'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'

export interface UploadOptions {
  contentType?: ContentType
  autoStart?: boolean
  chunked?: boolean
  validateOnly?: boolean
  metadata?: Record<string, any>
  onProgress?: (file: UploadFile, progress: number) => void
  onComplete?: (file: UploadFile, result: ContentSource) => void
  onError?: (file: UploadFile, error: string) => void
}

export interface UploadValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

export interface UploadState {
  files: UploadFile[]
  isUploading: boolean
  totalProgress: number
  completedFiles: number
  failedFiles: number
  isPaused: boolean
  dragActive: boolean
}

/**
 * ========================================================================
 * UTILITY FUNCTIONS
 * ========================================================================
 */

const generateUploadId = (): string => {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const getFileExtension = (filename: string): string => {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'))
}

const detectContentType = (file: File): ContentType => {
  const extension = getFileExtension(file.name)
  const mimeType = file.type

  // Check document types
  if (SUPPORTED_FILE_TYPES.document.extensions.includes(extension) ||
      SUPPORTED_FILE_TYPES.document.mimeTypes.includes(mimeType)) {
    return 'document'
  }

  // Check image types
  if (SUPPORTED_FILE_TYPES.image.extensions.includes(extension) ||
      SUPPORTED_FILE_TYPES.image.mimeTypes.includes(mimeType)) {
    return 'document' // Images are processed as documents with OCR
  }

  // Check video types
  if (SUPPORTED_FILE_TYPES.video.extensions.includes(extension) ||
      SUPPORTED_FILE_TYPES.video.mimeTypes.includes(mimeType)) {
    return 'video'
  }

  // Check audio types
  if (SUPPORTED_FILE_TYPES.audio.extensions.includes(extension) ||
      SUPPORTED_FILE_TYPES.audio.mimeTypes.includes(mimeType)) {
    return 'video' // Audio files are processed like videos for transcription
  }

  return 'document' // Default fallback
}

const validateFile = (file: File, tenantUsage?: TenantUsage): UploadValidation => {
  const errors: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  const extension = getFileExtension(file.name)
  const contentType = detectContentType(file)

  // Check file size
  const typeConfig = SUPPORTED_FILE_TYPES[contentType === 'video' ? 'video' : 'document']
  if (file.size > typeConfig.maxSize) {
    errors.push(`File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(typeConfig.maxSize)})`)
  }

  // Check file type support
  if (!typeConfig.extensions.includes(extension) && !typeConfig.mimeTypes.includes(file.type)) {
    errors.push(`File type "${extension}" is not supported. Supported types: ${typeConfig.extensions.join(', ')}`)
  }

  // Check tenant usage limits
  if (tenantUsage) {
    const remainingStorage = tenantUsage.limits.max_storage_mb - tenantUsage.current_month.storage_used_mb
    const fileSizeMB = file.size / (1024 * 1024)
    
    if (fileSizeMB > remainingStorage) {
      errors.push(`File size exceeds remaining storage quota (${remainingStorage.toFixed(1)}MB remaining)`)
    }

    const remainingDocs = tenantUsage.limits.max_documents - tenantUsage.current_month.documents_processed
    if (remainingDocs <= 0) {
      errors.push('Document processing limit reached for this month')
    }

    // Storage warnings
    if (tenantUsage.usage_percentage.storage > 80) {
      warnings.push('Storage quota is over 80% full')
    }

    if (tenantUsage.usage_percentage.documents > 80) {
      warnings.push('Document processing quota is over 80% full')
    }
  }

  // File-specific suggestions
  if (file.size > 10 * 1024 * 1024) { // Files larger than 10MB
    suggestions.push('Large files may take longer to process. Consider splitting into smaller documents if possible.')
  }

  if (contentType === 'video' && file.size > 100 * 1024 * 1024) {
    suggestions.push('Video transcription may take several minutes. You can continue using the app while processing.')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const createChunks = (file: File): UploadChunk[] => {
  const chunks: UploadChunk[] = []
  const chunkCount = Math.ceil(file.size / UPLOAD_CONFIG.CHUNK_SIZE)
  
  for (let i = 0; i < chunkCount; i++) {
    const start = i * UPLOAD_CONFIG.CHUNK_SIZE
    const end = Math.min(start + UPLOAD_CONFIG.CHUNK_SIZE, file.size)
    
    chunks.push({
      index: i,
      start,
      end,
      uploaded: false,
      retries: 0,
    })
  }
  
  return chunks
}

/**
 * ========================================================================
 * MAIN UPLOAD HOOK
 * ========================================================================
 */

export const useUpload = (defaultOptions: UploadOptions = {}) => {
  const apiClient = useApiClient()
  const tenant = useAuthStore((state) => state.tenant)
  const [state, setState] = useState<UploadState>({
    files: [],
    isUploading: false,
    totalProgress: 0,
    completedFiles: 0,
    failedFiles: 0,
    isPaused: false,
    dragActive: false,
  })

  const abortControllers = useRef<Map<string, AbortController>>(new Map())
  const progressThrottleTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Add files to upload queue
  const addFiles = useCallback((newFiles: FileList | File[], options: UploadOptions = {}) => {
    const mergedOptions = { ...defaultOptions, ...options }
    const filesArray = Array.from(newFiles)

    // Check batch size limit
    if (filesArray.length > UPLOAD_CONFIG.MAX_FILES_BATCH) {
      toast({
        title: 'Too Many Files',
        description: `Please select no more than ${UPLOAD_CONFIG.MAX_FILES_BATCH} files at once.`,
        variant: 'destructive',
      })
      return
    }

    const uploadFiles: UploadFile[] = filesArray.map((file) => {
      const contentType = mergedOptions.contentType || detectContentType(file)
      const uploadId = generateUploadId()

      return {
        id: uploadId,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        contentType,
        status: 'pending',
        progress: 0,
        uploadId,
        chunks: mergedOptions.chunked || file.size > UPLOAD_CONFIG.CHUNK_SIZE 
          ? createChunks(file) 
          : undefined,
      }
    })

    setState(prev => ({
      ...prev,
      files: [...prev.files, ...uploadFiles],
    }))

    // Auto-start uploads if enabled
    if (mergedOptions.autoStart !== false) {
      uploadFiles.forEach(uploadFile => {
        startUpload(uploadFile.id, mergedOptions)
      })
    }

    return uploadFiles
  }, [defaultOptions])

  // Validate files before upload
  const validateFiles = useCallback((fileIds: string[]): Map<string, UploadValidation> => {
    const validations = new Map<string, UploadValidation>()

    setState(prev => ({
      ...prev,
      files: prev.files.map(uploadFile => {
        if (fileIds.includes(uploadFile.id)) {
          const validation = validateFile(uploadFile.file, tenant?.usage)
          validations.set(uploadFile.id, validation)

          return {
            ...uploadFile,
            status: 'validating',
            error: validation.isValid ? undefined : validation.errors.join(', '),
          }
        }
        return uploadFile
      }),
    }))

    return validations
  }, [tenant?.usage])

  // Start individual file upload
  const startUpload = useCallback(async (fileId: string, options: UploadOptions = {}) => {
    const uploadFile = state.files.find(f => f.id === fileId)
    if (!uploadFile || uploadFile.status === 'uploading') return

    // Validate file first
    const validation = validateFile(uploadFile.file, tenant?.usage)
    if (!validation.isValid) {
      setState(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileId 
            ? { ...f, status: 'failed', error: validation.errors.join(', ') }
            : f
        ),
        failedFiles: prev.failedFiles + 1,
      }))

      toast({
        title: 'Upload Failed',
        description: `${uploadFile.name}: ${validation.errors[0]}`,
        variant: 'destructive',
      })
      return
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      toast({
        title: 'Upload Warning',
        description: validation.warnings[0],
        variant: 'destructive',
      })
    }

    setState(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.id === fileId ? { ...f, status: 'uploading', progress: 0 } : f
      ),
      isUploading: true,
    }))

    const abortController = new AbortController()
    abortControllers.current.set(fileId, abortController)

    try {
      let result: ContentSource

      if (uploadFile.chunks && uploadFile.chunks.length > 1) {
        // Chunked upload for large files
        result = await uploadFileChunked(uploadFile, options, abortController.signal)
      } else {
        // Standard upload for smaller files
        result = await uploadFileDirect(uploadFile, options, abortController.signal)
      }

      setState(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileId 
            ? { ...f, status: 'completed', progress: 100, contentSource: result }
            : f
        ),
        completedFiles: prev.completedFiles + 1,
      }))

      options.onComplete?.(uploadFile, result)

      toast({
        title: 'Upload Complete',
        description: `${uploadFile.name} has been uploaded and is being processed.`,
      })

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          files: prev.files.map(f => 
            f.id === fileId ? { ...f, status: 'cancelled' } : f
          ),
        }))
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        
        setState(prev => ({
          ...prev,
          files: prev.files.map(f => 
            f.id === fileId 
              ? { ...f, status: 'failed', error: errorMessage }
              : f
          ),
          failedFiles: prev.failedFiles + 1,
        }))

        options.onError?.(uploadFile, errorMessage)

        toast({
          title: 'Upload Failed',
          description: `${uploadFile.name}: ${errorMessage}`,
          variant: 'destructive',
        })
      }
    } finally {
      abortControllers.current.delete(fileId)
      
      // Check if all uploads are complete
      setState(prev => {
        const activeUploads = prev.files.filter(f => 
          f.status === 'uploading' || f.status === 'processing'
        )
        
        return {
          ...prev,
          isUploading: activeUploads.length > 1, // Account for current file finishing
        }
      })
    }
  }, [state.files, tenant?.usage])

  // Direct upload for smaller files
  const uploadFileDirect = useCallback(async (
    uploadFile: UploadFile,
    options: UploadOptions,
    signal: AbortSignal
  ): Promise<ContentSource> => {
    const formData = new FormData()
    formData.append('file', uploadFile.file)
    formData.append('name', uploadFile.name)
    formData.append('content_type', uploadFile.contentType)

    if (options.metadata) {
      formData.append('config', JSON.stringify(options.metadata))
    }

    const response = await fetch(`${apiClient.baseURL}/api/content/sources`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${useAuthStore.getState().tokens?.access_token}`,
      },
      body: formData,
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }, [apiClient])

  // Chunked upload for large files
  const uploadFileChunked = useCallback(async (
    uploadFile: UploadFile,
    options: UploadOptions,
    signal: AbortSignal
  ): Promise<ContentSource> => {
    if (!uploadFile.chunks) throw new Error('No chunks available for chunked upload')

    // Initialize chunked upload
    const initResponse = await apiClient.post<{ upload_id: string }>('/api/content/upload/init', {
      filename: uploadFile.name,
      file_size: uploadFile.size,
      content_type: uploadFile.contentType,
      chunk_count: uploadFile.chunks.length,
      metadata: options.metadata,
    })

    if (!initResponse.success) {
      throw new Error(initResponse.error)
    }

    const uploadId = initResponse.data?.upload_id
    if (!uploadId) throw new Error('No upload ID received')

    // Upload chunks
    let uploadedChunks = 0
    const chunkPromises = uploadFile.chunks.map(async (chunk) => {
      const chunkData = uploadFile.file.slice(chunk.start, chunk.end)
      const formData = new FormData()
      formData.append('chunk', chunkData)
      formData.append('chunk_index', chunk.index.toString())
      formData.append('upload_id', uploadId)

      let retries = 0
      while (retries <= UPLOAD_CONFIG.RETRY_ATTEMPTS) {
        try {
          const response = await fetch(`${apiClient.baseURL}/api/content/upload/chunk`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${useAuthStore.getState().tokens?.access_token}`,
            },
            body: formData,
            signal,
          })

          if (!response.ok) {
            throw new Error(`Chunk upload failed: HTTP ${response.status}`)
          }

          uploadedChunks++
          
          // Update progress
          const progress = Math.round((uploadedChunks / uploadFile.chunks!.length) * 100)
          updateFileProgress(uploadFile.id, progress)
          
          break

        } catch (error) {
          retries++
          if (retries > UPLOAD_CONFIG.RETRY_ATTEMPTS) {
            throw error
          }
          await new Promise(resolve => setTimeout(resolve, UPLOAD_CONFIG.RETRY_DELAY * retries))
        }
      }
    })

    await Promise.all(chunkPromises)

    // Complete upload
    const completeResponse = await apiClient.post<ContentSource>('/api/content/upload/complete', {
      upload_id: uploadId,
    })

    if (!completeResponse.success) {
      throw new Error(completeResponse.error)
    }

    return completeResponse.data!
  }, [apiClient])

  // Update file progress with throttling
  const updateFileProgress = useCallback((fileId: string, progress: number) => {
    const timerId = progressThrottleTimers.current.get(fileId)
    if (timerId) {
      clearTimeout(timerId)
    }

    const newTimerId = setTimeout(() => {
      setState(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileId ? { ...f, progress } : f
        ),
        totalProgress: prev.files.length > 0 
          ? prev.files.reduce((acc, f) => acc + (f.id === fileId ? progress : f.progress), 0) / prev.files.length
          : 0,
      }))
      progressThrottleTimers.current.delete(fileId)
    }, UPLOAD_CONFIG.PROGRESS_THROTTLE)

    progressThrottleTimers.current.set(fileId, newTimerId)
  }, [])

  // Cancel upload
  const cancelUpload = useCallback((fileId: string) => {
    const controller = abortControllers.current.get(fileId)
    if (controller) {
      controller.abort()
    }

    setState(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.id === fileId ? { ...f, status: 'cancelled' } : f
      ),
    }))
  }, [])

  // Remove file from queue
  const removeFile = useCallback((fileId: string) => {
    cancelUpload(fileId)
    
    setState(prev => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId),
    }))
  }, [cancelUpload])

  // Retry failed upload
  const retryUpload = useCallback((fileId: string) => {
    setState(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.id === fileId 
          ? { ...f, status: 'pending', progress: 0, error: undefined }
          : f
      ),
    }))

    startUpload(fileId)
  }, [startUpload])

  // Pause/resume uploads
  const pauseUploads = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: true }))
    
    // Cancel all active uploads
    abortControllers.current.forEach(controller => controller.abort())
    abortControllers.current.clear()
  }, [])

  const resumeUploads = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: false }))
    
    // Restart paused uploads
    state.files
      .filter(f => f.status === 'uploading' || f.status === 'pending')
      .forEach(f => startUpload(f.id))
  }, [state.files, startUpload])

  // Clear completed/failed files
  const clearCompleted = useCallback(() => {
    setState(prev => ({
      ...prev,
      files: prev.files.filter(f => 
        f.status !== 'completed' && f.status !== 'failed' && f.status !== 'cancelled'
      ),
      completedFiles: 0,
      failedFiles: 0,
    }))
  }, [])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState(prev => ({ ...prev, dragActive: true }))
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState(prev => ({ ...prev, dragActive: false }))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState(prev => ({ ...prev, dragActive: false }))
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      addFiles(files, { autoStart: true })
    }
  }, [addFiles])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllers.current.forEach(controller => controller.abort())
      progressThrottleTimers.current.forEach(timer => clearTimeout(timer))
    }
  }, [])

  return {
    // State
    ...state,
    
    // Actions
    addFiles,
    validateFiles,
    startUpload,
    cancelUpload,
    removeFile,
    retryUpload,
    pauseUploads,
    resumeUploads,
    clearCompleted,
    
    // Drag and drop
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    
    // Utilities
    formatFileSize,
    detectContentType,
    validateFile: (file: File) => validateFile(file, tenant?.usage),
    
    // Constants
    supportedTypes: SUPPORTED_FILE_TYPES,
    maxFileSize: UPLOAD_CONFIG.MAX_FILE_SIZE,
  }
}

/**
 * ========================================================================
 * SPECIALIZED UPLOAD HOOKS
 * ========================================================================
 */

// Hook specifically for document uploads
export const useDocumentUpload = (options?: UploadOptions) => {
  return useUpload({
    contentType: 'document',
    autoStart: true,
    chunked: false,
    ...options,
  })
}

// Hook specifically for video/audio uploads
export const useMediaUpload = (options?: UploadOptions) => {
  return useUpload({
    contentType: 'video',
    autoStart: true,
    chunked: true,
    ...options,
  })
}

// Hook for bulk uploads with progress aggregation
export const useBulkUpload = (options?: UploadOptions) => {
  const upload = useUpload({
    autoStart: false,
    ...options,
  })

  const startBulkUpload = useCallback((files: FileList | File[]) => {
    const uploadFiles = upload.addFiles(files, { autoStart: false })
    
    // Start all uploads simultaneously
    uploadFiles?.forEach(uploadFile => {
      upload.startUpload(uploadFile.id)
    })
    
    return uploadFiles
  }, [upload])

  return {
    ...upload,
    startBulkUpload,
  }
}

export default useUpload