// AI Personal Finance Analyzer - Main Application Logic
// Author: Claude AI Assistant
// Version: 1.0

class FinanceAnalyzer {
    constructor() {
        // Application state
        this.state = {
            conversations: [],
            currentConversation: [],
            transactions: [],
            memory: {
                summary: '',
                profile: '',
                keywordIndex: new Map()
            },
            settings: {
                apiKey: 'tgp_v1_o319HuxtA3Phy_VoWmflw1_WXLLKXZENiz2PbD8Q6UA',
                model: 'openai/gpt-oss-20b',
                temperature: 0.25,
                maxTokens: 800,
                keepMessages: 12,
                persistConversations: true,
                persistTransactions: true,
                persistMemory: true,
                theme: 'dark'
            }
        };

        // API configuration
        this.apiConfig = {
            baseUrl: 'https://api.together.xyz/v1/chat/completions',
            timeout: 20000,
            retryAttempts: 2,
            retryDelay: 1000
        };

        // Categories for transaction classification
        this.categories = [
            'Transport', 'Food & Drink', 'Shopping', 'Entertainment', 
            'Groceries', 'Utilities', 'Income', 'Travel', 'Electronics', 
            'Fuel', 'Health', 'Fitness', 'Rent', 'Education', 'Fees', 'Other'
        ];

        // System prompts
        this.prompts = {
            summary: "Summarize the conversation so far into a compact 'memory' that preserves user goals, constraints, key facts, preferences, and unresolved tasks. Keep it actionable and under 2000 characters.",
            categorization: `You are an expert transaction classifier. Allowed categories ONLY: ${this.categories.join(', ')}.
Input: N transaction descriptions, one per line.
Output: EXACTLY N lines, one category per line. No extra text.`,
            insights: `Given the following aggregated snapshot (INR-enabled formatting), produce:
1) 5–8 quick wins (bullets),
2) A 30-day action plan,
3) Risk flags, and
4) A budget split (percentages) with rationale.
Keep responses concise and high-impact.`
        };

        this.init();
    }

    // Initialize the application
    async init() {
        this.loadState();
        this.setupEventListeners();
        this.setupTabs();
        this.renderTransactions();
        this.updateDashboard();
        this.updateMemoryDisplay();
        this.populateCategoryFilter();
        
        // Load theme
        document.documentElement.classList.toggle('light', this.state.settings.theme === 'light');
        
        this.showToast('Welcome to FinanceAI! 🚀', 'success');
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Chat functionality
        document.getElementById('send-button').addEventListener('click', () => this.sendMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        document.getElementById('clear-chat').addEventListener('click', () => this.clearChat());

        // Settings inputs
        document.getElementById('api-key').addEventListener('change', (e) => {
            this.state.settings.apiKey = e.target.value;
            this.saveState();
        });
        document.getElementById('model-select').addEventListener('change', (e) => {
            this.state.settings.model = e.target.value;
            this.saveState();
        });
        document.getElementById('temperature').addEventListener('change', (e) => {
            this.state.settings.temperature = parseFloat(e.target.value);
            this.saveState();
        });
        document.getElementById('max-tokens').addEventListener('change', (e) => {
            this.state.settings.maxTokens = parseInt(e.target.value);
            this.saveState();
        });

        // File upload
        document.getElementById('upload-button').addEventListener('click', () => {
            document.getElementById('csv-upload').click();
        });
        document.getElementById('csv-upload').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        // Quick actions
        document.getElementById('download-sample').addEventListener('click', () => this.downloadSampleCSV());
        document.getElementById('generate-insights').addEventListener('click', () => this.generateInsights());
        document.getElementById('rebuild-summary').addEventListener('click', () => this.rebuildSummary());
        document.getElementById('categorize-button').addEventListener('click', () => this.categorizeTransactions());

        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // Memory management
        document.getElementById('edit-memory').addEventListener('click', () => this.openMemoryEditor());
        document.getElementById('export-memory').addEventListener('click', () => this.exportMemory());
        document.getElementById('save-profile').addEventListener('click', () => this.saveProfile());

        // Modal handlers
        document.getElementById('cancel-memory-edit').addEventListener('click', () => this.closeMemoryEditor());
        document.getElementById('save-memory-edit').addEventListener('click', () => this.saveMemoryEdit());

        // Settings
        document.getElementById('export-all').addEventListener('click', () => this.exportAllData());
        document.getElementById('import-all').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file').addEventListener('change', (e) => {
            this.importAllData(e.target.files[0]);
        });
        document.getElementById('clear-all').addEventListener('click', () => this.clearAllData());

        // Filters
        document.getElementById('search-transactions').addEventListener('input', (e) => {
            this.filterTransactions();
        });
        document.getElementById('category-filter').addEventListener('change', (e) => {
            this.filterTransactions();
        });

        // Persistence settings
        ['persist-conversations', 'persist-transactions', 'persist-memory'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                const setting = id.replace('persist-', '').replace('-', '');
                this.state.settings[`persist${setting.charAt(0).toUpperCase()}${setting.slice(1)}`] = e.target.checked;
                this.saveState();
            });
        });

        document.getElementById('keep-messages').addEventListener('change', (e) => {
            this.state.settings.keepMessages = parseInt(e.target.value);
            this.saveState();
        });
    }

    // Tab Management
    setupTabs() {
        this.switchTab('chat');
    }

    switchTab(tabName) {
        // Remove active class from all tabs and buttons
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));

        // Add active class to current tab and button
        document.getElementById(`${tabName}-tab`).classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update dashboard when switching to it
        if (tabName === 'dashboard') {
            setTimeout(() => this.updateDashboard(), 100);
        }
    }

    // Chat Functionality
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;

        input.value = '';
        this.addMessage('user', message);

        try {
            const response = await this.callAPI(message);
            this.addMessage('assistant', response);
            this.updateKeywordIndex(message);
            this.updateKeywordIndex(response);
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
            this.addMessage('assistant', `I apologize, but I encountered an error: ${error.message}`);
        }

        this.saveState();
    }

    addMessage(role, content) {
        const message = { role, content, timestamp: Date.now() };
        this.state.currentConversation.push(message);

        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role} flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content relative max-w-3xl';
        
        if (role === 'assistant') {
            contentDiv.innerHTML = this.formatMessage(content);
            this.addCopyButtons(contentDiv);
        } else {
            contentDiv.textContent = content;
        }

        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Update stats
        this.updateChatStats();
    }

    formatMessage(content) {
        // Basic markdown parsing
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/\n/g, '<br>');
    }

    addCopyButtons(container) {
        const codeBlocks = container.querySelectorAll('pre');
        codeBlocks.forEach(block => {
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.textContent = 'Copy';
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(block.textContent);
                copyButton.textContent = 'Copied!';
                setTimeout(() => copyButton.textContent = 'Copy', 2000);
            });
            block.style.position = 'relative';
            block.appendChild(copyButton);
        });
    }

    updateChatStats() {
        const stats = document.getElementById('chat-stats');
        const messages = this.state.currentConversation.length;
        const tokens = this.estimateTokens();
        stats.textContent = `Messages: ${messages} | Est. Tokens: ${tokens}`;
    }

    estimateTokens() {
        return Math.ceil(this.state.currentConversation
            .map(m => m.content.length)
            .reduce((a, b) => a + b, 0) / 4);
    }

    clearChat() {
        if (confirm('Are you sure you want to clear the conversation?')) {
            this.state.currentConversation = [];
            document.getElementById('chat-messages').innerHTML = '';
            this.updateChatStats();
            this.saveState();
        }
    }

    // API Communication
    async callAPI(message) {
        const prompt = this.buildPrompt(message);
        const requestBody = {
            model: this.state.settings.model,
            messages: prompt,
            temperature: this.state.settings.temperature,
            max_tokens: this.state.settings.maxTokens,
            stream: false // Simplified for now
        };

        const response = await this.makeRequest(this.apiConfig.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.state.settings.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (response.choices && response.choices[0]) {
            return response.choices[0].message.content;
        } else {
            throw new Error('Invalid API response');
        }
    }

    async makeRequest(url, options) {
        let lastError;
        
        for (let attempt = 0; attempt <= this.apiConfig.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.apiConfig.timeout);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                lastError = error;
                if (attempt < this.apiConfig.retryAttempts) {
                    await this.sleep(this.apiConfig.retryDelay * Math.pow(2, attempt));
                }
            }
        }

        throw lastError;
    }

    buildPrompt(userMessage) {
        const messages = [];
        
        // System message
        messages.push({
            role: 'system',
            content: 'You are a helpful AI assistant specializing in personal finance analysis and advice.'
        });

        // User profile if available
        if (this.state.memory.profile) {
            messages.push({
                role: 'system',
                content: `User Profile: ${this.state.memory.profile}`
            });
        }

        // Memory summary if available
        if (this.state.memory.summary) {
            messages.push({
                role: 'system',
                content: `Conversation Summary: ${this.state.memory.summary}`
            });
        }

        // Recent messages
        const recentMessages = this.state.currentConversation
            .slice(-this.state.settings.keepMessages)
            .map(msg => ({ role: msg.role, content: msg.content }));
        
        messages.push(...recentMessages);

        // Current user message
        messages.push({ role: 'user', content: userMessage });

        // Add relevant context from keyword search
        const relevantContext = this.searchRelevantContext(userMessage);
        if (relevantContext.length > 0) {
            messages.push({
                role: 'system',
                content: `Relevant context: ${relevantContext.join(' ')}`
            });
        }

        return messages;
    }

    // Context Management
    updateKeywordIndex(text) {
        const words = text.toLowerCase().match(/\b\w+\b/g) || [];
        words.forEach(word => {
            if (word.length > 3) { // Only index meaningful words
                if (!this.state.memory.keywordIndex.has(word)) {
                    this.state.memory.keywordIndex.set(word, []);
                }
                this.state.memory.keywordIndex.get(word).push({
                    text: text.substring(0, 200),
                    timestamp: Date.now()
                });
            }
        });
    }

    searchRelevantContext(query) {
        const queryWords = query.toLowerCase().match(/\b\w+\b/g) || [];
        const relevantSnippets = [];
        
        queryWords.forEach(word => {
            if (this.state.memory.keywordIndex.has(word)) {
                const snippets = this.state.memory.keywordIndex.get(word);
                relevantSnippets.push(...snippets.slice(-2)); // Get 2 most recent
            }
        });

        return relevantSnippets
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3)
            .map(s => s.text);
    }

    async rebuildSummary() {
        if (this.state.currentConversation.length === 0) {
            this.showToast('No conversation to summarize', 'warning');
            return;
        }

        try {
            const conversationText = this.state.currentConversation
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n\n');

            const summaryResponse = await this.callAPI(`${this.prompts.summary}\n\nConversation:\n${conversationText}`);
            
            this.state.memory.summary = summaryResponse;
            this.updateMemoryDisplay();
            this.saveState();
            this.showToast('Memory summary rebuilt successfully', 'success');
        } catch (error) {
            this.showToast(`Error rebuilding summary: ${error.message}`, 'error');
        }
    }

    // Transaction Management
    async handleFileUpload(file) {
        if (!file) return;

        const text = await file.text();
        const transactions = this.parseCSV(text);
        
        if (transactions.length > 0) {
            this.state.transactions = [...this.state.transactions, ...transactions];
            this.renderTransactions();
            this.updateDashboard();
            this.populateCategoryFilter();
            this.saveState();
            this.showToast(`Imported ${transactions.length} transactions`, 'success');
        } else {
            this.showToast('No valid transactions found in file', 'error');
        }
    }

    parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const transactions = [];

        // Find column indices
        const dateIndex = headers.findIndex(h => h.includes('date'));
        const descIndex = headers.findIndex(h => h.includes('desc') || h.includes('detail'));
        const amountIndex = headers.findIndex(h => h.includes('amount') || h.includes('sum'));
        const categoryIndex = headers.findIndex(h => h.includes('category'));

        if (dateIndex === -1 || descIndex === -1 || amountIndex === -1) {
            throw new Error('Required columns (Date, Description, Amount) not found');
        }

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
            
            try {
                const transaction = {
                    id: Date.now() + i,
                    date: this.parseDate(row[dateIndex]),
                    description: row[descIndex] || '',
                    amount: this.parseAmount(row[amountIndex]),
                    category: categoryIndex !== -1 ? row[categoryIndex] : 'Other',
                    original: row
                };

                if (transaction.date && transaction.amount !== null) {
                    transactions.push(transaction);
                }
            } catch (error) {
                console.warn(`Skipping invalid row ${i}: ${error.message}`);
            }
        }

        return transactions;
    }

    parseDate(dateStr) {
        // Handle multiple date formats
        const formats = [
            /^\d{4}-\d{2}-\d{2}$/,
            /^\d{2}\/\d{2}\/\d{4}$/,
            /^\d{2}-\d{2}-\d{4}$/
        ];

        for (const format of formats) {
            if (format.test(dateStr)) {
                const date = new Date(dateStr);
                return date.getTime();
            }
        }
        
        throw new Error(`Invalid date format: ${dateStr}`);
    }

    parseAmount(amountStr) {
        // Remove currency symbols and commas
        const cleaned = amountStr.replace(/[₹$,]/g, '');
        const amount = parseFloat(cleaned);
        return isNaN(amount) ? null : amount;
    }

    async categorizeTransactions() {
        const uncategorized = this.state.transactions.filter(t => !t.category || t.category === 'Other');
        
        if (uncategorized.length === 0) {
            this.showToast('All transactions are already categorized', 'info');
            return;
        }

        try {
            const descriptions = uncategorized.map(t => t.description).join('\n');
            const prompt = `${this.prompts.categorization}\n\nTransactions:\n${descriptions}`;
            
            const response = await this.callAPI(prompt);
            const categories = response.split('\n').filter(c => c.trim());

            if (categories.length === uncategorized.length) {
                uncategorized.forEach((transaction, index) => {
                    const category = categories[index].trim();
                    if (this.categories.includes(category)) {
                        transaction.category = category;
                    }
                });

                this.renderTransactions();
                this.updateDashboard();
                this.populateCategoryFilter();
                this.saveState();
                this.showToast(`Categorized ${categories.length} transactions`, 'success');
            } else {
                this.showToast('Categorization response format error', 'error');
            }
        } catch (error) {
            this.showToast(`Error categorizing transactions: ${error.message}`, 'error');
        }
    }

    renderTransactions() {
        const container = document.getElementById('transactions-table');
        
        if (this.state.transactions.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8">No transactions loaded. Upload a CSV file to get started.</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table w-full';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Category</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${this.state.transactions.map(transaction => `
                    <tr class="transaction-row">
                        <td>${new Date(transaction.date).toLocaleDateString()}</td>
                        <td class="max-w-xs truncate">${transaction.description}</td>
                        <td class="${transaction.amount >= 0 ? 'text-green-400' : 'text-red-400'}">
                            ${this.formatCurrency(transaction.amount)}
                        </td>
                        <td>
                            <select class="category-select bg-white/5 border border-white/10 rounded p-1 text-sm" 
                                    data-id="${transaction.id}">
                                ${this.categories.map(cat => 
                                    `<option value="${cat}" ${cat === transaction.category ? 'selected' : ''}>${cat}</option>`
                                ).join('')}
                            </select>
                        </td>
                        <td>
                            <button class="delete-transaction px-2 py-1 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30 transition-all" 
                                    data-id="${transaction.id}">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;

        container.innerHTML = '';
        container.appendChild(table);

        // Add event listeners for category changes and delete buttons
        table.querySelectorAll('.category-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const transactionId = parseInt(e.target.dataset.id);
                const transaction = this.state.transactions.find(t => t.id === transactionId);
                if (transaction) {
                    transaction.category = e.target.value;
                    this.updateDashboard();
                    this.saveState();
                }
            });
        });

        table.querySelectorAll('.delete-transaction').forEach(button => {
            button.addEventListener('click', (e) => {
                const transactionId = parseInt(e.target.dataset.id);
                if (confirm('Are you sure you want to delete this transaction?')) {
                    this.state.transactions = this.state.transactions.filter(t => t.id !== transactionId);
                    this.renderTransactions();
                    this.updateDashboard();
                    this.populateCategoryFilter();
                    this.saveState();
                }
            });
        });
    }

    filterTransactions() {
        const searchTerm = document.getElementById('search-transactions').value.toLowerCase();
        const categoryFilter = document.getElementById('category-filter').value;

        let filtered = this.state.transactions;

        if (searchTerm) {
            filtered = filtered.filter(t => 
                t.description.toLowerCase().includes(searchTerm) ||
                t.category.toLowerCase().includes(searchTerm)
            );
        }

        if (categoryFilter) {
            filtered = filtered.filter(t => t.category === categoryFilter);
        }

        // Re-render with filtered transactions
        const originalTransactions = this.state.transactions;
        this.state.transactions = filtered;
        this.renderTransactions();
        this.state.transactions = originalTransactions;
    }

    populateCategoryFilter() {
        const select = document.getElementById('category-filter');
        const categories = [...new Set(this.state.transactions.map(t => t.category))].sort();
        
        select.innerHTML = '<option value="">All Categories</option>' +
            categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }

    // Dashboard and Analytics
    updateDashboard() {
        this.updateKPIs();
        this.updateCharts();
    }

    updateKPIs() {
        const income = this.state.transactions
            .filter(t => t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0);

        const expenses = this.state.transactions
            .filter(t => t.amount < 0)
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        const net = income - expenses;

        document.getElementById('total-income').textContent = this.formatCurrency(income);
        document.getElementById('total-spend').textContent = this.formatCurrency(expenses);
        document.getElementById('net-balance').textContent = this.formatCurrency(net);
        document.getElementById('net-balance').className = `text-2xl font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`;
        document.getElementById('total-transactions').textContent = this.state.transactions.length;
    }

    updateCharts() {
        this.renderBalanceChart();
        this.renderCategoryChart();
    }

    renderBalanceChart() {
        if (this.state.transactions.length === 0) return;

        // Sort transactions by date
        const sorted = [...this.state.transactions].sort((a, b) => a.date - b.date);
        let balance = 0;
        
        const data = sorted.map(t => {
            balance += t.amount;
            return {
                date: new Date(t.date).toLocaleDateString(),
                balance: balance
            };
        });

        const trace = {
            x: data.map(d => d.date),
            y: data.map(d => d.balance),
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Balance',
            line: { color: '#3b82f6', width: 3 },
            marker: { color: '#3b82f6', size: 6 }
        };

        const layout = {
            title: '',
            xaxis: { title: 'Date', color: 'rgba(255,255,255,0.8)' },
            yaxis: { title: 'Balance (₹)', color: 'rgba(255,255,255,0.8)' },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: 'rgba(255,255,255,0.8)' },
            margin: { t: 30, r: 30, b: 50, l: 80 }
        };

        const config = { responsive: true, displayModeBar: false };

        Plotly.newPlot('balance-chart', [trace], layout, config);
    }

    renderCategoryChart() {
        if (this.state.transactions.length === 0) return;

        const categoryTotals = {};
        this.state.transactions
            .filter(t => t.amount < 0) // Only expenses
            .forEach(t => {
                categoryTotals[t.category] = (categoryTotals[t.category] || 0) + Math.abs(t.amount);
            });

        const categories = Object.keys(categoryTotals);
        const amounts = Object.values(categoryTotals);

        const trace = {
            x: categories,
            y: amounts,
            type: 'bar',
            marker: {
                color: categories.map((_, i) => 
                    `hsl(${(i * 360 / categories.length)}, 70%, 60%)`
                )
            }
        };

        const layout = {
            title: '',
            xaxis: { title: 'Category', color: 'rgba(255,255,255,0.8)' },
            yaxis: { title: 'Amount (₹)', color: 'rgba(255,255,255,0.8)' },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: 'rgba(255,255,255,0.8)' },
            margin: { t: 30, r: 30, b: 100, l: 80 }
        };

        const config = { responsive: true, displayModeBar: false };

        Plotly.newPlot('category-chart', [trace], layout, config);
    }

    // AI Insights Generation
    async generateInsights() {
        if (this.state.transactions.length === 0) {
            this.showToast('No transactions available for analysis', 'warning');
            return;
        }

        try {
            const snapshot = this.createFinancialSnapshot();
            const prompt = `${this.prompts.insights}\n\nFinancial Snapshot:\n${snapshot}`;
            
            const insights = await this.callAPI(prompt);
            
            // Add insights as a message in chat
            this.addMessage('assistant', `## 🔍 AI Financial Insights\n\n${insights}`);
            
            // Switch to chat tab to show insights
            this.switchTab('chat');
            
            this.showToast('AI insights generated successfully', 'success');
        } catch (error) {
            this.showToast(`Error generating insights: ${error.message}`, 'error');
        }
    }

    createFinancialSnapshot() {
        const income = this.state.transactions
            .filter(t => t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0);

        const expenses = this.state.transactions
            .filter(t => t.amount < 0)
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        const categoryBreakdown = {};
        this.state.transactions
            .filter(t => t.amount < 0)
            .forEach(t => {
                categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + Math.abs(t.amount);
            });

        const topCategories = Object.entries(categoryBreakdown)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([cat, amount]) => `${cat}: ${this.formatCurrency(amount)}`)
            .join(', ');

        return `
Total Income: ${this.formatCurrency(income)}
Total Expenses: ${this.formatCurrency(expenses)}
Net Balance: ${this.formatCurrency(income - expenses)}
Transaction Count: ${this.state.transactions.length}
Top Spending Categories: ${topCategories}
Average Transaction: ${this.formatCurrency(expenses / this.state.transactions.filter(t => t.amount < 0).length)}
        `.trim();
    }

    // Memory Management
    updateMemoryDisplay() {
        const summaryElement = document.getElementById('memory-summary');
        const profileElement = document.getElementById('user-profile');

        summaryElement.textContent = this.state.memory.summary || 'No conversation memory yet. Start chatting to build context.';
        profileElement.value = this.state.memory.profile || '';
    }

    openMemoryEditor() {
        const modal = document.getElementById('memory-modal');
        const editor = document.getElementById('memory-editor');
        
        editor.value = this.state.memory.summary;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.querySelector('.bg-gray-900').classList.add('modal-enter');
    }

    closeMemoryEditor() {
        const modal = document.getElementById('memory-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    saveMemoryEdit() {
        const editor = document.getElementById('memory-editor');
        this.state.memory.summary = editor.value;
        this.updateMemoryDisplay();
        this.saveState();
        this.closeMemoryEditor();
        this.showToast('Memory updated successfully', 'success');
    }

    exportMemory() {
        const data = {
            summary: this.state.memory.summary,
            profile: this.state.memory.profile,
            timestamp: new Date().toISOString()
        };

        this.downloadJSON(data, 'memory-export.json');
        this.showToast('Memory exported successfully', 'success');
    }

    saveProfile() {
        const profileElement = document.getElementById('user-profile');
        this.state.memory.profile = profileElement.value;
        this.saveState();
        this.showToast('Profile saved successfully', 'success');
    }

    // Utility Functions
    downloadSampleCSV() {
        const sampleData = [
            'Date,Description,Amount,Category',
            '2024-01-15,"Grocery Shopping",-2500,Groceries',
            '2024-01-16,"Salary Credit",50000,Income',
            '2024-01-17,"Uber Ride",-350,Transport',
            '2024-01-18,"Netflix Subscription",-799,Entertainment',
            '2024-01-19,"Medical Checkup",-1200,Health',
            '2024-01-20,"Fuel",-3000,Fuel'
        ].join('\n');

        this.downloadText(sampleData, 'sample-transactions.csv', 'text/csv');
        this.showToast('Sample CSV downloaded', 'success');
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    downloadText(text, filename, type = 'text/plain') {
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    downloadJSON(obj, filename) {
        this.downloadText(JSON.stringify(obj, null, 2), filename, 'application/json');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Toast Notifications
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="flex items-start space-x-2">
                <div class="flex-shrink-0 mt-0.5">
                    ${this.getToastIcon(type)}
                </div>
                <div class="text-sm">${message}</div>
            </div>
        `;

        container.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    getToastIcon(type) {
        const icons = {
            success: '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
            error: '<svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
            warning: '<svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>',
            info: '<svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        };
        return icons[type] || icons.info;
    }

    // Theme Management
    toggleTheme() {
        const html = document.documentElement;
        const isLight = html.classList.contains('light');
        
        html.classList.toggle('light', !isLight);
        this.state.settings.theme = isLight ? 'dark' : 'light';
        
        document.getElementById('theme-text').textContent = isLight ? 'Dark Mode' : 'Light Mode';
        this.saveState();
        
        // Re-render charts with new theme
        setTimeout(() => {
            this.updateCharts();
        }, 100);
    }

    // Data Management
    exportAllData() {
        const exportData = {
            conversations: this.state.currentConversation,
            transactions: this.state.transactions,
            memory: this.state.memory,
            settings: this.state.settings,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        this.downloadJSON(exportData, `financeai-export-${new Date().toISOString().split('T')[0]}.json`);
        this.showToast('All data exported successfully', 'success');
    }

    async importAllData(file) {
        if (!file) return;

        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            if (confirm('This will replace all current data. Are you sure?')) {
                if (importData.conversations) this.state.currentConversation = importData.conversations;
                if (importData.transactions) this.state.transactions = importData.transactions;
                if (importData.memory) this.state.memory = importData.memory;
                if (importData.settings) this.state.settings = { ...this.state.settings, ...importData.settings };

                this.renderTransactions();
                this.updateDashboard();
                this.updateMemoryDisplay();
                this.populateCategoryFilter();
                this.saveState();

                // Render chat messages
                const messagesContainer = document.getElementById('chat-messages');
                messagesContainer.innerHTML = '';
                this.state.currentConversation.forEach(msg => {
                    this.addMessageToDOM(msg);
                });

                this.showToast('Data imported successfully', 'success');
            }
        } catch (error) {
            this.showToast(`Import failed: ${error.message}`, 'error');
        }
    }

    addMessageToDOM(message) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${message.role} flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content relative max-w-3xl';
        
        if (message.role === 'assistant') {
            contentDiv.innerHTML = this.formatMessage(message.content);
            this.addCopyButtons(contentDiv);
        } else {
            contentDiv.textContent = message.content;
        }

        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        this.updateChatStats();
    }

    clearAllData() {
        if (confirm('This will delete ALL data including conversations, transactions, and memory. Are you sure?')) {
            // Reset state
            this.state.conversations = [];
            this.state.currentConversation = [];
            this.state.transactions = [];
            this.state.memory = {
                summary: '',
                profile: '',
                keywordIndex: new Map()
            };

            // Clear UI
            document.getElementById('chat-messages').innerHTML = '';
            this.renderTransactions();
            this.updateDashboard();
            this.updateMemoryDisplay();
            this.populateCategoryFilter();
            this.updateChatStats();

            // Clear localStorage
            localStorage.removeItem('financeai-state');
            
            this.showToast('All data cleared successfully', 'success');
        }
    }

    // State Persistence
    saveState() {
        if (this.state.settings.persistConversations || 
            this.state.settings.persistTransactions || 
            this.state.settings.persistMemory) {
            
            const stateToSave = {
                conversations: this.state.settings.persistConversations ? this.state.currentConversation : [],
                transactions: this.state.settings.persistTransactions ? this.state.transactions : [],
                memory: this.state.settings.persistMemory ? {
                    ...this.state.memory,
                    keywordIndex: Array.from(this.state.memory.keywordIndex.entries())
                } : { summary: '', profile: '', keywordIndex: [] },
                settings: this.state.settings
            };

            localStorage.setItem('financeai-state', JSON.stringify(stateToSave));
        }
    }

    loadState() {
        try {
            const saved = localStorage.getItem('financeai-state');
            if (saved) {
                const parsedState = JSON.parse(saved);
                
                if (parsedState.conversations) this.state.currentConversation = parsedState.conversations;
                if (parsedState.transactions) this.state.transactions = parsedState.transactions;
                if (parsedState.memory) {
                    this.state.memory = {
                        ...parsedState.memory,
                        keywordIndex: new Map(parsedState.memory.keywordIndex || [])
                    };
                }
                if (parsedState.settings) this.state.settings = { ...this.state.settings, ...parsedState.settings };

                // Update UI with loaded settings
                document.getElementById('api-key').value = this.state.settings.apiKey;
                document.getElementById('model-select').value = this.state.settings.model;
                document.getElementById('temperature').value = this.state.settings.temperature;
                document.getElementById('max-tokens').value = this.state.settings.maxTokens;
                document.getElementById('keep-messages').value = this.state.settings.keepMessages;
                
                // Update persistence checkboxes
                document.getElementById('persist-conversations').checked = this.state.settings.persistConversations;
                document.getElementById('persist-transactions').checked = this.state.settings.persistTransactions;
                document.getElementById('persist-memory').checked = this.state.settings.persistMemory;

                // Render loaded chat messages
                const messagesContainer = document.getElementById('chat-messages');
                this.state.currentConversation.forEach(msg => {
                    this.addMessageToDOM(msg);
                });
            }
        } catch (error) {
            console.error('Error loading state:', error);
            this.showToast('Error loading saved data', 'warning');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.financeApp = new FinanceAnalyzer();
});

// Handle mobile sidebar toggle (if needed)
function toggleSidebar() {
    document.body.classList.toggle('sidebar-open');
}