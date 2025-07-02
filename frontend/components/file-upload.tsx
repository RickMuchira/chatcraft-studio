// components/file-upload.tsx - Comprehensive File Upload Component for ChatCraft Studio

"use client"

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Upload, 
  FileText, 
  Video, 
  Image, 
  File, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Download,
  Trash2,
  Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * ========================================================================
 * TYPES & INTERFACES
 * ========================================================================
 */

export type ContentType = 'document' | 'website' | 'video' | 'api'
export type UploadStatus = 'pending' | 'validating' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paused'

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
  uploadedBytes?: number
  totalBytes?: number
  speed?: number
  timeRemaining?: number
  retryCount?: number
}

export interface UploadOptions {
  accept?: string[]
  maxFiles?: number
  maxSize?: number
  autoStart?: boolean
  allowRetry?: boolean
  showPreview?: boolean
  chunkSize?: number
}

export interface FileUploadProps {
  onUploadComplete?: (files: UploadFile[]) => void
  onUploadProgress?: (files: UploadFile[]) => void
  onUploadError?: (error: string, file?: UploadFile) => void
  options?: UploadOptions
  className?: string
  disabled?: boolean
}

/**
 * ========================================================================
 * CONFIGURATION
 * ========================================================================
 */

const DEFAULT_OPTIONS: Required<UploadOptions> = {
  accept: [
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'application/rtf',
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Videos
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'video/webm',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/flac',
    'audio/aac'
  ],
  maxFiles: 10,
  maxSize: 100 * 1024 * 1024, // 100MB
  autoStart: true,
  allowRetry: true,
  showPreview: true,
  chunkSize: 4 * 1024 * 1024, // 4MB chunks
}

const SUPPORTED_EXTENSIONS = {
  document: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'],
  video: ['.mp4', '.avi', '.mov', '.wmv', '.webm'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  audio: ['.mp3', '.wav', '.flac', '.aac']
}

/**
 * ========================================================================
 * UTILITY FUNCTIONS
 * ========================================================================
 */

const generateId = (): string => {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

const detectContentType = (file: File): ContentType => {
  const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
  
  if (SUPPORTED_EXTENSIONS.document.includes(extension)) return 'document'
  if (SUPPORTED_EXTENSIONS.video.includes(extension)) return 'video'
  if (SUPPORTED_EXTENSIONS.image.includes(extension)) return 'document' // Images processed as documents with OCR
  if (SUPPORTED_EXTENSIONS.audio.includes(extension)) return 'video' // Audio processed like video for transcription
  
  return 'document' // Default fallback
}

const getFileIcon = (file: UploadFile) => {
  switch (file.contentType) {
    case 'document':
      return <FileText className="h-8 w-8 text-blue-500" />
    case 'video':
      return <Video className="h-8 w-8 text-purple-500" />
    default:
      return <File className="h-8 w-8 text-gray-500" />
  }
}

const validateFile = (file: File, options: Required<UploadOptions>): { valid: boolean; error?: string } => {
  // Check file size
  if (file.size > options.maxSize) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(options.maxSize)})`
    }
  }

  // Check file type
  if (options.accept.length > 0 && !options.accept.includes(file.type)) {
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    const isValidExtension = Object.values(SUPPORTED_EXTENSIONS).flat().includes(extension)
    
    if (!isValidExtension) {
      return {
        valid: false,
        error: `File type "${extension}" is not supported`
      }
    }
  }

  return { valid: true }
}

/**
 * ========================================================================
 * FILE UPLOAD HOOK
 * ========================================================================
 */

const useFileUpload = (options: UploadOptions = {}) => {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const abortControllers = useRef<Map<string, AbortController>>(new Map())

  // Add files to upload queue
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const filesArray = Array.from(newFiles)
    
    // Check max files limit
    if (files.length + filesArray.length > mergedOptions.maxFiles) {
      throw new Error(`Cannot upload more than ${mergedOptions.maxFiles} files`)
    }

    const uploadFiles: UploadFile[] = filesArray.map(file => {
      const validation = validateFile(file, mergedOptions)
      
      return {
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        contentType: detectContentType(file),
        status: validation.valid ? 'pending' : 'failed',
        progress: 0,
        error: validation.error,
        totalBytes: file.size,
        uploadedBytes: 0,
        retryCount: 0,
      }
    })

    setFiles(prev => [...prev, ...uploadFiles])

    // Auto-start upload if enabled
    if (mergedOptions.autoStart) {
      uploadFiles.forEach(file => {
        if (file.status === 'pending') {
          startUpload(file.id)
        }
      })
    }

    return uploadFiles
  }, [files.length, mergedOptions])

  // Start upload for a specific file
  const startUpload = useCallback(async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file || file.status !== 'pending') return

    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'validating' }
        : f
    ))

    try {
      // Create abort controller for this upload
      const abortController = new AbortController()
      abortControllers.current.set(fileId, abortController)

      // Validate file on server
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ))

      // Simulate chunked upload with progress
      await uploadFileWithProgress(file, abortController.signal, (progress, uploadedBytes, speed) => {
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { 
                ...f, 
                progress, 
                uploadedBytes,
                speed,
                timeRemaining: speed > 0 ? (file.size - uploadedBytes) / speed : undefined
              }
            : f
        ))
      })

      // Mark as completed
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'completed', progress: 100 }
          : f
      ))

    } catch (error) {
      if (error.name === 'AbortError') {
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { ...f, status: 'cancelled' }
            : f
        ))
      } else {
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { 
                ...f, 
                status: 'failed', 
                error: error.message || 'Upload failed',
                retryCount: (f.retryCount || 0) + 1
              }
            : f
        ))
      }
    } finally {
      abortControllers.current.delete(fileId)
    }
  }, [files])

  // Mock upload function with progress simulation
  const uploadFileWithProgress = async (
    file: UploadFile, 
    signal: AbortSignal,
    onProgress: (progress: number, uploadedBytes: number, speed: number) => void
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      let uploadedBytes = 0
      const startTime = Date.now()

      const interval = setInterval(() => {
        if (signal.aborted) {
          clearInterval(interval)
          reject(new Error('AbortError'))
          return
        }

        // Simulate upload progress
        const increment = Math.random() * 0.1 * file.size
        uploadedBytes = Math.min(uploadedBytes + increment, file.size)
        const progress = (uploadedBytes / file.size) * 100
        
        // Calculate speed
        const elapsed = (Date.now() - startTime) / 1000
        const speed = uploadedBytes / elapsed

        onProgress(progress, uploadedBytes, speed)

        if (uploadedBytes >= file.size) {
          clearInterval(interval)
          
          // Simulate processing time
          setTimeout(() => {
            resolve()
          }, 1000)
        }
      }, 100)
    })
  }

  // Cancel upload
  const cancelUpload = useCallback((fileId: string) => {
    const controller = abortControllers.current.get(fileId)
    if (controller) {
      controller.abort()
    }
  }, [])

  // Retry upload
  const retryUpload = useCallback((fileId: string) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'pending', progress: 0, error: undefined, uploadedBytes: 0 }
        : f
    ))
    startUpload(fileId)
  }, [startUpload])

  // Remove file
  const removeFile = useCallback((fileId: string) => {
    cancelUpload(fileId)
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [cancelUpload])

  // Clear completed files
  const clearCompleted = useCallback(() => {
    setFiles(prev => prev.filter(f => f.status !== 'completed'))
  }, [])

  // Pause all uploads
  const pauseAll = useCallback(() => {
    setIsPaused(true)
    abortControllers.current.forEach(controller => controller.abort())
  }, [])

  // Resume all uploads
  const resumeAll = useCallback(() => {
    setIsPaused(false)
    files
      .filter(f => f.status === 'cancelled' || f.status === 'pending')
      .forEach(f => startUpload(f.id))
  }, [files, startUpload])

  // Calculate stats
  const stats = {
    total: files.length,
    pending: files.filter(f => f.status === 'pending').length,
    uploading: files.filter(f => f.status === 'uploading').length,
    completed: files.filter(f => f.status === 'completed').length,
    failed: files.filter(f => f.status === 'failed').length,
    totalSize: files.reduce((acc, f) => acc + f.size, 0),
    uploadedSize: files.reduce((acc, f) => acc + (f.uploadedBytes || 0), 0),
    overallProgress: files.length > 0 
      ? files.reduce((acc, f) => acc + f.progress, 0) / files.length 
      : 0
  }

  return {
    files,
    stats,
    isUploading,
    isPaused,
    addFiles,
    startUpload,
    cancelUpload,
    retryUpload,
    removeFile,
    clearCompleted,
    pauseAll,
    resumeAll,
  }
}

/**
 * ========================================================================
 * FILE ITEM COMPONENT
 * ========================================================================
 */

interface FileItemProps {
  file: UploadFile
  onCancel: () => void
  onRetry: () => void
  onRemove: () => void
  showPreview?: boolean
}

const FileItem: React.FC<FileItemProps> = ({ 
  file, 
  onCancel, 
  onRetry, 
  onRemove, 
  showPreview = true 
}) => {
  const getStatusColor = () => {
    switch (file.status) {
      case 'completed': return 'text-green-600'
      case 'failed': return 'text-red-600'
      case 'uploading': return 'text-blue-600'
      case 'processing': return 'text-purple-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = () => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'cancelled':
        return <X className="h-4 w-4 text-gray-500" />
      default:
        return <Upload className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start space-x-3">
        {/* File Icon */}
        <div className="flex-shrink-0">
          {getFileIcon(file)}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {file.name}
            </h4>
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <Badge variant={file.status === 'completed' ? 'default' : 'secondary'}>
                {file.status}
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            {/* File Details */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{formatFileSize(file.size)}</span>
              <span className="capitalize">{file.contentType}</span>
            </div>

            {/* Progress Bar */}
            {(file.status === 'uploading' || file.status === 'processing') && (
              <div className="space-y-1">
                <Progress value={file.progress} className="h-2" />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{Math.round(file.progress)}%</span>
                  {file.speed && (
                    <span>
                      {formatFileSize(file.speed)}/s
                      {file.timeRemaining && ` • ${formatDuration(file.timeRemaining)} left`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Upload Stats */}
            {file.uploadedBytes && file.totalBytes && (
              <div className="text-xs text-gray-500">
                {formatFileSize(file.uploadedBytes)} / {formatFileSize(file.totalBytes)}
              </div>
            )}

            {/* Error Message */}
            {file.error && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {file.error}
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2">
              {file.status === 'uploading' && (
                <Button variant="outline" size="sm" onClick={onCancel}>
                  <Pause className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              )}
              
              {file.status === 'failed' && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * ========================================================================
 * MAIN FILE UPLOAD COMPONENT
 * ========================================================================
 */

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadComplete,
  onUploadProgress,
  onUploadError,
  options = {},
  className,
  disabled = false
}) => {
  const {
    files,
    stats,
    isUploading,
    isPaused,
    addFiles,
    startUpload,
    cancelUpload,
    retryUpload,
    removeFile,
    clearCompleted,
    pauseAll,
    resumeAll,
  } = useFileUpload(options)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (disabled) return

    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      try {
        addFiles(droppedFiles)
      } catch (error) {
        onUploadError?.(error.message)
      }
    }
  }, [addFiles, disabled, onUploadError])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles && selectedFiles.length > 0) {
      try {
        addFiles(selectedFiles)
      } catch (error) {
        onUploadError?.(error.message)
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [addFiles, onUploadError])

  // Notify parent of progress
  useEffect(() => {
    onUploadProgress?.(files)
  }, [files, onUploadProgress])

  // Notify parent when uploads complete
  useEffect(() => {
    const completedFiles = files.filter(f => f.status === 'completed')
    if (completedFiles.length > 0) {
      onUploadComplete?.(completedFiles)
    }
  }, [files, onUploadComplete])

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload Area */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors",
          dragActive ? "border-blue-400 bg-blue-50" : "border-gray-300",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className={cn(
              "p-4 rounded-full",
              dragActive ? "bg-blue-100" : "bg-gray-100"
            )}>
              <Upload className={cn(
                "h-8 w-8",
                dragActive ? "text-blue-500" : "text-gray-400"
              )} />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium">
                {dragActive ? "Drop files here" : "Upload files"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Supports: PDF, DOC, DOCX, TXT, MP4, and more
                <br />
                Max size: {formatFileSize(options.maxSize || DEFAULT_OPTIONS.maxSize)}
              </p>
            </div>

            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Choose Files
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={options.accept?.join(',') || DEFAULT_OPTIONS.accept.join(',')}
              onChange={handleFileSelect}
              className="hidden"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload Stats */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Upload Progress ({stats.completed}/{stats.total})
              </CardTitle>
              <div className="flex items-center space-x-2">
                {stats.uploading > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={isPaused ? resumeAll : pauseAll}
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-3 w-3 mr-1" />
                        Pause
                      </>
                    )}
                  </Button>
                )}
                
                {stats.completed > 0 && (
                  <Button variant="outline" size="sm" onClick={clearCompleted}>
                    Clear Completed
                  </Button>
                )}
              </div>
            </div>
            
            {stats.total > 0 && (
              <div className="space-y-2">
                <Progress value={stats.overallProgress} className="h-2" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{Math.round(stats.overallProgress)}% complete</span>
                  <span>
                    {formatFileSize(stats.uploadedSize)} / {formatFileSize(stats.totalSize)}
                  </span>
                </div>
              </div>
            )}
          </CardHeader>
        </Card>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Files</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                <AnimatePresence>
                  {files.map((file) => (
                    <FileItem
                      key={file.id}
                      file={file}
                      onCancel={() => cancelUpload(file.id)}
                      onRetry={() => retryUpload(file.id)}
                      onRemove={() => removeFile(file.id)}
                      showPreview={options.showPreview}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * ========================================================================
 * SPECIALIZED UPLOAD COMPONENTS
 * ========================================================================
 */

export const DocumentUpload: React.FC<FileUploadProps> = (props) => {
  return (
    <FileUpload
      {...props}
      options={{
        ...props.options,
        accept: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/markdown',
          'application/rtf'
        ],
        maxSize: 50 * 1024 * 1024, // 50MB for documents
      }}
    />
  )
}

export const MediaUpload: React.FC<FileUploadProps> = (props) => {
  return (
    <FileUpload
      {...props}
      options={{
        ...props.options,
        accept: [
          'video/mp4',
          'video/avi',
          'video/mov',
          'video/wmv',
          'video/webm',
          'audio/mpeg',
          'audio/wav',
          'audio/flac',
          'audio/aac'
        ],
        maxSize: 500 * 1024 * 1024, // 500MB for media
        chunkSize: 8 * 1024 * 1024, // 8MB chunks for large files
      }}
    />
  )
}

export default FileUpload