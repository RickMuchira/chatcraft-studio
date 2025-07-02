'use client'

import { useState, useEffect } from 'react'
import { 
  LayoutDashboard, 
  FileText, 
  Bot, 
  Rocket, 
  BarChart, 
  Settings,
  Menu,
  X,
  Bell,
  Search,
  Zap,
  User,
  LogOut,
  HelpCircle,
  ChevronDown
} from 'lucide-react'

// Mock user data - replace with actual auth
const mockUser = {
  name: "John Doe",
  email: "john@acmecorp.com",
  organization: "Acme Corporation",
  avatar: null,
  notifications: 3
}

interface DashboardLayoutProps {
  children: React.ReactNode
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) {
        setSidebarOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Navigation items
  const navigationItems = [
    { 
      id: 'dashboard', 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: LayoutDashboard,
      active: true // You'll make this dynamic based on current route
    },
    { 
      id: 'content', 
      name: 'Content', 
      href: '/dashboard/content', 
      icon: FileText,
      badge: '3' // Dynamic count of content sources
    },
    { 
      id: 'chatbot', 
      name: 'Chatbot', 
      href: '/dashboard/chatbot', 
      icon: Bot 
    },
    { 
      id: 'deployment', 
      name: 'Deployment', 
      href: '/dashboard/deployment', 
      icon: Rocket 
    },
    { 
      id: 'analytics', 
      name: 'Analytics', 
      href: '/dashboard/analytics', 
      icon: BarChart 
    },
    { 
      id: 'settings', 
      name: 'Settings', 
      href: '/dashboard/settings', 
      icon: Settings 
    }
  ]

  // Close mobile sidebar when clicking outside
  const handleOverlayClick = () => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={handleOverlayClick}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 
        transform transition-transform duration-300 ease-in-out lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${!sidebarOpen && !isMobile ? 'lg:w-16' : 'lg:w-64'}
      `}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            {(sidebarOpen || !isMobile) && (
              <h1 className="text-xl font-bold text-gray-900">ChatCraft</h1>
            )}
          </div>
          
          {/* Mobile close button */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon
            return (
              <a
                key={item.id}
                href={item.href}
                className={`
                  group flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors
                  ${item.active 
                    ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' 
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {(sidebarOpen || !isMobile) && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {item.badge && (
                      <span className="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </a>
            )
          })}
        </nav>

        {/* Sidebar Footer - User Info */}
        {(sidebarOpen || !isMobile) && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {mockUser.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {mockUser.name}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {mockUser.organization}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left side - Menu toggle and search */}
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Toggle sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64 text-sm"
                />
              </div>
            </div>

            {/* Right side - Notifications and user menu */}
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell className="h-5 w-5" />
                {mockUser.notifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {mockUser.notifications}
                  </span>
                )}
              </button>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                    {mockUser.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <ChevronDown className="h-4 w-4 hidden sm:block" />
                </button>

                {/* User dropdown menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    <div className="p-4 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900">{mockUser.name}</p>
                      <p className="text-xs text-gray-500">{mockUser.email}</p>
                    </div>
                    <div className="py-2">
                      <a href="/dashboard/profile" className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <User className="h-4 w-4" />
                        Profile
                      </a>
                      <a href="/dashboard/settings" className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <Settings className="h-4 w-4" />
                        Settings
                      </a>
                      <a href="/help" className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <HelpCircle className="h-4 w-4" />
                        Help & Support
                      </a>
                      <hr className="my-2" />
                      <button className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left">
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main id="main-content" className="flex-1 overflow-auto">
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>

      {/* Click outside to close user menu */}
      {userMenuOpen && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setUserMenuOpen(false)}
        />
      )}
    </div>
  )
}

export default DashboardLayout