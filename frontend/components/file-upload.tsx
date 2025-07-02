// components/file-upload.tsx - Comprehensive File Upload Component for ChatCraft Studio

"use client"

import React, { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Upload, 
  File, 
  FileText, 
  Video, 
  Image, 
  Music,
  X, 
  Check, 
  AlertCircle, 
  Pause, 
  Play, 
  RotateCcw,
  Trash2,
  FolderOpen,
  Cloud,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Info,
  Zap,
  Shield,
  Globe
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUpload, useDocumentUpload, useMediaUpload, type UploadFile, type UploadOptions } from '@/hooks/use-upload'
import { useTenantUsage } from '@/hooks/api'
import type { ContentType } from '@/types'

/**
 * ========================================================================
 * COMPONENT INTERFACES
 * ========================================================================
 */

interface FileUploadProps {
  variant?: 'default' | 'compact' | 'minimal'
  acceptedTypes?: ContentType[]
  maxFiles?: number
  showProgress?: boolean
  showPreview?: boolean
  autoStart?: boolean
  className?: string
  onUploadComplete?: (files: UploadFile[]) => void
  onUploadError?: (error: string) => void
}

interface FileItemProps {
  file: UploadFile
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  showPreview?: boolean
  compact?: boolean
}

interface DropZoneProps {
  onFilesAdded: (files: FileList) => void
  dragActive: boolean
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  acceptedTypes?: ContentType[]
  disabled?: boolean
  className?: string
}

/**
 * ========================================================================
 * UTILITY FUNCTIONS
 * ========================================================================
 */

const getFileIcon = (contentType: ContentType, mimeType: string) => {
  if (contentType === 'video' || mimeType.startsWith('video/')) {
    return <Video className="h-5 w-5 text-purple-500" />
  }
  
  if (mimeType.startsWith('image/')) {
    return <Image className="h-5 w-5 text-green-500" />
  }
  
  if (mimeType.startsWith('audio/')) {
    return <Music className="h-5 w-5 text-blue-500" />
  }
  
  return <FileText className="h-5 w-5 text-gray-500" />
}

const getStatusIcon = (status: UploadFile['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'uploading':
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-gray-500" />
    case 'paused':
      return <Pause className="h-4 w-4 text-yellow-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-400" />
  }
}

const getStatusColor = (status: UploadFile['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-green-500'
    case 'failed':
    case 'cancelled':
      return 'bg-red-500'
    case 'uploading':
    case 'processing':
      return 'bg-blue-500'
    case 'paused':
      return 'bg-yellow-500'
    default:
      return 'bg-gray-300'
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * ========================================================================
 * SUB-COMPONENTS
 * ========================================================================
 */

const DropZone: React.FC<DropZoneProps> = ({
  onFilesAdded,
  dragActive,
  dragHandlers,
  acceptedTypes,
  disabled,
  className
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onFilesAdded(files)
    }
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onFilesAdded])

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }, [disabled])

  const getAcceptString = () => {
    if (!acceptedTypes) return undefined
    
    const extensions: string[] = []
    acceptedTypes.forEach(type => {
      switch (type) {
        case 'document':
          extensions.push('.pdf', '.docx', '.doc', '.txt', '.md', '.rtf')
          break
        case 'video':
          extensions.push('.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm')
          break
      }
    })
    return extensions.join(',')
  }

  return (
    <div
      {...dragHandlers}
      onClick={handleClick}
      className={cn(
        "relative border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer",
        "hover:border-primary/50 hover:bg-primary/5",
        dragActive && "border-primary bg-primary/10 scale-[1.02]",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={getAcceptString()}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          animate={{
            scale: dragActive ? 1.1 : 1,
            rotate: dragActive ? 5 : 0,
          }}
          transition={{ duration: 0.2 }}
        >
          <Cloud className={cn(
            "h-12 w-12 mb-4",
            dragActive ? "text-primary" : "text-muted-foreground"
          )} />
        </motion.div>
        
        <h3 className="text-lg font-semibold mb-2">
          {dragActive ? "Drop files here" : "Upload your content"}
        </h3>
        
        <p className="text-sm text-muted-foreground mb-4">
          Drag and drop files here, or click to browse
        </p>
        
        <div className="flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Documents
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Video className="h-3 w-3 mr-1" />
            Videos
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Image className="h-3 w-3 mr-1" />
            Images
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Music className="h-3 w-3 mr-1" />
            Audio
          </Badge>
        </div>
      </div>
    </div>
  )
}

const FileItem: React.FC<FileItemProps> = ({ 
  file, 
  onCancel, 
  onRetry, 
  onRemove, 
  showPreview = true,
  compact = false 
}) => {
  const [showDetails, setShowDetails] = useState(false)

  const canCancel = file.status === 'uploading' || file.status === 'pending'
  const canRetry = file.status === 'failed'
  const canRemove = file.status === 'completed' || file.status === 'failed' || file.status === 'cancelled'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "border rounded-lg p-4 bg-card",
        compact && "p-3"
      )}
    >
      <div className="flex items-center space-x-3">
        {/* File Icon */}
        <div className="flex-shrink-0">
          {getFileIcon(file.contentType, file.type)}
        </div>
        
        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium truncate">
              {file.name}
            </p>
            {getStatusIcon(file.status)}
          </div>
          
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <span>{formatFileSize(file.size)}</span>
            <span>•</span>
            <span className="capitalize">{file.status.replace('_', ' ')}</span>
            {file.status === 'uploading' && (
              <>
                <span>•</span>
                <span>{file.progress}%</span>
              </>
            )}
          </div>
          
          {/* Progress Bar */}
          {(file.status === 'uploading' || file.status === 'processing') && (
            <div className="mt-2">
              <Progress 
                value={file.progress} 
                className="h-1"
              />
            </div>
          )}
          
          {/* Error Message */}
          {file.error && (
            <div className="mt-2">
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  {file.error}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center space-x-1">
          {canCancel && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onCancel(file.id)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel upload</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {canRetry && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRetry(file.id)}
                    className="h-8 w-8 p-0"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Retry upload</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {canRemove && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(file.id)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove file</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      
      {/* Processing Info */}
      {file.status === 'processing' && file.contentSource && (
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
          <div className="flex items-center space-x-2 text-sm">
            <Zap className="h-4 w-4 text-blue-500" />
            <span className="text-blue-700 dark:text-blue-300">
              Processing content for AI analysis...
            </span>
          </div>
        </div>
      )}
      
      {/* Success Info */}
      {file.status === 'completed' && file.contentSource && (
        <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-green-700 dark:text-green-300">
                Content processed successfully
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowDetails(!showDetails)}
            >
              <Info className="h-3 w-3 mr-1" />
              Details
            </Button>
          </div>
          
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t border-green-200 dark:border-green-800"
            >
              <div className="text-xs space-y-1 text-green-600 dark:text-green-400">
                <div>ID: {file.contentSource.id}</div>
                <div>Type: {file.contentSource.content_type}</div>
                <div>Status: {file.contentSource.status}</div>
                {file.contentSource.stats && (
                  <>
                    <div>Chunks: {file.contentSource.stats.total_chunks}</div>
                    <div>Tokens: {file.contentSource.stats.total_tokens?.toLocaleString()}</div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  )
}

const UsageIndicator: React.FC = () => {
  const { data: usage } = useTenantUsage()
  
  if (!usage) return null

  const storagePercentage = usage.usage_percentage.storage
  const documentsPercentage = usage.usage_percentage.documents

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-500'
    if (percentage >= 75) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
      <div className="flex items-center space-x-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Usage Overview</span>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span>Storage</span>
          <span className={getUsageColor(storagePercentage)}>
            {usage.current_month.storage_used_mb.toFixed(1)} / {usage.limits.max_storage_mb} MB
          </span>
        </div>
        <Progress value={storagePercentage} className="h-1" />
        
        <div className="flex justify-between items-center text-xs">
          <span>Documents</span>
          <span className={getUsageColor(documentsPercentage)}>
            {usage.current_month.documents_processed} / {usage.limits.max_documents}
          </span>
        </div>
        <Progress value={documentsPercentage} className="h-1" />
      </div>
      
      {(storagePercentage > 80 || documentsPercentage > 80) && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">
            Approaching usage limits. Consider upgrading your plan.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/**
 * ========================================================================
 * MAIN COMPONENT
 * ========================================================================
 */

export const FileUpload: React.FC<FileUploadProps> = ({
  variant = 'default',
  acceptedTypes,
  maxFiles = 10,
  showProgress = true,
  showPreview = true,
  autoStart = true,
  className,
  onUploadComplete,
  onUploadError,
}) => {
  const uploadOptions: UploadOptions = {
    autoStart,
    onComplete: (file, result) => {
      onUploadComplete?.([file])
    },
    onError: (file, error) => {
      onUploadError?.(error)
    },
  }

  const upload = useUpload(uploadOptions)
  
  const handleFilesAdded = useCallback((files: FileList) => {
    if (files.length + upload.files.length > maxFiles) {
      onUploadError?.(`Maximum ${maxFiles} files allowed`)
      return
    }
    
    upload.addFiles(files)
  }, [upload, maxFiles, onUploadError])

  const activeFiles = upload.files.filter(f => 
    f.status !== 'completed' && f.status !== 'cancelled'
  )
  const completedFiles = upload.files.filter(f => f.status === 'completed')
  const failedFiles = upload.files.filter(f => f.status === 'failed')

  if (variant === 'minimal') {
    return (
      <div className={cn("space-y-4", className)}>
        <DropZone
          onFilesAdded={handleFilesAdded}
          dragActive={upload.dragActive}
          dragHandlers={upload.dragHandlers}
          acceptedTypes={acceptedTypes}
          className="h-32"
        />
        
        {upload.files.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence>
              {upload.files.map((file) => (
                <FileItem
                  key={file.id}
                  file={file}
                  onCancel={upload.cancelUpload}
                  onRetry={upload.retryUpload}
                  onRemove={upload.removeFile}
                  showPreview={false}
                  compact={true}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <DropZone
            onFilesAdded={handleFilesAdded}
            dragActive={upload.dragActive}
            dragHandlers={upload.dragHandlers}
            acceptedTypes={acceptedTypes}
            className="h-24"
          />
          
          {upload.files.length > 0 && (
            <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
              <AnimatePresence>
                {upload.files.map((file) => (
                  <FileItem
                    key={file.id}
                    file={file}
                    onCancel={upload.cancelUpload}
                    onRetry={upload.retryUpload}
                    onRemove={upload.removeFile}
                    showPreview={showPreview}
                    compact={true}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Default variant - full featured
  return (
    <div className={cn("space-y-6", className)}>
      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <DropZone
            onFilesAdded={handleFilesAdded}
            dragActive={upload.dragActive}
            dragHandlers={upload.dragHandlers}
            acceptedTypes={acceptedTypes}
          />
        </CardContent>
      </Card>

      {/* Usage Indicator */}
      <UsageIndicator />

      {/* Upload Progress Overview */}
      {showProgress && upload.files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Upload Progress</CardTitle>
              <div className="flex items-center space-x-2">
                {upload.isUploading && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={upload.isPaused ? upload.resumeUploads : upload.pauseUploads}
                  >
                    {upload.isPaused ? (
                      <>
                        <Play className="h-4 w-4 mr-1" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </>
                    )}
                  </Button>
                )}
                
                {(completedFiles.length > 0 || failedFiles.length > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={upload.clearCompleted}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
            
            {/* Overall Progress */}
            {upload.isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{Math.round(upload.totalProgress)}%</span>
                </div>
                <Progress value={upload.totalProgress} />
              </div>
            )}
            
            {/* Statistics */}
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>{upload.files.length} total</span>
              {completedFiles.length > 0 && (
                <span className="text-green-600">
                  {completedFiles.length} completed
                </span>
              )}
              {activeFiles.length > 0 && (
                <span className="text-blue-600">
                  {activeFiles.length} active
                </span>
              )}
              {failedFiles.length > 0 && (
                <span className="text-red-600">
                  {failedFiles.length} failed
                </span>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <ScrollArea className="h-64">
              <div className="space-y-3">
                <AnimatePresence>
                  {upload.files.map((file) => (
                    <FileItem
                      key={file.id}
                      file={file}
                      onCancel={upload.cancelUpload}
                      onRetry={upload.retryUpload}
                      onRemove={upload.removeFile}
                      showPreview={showPreview}
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
 * SPECIALIZED COMPONENTS
 * ========================================================================
 */

export const DocumentUpload: React.FC<Omit<FileUploadProps, 'acceptedTypes'>> = (props) => {
  return <FileUpload {...props} acceptedTypes={['document']} />
}

export const MediaUpload: React.FC<Omit<FileUploadProps, 'acceptedTypes'>> = (props) => {
  return <FileUpload {...props} acceptedTypes={['video']} />
}

export const QuickUpload: React.FC<FileUploadProps> = (props) => {
  return (
    <FileUpload 
      {...props} 
      variant="compact"
      showProgress={false}
      maxFiles={5}
    />
  )
}

export default FileUpload