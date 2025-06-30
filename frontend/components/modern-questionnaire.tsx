"use client"

import type React from "react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Building2,
  Users,
  Target,
  MessageCircle,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Globe,
  Shield,
  Zap,
  ChevronRight,
} from "lucide-react"

interface FormData {
  organizationName: string
  organizationType: string
  industry: string
  organizationSize: string
  primaryPurpose: string
  targetAudience: string[]
  communicationStyle: string
  supportChannels: string[]
  businessHours: string
  specialRequirements: string
  complianceNeeds: string[]
  languages: string[]
  integrationNeeds: string[]
}

interface Question {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  type: "input" | "textarea" | "select" | "multiselect" | "radio" | "checkbox-grid"
  field: keyof FormData
  options?: any[]
  placeholder?: string
  required?: boolean
}

const ModernQuestionnaire = () => {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [formData, setFormData] = useState<FormData>({
    organizationName: "",
    organizationType: "",
    industry: "",
    organizationSize: "",
    primaryPurpose: "",
    targetAudience: [],
    communicationStyle: "",
    supportChannels: [],
    businessHours: "",
    specialRequirements: "",
    complianceNeeds: [],
    languages: ["English"],
    integrationNeeds: [],
  })

  const organizationTypes = [
    { value: "business", label: "Business", icon: "🏢", description: "Corporations & companies" },
    { value: "nonprofit", label: "Non-Profit", icon: "❤️", description: "Charities & NGOs" },
    { value: "education", label: "Education", icon: "🎓", description: "Schools & universities" },
    { value: "healthcare", label: "Healthcare", icon: "🏥", description: "Hospitals & clinics" },
    { value: "government", label: "Government", icon: "🏛️", description: "Public agencies" },
    { value: "retail", label: "Retail", icon: "🛒", description: "E-commerce & stores" },
    { value: "technology", label: "Technology", icon: "💻", description: "Tech companies" },
    { value: "finance", label: "Finance", icon: "💰", description: "Banks & fintech" },
    { value: "consulting", label: "Consulting", icon: "📊", description: "Professional services" },
    { value: "other", label: "Other", icon: "🔧", description: "Other organizations" },
  ]

  const industries = [
    "Technology",
    "Healthcare",
    "Finance",
    "Education",
    "Retail",
    "Manufacturing",
    "Real Estate",
    "Food & Beverage",
    "Travel & Tourism",
    "Legal Services",
    "Marketing & Advertising",
    "Non-Profit",
    "Government",
    "Entertainment",
    "Automotive",
    "Energy",
    "Agriculture",
    "Construction",
    "Other",
  ]

  const organizationSizes = [
    { value: "solo", label: "1 person", description: "Solo entrepreneur" },
    { value: "small", label: "2-10 people", description: "Small team" },
    { value: "medium", label: "11-50 people", description: "Growing company" },
    { value: "large", label: "51-200 people", description: "Established business" },
    { value: "enterprise", label: "200+ people", description: "Large enterprise" },
  ]

  const communicationStyles = [
    { value: "professional", label: "Professional & Formal", description: "Corporate tone" },
    { value: "friendly", label: "Friendly & Casual", description: "Approachable style" },
    { value: "helpful", label: "Helpful & Supportive", description: "Service-oriented" },
    { value: "expert", label: "Expert & Technical", description: "Specialized knowledge" },
    { value: "warm", label: "Warm & Personal", description: "Human touch" },
  ]

  const targetAudiences = [
    "Customers",
    "Employees",
    "Students",
    "Patients",
    "Citizens",
    "Vendors/Partners",
    "Investors",
    "Job Seekers",
    "Members",
    "Visitors",
  ]

  const supportChannels = [
    "Website Chat",
    "Mobile App",
    "WhatsApp",
    "Facebook Messenger",
    "Slack",
    "Discord",
    "Email Integration",
    "Voice Calls",
    "SMS",
  ]

  const complianceOptions = ["GDPR", "HIPAA", "SOX", "PCI DSS", "COPPA", "CCPA", "ISO 27001", "None"]

  const integrationOptions = [
    "CRM (Salesforce, HubSpot)",
    "Help Desk (Zendesk, Freshdesk)",
    "E-commerce (Shopify, WooCommerce)",
    "Calendar Systems",
    "Payment Processing",
    "Database Systems",
    "Email Marketing",
    "Analytics Tools",
    "Social Media",
    "Custom APIs",
  ]

  const questions: Question[] = [
    {
      id: "name",
      title: "What's your organization called?",
      subtitle: "Let's start with the basics - what should we call your organization?",
      icon: <Building2 className="h-8 w-8" />,
      type: "input",
      field: "organizationName",
      placeholder: "Enter your organization name",
      required: true,
    },
    {
      id: "type",
      title: "What type of organization are you?",
      subtitle: "This helps us understand your context and needs better",
      icon: <Globe className="h-8 w-8" />,
      type: "radio",
      field: "organizationType",
      options: organizationTypes,
      required: true,
    },
    {
      id: "industry",
      title: "Which industry do you operate in?",
      subtitle: "We'll customize the chatbot based on your industry standards",
      icon: <Target className="h-8 w-8" />,
      type: "select",
      field: "industry",
      options: industries,
      required: true,
    },
    {
      id: "size",
      title: "How big is your organization?",
      subtitle: "This helps us scale the solution appropriately",
      icon: <Users className="h-8 w-8" />,
      type: "radio",
      field: "organizationSize",
      options: organizationSizes,
      required: true,
    },
    {
      id: "purpose",
      title: "What's the main purpose of your chatbot?",
      subtitle: "Describe what you want your chatbot to accomplish",
      icon: <Zap className="h-8 w-8" />,
      type: "textarea",
      field: "primaryPurpose",
      placeholder: "e.g., Customer support, lead generation, appointment booking, FAQ answering...",
      required: true,
    },
    {
      id: "audience",
      title: "Who will be using your chatbot?",
      subtitle: "Select all the groups that will interact with your chatbot",
      icon: <Users className="h-8 w-8" />,
      type: "checkbox-grid",
      field: "targetAudience",
      options: targetAudiences,
      required: true,
    },
    {
      id: "style",
      title: "How should your chatbot communicate?",
      subtitle: "Choose the communication style that matches your brand",
      icon: <MessageCircle className="h-8 w-8" />,
      type: "radio",
      field: "communicationStyle",
      options: communicationStyles,
      required: true,
    },
    {
      id: "channels",
      title: "Where will your chatbot be deployed?",
      subtitle: "Select all the channels where users will interact with your chatbot",
      icon: <Globe className="h-8 w-8" />,
      type: "checkbox-grid",
      field: "supportChannels",
      options: supportChannels,
      required: true,
    },
    {
      id: "hours",
      title: "What are your business hours?",
      subtitle: "When should your chatbot be most active?",
      icon: <Shield className="h-8 w-8" />,
      type: "input",
      field: "businessHours",
      placeholder: "e.g., Monday-Friday 9AM-5PM EST, 24/7, etc.",
    },
    {
      id: "compliance",
      title: "Any compliance requirements?",
      subtitle: "Select any regulatory standards you need to comply with",
      icon: <Shield className="h-8 w-8" />,
      type: "checkbox-grid",
      field: "complianceNeeds",
      options: complianceOptions,
    },
    {
      id: "integrations",
      title: "What systems need integration?",
      subtitle: "Select the tools and systems your chatbot should connect with",
      icon: <Zap className="h-8 w-8" />,
      type: "checkbox-grid",
      field: "integrationNeeds",
      options: integrationOptions,
    },
    {
      id: "special",
      title: "Any special requirements?",
      subtitle: "Tell us about any specific features or restrictions we should know about",
      icon: <Sparkles className="h-8 w-8" />,
      type: "textarea",
      field: "specialRequirements",
      placeholder: "Any specific features, restrictions, or requirements...",
    },
  ]

  const currentQ = questions[currentQuestion]
  const progress = ((currentQuestion + 1) / questions.length) * 100

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleArrayToggle = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).includes(value)
        ? (prev[field] as string[]).filter((item: string) => item !== value)
        : [...(prev[field] as string[]), value],
    }))
  }

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    }
  }

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitStatus('idle')
    
    try {
      const response = await fetch('http://localhost:8000/api/save-questionnaire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log("✅ Questionnaire saved successfully:", result)
      setSubmitStatus('success')
      
      // Show success message
      alert(`✅ Questionnaire submitted successfully!\n\nOrganization: ${result.organization_name}\nResponse ID: ${result.id}`)
      
    } catch (error) {
      console.error("❌ Error submitting questionnaire:", error)
      setSubmitStatus('error')
      alert(`❌ Error submitting questionnaire: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isCurrentQuestionValid = () => {
    const field = currentQ.field
    const value = formData[field]

    if (!currentQ.required) return true

    if (Array.isArray(value)) {
      return value.length > 0
    }

    return value && value.toString().trim() !== ""
  }

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  }

  const renderQuestionContent = () => {
    const field = currentQ.field
    const value = formData[field]

    switch (currentQ.type) {
      case "input":
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Input
              value={value as string}
              onChange={(e) => handleInputChange(field, e.target.value)}
              placeholder={currentQ.placeholder}
              className="h-14 text-lg border-2 focus:border-blue-500 transition-colors"
            />
          </motion.div>
        )

      case "textarea":
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Textarea
              value={value as string}
              onChange={(e) => handleInputChange(field, e.target.value)}
              placeholder={currentQ.placeholder}
              className="min-h-[120px] text-lg border-2 focus:border-blue-500 transition-colors resize-none"
            />
          </motion.div>
        )

      case "select":
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Select value={value as string} onValueChange={(val) => handleInputChange(field, val)}>
              <SelectTrigger className="h-14 text-lg border-2 focus:border-blue-500">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {currentQ.options?.map((option) => (
                  <SelectItem key={option} value={option.toLowerCase ? option.toLowerCase() : option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>
        )

      case "radio":
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <RadioGroup
              value={value as string}
              onValueChange={(val) => handleInputChange(field, val)}
              className="space-y-3"
            >
              {currentQ.options?.map((option, index) => (
                <motion.div
                  key={option.value}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                >
                  <Card
                    className={`cursor-pointer transition-all duration-300 hover:shadow-lg border-2 ${
                      value === option.value
                        ? "border-blue-500 bg-blue-50 shadow-md"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <RadioGroupItem value={option.value} id={option.value} />
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="text-3xl">{option.icon}</div>
                          <div>
                            <Label htmlFor={option.value} className="text-lg font-semibold cursor-pointer">
                              {option.label}
                            </Label>
                            <p className="text-gray-600 mt-1">{option.description}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </RadioGroup>
          </motion.div>
        )

      case "checkbox-grid":
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {currentQ.options?.map((option, index) => (
              <motion.div
                key={option}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.05 }}
              >
                <Card
                  className={`cursor-pointer transition-all duration-300 hover:shadow-md border-2 ${
                    (value as string[]).includes(option)
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id={`${field}-${option}`}
                        checked={(value as string[]).includes(option)}
                        onCheckedChange={() => handleArrayToggle(field, option)}
                      />
                      <Label htmlFor={`${field}-${option}`} className="font-medium cursor-pointer flex-1">
                        {option}
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <motion.div
              className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl shadow-lg"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Sparkles className="h-8 w-8 text-white" />
            </motion.div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ChatCraft Studio
            </h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Let's create a chatbot that perfectly matches your organization's needs
          </p>
        </motion.div>

        {/* Progress Bar */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold text-gray-700">
              Question {currentQuestion + 1} of {questions.length}
            </span>
            <span className="text-lg text-gray-500">{Math.round(progress)}% complete</span>
          </div>
          <div className="relative">
            <Progress value={progress} className="h-3 bg-gray-200" />
            <motion.div
              className="absolute top-0 left-0 h-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
          >
            <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur-sm">
              <CardContent className="p-8 md:p-12">
                {/* Question Header */}
                <motion.div
                  className="text-center mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex items-center justify-center mb-6">
                    <motion.div
                      className="p-4 bg-gradient-to-r from-blue-100 to-purple-100 rounded-2xl"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="text-blue-600">{currentQ.icon}</div>
                    </motion.div>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{currentQ.title}</h2>
                  <p className="text-xl text-gray-600 max-w-2xl mx-auto">{currentQ.subtitle}</p>
                </motion.div>

                {/* Question Content */}
                <div className="max-w-3xl mx-auto">{renderQuestionContent()}</div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <motion.div
          className="flex justify-between items-center mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            variant="outline"
            onClick={prevQuestion}
            disabled={currentQuestion === 0}
            className="px-6 py-3 text-lg bg-transparent"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {questions.map((_, index) => (
              <motion.div
                key={index}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index === currentQuestion ? "bg-blue-500" : index < currentQuestion ? "bg-green-500" : "bg-gray-300"
                }`}
                whileHover={{ scale: 1.2 }}
              />
            ))}
          </div>

          {currentQuestion < questions.length - 1 ? (
            <Button
              onClick={nextQuestion}
              disabled={!isCurrentQuestionValid()}
              className="px-6 py-3 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              Next
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!isCurrentQuestionValid() || isSubmitting}
              className="px-8 py-3 text-lg bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:opacity-50"
            >
              <Zap className="mr-2 h-5 w-5" />
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </Button>
          )}
        </motion.div>

        {/* Summary Preview */}
        {formData.organizationName && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-12"
          >
            <Card className="border-0 shadow-xl bg-gradient-to-r from-blue-50 to-purple-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <h3 className="text-xl font-bold">Your Progress</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">{formData.organizationName}</span>
                    </div>
                    {formData.organizationType && (
                      <Badge variant="secondary">
                        {organizationTypes.find((t) => t.value === formData.organizationType)?.label}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {formData.targetAudience.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-600">Audience:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {formData.targetAudience.slice(0, 2).map((audience) => (
                            <Badge key={audience} variant="outline" className="text-xs">
                              {audience}
                            </Badge>
                          ))}
                          {formData.targetAudience.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{formData.targetAudience.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {formData.communicationStyle && (
                      <div>
                        <span className="text-sm font-medium text-gray-600">Style:</span>
                        <Badge variant="secondary" className="ml-2">
                          {communicationStyles.find((s) => s.value === formData.communicationStyle)?.label}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default ModernQuestionnaire