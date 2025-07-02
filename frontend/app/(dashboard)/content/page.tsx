// app/dashboard/content/page.tsx - Comprehensive Content Management Page

"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Upload, 
  Search, 
  Filter, 
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Download,
  RefreshCw,
  Plus,
  FileText,
  Video,
  Globe,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  BarChart3,
  Settings,
  ExternalLink,
  Calendar,
  Users,
  Zap,
  TrendingUp,
  Activity
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Import our custom components and hooks
import { FileUpload, DocumentUpload, MediaUpload } from '@/components/file-upload'
import { 
  useContentSources, 
  useContentStats, 
  useDeleteContentSource,
  useUpdateContentSource,
  useProcessingProgress,
  useTenantUsage
} from '@/hooks/api'
import type { ContentSource, ContentType, ProcessingStatus } from '@/types'

/**
 * ========================================================================
 * INTERFACES & TYPES
 * ========================================================================
 */

interface ContentSourceWithProgress extends ContentSource {
  progress?: number
}

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
}

interface ContentSourceRowProps {
  source: ContentSourceWithProgress
  onEdit: (source: ContentSource) => void
  onDelete: (source: ContentSource) => void
  onView: (source: ContentSource) => void
}

interface AddContentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FilterType = 'all' | ContentType
type StatusFilter = 'all' | ProcessingStatus

/**
 * ========================================================================
 * UTILITY FUNCTIONS
 * ========================================================================
 */

const getStatusIcon = (status: ProcessingStatus) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500" />
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-gray-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-400" />
  }
}

const getStatusBadge = (status: ProcessingStatus) => {
  const variants = {
    completed: 'default',
    failed: 'destructive',
    processing: 'secondary',
    pending: 'outline',
    cancelled: 'secondary',
  } as const

  return (
    <Badge variant={variants[status] as any} className="capitalize">
      {status.replace('_', ' ')}
    </Badge>
  )
}

const getContentTypeIcon = (type: ContentType) => {
  switch (type) {
    case 'document':
      return <FileText className="h-4 w-4 text-blue-500" />
    case 'website':
      return <Globe className="h-4 w-4 text-green-500" />
    case 'video':
      return <Video className="h-4 w-4 text-purple-500" />
    case 'api':
      return <Database className="h-4 w-4 text-orange-500" />
    default:
      return <FileText className="h-4 w-4 text-gray-500" />
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

const StatsCard: React.FC<StatsCardProps> = ({ 
  title, 
  value, 
  description, 
  icon, 
  trend,
  className 
}) => {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <div className={cn(
            "flex items-center text-xs mt-1",
            trend.isPositive ? "text-green-600" : "text-red-600"
          )}>
            <TrendingUp className={cn(
              "h-3 w-3 mr-1",
              !trend.isPositive && "rotate-180"
            )} />
            {Math.abs(trend.value)}% from last month
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const ContentSourceRow: React.FC<ContentSourceRowProps> = ({ 
  source, 
  onEdit, 
  onDelete, 
  onView 
}) => {
  const { data: progress } = useProcessingProgress(
    source.status === 'processing' ? source.id : ''
  )

  const isProcessing = source.status === 'processing'
  const processingProgress = progress?.progress_percentage || 0

  return (
    <TableRow className="group hover:bg-muted/50">
      <TableCell className="font-medium">
        <div className="flex items-center space-x-3">
          {getContentTypeIcon(source.content_type)}
          <div>
            <div className="font-medium">{source.name}</div>
            {source.source_url && (
              <div className="text-xs text-muted-foreground truncate max-w-xs">
                {source.source_url}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {source.content_type.replace('_', ' ')}
        </Badge>
      </TableCell>
      
      <TableCell>
        <div className="flex items-center space-x-2">
          {getStatusIcon(source.status)}
          {getStatusBadge(source.status)}
        </div>
        {isProcessing && (
          <div className="mt-1">
            <Progress value={processingProgress} className="h-1 w-20" />
            <span className="text-xs text-muted-foreground">
              {processingProgress}%
            </span>
          </div>
        )}
      </TableCell>
      
      <TableCell className="text-sm text-muted-foreground">
        <div>
          {source.stats?.total_documents || 0} docs
        </div>
        <div>
          {source.stats?.total_chunks || 0} chunks
        </div>
      </TableCell>
      
      <TableCell className="text-sm text-muted-foreground">
        {source.stats?.file_size_bytes 
          ? formatFileSize(source.stats.file_size_bytes)
          : '—'
        }
      </TableCell>
      
      <TableCell className="text-sm text-muted-foreground">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              {formatDistanceToNow(new Date(source.created_at), { addSuffix: true })}
            </TooltipTrigger>
            <TooltipContent>
              {format(new Date(source.created_at), 'PPpp')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onView(source)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(source)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            {source.source_url && (
              <DropdownMenuItem asChild>
                <a href={source.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Source
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onDelete(source)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

const AddContentDialog: React.FC<AddContentDialogProps> = ({ open, onOpenChange }) => {
  const [uploadType, setUploadType] = useState<'file' | 'website' | 'api'>('file')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Content Source</DialogTitle>
          <DialogDescription>
            Upload files, connect websites, or integrate APIs to build your knowledge base.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={uploadType} onValueChange={(value) => setUploadType(value as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="file" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>Files</span>
            </TabsTrigger>
            <TabsTrigger value="website" className="flex items-center space-x-2">
              <Globe className="h-4 w-4" />
              <span>Website</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center space-x-2">
              <Database className="h-4 w-4" />
              <span>API</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Document Upload</h3>
                <DocumentUpload 
                  variant="compact"
                  onUploadComplete={() => onOpenChange(false)}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-4">Media Upload</h3>
                <MediaUpload 
                  variant="compact"
                  onUploadComplete={() => onOpenChange(false)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="website" className="space-y-4">
            <Alert>
              <Globe className="h-4 w-4" />
              <AlertDescription>
                Website crawling feature coming soon. This will allow you to automatically extract and process content from websites.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="api" className="space-y-4">
            <Alert>
              <Database className="h-4 w-4" />
              <AlertDescription>
                API integration feature coming soon. This will allow you to connect external data sources and APIs.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/**
 * ========================================================================
 * MAIN COMPONENT
 * ========================================================================
 */

export default function ContentManagementPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [addContentOpen, setAddContentOpen] = useState(false)
  const [selectedSource, setSelectedSource] = useState<ContentSource | null>(null)

  // API Hooks
  const { data: contentSources, isLoading, refetch } = useContentSources({
    per_page: 50,
  })
  const { data: stats } = useContentStats()
  const { data: usage } = useTenantUsage()
  const deleteSource = useDeleteContentSource()

  // Filter and search logic
  const filteredSources = useMemo(() => {
    if (!contentSources?.data) return []

    return contentSources.data.filter((source) => {
      const matchesSearch = source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           source.source_url?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = typeFilter === 'all' || source.content_type === typeFilter
      const matchesStatus = statusFilter === 'all' || source.status === statusFilter

      return matchesSearch && matchesType && matchesStatus
    })
  }, [contentSources?.data, searchQuery, typeFilter, statusFilter])

  // Calculate stats
  const sourceStats = useMemo(() => {
    if (!contentSources?.data) return { total: 0, processing: 0, completed: 0, failed: 0 }

    return contentSources.data.reduce((acc, source) => {
      acc.total++
      if (source.status === 'processing') acc.processing++
      else if (source.status === 'completed') acc.completed++
      else if (source.status === 'failed') acc.failed++
      return acc
    }, { total: 0, processing: 0, completed: 0, failed: 0 })
  }, [contentSources?.data])

  // Event handlers
  const handleEdit = useCallback((source: ContentSource) => {
    setSelectedSource(source)
    // TODO: Open edit dialog
  }, [])

  const handleDelete = useCallback(async (source: ContentSource) => {
    if (confirm(`Are you sure you want to delete "${source.name}"?`)) {
      await deleteSource.mutateAsync(source.id)
    }
  }, [deleteSource])

  const handleView = useCallback((source: ContentSource) => {
    setSelectedSource(source)
    // TODO: Open view dialog
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Management</h1>
          <p className="text-muted-foreground">
            Manage your knowledge base content and monitor processing status
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setAddContentOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Content
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Sources"
          value={sourceStats.total}
          description="Content sources in your knowledge base"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          trend={{ value: 12, isPositive: true }}
        />
        <StatsCard
          title="Processing"
          value={sourceStats.processing}
          description="Currently being processed"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Completed"
          value={sourceStats.completed}
          description="Successfully processed"
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          trend={{ value: 8, isPositive: true }}
        />
        <StatsCard
          title="Storage Used"
          value={usage ? `${usage.current_month.storage_used_mb.toFixed(1)} MB` : '—'}
          description={usage ? `${usage.usage_percentage.storage.toFixed(1)}% of limit` : ''}
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Processing Alert */}
      {sourceStats.processing > 0 && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            {sourceStats.processing} content source{sourceStats.processing > 1 ? 's are' : ' is'} currently being processed. 
            This may take a few minutes depending on the content size.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Content Sources</CardTitle>
          <CardDescription>
            Manage and monitor all your content sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search content sources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as FilterType)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Content Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="website">Websites</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
                <SelectItem value="api">APIs</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Content Sources Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-muted-foreground">Loading content sources...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredSources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center space-y-2">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                            ? 'No content sources match your filters'
                            : 'No content sources yet'
                          }
                        </p>
                        {!searchQuery && typeFilter === 'all' && statusFilter === 'all' && (
                          <Button 
                            variant="outline" 
                            onClick={() => setAddContentOpen(true)}
                            className="mt-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Your First Content
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSources.map((source) => (
                    <ContentSourceRow
                      key={source.id}
                      source={source}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onView={handleView}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Table Footer with Results Count */}
          {filteredSources.length > 0 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {filteredSources.length} of {sourceStats.total} content sources
              </p>
              {contentSources?.meta?.has_more && (
                <Button variant="outline" size="sm">
                  Load More
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Content Dialog */}
      <AddContentDialog 
        open={addContentOpen} 
        onOpenChange={setAddContentOpen}
      />
    </div>
  )
}