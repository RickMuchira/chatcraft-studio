// components/media-upload.tsx - Specialized Media Upload Component

"use client"

import React from 'react'
import { FileUpload, type FileUploadProps } from './file-upload'
import { Video, Music, Mic } from 'lucide-react'

/**
 * ========================================================================
 * MEDIA-SPECIFIC CONFIGURATION
 * ========================================================================
 */

const MEDIA_TYPES = {
  // Video Files
  'video/mp4': '.mp4',
  'video/avi': '.avi',
  'video/mov': '.mov',
  'video/wmv': '.wmv',
  'video/webm': '.webm',
  'video/flv': '.flv',
  'video/mkv': '.mkv',
  'video/m4v': '.m4v',
  
  // Audio Files
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/flac': '.flac',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/m4a': '.m4a',
  'audio/wma': '.wma',
  
  // YouTube URLs (will be handled separately)
  'text/plain': '.txt', // For YouTube URLs in text files
}

const MEDIA_OPTIONS = {
  accept: Object.keys(MEDIA_TYPES),
  maxFiles: 5,
  maxSize: 500 * 1024 * 1024, // 500MB for media files
  autoStart: true,
  allowRetry: true,
  showPreview: true,
  chunkSize: 8 * 1024 * 1024, // 8MB chunks for large media files
}

/**
 * ========================================================================
 * MEDIA UPLOAD COMPONENT
 * ========================================================================
 */

export interface MediaUploadProps extends Omit<FileUploadProps, 'options'> {
  options?: Partial<typeof MEDIA_OPTIONS>
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
  options = {},
  ...props
}) => {
  const mergedOptions = {
    ...MEDIA_OPTIONS,
    ...options,
  }

  return (
    <FileUpload
      {...props}
      options={mergedOptions}
    />
  )
}

export default MediaUpload