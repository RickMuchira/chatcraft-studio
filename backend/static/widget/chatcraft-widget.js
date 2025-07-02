/**
 * ChatCraft Studio - Embeddable Chat Widget
 * 
 * This widget can be embedded on any website to provide AI-powered chat support.
 * It's designed to be lightweight, customizable, and easy to integrate.
 */

(function() {
    'use strict';
    
    // Prevent double loading
    if (window.ChatCraftWidget) {
        return;
    }
    
    // Default configuration
    const defaultConfig = {
        apiUrl: '/api/deployment',
        position: 'bottom-right',
        size: 'medium',
        primaryColor: '#2563eb',
        backgroundColor: '#ffffff',
        textColor: '#1f2937',
        headerTitle: 'Chat with us',
        headerSubtitle: 'We\'re here to help!',
        launcherText: '💬',
        showLauncher: true,
        autoOpen: false,
        greetingEnabled: true,
        typingIndicator: true,
        feedbackEnabled: true,
        borderRadius: '12px',
        shadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        animation: 'slide-up',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px'
    };
    
    class ChatCraftWidget {
        constructor(config = {}) {
            this.config = { ...defaultConfig, ...config };
            this.isOpen = false;
            this.isMinimized = false;
            this.conversationId = null;
            this.sessionId = this.generateSessionId();
            this.messages = [];
            this.websocket = null;
            this.isTyping = false;
            
            this.init();
        }
        
        init() {
            this.loadConfig();
            this.createStyles();
            this.createWidget();
            this.bindEvents();
            this.connectWebSocket();
            
            if (this.config.autoOpen) {
                setTimeout(() => this.open(), 1000);
            }
        }
        
        async loadConfig() {
            if (!this.config.widgetId) {
                console.error('ChatCraft Widget: widgetId is required');
                return;
            }
            
            try {
                const response = await fetch(`${this.config.apiUrl}/widget/${this.config.widgetId}/config`);
                if (response.ok) {
                    const serverConfig = await response.json();
                    this.config = { ...this.config, ...serverConfig.config, ...serverConfig.styling };
                }
            } catch (error) {
                console.warn('ChatCraft Widget: Failed to load server config', error);
            }
        }
        
        generateSessionId() {
            return 'ccs_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
        }
        
        createStyles() {
            const styleId = 'chatcraft-widget-styles';
            if (document.getElementById(styleId)) return;
            
            const styles = `
                .chatcraft-widget {
                    position: fixed;
                    z-index: 10000;
                    font-family: ${this.config.fontFamily};
                    font-size: ${this.config.fontSize};
                    line-height: 1.5;
                    color: ${this.config.textColor};
                    * { box-sizing: border-box; }
                }
                
                .chatcraft-widget.bottom-right {
                    bottom: 20px;
                    right: 20px;
                }
                
                .chatcraft-widget.bottom-left {
                    bottom: 20px;
                    left: 20px;
                }
                
                .chatcraft-widget.top-right {
                    top: 20px;
                    right: 20px;
                }
                
                .chatcraft-widget.top-left {
                    top: 20px;
                    left: 20px;
                }
                
                .chatcraft-launcher {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: ${this.config.primaryColor};
                    color: white;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    box-shadow: ${this.config.shadow};
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                
                .chatcraft-launcher:hover {
                    transform: scale(1.05);
                    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
                }
                
                .chatcraft-launcher.pulse {
                    animation: chatcraft-pulse 2s infinite;
                }
                
                @keyframes chatcraft-pulse {
                    0% { box-shadow: 0 0 0 0 ${this.config.primaryColor}40; }
                    70% { box-shadow: 0 0 0 20px transparent; }
                    100% { box-shadow: 0 0 0 0 transparent; }
                }
                
                .chatcraft-chat-window {
                    position: absolute;
                    bottom: 80px;
                    right: 0;
                    width: 350px;
                    height: 500px;
                    background: ${this.config.backgroundColor};
                    border-radius: ${this.config.borderRadius};
                    box-shadow: ${this.config.shadow};
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                    transform: translateY(20px);
                    opacity: 0;
                    transition: all 0.3s ease;
                }
                
                .chatcraft-chat-window.medium {
                    width: 350px;
                    height: 500px;
                }
                
                .chatcraft-chat-window.small {
                    width: 300px;
                    height: 400px;
                }
                
                .chatcraft-chat-window.large {
                    width: 400px;
                    height: 600px;
                }
                
                .chatcraft-chat-window.open {
                    display: flex;
                    opacity: 1;
                    transform: translateY(0);
                }
                
                .chatcraft-header {
                    background: ${this.config.primaryColor};
                    color: white;
                    padding: 16px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .chatcraft-header-content h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                }
                
                .chatcraft-header-content p {
                    margin: 4px 0 0 0;
                    font-size: 12px;
                    opacity: 0.9;
                }
                
                .chatcraft-close-btn {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                }
                
                .chatcraft-close-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                
                .chatcraft-messages {
                    flex: 1;
                    padding: 16px;
                    overflow-y: auto;
                    background: #f8fafc;
                }
                
                .chatcraft-message {
                    margin-bottom: 16px;
                    display: flex;
                    animation: chatcraft-fade-in 0.3s ease;
                }
                
                @keyframes chatcraft-fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .chatcraft-message.user {
                    justify-content: flex-end;
                }
                
                .chatcraft-message-content {
                    max-width: 80%;
                    padding: 12px 16px;
                    border-radius: 18px;
                    word-wrap: break-word;
                }
                
                .chatcraft-message.user .chatcraft-message-content {
                    background: ${this.config.primaryColor};
                    color: white;
                }
                
                .chatcraft-message.bot .chatcraft-message-content {
                    background: white;
                    color: ${this.config.textColor};
                    border: 1px solid #e2e8f0;
                }
                
                .chatcraft-typing {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    background: white;
                    border-radius: 18px;
                    margin-bottom: 16px;
                    border: 1px solid #e2e8f0;
                }
                
                .chatcraft-typing-dots {
                    display: flex;
                    gap: 4px;
                }
                
                .chatcraft-typing-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #94a3b8;
                    animation: chatcraft-typing 1.4s ease-in-out infinite both;
                }
                
                .chatcraft-typing-dot:nth-child(2) { animation-delay: 0.2s; }
                .chatcraft-typing-dot:nth-child(3) { animation-delay: 0.4s; }
                
                @keyframes chatcraft-typing {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1); }
                }
                
                .chatcraft-input-area {
                    padding: 16px;
                    border-top: 1px solid #e2e8f0;
                    background: ${this.config.backgroundColor};
                }
                
                .chatcraft-input-container {
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                }
                
                .chatcraft-input {
                    flex: 1;
                    padding: 12px 16px;
                    border: 1px solid #e2e8f0;
                    border-radius: 20px;
                    outline: none;
                    resize: none;
                    max-height: 100px;
                    font-family: inherit;
                    font-size: 14px;
                }
                
                .chatcraft-input:focus {
                    border-color: ${this.config.primaryColor};
                }
                
                .chatcraft-send-btn {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: ${this.config.primaryColor};
                    color: white;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s ease;
                }
                
                .chatcraft-send-btn:hover {
                    background: ${this.config.primaryColor}dd;
                }
                
                .chatcraft-send-btn:disabled {
                    background: #94a3b8;
                    cursor: not-allowed;
                }
                
                .chatcraft-conversation-starters {
                    padding: 0 16px 16px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                
                .chatcraft-starter-btn {
                    padding: 8px 12px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .chatcraft-starter-btn:hover {
                    background: ${this.config.primaryColor}10;
                    border-color: ${this.config.primaryColor};
                }
                
                .chatcraft-feedback {
                    display: flex;
                    gap: 4px;
                    margin-top: 8px;
                    justify-content: flex-end;
                }
                
                .chatcraft-feedback-btn {
                    background: none;
                    border: none;
                    font-size: 16px;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    opacity: 0.6;
                    transition: opacity 0.2s ease;
                }
                
                .chatcraft-feedback-btn:hover,
                .chatcraft-feedback-btn.selected {
                    opacity: 1;
                }
                
                @media (max-width: 480px) {
                    .chatcraft-chat-window {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        bottom: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        border-radius: 0 !important;
                    }
                }
            `;
            
            const styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.textContent = styles;
            document.head.appendChild(styleElement);
        }
        
        createWidget() {
            // Create main container
            this.container = document.createElement('div');
            this.container.className = `chatcraft-widget ${this.config.position}`;
            
            // Create launcher button
            this.launcher = document.createElement('button');
            this.launcher.className = 'chatcraft-launcher';
            this.launcher.innerHTML = this.config.launcherText;
            this.launcher.title = 'Open chat';
            
            if (this.config.showLauncher) {
                this.container.appendChild(this.launcher);
            }
            
            // Create chat window
            this.chatWindow = document.createElement('div');
            this.chatWindow.className = `chatcraft-chat-window ${this.config.size}`;
            
            this.chatWindow.innerHTML = `
                <div class="chatcraft-header">
                    <div class="chatcraft-header-content">
                        <h3>${this.config.headerTitle}</h3>
                        ${this.config.headerSubtitle ? `<p>${this.config.headerSubtitle}</p>` : ''}
                    </div>
                    <button class="chatcraft-close-btn" title="Close chat">×</button>
                </div>
                <div class="chatcraft-messages" id="chatcraft-messages"></div>
                <div class="chatcraft-input-area">
                    <div class="chatcraft-input-container">
                        <textarea 
                            class="chatcraft-input" 
                            placeholder="Type your message..." 
                            rows="1"
                            id="chatcraft-input"
                        ></textarea>
                        <button class="chatcraft-send-btn" title="Send message">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
            
            this.container.appendChild(this.chatWindow);
            document.body.appendChild(this.container);
            
            // Add conversation starters if configured
            if (this.config.conversationStarters && this.config.conversationStarters.length > 0) {
                this.addConversationStarters();
            }
            
            // Add greeting message if enabled
            if (this.config.greetingEnabled) {
                setTimeout(() => {
                    this.addMessage('Hello! How can I help you today?', 'bot');
                    this.launcher.classList.add('pulse');
                }, 2000);
            }
        }
        
        addConversationStarters() {
            const startersContainer = document.createElement('div');
            startersContainer.className = 'chatcraft-conversation-starters';
            
            this.config.conversationStarters.forEach(starter => {
                const button = document.createElement('button');
                button.className = 'chatcraft-starter-btn';
                button.textContent = starter;
                button.onclick = () => {
                    this.sendMessage(starter);
                    startersContainer.style.display = 'none';
                };
                startersContainer.appendChild(button);
            });
            
            const inputArea = this.chatWindow.querySelector('.chatcraft-input-area');
            inputArea.parentNode.insertBefore(startersContainer, inputArea);
        }
        
        bindEvents() {
            // Launcher click
            this.launcher.addEventListener('click', () => {
                this.toggle();
            });
            
            // Close button
            const closeBtn = this.chatWindow.querySelector('.chatcraft-close-btn');
            closeBtn.addEventListener('click', () => {
                this.close();
            });
            
            // Input handling
            const input = this.chatWindow.querySelector('.chatcraft-input');
            const sendBtn = this.chatWindow.querySelector('.chatcraft-send-btn');
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            input.addEventListener('input', () => {
                this.autoResizeInput(input);
            });
            
            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });
            
            // Outside click to close
            document.addEventListener('click', (e) => {
                if (this.isOpen && !this.container.contains(e.target)) {
                    // Don't close on outside click for mobile
                    if (window.innerWidth > 480) {
                        this.close();
                    }
                }
            });
            
            // Escape key to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
        }
        
        autoResizeInput(input) {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        }
        
        connectWebSocket() {
            if (!this.config.widgetId) return;
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}${this.config.apiUrl}/ws/widget/${this.config.widgetId}?session_id=${this.sessionId}`;
            
            try {
                this.websocket = new WebSocket(wsUrl);
                
                this.websocket.onopen = () => {
                    console.log('ChatCraft Widget: WebSocket connected');
                };
                
                this.websocket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                };
                
                this.websocket.onclose = () => {
                    console.log('ChatCraft Widget: WebSocket disconnected');
                    // Reconnect after 5 seconds
                    setTimeout(() => this.connectWebSocket(), 5000);
                };
                
                this.websocket.onerror = (error) => {
                    console.warn('ChatCraft Widget: WebSocket error', error);
                };
                
            } catch (error) {
                console.warn('ChatCraft Widget: WebSocket not supported, falling back to HTTP');
            }
        }
        
        handleWebSocketMessage(data) {
            switch (data.type) {
                case 'chat_response':
                    this.hideTyping();
                    this.addMessage(data.data.response, 'bot', data.data.message_id);
                    this.conversationId = data.data.conversation_id;
                    break;
                    
                case 'typing':
                    if (data.data.typing) {
                        this.showTyping();
                    } else {
                        this.hideTyping();
                    }
                    break;
                    
                case 'error':
                    this.hideTyping();
                    this.addMessage('Sorry, I encountered an error. Please try again.', 'bot');
                    break;
            }
        }
        
        async sendMessage(message = null) {
            const input = this.chatWindow.querySelector('.chatcraft-input');
            const text = message || input.value.trim();
            
            if (!text) return;
            
            // Clear input and reset height
            if (!message) {
                input.value = '';
                input.style.height = 'auto';
            }
            
            // Add user message
            this.addMessage(text, 'user');
            
            // Remove conversation starters after first message
            const starters = this.chatWindow.querySelector('.chatcraft-conversation-starters');
            if (starters) {
                starters.style.display = 'none';
            }
            
            // Show typing indicator
            if (this.config.typingIndicator) {
                this.showTyping();
            }
            
            try {
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    // Send via WebSocket
                    this.websocket.send(JSON.stringify({
                        type: 'chat',
                        message: text,
                        metadata: {
                            conversation_id: this.conversationId,
                            page_url: window.location.href,
                            referrer_url: document.referrer,
                            user_agent: navigator.userAgent
                        }
                    }));
                } else {
                    // Fallback to HTTP
                    await this.sendMessageHTTP(text);
                }
            } catch (error) {
                console.error('ChatCraft Widget: Send message error', error);
                this.hideTyping();
                this.addMessage('Sorry, I couldn\'t send your message. Please try again.', 'bot');
            }
        }
        
        async sendMessageHTTP(text) {
            const response = await fetch(`${this.config.apiUrl}/widget/${this.config.widgetId}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: text,
                    conversation_id: this.conversationId,
                    session_id: this.sessionId,
                    page_url: window.location.href,
                    referrer_url: document.referrer,
                    user_agent: navigator.userAgent
                })
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            
            this.hideTyping();
            this.addMessage(data.response, 'bot', data.message_id);
            this.conversationId = data.conversation_id;
        }
        
        addMessage(text, sender, messageId = null) {
            const messagesContainer = this.chatWindow.querySelector('.chatcraft-messages');
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `chatcraft-message ${sender}`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'chatcraft-message-content';
            contentDiv.textContent = text;
            
            messageDiv.appendChild(contentDiv);
            
            // Add feedback buttons for bot messages
            if (sender === 'bot' && this.config.feedbackEnabled && messageId) {
                const feedbackDiv = document.createElement('div');
                feedbackDiv.className = 'chatcraft-feedback';
                
                const thumbsUp = document.createElement('button');
                thumbsUp.className = 'chatcraft-feedback-btn';
                thumbsUp.innerHTML = '👍';
                thumbsUp.title = 'Helpful';
                thumbsUp.onclick = () => this.submitFeedback(messageId, 5, thumbsUp);
                
                const thumbsDown = document.createElement('button');
                thumbsDown.className = 'chatcraft-feedback-btn';
                thumbsDown.innerHTML = '👎';
                thumbsDown.title = 'Not helpful';
                thumbsDown.onclick = () => this.submitFeedback(messageId, 1, thumbsDown);
                
                feedbackDiv.appendChild(thumbsUp);
                feedbackDiv.appendChild(thumbsDown);
                contentDiv.appendChild(feedbackDiv);
            }
            
            messagesContainer.appendChild(messageDiv);
            this.scrollToBottom();
            
            // Store message
            this.messages.push({ text, sender, messageId, timestamp: new Date() });
        }
        
        async submitFeedback(messageId, score, buttonElement) {
            try {
                await fetch(`${this.config.apiUrl}/widget/${this.config.widgetId}/feedback`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message_id: messageId,
                        score: score
                    })
                });
                
                // Update UI
                buttonElement.classList.add('selected');
                const feedbackDiv = buttonElement.parentElement;
                const buttons = feedbackDiv.querySelectorAll('.chatcraft-feedback-btn');
                buttons.forEach(btn => {
                    if (btn !== buttonElement) {
                        btn.style.display = 'none';
                    }
                });
                
            } catch (error) {
                console.error('ChatCraft Widget: Feedback submission error', error);
            }
        }
        
        showTyping() {
            if (this.isTyping) return;
            
            this.isTyping = true;
            const messagesContainer = this.chatWindow.querySelector('.chatcraft-messages');
            
            const typingDiv = document.createElement('div');
            typingDiv.className = 'chatcraft-typing';
            typingDiv.id = 'chatcraft-typing-indicator';
            
            typingDiv.innerHTML = `
                <div class="chatcraft-typing-dots">
                    <div class="chatcraft-typing-dot"></div>
                    <div class="chatcraft-typing-dot"></div>
                    <div class="chatcraft-typing-dot"></div>
                </div>
            `;
            
            messagesContainer.appendChild(typingDiv);
            this.scrollToBottom();
        }
        
        hideTyping() {
            this.isTyping = false;
            const typingIndicator = this.chatWindow.querySelector('#chatcraft-typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }
        
        scrollToBottom() {
            const messagesContainer = this.chatWindow.querySelector('.chatcraft-messages');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        open() {
            if (this.isOpen) return;
            
            this.isOpen = true;
            this.chatWindow.classList.add('open');
            this.launcher.classList.remove('pulse');
            
            // Focus input
            setTimeout(() => {
                const input = this.chatWindow.querySelector('.chatcraft-input');
                input.focus();
            }, 300);
            
            // Track analytics
            this.trackEvent('widget_opened');
        }
        
        close() {
            if (!this.isOpen) return;
            
            this.isOpen = false;
            this.chatWindow.classList.remove('open');
            
            // Track analytics
            this.trackEvent('widget_closed');
        }
        
        toggle() {
            if (this.isOpen) {
                this.close();
            } else {
                this.open();
            }
        }
        
        trackEvent(eventName, data = {}) {
            // Simple analytics tracking
            if (typeof gtag !== 'undefined') {
                gtag('event', eventName, {
                    event_category: 'ChatCraft Widget',
                    ...data
                });
            }
            
            // Send to ChatCraft analytics if configured
            if (this.config.analyticsEnabled) {
                try {
                    fetch(`${this.config.apiUrl}/widget/${this.config.widgetId}/analytics`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            event: eventName,
                            data: data,
                            session_id: this.sessionId,
                            page_url: window.location.href,
                            timestamp: new Date().toISOString()
                        })
                    });
                } catch (error) {
                    // Ignore analytics errors
                }
            }
        }
        
        // Public API methods
        destroy() {
            if (this.websocket) {
                this.websocket.close();
            }
            if (this.container) {
                this.container.remove();
            }
            window.ChatCraftWidget = null;
        }
        
        updateConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
            // Re-apply styles and update UI
            this.createStyles();
        }
        
        getMessages() {
            return this.messages;
        }
        
        clearMessages() {
            this.messages = [];
            const messagesContainer = this.chatWindow.querySelector('.chatcraft-messages');
            messagesContainer.innerHTML = '';
        }
    }
    
    // Initialize widget
    function initWidget() {
        if (typeof window.ChatCraftConfig !== 'undefined') {
            window.ChatCraftWidget = new ChatCraftWidget(window.ChatCraftConfig);
        } else {
            console.warn('ChatCraft Widget: No configuration found. Please define window.ChatCraftConfig before loading the widget script.');
        }
    }
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }
    
    // Expose ChatCraftWidget class globally for manual initialization
    window.ChatCraftWidget = ChatCraftWidget;
    
})();