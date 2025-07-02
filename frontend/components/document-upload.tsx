// components/document-upload.tsx - Specialized Document Upload Component

"use client"

import React from 'react'
import { FileUpload, type FileUploadProps } from './file-upload'
import { FileText, File, Image } from 'lucide-react'

/**
 * ========================================================================
 * DOCUMENT-SPECIFIC CONFIGURATION
 * ========================================================================
 */

const DOCUMENT_TYPES = {
  // PDF Documents
  'application/pdf': '.pdf',
  
  // Microsoft Word
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  
  // Text Files
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  
  // Rich Text
  'application/rtf': '.rtf',
  
  // Images (for OCR processing)
  'image/jpeg': '.jpg,.jpeg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  
  // Presentations
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  
  // Spreadsheets  
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
}

const DOCUMENT_OPTIONS = {
  accept: Object.keys(DOCUMENT_TYPES),
  maxFiles: 20,
  maxSize: 50 * 1024 * 1024, // 50MB for documents
  autoStart: true,
  allowRetry: true,
  showPreview: true,
  chunkSize: 2 * 1024 * 1024, // 2MB chunks for documents
}

/**
 * ========================================================================
 * DOCUMENT UPLOAD COMPONENT
 * ========================================================================
 */

export interface DocumentUploadProps extends Omit<FileUploadProps, 'options'> {
  options?: Partial<typeof DOCUMENT_OPTIONS>
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  options = {},
  ...props
}) => {
  const mergedOptions = {
    ...DOCUMENT_OPTIONS,
    ...options,
  }

  return (
    <FileUpload
      {...props}
      options={mergedOptions}
    />
  )
}

export default DocumentUpload